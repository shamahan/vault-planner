import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../domain/grid'
import { canApply, cascadeFor, validate, type Mode, type Verdict } from '../domain/validate'
import { findRoom, type Level, type Op, type Vault } from '../domain/vault'
import { renderScene } from '../render/scene'
import { CELL_PX, COLORS, FLOOR_GAP_PX, FLOOR_PX, SCENE_GUTTER_PX, SCENE_PAD_PX } from '../render/theme'
import { confirmCascade } from './dialogs'
import { createDropResolver, type DropPlan, type Ghost } from './drag'
import { highlightFor, type Highlight, type Spot } from './highlight'
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

/** How far a press on a room may travel, in page pixels, and still be a click. */
const DRAG_THRESHOLD_PX = 4

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
  const scrollEl = canvas.querySelector<HTMLElement>('.scene-scroll')!

  // Where the armed tool could go is 25 floors * 26 cells of canApply
  // calls, each of which clones the vault and walks the reachability graph
  // -- and paint() below runs on every store emit, including a plain
  // selection change that touches neither the vault nor the tool. applyOp
  // always hands back a new Vault object on an accepted change (see
  // vault.ts's `clone`), so `===` on the vault is a sound "did anything this
  // depends on change" signal: this cache keys on the vault object, the
  // armed tool and the mode, and recomputes only when one of those three no
  // longer matches what it last saw.
  let placementCache: { vault: Vault; tool: string; mode: Mode; highlight: Highlight; accepted: Spot[] } | null = null

  const placementFor = (vault: Vault, tool: string, mode: Mode) => {
    if (placementCache && placementCache.vault === vault && placementCache.tool === tool && placementCache.mode === mode) {
      return placementCache
    }
    const highlight = highlightFor(vault, mode, kindOf(tool).baseWidth, (floor, x) => ({ kind: 'place', type: tool, floor, x }))
    placementCache = { vault, tool, mode, highlight, accepted: highlight.connected.concat(highlight.freeOnly) }
    return placementCache
  }

  // Every spot the current rules accept, both tiers: what the ghost and the
  // click snap to. Only the drawing tells the tiers apart.
  const candidatesFor = (vault: Vault, tool: string, mode: Mode): Spot[] => placementFor(vault, tool, mode).accepted

  // While a room is carried, the spots it could be dropped on -- worked out
  // once when the drag starts, since the vault cannot change mid-drag.
  let dragHighlight: Highlight | null = null

  const paint = () => {
    const { vault, selection, tool, mode } = store.state
    const highlight = dragHighlight ?? (tool ? placementFor(vault, tool, mode).highlight : null)
    // Only .scene's own markup is replaced -- .scene-scroll (its parent,
    // the thing that actually scrolls) and .refusal (its sibling; see the
    // mountCanvas comment on why .refusal must stay outside .scene-scroll)
    // are never touched, so neither loses state across a repaint.
    sceneEl.innerHTML = renderScene(vault, {
      problems: validate(vault),
      selection,
      candidates: highlight?.connected,
      freeOnly: highlight?.freeOnly,
    })
    // Any refusal shown for a previous action no longer applies once the
    // scene it was about has just been repainted; say() below sets a fresh
    // one when this repaint itself follows a refusal.
    refusalEl.textContent = ''
  }

  const say = (verdict: Verdict) => {
    refusalEl.textContent = describeRefusal(verdict)
  }

  // The floor/cell under a point on the page, or null off the grid. Reads
  // the svg afresh each time: paint() replaces it on every store emit.
  const cellAt = (clientX: number, clientY: number): { floor: number; x: number } | null => {
    const svg = canvas.querySelector('svg')
    if (!svg) return null
    return cellFromPoint(svg.getBoundingClientRect(), svg.viewBox.baseVal.width, clientX, clientY)
  }

  // Reveals a ghost slot over the footprint `at`, in the same geometry
  // scene.ts's roomGroup uses for a room at that floor/x/w, so a ghost lines
  // up exactly with where the room would actually land.
  const showGhost = (el: SVGRectElement | null, at: Ghost, stroke: string): void => {
    if (!el) return
    const top = SCENE_PAD_PX + at.floor * (FLOOR_PX + FLOOR_GAP_PX)
    el.setAttribute('x', String(SCENE_GUTTER_PX + at.x * CELL_PX + 1))
    el.setAttribute('y', String(top + 3))
    el.setAttribute('width', String(at.w * CELL_PX - 2))
    el.setAttribute('height', String(FLOOR_PX - 6))
    el.setAttribute('stroke', stroke)
    el.setAttribute('visibility', 'visible')
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
    showGhost(ghost, { floor, x, w }, verdict.ok ? COLORS.accepted : COLORS.problem)
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (drag) return
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
    if (drag) return
    lastPointer = null
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame)
      pendingFrame = null
    }
    hideGhost()
  }

  // Dragging a room -- see docs/superpowers/specs/2026-09-27-room-drag-swap-design.md.
  // A press on a movable room is only a candidate until the pointer has
  // travelled DRAG_THRESHOLD_PX: short of that it is a click, and onClick
  // handles it as one. Past it the room is being carried: each frame asks
  // the drop resolver what letting go there would do and draws the answer
  // as the ghosts, and letting go does exactly what the last frame drew.
  type Press = { pointerId: number; id: string; clientX: number; clientY: number; grabOffset: number }
  type Drag = { pointerId: number; resolve: (cell: { floor: number; x: number } | null) => DropPlan; plan: DropPlan }
  let press: Press | null = null
  let drag: Drag | null = null
  let dragPointer: { x: number; y: number } | null = null
  let dragFrame: number | null = null
  // The click a browser fires after the pointerup that ends a drag is not a
  // click on anything: left alone it would select or deselect whatever the
  // room was dropped on. The next pointerdown clears the flag, so a drag
  // let go where no click follows cannot eat the next real click.
  let swallowClick = false

  const markDragged = (id: string | null): void => {
    for (const el of canvas.querySelectorAll('[data-room-id]')) {
      el.toggleAttribute('data-dragging', el.getAttribute('data-room-id') === id)
    }
  }

  const hideDragGhosts = (): void => {
    canvas.querySelector('[data-ghost]')?.setAttribute('visibility', 'hidden')
    canvas.querySelector('[data-ghost-swap]')?.setAttribute('visibility', 'hidden')
  }

  const drawDrag = (): void => {
    dragFrame = null
    if (!drag || !dragPointer) return
    const plan = drag.resolve(cellAt(dragPointer.x, dragPointer.y))
    drag.plan = plan
    if (plan.kind === 'cancel') {
      hideDragGhosts()
      return
    }
    const stroke = plan.kind === 'refuse' ? COLORS.problem : COLORS.accepted
    showGhost(canvas.querySelector<SVGRectElement>('[data-ghost]'), plan.ghost, stroke)
    const swapGhost = canvas.querySelector<SVGRectElement>('[data-ghost-swap]')
    if (plan.kind !== 'stay' && plan.swapGhost) showGhost(swapGhost, plan.swapGhost, stroke)
    else swapGhost?.setAttribute('visibility', 'hidden')
  }

  const scheduleDragFrame = (): void => {
    if (dragFrame === null) dragFrame = requestAnimationFrame(drawDrag)
  }

  const endDrag = (): void => {
    const ended = drag
    if (!ended) return
    // Cleared first: releasing capture fires lostpointercapture, which must
    // find no drag left to end.
    drag = null
    dragPointer = null
    if (dragFrame !== null) {
      cancelAnimationFrame(dragFrame)
      dragFrame = null
    }
    if (canvas.hasPointerCapture(ended.pointerId)) canvas.releasePointerCapture(ended.pointerId)
    markDragged(null)
    hideDragGhosts()
    canvas.classList.remove('dragging')
    swallowClick = true
  }

  const startDrag = (p: Press, event: PointerEvent): void => {
    press = null
    if (!findRoom(store.state.vault, p.id)) {
      // The pressed room went (a key removed it) before the pointer
      // travelled far enough to carry it.
      return
    }
    if (pendingFrame !== null) {
      // A hover-ghost frame queued while a palette room was armed would
      // otherwise land after this one and hide the drag's ghost.
      cancelAnimationFrame(pendingFrame)
      pendingFrame = null
    }
    // Taking hold of a room selects it, and selecting puts an armed palette
    // room down -- the same as clicking a room with one armed. The repaint
    // this triggers happens now, before any ghost is drawn into it.
    store.select(p.id)
    const { vault, mode } = store.state
    drag = {
      pointerId: p.pointerId,
      resolve: createDropResolver(vault, mode, { id: p.id, grabOffset: p.grabOffset }),
      plan: { kind: 'cancel' },
    }
    dragPointer = { x: event.clientX, y: event.clientY }
    // Captured by the canvas, which paint() never replaces -- not by the
    // room's own element, which the repaint above has just thrown away.
    canvas.setPointerCapture(p.pointerId)
    canvas.classList.add('dragging')
    markDragged(p.id)
    scheduleDragFrame()
  }

  const onPointerDown = (event: PointerEvent): void => {
    swallowClick = false
    // A stale press from a button that came up somewhere the canvas never
    // heard about must not still be sitting here when a new one starts.
    press = null
    // Touch keeps scrolling the scene: a finger on a 25-floor vault is far
    // more often reaching for the floors below than for a room.
    if (drag || event.button !== 0 || event.pointerType === 'touch') return
    const target = event.target as Element
    if (target.closest('[data-delete-room]')) return
    const id = target.closest('[data-movable]')?.getAttribute('data-room-id')
    const room = id ? findRoom(store.state.vault, id) : undefined
    if (!room) return
    const cell = cellAt(event.clientX, event.clientY)
    const grabOffset = cell ? Math.max(0, Math.min(room.w - 1, cell.x - room.x)) : 0
    press = { pointerId: event.pointerId, id: room.id, clientX: event.clientX, clientY: event.clientY, grabOffset }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (drag) {
      if (event.pointerId !== drag.pointerId) return
      dragPointer = { x: event.clientX, y: event.clientY }
      scheduleDragFrame()
      return
    }
    if (!press || event.pointerId !== press.pointerId) return
    if ((event.buttons & 1) === 0) {
      // The button came up somewhere the canvas never heard about.
      press = null
      return
    }
    const travelled = Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY)
    if (travelled >= DRAG_THRESHOLD_PX) startDrag(press, event)
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (press?.pointerId === event.pointerId) {
      // It never went past the threshold: a click, which onClick will see.
      press = null
      return
    }
    if (!drag || event.pointerId !== drag.pointerId) return
    // Resolve the spot the pointer actually let go of, now, rather than act
    // on a frame that may be a move behind it: what happens is what the
    // ghost shows for this exact spot.
    dragPointer = { x: event.clientX, y: event.clientY }
    if (dragFrame !== null) cancelAnimationFrame(dragFrame)
    drawDrag()
    const plan = drag.plan
    endDrag()
    if (plan.kind === 'run') say(store.run(plan.op))
    else if (plan.kind === 'refuse') say(plan.verdict)
    else say({ ok: true })
  }

  const onPointerCancel = (event: PointerEvent): void => {
    if (press?.pointerId === event.pointerId) press = null
    if (drag?.pointerId === event.pointerId) endDrag()
  }

  const onScroll = (): void => {
    // The pointer has not moved, but the grid under it has.
    if (drag) scheduleDragFrame()
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
    if (swallowClick) {
      swallowClick = false
      return
    }
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

    // Mid-drag the keyboard does one thing, let go. Anything else would
    // change the vault under a drag still resolving drops against the vault
    // it started from.
    if (drag) {
      if (event.key === 'Escape') endDrag()
      return
    }

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
    if ((event.key === '1' || event.key === '2' || event.key === '3') &&
        !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      // canApply refuses a level the room does not have and the one it
      // already has, so a keypress never commits an unchanged vault.
      say(store.run({ kind: 'level', id: selection, level: Number(event.key) as Level }))
    }
  }

  canvas.addEventListener('click', onClick)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseleave', onMouseLeave)
  document.addEventListener('keydown', onKeydown)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('lostpointercapture', onPointerCancel)
  scrollEl.addEventListener('scroll', onScroll)
  const unsubscribe = store.subscribe(paint)
  paint()

  return () => {
    endDrag()
    canvas.removeEventListener('click', onClick)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    document.removeEventListener('keydown', onKeydown)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerCancel)
    canvas.removeEventListener('lostpointercapture', onPointerCancel)
    scrollEl.removeEventListener('scroll', onScroll)
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
