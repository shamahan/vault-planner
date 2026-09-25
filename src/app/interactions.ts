import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../domain/grid'
import { canApply, cascadeFor, validate, type Mode, type Verdict } from '../domain/validate'
import { findRoom, type Op, type Vault } from '../domain/vault'
import { renderScene } from '../render/scene'
import { CELL_PX, COLORS, FLOOR_GAP_PX, FLOOR_PX, SCENE_GUTTER_PX, SCENE_PAD_PX } from '../render/theme'
import { confirmCascade } from './dialogs'
import type { Store } from './state'

export function describeRefusal(verdict: Verdict): string {
  return verdict.ok ? '' : verdict.reason
}

/**
 * Turns a click's page coordinates into a floor/cell address, scaling from
 * the SVG's rendered width against its viewBox width so the maths still
 * works when the page has scaled the picture down or up. `rect` and
 * `viewBoxWidth` are passed in (rather than read from the DOM here) so this
 * conversion is a pure function the tests can check against known numbers,
 * independent of whatever layout a real browser or jsdom produces.
 *
 * Returns `null` when the point falls outside the drawn grid -- left of the
 * floor-number gutter, right of the last cell, above the first floor, or
 * below the last floor. This used to clamp instead, which meant a click in
 * the gutter or beyond the last floor still placed a room: at whatever
 * cell/floor the clamp happened to produce, never where the person actually
 * pointed. Outside the grid there is nothing to snap to, so callers must
 * treat `null` as "nothing was aimed at", not as a position to act on.
 */
