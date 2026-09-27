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

/**
 * The sheets a narrow screen opens over the grid: the room list, the
 * problems list and the menu. One at a time. On a wide screen the room list
 * is always on screen and the menu has no button, so only the problems
 * list ever opens there, under its counter.
 */
export type Sheet = 'rooms' | 'problems' | 'menu'

const CLOSE = '<button type="button" class="icon-only" data-sheet-close aria-label="Close">'

const DISCLAIMER =
  `<footer class="disclaimer"><p>Unofficial fan-made planner. ` +
  `Not affiliated with Bethesda. All artwork original.</p></footer>`

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

function rulesButtons(mode: string, labelledBy: string): string {
  return (
    `<span class="seg" role="group" ${labelledBy}>` +
    `<button type="button" data-mode="strict" aria-pressed="${mode === 'strict'}">Strict</button>` +
    `<button type="button" data-mode="free" aria-pressed="${mode === 'free'}">Free</button>` +
    `</span>`
  )
}

/**
 * One toolbar for every width; style.css decides what shows at which. The
 * groups below are wrapped so a breakpoint can take a whole group away: the
 * file actions go to the menu under 1100px, the rules and the counter go
 * under 720px (the rules to the menu, the counter to the bar along the
 * bottom), leaving the rules named beside the mark.
 */
export function renderToolbar(store: Store, problemCount: number, sheet: Sheet | null): string {
  const { mode } = store.state
  const button = ([id, label]: [string, string]) => `<button type="button" data-action="${id}">${label}</button>`
  return (
    `<header class="toolbar">` +
    // The mark is the vault door glyph -- the favicon is the same path -- so
    // it is drawn from GLYPH_PATHS rather than copied, and cannot drift.
    `<span class="brand"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${GLYPH_PATHS.vault_door}" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>VAULT PLANNER</span>` +
    `<span class="rules-tag">${mode === 'free' ? 'FREE' : 'STRICT'}</span>` +
    `<button type="button" class="rooms-button" data-rooms-toggle aria-controls="rooms" ` +
    `aria-expanded="${sheet === 'rooms'}">Rooms</button>` +
    `<span class="toolbar-files">` + SEP +
    ([['new', 'New'], ['open', 'Open'], ['save', 'Save']] as [string, string][]).map(button).join('') +
    SEP +
    ([['share', 'Copy link'], ['export-png', 'Export PNG']] as [string, string][]).map(button).join('') +
    `</span>` +
    `<span class="spacer"></span>` +
    // The words stay in the button when a narrow screen hides them from
    // sight, so the button keeps its name.
    `<button type="button" data-action="undo"${store.canUndo ? '' : ' disabled'}>` +
    `${uiIcon('undo')}<span class="label-text">Undo</span></button>` +
    `<button type="button" data-action="redo"${store.canRedo ? '' : ' disabled'}>` +
    `${uiIcon('redo')}<span class="label-text">Redo</span></button>` +
    `<span class="toolbar-rules">` + SEP +
    // Two buttons that name both rules, where a switch named only one: its
    // "off" position had to be read as Free.
    `<span class="rules-label" id="rules-label">Game rules</span>` +
    rulesButtons(mode, 'aria-labelledby="rules-label"') +
    `</span>` +
    `<span class="toolbar-problems">` + SEP + problemsToggle(problemCount, sheet === 'problems') + `</span>` +
    `<button type="button" class="icon-only menu-button" data-menu-toggle aria-label="Menu" ` +
    `aria-controls="menu" aria-expanded="${sheet === 'menu'}">${uiIcon('menu', 20)}</button>` +
    `</header>`
  )
}

/** Along the bottom of a phone: the counter, and the way into the room list. */
export function renderMobileBar(problemCount: number, sheet: Sheet | null): string {
  return (
    `<div class="mobile-bar">` +
    problemsToggle(problemCount, sheet === 'problems') +
    `<span class="spacer"></span>` +
    `<button type="button" class="primary" data-rooms-toggle aria-controls="rooms" ` +
    `aria-expanded="${sheet === 'rooms'}">${uiIcon('plus', 18)}Add room</button>` +
    `</div>`
  )
}

/**
 * Everything the toolbar has no room for on a narrow screen: the file
 * actions -- the same data-action buttons main.ts already answers -- and the
 * rules, with a line on what the ones in force mean.
 */
export function renderMenu(): string {
  const item = (action: string, label: string, meta = '') =>
    `<button type="button" data-action="${action}"><span>${label}</span>` +
    (meta ? `<span class="meta">${meta}</span>` : '') + `</button>`
  return (
    `<section class="menu" id="menu" aria-label="Menu" hidden>` +
    `<div class="sheet-head"><h2>Vault</h2>${CLOSE}${uiIcon('close', 18)}</button></div>` +
    `<div class="menu-actions">` +
    item('new', 'New vault') + item('open', 'Open file', 'JSON') + item('save', 'Save file', 'JSON') +
    item('share', 'Copy link') + item('export-png', 'Export picture', 'PNG') +
    `</div>` +
    `<h3 id="menu-rules-label">Game rules</h3>` +
    rulesButtons('strict', 'aria-labelledby="menu-rules-label"') +
    `<p class="note" data-rules-note></p>` +
    `<p class="small">Kept on this device. Not written into the file or the link.</p>` +
    DISCLAIMER +
    `</section>`
  )
}

