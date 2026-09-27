import { kindOf, placeableKinds, type RoomGroup } from '../domain/catalog'
import { floorLabel } from '../domain/grid'
import { validate, type Problem } from '../domain/validate'
import { findRoom, type Vault } from '../domain/vault'
import { GROUP_COLORS } from '../render/theme'
import { GLYPH_PATHS, roomGlyph, uiIcon } from '../render/icons'
import { escapeText } from '../shared/escape'
import type { Store } from './state'

const GROUP_ORDER: RoomGroup[] = [
  'infra', 'power', 'food', 'water', 'living', 'storage',
  'medical', 'training', 'crafting', 'misc', 'season',
]

const SEP = '<span class="sep" aria-hidden="true"></span>'

function problemsLabel(count: number): string {
  return `${count} ${count === 1 ? 'problem' : 'problems'}`
}

/**
 * The problems counter stands where the problems column was. The column
 * gave 300px of every screen to a list that is empty for a vault built
 * under Strict rules; the counter says the same "nothing wrong" in a few
 * words and opens the list only when there is one to read.
 */
function problemsToggle(count: number, open: boolean): string {
  const face = count === 0
    ? `${uiIcon('check')}<span>No problems</span>`
    : `${uiIcon('alert')}<span><span data-problems-count>${count}</span> ${count === 1 ? 'problem' : 'problems'}</span>` +
      uiIcon('chevronDown', 14)
  return (
    `<button type="button" class="chip${count > 0 ? ' has-problems' : ''}" data-problems-toggle ` +
    `aria-expanded="${open}" aria-controls="problems">${face}</button>`
  )
}

export function renderToolbar(store: Store, problemCount: number, problemsOpen: boolean): string {
  const { mode } = store.state
  const button = ([id, label]: [string, string]) => `<button type="button" data-action="${id}">${label}</button>`
  return (
    `<header class="toolbar">` +
    // The mark is the vault door glyph -- the favicon is the same path -- so
    // it is drawn from GLYPH_PATHS rather than copied, and cannot drift.
    `<span class="brand"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${GLYPH_PATHS.vault_door}" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>VAULT PLANNER</span>` +
    SEP +
    ([['new', 'New'], ['open', 'Open'], ['save', 'Save']] as [string, string][]).map(button).join('') +
    SEP +
    ([['share', 'Copy link'], ['export-png', 'Export PNG']] as [string, string][]).map(button).join('') +
    `<span class="spacer"></span>` +
    `<button type="button" data-action="undo"${store.canUndo ? '' : ' disabled'}>${uiIcon('undo')}Undo</button>` +
    `<button type="button" data-action="redo"${store.canRedo ? '' : ' disabled'}>${uiIcon('redo')}Redo</button>` +
    SEP +
    // Two buttons that name both rules, where a switch named only one: its
    // "off" position had to be read as Free.
    `<span class="rules-label" id="rules-label">Game rules</span>` +
    `<span class="seg" role="group" aria-labelledby="rules-label">` +
    `<button type="button" data-mode="strict" aria-pressed="${mode === 'strict'}">Strict</button>` +
    `<button type="button" data-mode="free" aria-pressed="${mode === 'free'}">Free</button>` +
    `</span>` +
    SEP +
    problemsToggle(problemCount, problemsOpen) +
    `</header>`
  )
}

export function renderPalette(store: Store): string {
  const kinds = placeableKinds()
  const groups = GROUP_ORDER
    .map((group) => ({ group, rooms: kinds.filter((k) => k.group === group) }))
    .filter((g) => g.rooms.length > 0)

  return (
    `<aside class="palette"><h2>Rooms</h2>` +
    groups.map(({ group, rooms }) =>
      `<section><h3 style="color:${GROUP_COLORS[group]}">${group.toUpperCase()}</h3>` +
      rooms.map((kind) => {
        const armed = store.state.tool === kind.id
        const hint = [kind.special, kind.popRequired ? `${kind.popRequired} dwellers` : '']
          .filter(Boolean).join(' · ')
        return (
          `<button type="button" data-place-type="${escapeText(kind.id)}" aria-pressed="${armed}">` +
          roomGlyph(kind, 18) +
          `<span class="label">${escapeText(kind.name)}</span>` +
          `<span class="hint">${escapeText(hint)}</span>` +
          `<span class="width">${kind.baseWidth}</span>` +
          `</button>`
        )
      }).join('') + `</section>`).join('') +
    // It came with the problems column, which is gone; the end of the room
    // list is the one place left that every visitor passes.
    `<footer class="disclaimer"><p>Unofficial fan-made planner. ` +
    `Not affiliated with Bethesda. All artwork original.</p></footer>` +
    `</aside>`
  )
}

/**
 * The list's rows: each problem, the room it is about and that room's
 * floor. The only part of the list that depends on the vault, so a repaint
 * replaces just this -- see mountPanels on why the list itself has to
 * survive.
 */