export function cellFromPoint(
  rect: { left: number; top: number; width: number },
  viewBoxWidth: number,
  clientX: number,
  clientY: number,
): { floor: number; x: number } | null {
  const rawScale = rect.width / viewBoxWidth
  // A zero viewBox with a real rendered width would give Infinity; a zero
  // width with a click exactly on rect.left would give NaN. Either one has
  // to fall back to 1 (treat the click as already in scene units), the same
  // as the legitimate 0/0 case where nothing has been laid out yet.
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1
  const localX = (clientX - rect.left) / scale
  const localY = (clientY - rect.top) / scale
  const x = Math.floor((localX - SCENE_GUTTER_PX) / CELL_PX)
  const floor = Math.floor((localY - SCENE_PAD_PX) / (FLOOR_PX + FLOOR_GAP_PX))
  if (x < 0 || x >= CELLS_PER_FLOOR || floor < 0 || floor >= FLOOR_COUNT) return null
  return { floor, x }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

type Candidate = { floor: number; x: number; w: number }

/**
 * Holds a room's left edge inside the floor it would be placed on, so a
 * cursor near the right edge cannot leave the room hanging off it. The
 * cursor cell is always the room's left edge (before resolvePlacement's own
 * snap to a legal footprint), so a room of width `w` can start no further
 * right than `CELLS_PER_FLOOR - w` without its far end running past the
 * last cell.
 *
 * This must run *before* resolvePlacement, not after: resolvePlacement
 * looks up the cursor cell among already-accepted positions, so handing it
 * an unclamped cursor that sits past every accepted position (because
 * nothing *can* be accepted there -- the room would not fit) leaves the
 * cursor unchanged and the ghost drawn off the floor. Clamping first turns
 * the cursor into a position the room could occupy at all; resolvePlacement
 * then snaps that clamped position onto a legal one.
 */
export function clampToFloor(x: number, w: number): number {
  return Math.max(0, Math.min(CELLS_PER_FLOOR - w, x))
}

/**
 * Resolves the cell under the cursor to the position a placement will
 * actually land on. The cursor cell is the room's left edge only when
 * pointing exactly at a legal one; pointing anywhere *inside* a legal
 * footprint means that footprint, not a new room starting under the
 * cursor -- otherwise an armed room can land on whatever already occupies
 * the cell just past the one the person meant (see the design doc, §8, on
 * why the ghost and the click must never disagree about this).
 *
 * `candidatesOnFloor` is the armed tool's accepted positions already
 * narrowed to the cursor's floor; this is a lookup over that list, not a
 * recomputation, and makes no `canApply` call of its own.
 *
 * 1. An exact match on an accepted position always wins: pointing at a
 *    legal left edge means that edge.
 * 2. Otherwise, among the accepted positions whose footprint contains the
 *    cursor (`x <= cursorX < x + w`), pick the one nearest to the cursor.
 *    Because containment requires `x <= cursorX`, "nearest" is always the
 *    one with the largest `x` -- there is no left/right ambiguity. Ties
 *    (two candidates sharing the same `x`, which does not arise from the
 *    real per-floor candidate list but can appear in synthetic data) go to
 *    whichever one appears first in `candidatesOnFloor`.
 * 3. If no accepted footprint contains the cursor, the cursor is returned
 *    unchanged: the placement is attempted where the person pointed and
 *    `canApply` refuses it with its reason, rather than the room jumping to
 *    a position the person was not pointing at.
 */
export function resolvePlacement(candidatesOnFloor: { x: number; w: number }[], cursorX: number): number {
  if (candidatesOnFloor.some((c) => c.x === cursorX)) return cursorX

  let resolved = cursorX
  let bestDistance = Infinity
  for (const c of candidatesOnFloor) {
    if (c.x > cursorX || cursorX >= c.x + c.w) continue
    const distance = cursorX - c.x
    if (distance < bestDistance) {
      bestDistance = distance
      resolved = c.x
    }
  }
  return resolved
}

/** Returns a disposer: removes every listener this call added and unsubscribes from the store. */
export function mountCanvas(canvas: HTMLElement, store: Store): () => void {
  // Build the DOM skeleton once, rather than inside paint(). .scene-scroll
  // is the element that actually scrolls; replacing canvas.innerHTML on
  // every paint used to destroy and recreate it each time, which reset its
  // scrollTop/scrollLeft to zero -- invisible with two floors, but with 25
  // it threw you back to the top of the vault on every placement, deletion,
  // undo and selection. Keeping .scene-scroll (and .refusal, which must
  // stay a sibling of it -- see the comment below) in place and updating
  // only .scene's own markup on each repaint means there is no scroll
  // position to lose in the first place.
  canvas.innerHTML =
    '<div class="scene-scroll"><div class="scene" data-cell-target></div></div>' +
    '<p class="refusal" data-refusal></p>'
  const sceneEl = canvas.querySelector<HTMLElement>('[data-cell-target]')!
  const refusalEl = canvas.querySelector<HTMLElement>('[data-refusal]')!

  // Every position the armed tool could legally occupy is 25 floors * 26
  // cells = 650 canApply calls, each of which clones the vault and walks
  // the reachability graph -- and paint() below runs on every store emit,
  // including a plain selection change that touches neither the vault nor
  // the tool. applyOp always hands back a new Vault object on an accepted
  // change (see vault.ts's `clone`), so `===` on the vault is a sound
  // "did anything this depends on change" signal: this cache keys on the
  // vault object, the armed tool and the mode, and recomputes only when one
  // of those three no longer matches what it last saw.
  let candidateCache: { vault: Vault; tool: string; mode: Mode; candidates: Candidate[] } | null = null

  const candidatesFor = (vault: Vault, tool: string, mode: Mode): Candidate[] => {
    if (
      candidateCache &&
      candidateCache.vault === vault &&
      candidateCache.tool === tool &&
      candidateCache.mode === mode
    ) {
      return candidateCache.candidates
    }
    const w = kindOf(tool).baseWidth
    const candidates: Candidate[] = []
    for (let floor = 0; floor < FLOOR_COUNT; floor++) {
      for (let x = 0; x < CELLS_PER_FLOOR; x++) {
        if (canApply(vault, { kind: 'place', type: tool, floor, x }, mode).ok) {
          candidates.push({ floor, x, w })
        }
      }
    }
    candidateCache = { vault, tool, mode, candidates }
    return candidates
  }

  const paint = () => {
    const { vault, selection, tool, mode } = store.state
    const candidates = tool ? candidatesFor(vault, tool, mode) : undefined
    // Only .scene's own markup is replaced -- .scene-scroll (its parent,
    // the thing that actually scrolls) and .refusal (its sibling; see the
    // mountCanvas comment on why .refusal must stay outside .scene-scroll)
    // are never touched, so neither loses state across a repaint.
    sceneEl.innerHTML = renderScene(vault, { problems: validate(vault), selection, candidates })
    // Any refusal shown for a previous action no longer applies once the
    // scene it was about has just been repainted; say() below sets a fresh
    // one when this repaint itself follows a refusal.
    refusalEl.textContent = ''
  }

  const say = (verdict: Verdict) => {
    refusalEl.textContent = describeRefusal(verdict)
  }

  // The hover ghost -- a room-sized outline that follows the cursor while a
  // tool is armed, green if `canApply` would accept a placement there and
  // red if it would not (see the design doc, §8). paint() rebuilds the
  // whole scene, both panels and the problems list, so running it on every
  // mousemove would be unusable; a click's worth of work per pixel moved.
  // Instead this mutates the one <rect data-ghost> renderScene always
  // emits (see scene.ts), and does so at most once per animation frame, no
  // matter how many mousemove events a fast drag fires in between.
  let pendingFrame: number | null = null
  let lastPointer: { x: number; y: number } | null = null

  const hideGhost = (): void => {
    canvas.querySelector<SVGRectElement>('[data-ghost]')?.setAttribute('visibility', 'hidden')
  }

  const updateGhost = (): void => {
    pendingFrame = null
    const { tool, vault, mode } = store.state
    const ghost = canvas.querySelector<SVGRectElement>('[data-ghost]')
    if (!ghost) return
    if (!tool || !lastPointer) {
      ghost.setAttribute('visibility', 'hidden')
      return
    }
    const svg = canvas.querySelector('svg')
    if (!svg) {
      ghost.setAttribute('visibility', 'hidden')
      return
    }
    const box = svg.getBoundingClientRect()
    const cell = cellFromPoint(box, svg.viewBox.baseVal.width, lastPointer.x, lastPointer.y)
    if (!cell) {
      // Outside the drawn grid entirely -- the gutter, past the last cell,
      // above the first floor, or below the last -- same as no tool armed.
      ghost.setAttribute('visibility', 'hidden')
      return
    }
    const { floor, x: cursorX } = cell
    const w = kindOf(tool).baseWidth
    // Clamp first so the cursor becomes a position the room could occupy at
    // all, then snap so it lands on a legal one -- see clampToFloor's own
    // comment for why the order matters.
    const clampedX = clampToFloor(cursorX, w)
    // Snap to whatever legal footprint the cursor is actually inside, so the
    // ghost -- and, via the same lookup in onClick, the placement itself --
    // shows exactly where a click here will put the room.
    const onFloor = candidatesFor(vault, tool, mode).filter((c) => c.floor === floor)
    const x = resolvePlacement(onFloor, clampedX)
    const verdict = canApply(vault, { kind: 'place', type: tool, floor, x }, mode)
    const top = SCENE_PAD_PX + floor * (FLOOR_PX + FLOOR_GAP_PX)
    // Same geometry scene.ts's roomGroup/candidateMark use for a footprint
    // at this floor/x/w, so the ghost lines up exactly with where the room
    // would actually land.
    ghost.setAttribute('x', String(SCENE_GUTTER_PX + x * CELL_PX + 1))
    ghost.setAttribute('y', String(top + 3))
    ghost.setAttribute('width', String(w * CELL_PX - 2))
    ghost.setAttribute('height', String(FLOOR_PX - 6))
    ghost.setAttribute('stroke', verdict.ok ? COLORS.accepted : COLORS.problem)
    ghost.setAttribute('visibility', 'visible')
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!store.state.tool) {
      hideGhost()
      return
    }
    lastPointer = { x: event.clientX, y: event.clientY }
    if (pendingFrame === null) {
      pendingFrame = requestAnimationFrame(updateGhost)
    }
  }

  const onMouseLeave = (): void => {
    lastPointer = null
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame)
      pendingFrame = null
    }
    hideGhost()
  }

  const removeRoom = (id: string): void => {
    const verdict = store.run({ kind: 'remove', id })
    if (verdict.ok) return
    // Show the refusal before asking about the cascade: confirm() blocks, so
    // without this order the person is asked whether to take the dependents
    // with it before ever being told the plain delete failed.
    say(verdict)
    void offerCascade(store, id, verdict)
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement

    // The close button of the selected room outranks the room beneath it:
    // it is drawn on top of what it deletes, so a click that reaches it was
    // aimed at it and nothing else, and must not fall through to selecting
    // that room again. It cannot collide with an armed tool -- arming one
    // puts the selection down, and the handle with it.
    const close = target.closest<HTMLElement>('[data-delete-room]')
    if (close?.dataset.deleteRoom) {
      removeRoom(close.dataset.deleteRoom)
      return
    }

    const room = target.closest<HTMLElement>('[data-room-id]')

    if (store.state.tool) {
      // Clicking a room that is already there was never a placement that
      // could succeed: no legal footprint overlaps an existing room, so this
      // only ever produced an "overlaps" refusal. Read it as what it looks
      // like -- reaching for that room -- and put the palette down.
      if (room) {
        store.setTool(null)
        store.select(room.dataset.roomId ?? null)
        say({ ok: true })
        return
      }
      const svg = canvas.querySelector('svg')
      if (!svg) return
      const box = svg.getBoundingClientRect()
      const cell = cellFromPoint(box, svg.viewBox.baseVal.width, event.clientX, event.clientY)
      // Outside the drawn grid: nothing was aimed at, so there is nothing to
      // attempt and nothing to refuse -- unlike a placement that was tried
      // and failed, silence here is correct, not a missing refusal message.
      // Clicking off the grid is also how you put the armed room down: there
      // is no other empty space to click, since every cell of every floor is
      // somewhere a room could go.
      if (!cell) {
        store.setTool(null)
        say({ ok: true })
        return
      }
      const { floor, x: cursorX } = cell
      const { vault, tool, mode } = store.state
      const w = kindOf(tool).baseWidth
      // Clamp first, then snap -- see clampToFloor's own comment for why.
      const clampedX = clampToFloor(cursorX, w)
      // Same snap the ghost applies, from the same cached candidates, so a
      // click can never place a room somewhere the ghost was not showing.
      const onFloor = candidatesFor(vault, tool, mode).filter((c) => c.floor === floor)
      const x = resolvePlacement(onFloor, clampedX)
      say(store.run({ kind: 'place', type: tool, floor, x }))
      return
    }

    store.select(room?.dataset.roomId ?? null)
  }

  const onKeydown = (event: KeyboardEvent) => {
    // The keydown listener lives on `document` so arrow keys and Delete work
    // wherever the canvas last put focus, which means it sees every keystroke
    // the page receives -- including ones meant for a text box, where Delete
    // and Backspace and Ctrl+Z all mean something else entirely. Nothing
    // editable ships today (the vault-name field this was written for is
    // gone), but an unguarded document-level handler that swallows Delete is
    // not something to leave lying around for the next input to walk into.
    if (isEditableTarget(event.target)) return

    const { selection, tool, vault } = store.state
    if (event.key === 'Escape') {
      // Escape means "never mind", so it leaves whichever of the two modes
      // the editor is in -- it used to put an armed room down and leave a
      // selected one selected, with nothing else on the keyboard able to
      // let go of it. A branch rather than both calls: the store keeps the
      // two exclusive, so clearing the other would be a second repaint for
      // a half that is already empty.
      tool ? store.setTool(null) : store.select(null)
      return
    }
    if ((event.key === 'z' || event.key === 'Z') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.shiftKey ? store.redo() : store.undo()
      return
    }
    if (!selection) return
    const room = findRoom(vault, selection)
    if (!room) return

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      removeRoom(selection)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const dx = event.key === 'ArrowLeft' ? -1 : 1
      say(store.run({ kind: 'move', id: selection, floor: room.floor, x: room.x + dx }))
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const dy = event.key === 'ArrowUp' ? -1 : 1
      say(store.run({ kind: 'move', id: selection, floor: room.floor + dy, x: room.x }))
    }
    if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      // canApply accepts a split of a room that is not actually merged --
      // applyOp is a no-op on it, so nothing about it is wrong -- but
      // wiring that straight to store.run would still commit: it pushes
      // the (unchanged) vault onto the undo stack and clears redo, silently
      // burning whatever redo the person had queued up for no visible
      // effect. Refuse before it reaches the store instead.
      if (room.w <= kindOf(room.type).baseWidth) {
        say({ ok: false, reason: 'This room is not merged; there is nothing to split.', blame: [selection] })
        return
      }
      say(store.run({ kind: 'split', id: selection }))
    }
  }

  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseleave', onMouseLeave)
  document.addEventListener('keydown', onKeydown)
  const unsubscribe = store.subscribe(paint)
  paint()

  return () => {
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    document.removeEventListener('keydown', onKeydown)
    if (pendingFrame !== null) cancelAnimationFrame(pendingFrame)
    unsubscribe()
  }
}

async function offerCascade(store: Store, id: string, verdict: Verdict): Promise<void> {
  if (verdict.ok) return
  // cascadeFor only ever builds a removeMany op; its return type is the
  // broader Op union only because that is the shared operation type, not
  // because it can return anything else, so this is a fact, not a check.
  const op = cascadeFor(store.state.vault, id) as Extract<Op, { kind: 'removeMany' }>
  if (!canApply(store.state.vault, op, store.state.mode).ok) return
  if (await confirmCascade(op.ids.length)) store.run(op)
}