export function renderPalette(store: Store): string {
  const kinds = placeableKinds()
  const groups = GROUP_ORDER
    .map((group) => ({ group, rooms: kinds.filter((k) => k.group === group) }))
    .filter((g) => g.rooms.length > 0)

  return (
    `<aside class="palette" id="rooms">` +
    // The close button is for the narrow screens, where the list is a sheet
    // over the grid; style.css hides it where the list is always there.
    `<div class="sheet-head"><h2>Rooms</h2>${CLOSE}${uiIcon('close', 18)}</button></div>` +
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
    DISCLAIMER +
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
    `<div data-mobile-bar></div>` +
    `<div data-problems-panel></div>` +
    `<div data-menu-panel></div>` +
    // Under a sheet on a narrow screen; a tap on it puts the sheet away.
    `<div class="scrim" aria-hidden="true"></div></div>`
}

/** What counts as inside each sheet: the sheet itself, and whatever opens it. */
const SHEET_PARTS: Record<Sheet, string> = {
  rooms: '.palette, [data-rooms-toggle]',
  problems: '.problems, [data-problems-toggle]',
  menu: '.menu, [data-menu-toggle]',
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
  root.querySelector('[data-menu-panel]')!.innerHTML = renderMenu()

  const paletteButtons = [...root.querySelectorAll<HTMLElement>('[data-place-type]')]
  const list = root.querySelector<HTMLElement>('.problems')!
  const listTitle = root.querySelector<HTMLElement>('[data-problems-title]')!
  const listNote = root.querySelector<HTMLElement>('[data-problems-note]')!
  const listBody = root.querySelector<HTMLElement>('[data-problems]')!
  const shell = root.querySelector<HTMLElement>('.shell')!
  const menu = root.querySelector<HTMLElement>('.menu')!
  const menuRules = [...menu.querySelectorAll<HTMLElement>('[data-mode]')]
  const rulesNote = menu.querySelector<HTMLElement>('[data-rules-note]')!

  // Which sheet is open is the panels' own business: nothing else reads it,
  // and it is not worth an undo step or a save.
  let sheet: Sheet | null = null

  const paint = () => {
    const problems = validate(store.state.vault)

    // Neither the toolbar nor the bottom bar is a scroll container, and
    // neither holds anything to lose.
    root.querySelector('[data-toolbar]')!.innerHTML = renderToolbar(store, problems.length, sheet)
    root.querySelector('[data-mobile-bar]')!.innerHTML = renderMobileBar(problems.length, sheet)

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
    list.hidden = sheet !== 'problems'

    // The menu is built once like the lists; only its rules change.
    const mode = store.state.mode
    for (const button of menuRules) button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
    rulesNote.textContent = mode === 'free'
      ? 'Rooms can go anywhere they fit. The problems counter says what the game would refuse.'
      : 'You can only dig down where there is an elevator, and no delete may cut rooms off from the vault door.'
    menu.hidden = sheet !== 'menu'

    for (const name of ['rooms', 'problems', 'menu'] as const) {
      shell.classList.toggle(`${name}-open`, sheet === name)
    }
  }

  const setSheet = (next: Sheet | null): void => {
    sheet = next
    paint()
  }
  const toggle = (name: Sheet): void => setSheet(sheet === name ? null : name)

  // The room a problem is about, brought into view on the canvas. Looked up
  // by attribute rather than a selector, so an id needs no escaping.
  const scrollToRoom = (id: string): void => {
    const el = [...root.querySelectorAll('[data-room-id]')].find((r) => r.getAttribute('data-room-id') === id)
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    // A click anywhere but the open sheet and whatever opens it puts the
    // sheet away -- then goes on to do whatever it was aimed at. The scrim
    // under a sheet is such a click.
    if (sheet && !target.closest(SHEET_PARTS[sheet])) setSheet(null)

    if (target.closest('[data-sheet-close]')) {
      setSheet(null)
      return
    }
    const paletteButton = target.closest<HTMLElement>('[data-place-type]')
    if (paletteButton) {
      const type = paletteButton.dataset.placeType!
      store.setTool(store.state.tool === type ? null : type)
      // On a narrow screen the list is over the grid the room goes on.
      if (sheet === 'rooms') setSheet(null)
      return
    }
    if (target.closest('[data-rooms-toggle]')) {
      toggle('rooms')
      return
    }
    if (target.closest('[data-problems-toggle]')) {
      toggle('problems')
      return
    }
    if (target.closest('[data-menu-toggle]')) {
      toggle('menu')
      return
    }
    const mode = target.closest<HTMLElement>('[data-mode]')
    if (mode) {
      store.setMode(mode.dataset.mode === 'free' ? 'free' : 'strict')
      return
    }
    // main.ts carries the action out; the menu only has to get out of the way.
    if (target.closest('.menu [data-action]')) {
      setSheet(null)
      return
    }
    const problem = target.closest<HTMLElement>('[data-problem-room]')
    if (problem) {
      const id = problem.dataset.problemRoom || null
      store.select(id)
      setSheet(null)
      if (id) scrollToRoom(id)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet) setSheet(null)
  })

  store.subscribe(paint)
  paint()
}