function problemsBody(v: Vault, problems: Problem[]): string {
  if (problems.length === 0) {
    return `<p class="ok">No problems. Every room has a route to the vault door.</p>`
  }
  return problems.map((p) => {
    const id = p.rooms[0]
    const room = id === undefined ? undefined : findRoom(v, id)
    const tile = room ? `<span class="tile">${roomGlyph(kindOf(room.type), 18)}</span>` : ''
    const floor = room ? `<span class="meta">FLOOR ${floorLabel(room.floor)}</span>` : ''
    return (
      `<button type="button" data-problem-room="${escapeText(id ?? '')}">` +
      `${tile}<span class="text"><span>${escapeText(p.message)}</span>${floor}</span>` +
      `${uiIcon('chevronRight')}</button>`
    )
  }).join('')
}

export function renderProblems(): string {
  return (
    `<section class="problems" id="problems" aria-label="Problems" hidden>` +
    `<h2 data-problems-title></h2>` +
    `<p class="note" data-problems-note></p>` +
    `<div class="problems-list" data-problems></div>` +
    `</section>`
  )
}

export function renderShell(): string {
  return `<div class="shell"><div data-toolbar></div>` +
    `<div class="body"><div data-palette></div>` +
    `<main class="canvas" data-canvas></main></div>` +
    `<div data-problems-panel></div></div>`
}

export function mountPanels(root: HTMLElement, store: Store): void {
  // Guard against multiple calls on the same root
  if ((root as any).__panelsMounted) return
  ;(root as any).__panelsMounted = true

  root.innerHTML = renderShell()

  // The palette and the problems list are scroll containers, and
  // mountCanvas already learned this the hard way for .scene-scroll:
  // replacing a scroll container's markup destroys the element that was
  // holding the scroll position, so it comes back at zero. Arming a room
  // from the palette repaints, so picking a room from halfway down the list
  // threw the list back to the top -- and took the focus ring off the button
  // that had just been clicked with it. So each one's DOM is built once,
  // here, and a repaint touches only the parts that actually differ.
  root.querySelector('[data-palette]')!.innerHTML = renderPalette(store)
  root.querySelector('[data-problems-panel]')!.innerHTML = renderProblems()

  const paletteButtons = [...root.querySelectorAll<HTMLElement>('[data-place-type]')]
  const list = root.querySelector<HTMLElement>('.problems')!
  const listTitle = root.querySelector<HTMLElement>('[data-problems-title]')!
  const listNote = root.querySelector<HTMLElement>('[data-problems-note]')!
  const listBody = root.querySelector<HTMLElement>('[data-problems]')!

  // Whether the problems list is open is the panels' own business: nothing
  // else reads it, and it is not worth an undo step or a save.
  let problemsOpen = false

  const paint = () => {
    const problems = validate(store.state.vault)

    // The toolbar is not a scroll container and holds nothing to lose.
    root.querySelector('[data-toolbar]')!.innerHTML = renderToolbar(store, problems.length, problemsOpen)

    // The room list never changes: the catalog is static, and the only
    // state renderPalette reads beyond it is which tool is armed. Should a
    // room ever need drawing differently for a particular vault -- greyed
    // out below its population requirement, say -- that would have to be
    // reflected here too, or the palette would quietly go stale.
    for (const button of paletteButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.placeType === store.state.tool))
    }

    listTitle.textContent = problems.length === 0 ? 'Problems' : problemsLabel(problems.length)
    // Under Strict rules a problem can only have arrived with the file; under
    // Free rules it is most likely the sketch itself, and worth saying so.
    listNote.textContent = problems.length > 0 && store.state.mode === 'free'
      ? 'Free rules let you sketch this. The game would not build it.'
      : ''
    listBody.innerHTML = problemsBody(store.state.vault, problems)
    list.hidden = !problemsOpen
  }

  const setOpen = (open: boolean): void => {
    problemsOpen = open
    paint()
  }

  // The room a problem is about, brought into view on the canvas. Looked up
  // by attribute rather than a selector, so an id needs no escaping.
  const scrollToRoom = (id: string): void => {
    const el = [...root.querySelectorAll('[data-room-id]')].find((r) => r.getAttribute('data-room-id') === id)
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    // A click anywhere but the list and its counter puts the list away --
    // then goes on to do whatever it was aimed at.
    if (problemsOpen && !target.closest('.problems, [data-problems-toggle]')) setOpen(false)

    const paletteButton = target.closest<HTMLElement>('[data-place-type]')
    if (paletteButton) {
      const type = paletteButton.dataset.placeType!
      store.setTool(store.state.tool === type ? null : type)
      return
    }
    if (target.closest('[data-problems-toggle]')) {
      setOpen(!problemsOpen)
      return
    }
    const mode = target.closest<HTMLElement>('[data-mode]')
    if (mode) {
      store.setMode(mode.dataset.mode === 'free' ? 'free' : 'strict')
      return
    }
    const problem = target.closest<HTMLElement>('[data-problem-room]')
    if (problem) {
      const id = problem.dataset.problemRoom || null
      store.select(id)
      setOpen(false)
      if (id) scrollToRoom(id)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && problemsOpen) setOpen(false)
  })

  store.subscribe(paint)
  paint()
}
