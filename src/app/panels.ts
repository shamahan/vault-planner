import { placeableKinds, type RoomGroup, type RoomKind } from '../domain/catalog'
import { validate } from '../domain/validate'
import { GROUP_COLORS } from '../render/theme'
import { GLYPH_PATHS } from '../render/icons'
import { escapeText } from '../shared/escape'
import type { Store } from './state'

const GROUP_ORDER: RoomGroup[] = [
  'infra', 'power', 'food', 'water', 'living', 'storage',
  'medical', 'training', 'crafting', 'misc', 'season',
]

function glyphSvg(kind: RoomKind, size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${GLYPH_PATHS[kind.glyph] ?? ''}" fill="none" stroke="${GROUP_COLORS[kind.group]}" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

export function renderToolbar(store: Store): string {
  const { mode } = store.state
  const actions = [
    ['new', 'New'], ['open', 'Open'], ['save', 'Save'],
    ['share', 'Copy link'], ['export-png', 'Export PNG'],
  ]
  return (
    `<header class="toolbar">` +
    `<span class="brand">VAULT PLANNER</span>` +
    actions.map(([id, label]) =>
      `<button type="button" data-action="${id}">${label}</button>`).join('') +
    `<span class="spacer"></span>` +
    `<button type="button" data-action="undo"${store.canUndo ? '' : ' disabled'}>Undo</button>` +
    `<button type="button" data-action="redo"${store.canRedo ? '' : ' disabled'}>Redo</button>` +
    `<span class="mode">Game rules: <strong>${mode === 'strict' ? 'Strict' : 'Free'}</strong></span>` +
    `<button type="button" role="switch" data-mode-toggle ` +
    `aria-checked="${mode === 'strict'}" aria-label="Game rules"></button>` +
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
          glyphSvg(kind, 18) +
          `<span class="label">${escapeText(kind.name)}</span>` +
          `<span class="hint">${escapeText(hint)}</span>` +
          `<span class="width">${kind.baseWidth}</span>` +
          `</button>`
        )
      }).join('') + `</section>`).join('') +
    `</aside>`
  )
}

/**
 * The only part of the problems panel that depends on the vault: its count
 * and its list. Kept separate from the panel around it so a repaint can
 * replace just this much -- see mountPanels on why the panel itself has to
 * survive.
 */
function problemsList(store: Store): { count: number; body: string } {
  const problems = validate(store.state.vault)
  const body = problems.length === 0
    ? `<p class="ok">No problems. Every room has a route to the vault door.</p>`
    : problems.map((p) =>
        `<button type="button" data-problem-room="${escapeText(p.rooms[0] ?? '')}">` +
        `${escapeText(p.message)}</button>`).join('')
  return { count: problems.length, body }
}

export function renderProblems(store: Store): string {
  const { count, body } = problemsList(store)

  return (
    `<aside class="problems"><h2>Problems <span class="count">${count}</span></h2>` +
    `<div data-problems>${body}</div>` +
    `<footer class="disclaimer">` +
    `<p>Unofficial fan-made planner. ` +
    `Not affiliated with Bethesda. All artwork original.</p>` +
    `</footer></aside>`
  )
}

export function renderShell(): string {
  return `<div class="shell"><div data-toolbar></div>` +
    `<div class="body"><div data-palette></div>` +
    `<main class="canvas" data-canvas></main>` +
    `<div data-problems-panel></div></div></div>`
}

export function mountPanels(root: HTMLElement, store: Store): void {
  // Guard against multiple calls on the same root
  if ((root as any).__panelsMounted) return
  ;(root as any).__panelsMounted = true

  root.innerHTML = renderShell()

  // Both side panels are scroll containers, and mountCanvas already learned
  // this the hard way for .scene-scroll: replacing a scroll container's
  // markup destroys the element that was holding the scroll position, so it
  // comes back at zero. Arming a room from the palette repaints, so picking
  // a room from halfway down the list threw the list back to the top -- and
  // took the focus ring off the button that had just been clicked with it.
  // So each panel's DOM is built once, here, and a repaint touches only the
  // parts that actually differ.
  root.querySelector('[data-palette]')!.innerHTML = renderPalette(store)
  root.querySelector('[data-problems-panel]')!.innerHTML = renderProblems(store)

  const paletteButtons = [...root.querySelectorAll<HTMLElement>('[data-place-type]')]
  const problemsCount = root.querySelector<HTMLElement>('.problems .count')!
  const problemsBody = root.querySelector<HTMLElement>('[data-problems]')!

  const paint = () => {
    // The toolbar is not a scroll container and holds nothing to lose.
    root.querySelector('[data-toolbar]')!.innerHTML = renderToolbar(store)

    // The room list never changes: the catalog is static, and the only
    // state renderPalette reads beyond it is which tool is armed. Should a
    // room ever need drawing differently for a particular vault -- greyed
    // out below its population requirement, say -- that would have to be
    // reflected here too, or the palette would quietly go stale.
    for (const button of paletteButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.placeType === store.state.tool))
    }

    const { count, body } = problemsList(store)
    problemsCount.textContent = String(count)
    problemsBody.innerHTML = body
  }

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const paletteButton = target.closest<HTMLElement>('[data-place-type]')
    if (paletteButton) {
      const type = paletteButton.dataset.placeType!
      store.setTool(store.state.tool === type ? null : type)
      return
    }
    if (target.closest('[data-mode-toggle]')) {
      store.setMode(store.state.mode === 'strict' ? 'free' : 'strict')
      return
    }
    const problem = target.closest<HTMLElement>('[data-problem-room]')
    if (problem) store.select(problem.dataset.problemRoom || null)
  })

  store.subscribe(paint)
  paint()
}
