// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { Store } from '../../src/app/state'
import { mountPanels } from '../../src/app/panels'
import { createVault, type Vault } from '../../src/domain/vault'
import { placeableKinds } from '../../src/domain/catalog'
import { GLYPH_PATHS } from '../../src/render/icons'

function mount(vault: Vault = createVault()) {
  localStorage.clear()
  document.body.innerHTML = '<div id="app"></div>'
  const root = document.querySelector<HTMLElement>('#app')!
  const store = new Store(vault)
  mountPanels(root, store)
  return { root, store }
}

beforeEach(() => localStorage.clear())

describe('panels', () => {
  it('offers every placeable room and never the vault door', () => {
    const { root } = mount()
    const buttons = root.querySelectorAll('[data-place-type]')
    expect(buttons).toHaveLength(placeableKinds().length)
    expect(root.querySelector('[data-place-type="vault_door"]')).toBeNull()
  })

  it('offers each toolbar action once, and one picture format', () => {
    const { root } = mount()
    const actions = [...root.querySelectorAll('.toolbar [data-action]')]
      .map((b) => [b.getAttribute('data-action'), b.textContent])
    // Open and Save move the layout itself; the extension is the file
    // dialog's business, not the button's. Export PNG is the only picture
    // out -- SVG went the same way, since a picture is taken to show
    // someone and PNG opens for everyone.
    expect(actions).toEqual([
      ['new', 'New'], ['open', 'Open'], ['save', 'Save'],
      ['share', 'Copy link'], ['export-png', 'Export PNG'],
      ['undo', 'Undo'], ['redo', 'Redo'],
    ])
  })

  it('marks the toolbar with the vault door, and names the tool beside it', () => {
    const { root } = mount()
    const brand = root.querySelector('.toolbar .brand')!
    expect(brand.querySelector('path')?.getAttribute('d')).toBe(GLYPH_PATHS.vault_door)
    // Decoration: the words beside it already say what it says.
    expect(brand.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(brand.textContent).toBe('VAULT PLANNER')
  })

  it('offers nothing to type into', () => {
    const { root } = mount()
    // The vault name was an editable field with nothing to do: naming a
    // layout only pays off against a catalogue of them, and there is none.
    // It still exists in the format, titles the exported picture and names
    // the downloaded file -- it simply is not edited here any more.
    expect(root.querySelectorAll('input, textarea')).toHaveLength(0)
  })

  it('shows the rules that are actually in force', () => {
    const { root, store } = mount()
    const pressed = (mode: string) => root.querySelector(`[data-mode="${mode}"]`)?.getAttribute('aria-pressed')
    expect(pressed('strict')).toBe('true')
    expect(pressed('free')).toBe('false')
    store.setMode('free')
    expect(pressed('strict')).toBe('false')
    expect(pressed('free')).toBe('true')
  })

  it('switches the rules from the toolbar', () => {
    const { root, store } = mount()
    root.querySelector<HTMLElement>('[data-mode="free"]')!.click()
    expect(store.state.mode).toBe('free')
    root.querySelector<HTMLElement>('[data-mode="strict"]')!.click()
    expect(store.state.mode).toBe('strict')
  })

  it('says the vault is sound when it is', () => {
    const { root } = mount()
    expect(root.querySelector('[data-problems]')?.textContent).toMatch(/no problems/i)
  })

  it('lists a problem per stranded room, each clickable', () => {
    const broken = createVault()
    broken.rooms.push({ id: 'lost', type: 'diner', floor: 3, x: 12, w: 3 })
    const { root } = mount(broken)
    const items = root.querySelectorAll('[data-problem-room]')
    expect(items).toHaveLength(1)
    expect(items[0]!.getAttribute('data-problem-room')).toBe('lost')
  })

  it('arms the palette when a room type is chosen', () => {
    const { root, store } = mount()
    root.querySelector<HTMLButtonElement>('[data-place-type="elevator"]')!.click()
    expect(store.state.tool).toBe('elevator')
    expect(root.querySelector('[data-place-type="elevator"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('disarms it when the same type is chosen again', () => {
    const { root, store } = mount()
    const button = () => root.querySelector<HTMLButtonElement>('[data-place-type="elevator"]')!
    button().click()
    button().click()
    expect(store.state.tool).toBeNull()
  })

  it('disables undo until there is something to undo', () => {
    const { root, store } = mount()
    expect(root.querySelector('[data-action="undo"]')?.hasAttribute('disabled')).toBe(true)
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(root.querySelector('[data-action="undo"]')?.hasAttribute('disabled')).toBe(false)
  })

  it('carries the disclaimer the project promised', () => {
    const { root } = mount()
    expect(root.textContent).toMatch(/not affiliated with Bethesda/i)
  })

  it('escapes problem room ids in data attributes', () => {
    const broken = createVault()
    broken.rooms.push({ id: 'r"bad', type: 'diner', floor: 3, x: 12, w: 3 })
    const { root } = mount(broken)
    const button = root.querySelector('[data-problem-room]')
    // getAttribute returns the unescaped value after browser parsing
    expect(button?.getAttribute('data-problem-room')).toBe('r"bad')
  })
})

describe('the palette and the selection', () => {
  /**
   * The reported bug: a room stayed outlined on the canvas, close handle
   * and all, after the palette had been used to arm a different one. The
   * keys follow the selection, so the editor was left listening for arrow
   * keys and Delete on behalf of a room the hand had already left.
   */
  it('clears a canvas selection when a room is armed from the palette', () => {
    const { root, store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.select(store.state.vault.rooms.find((r) => r.type === 'elevator')!.id)

    root.querySelector<HTMLElement>('[data-place-type="diner"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(store.state.tool).toBe('diner')
    expect(store.state.selection).toBeNull()
  })

  /**
   * And the same fault in the other direction: the problems list selects a
   * room without putting the palette down, so clicking a problem while
   * armed left the editor in the same split state by the other route.
   */
  it('puts an armed room down when a problem is clicked', () => {
    // A stranded room, built directly: strict mode exists precisely to stop
    // one being placed, so the only way to have a problem to click is to
    // start from a vault that already has it.
    const broken = createVault()
    broken.rooms.push({ id: 'lost', type: 'diner', floor: 3, x: 12, w: 3 })
    const { root, store } = mount(broken)
    store.setTool('garden')

    const problem = root.querySelector<HTMLElement>('[data-problem-room]')!
    problem.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(store.state.selection).toBe('lost')
    expect(store.state.tool).toBeNull()
  })
})

describe('repainting the panels', () => {
  it('keeps the scroll containers themselves alive across a repaint', () => {
    const { root, store } = mount()
    const palette = root.querySelector('.palette')
    const problems = root.querySelector('.problems')

    store.setTool('diner')
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })

    // Identity, not equality: these are the elements holding the scroll
    // position, and a replaced one comes back scrolled to the top. jsdom
    // has no layout, so scrollTop itself is only measurable in the browser
    // test -- what is checkable here is that nothing replaced them.
    expect(root.querySelector('.palette')).toBe(palette)
    expect(root.querySelector('.problems')).toBe(problems)
  })

  it('still arms the clicked room and disarms the one before it', () => {
    const { root, store } = mount()
    const diner = root.querySelector('[data-place-type="diner"]')!
    const garden = root.querySelector('[data-place-type="garden"]')!

    store.setTool('diner')
    expect(diner.getAttribute('aria-pressed')).toBe('true')
    expect(garden.getAttribute('aria-pressed')).toBe('false')

    store.setTool('garden')
    expect(diner.getAttribute('aria-pressed')).toBe('false')
    expect(garden.getAttribute('aria-pressed')).toBe('true')
  })

  it('still updates the problem list and its count in place', () => {
    const { root, store } = mount()
    expect(root.querySelector('[data-problems-count]')).toBeNull()

    store.setMode('free')
    store.run({ kind: 'place', type: 'diner', floor: 6, x: 3 })

    expect(root.querySelector('[data-problems-count]')?.textContent).toBe('1')
    expect(root.querySelectorAll('[data-problem-room]').length).toBe(1)
  })
})

describe('the problems list', () => {
  function broken(): Vault {
    const v = createVault()
    v.rooms.push({ id: 'lost', type: 'diner', floor: 3, x: 12, w: 3 })
    return v
  }
  const toggle = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-problems-toggle]')!
  const list = (root: HTMLElement) => root.querySelector<HTMLElement>('.problems')!

  it('counts the problems in the toolbar, and says so when there are none', () => {
    expect(toggle(mount().root).textContent).toBe('No problems')
    expect(toggle(mount(broken()).root).textContent).toBe('1 problem')
  })

  it('opens from the counter and closes from it again', () => {
    const { root } = mount(broken())
    expect(list(root).hidden).toBe(true)
    toggle(root).click()
    expect(list(root).hidden).toBe(false)
    expect(toggle(root).getAttribute('aria-expanded')).toBe('true')
    toggle(root).click()
    expect(list(root).hidden).toBe(true)
    expect(toggle(root).getAttribute('aria-expanded')).toBe('false')
  })

  it('closes when a problem is picked, on Escape, and on a click anywhere else', () => {
    const { root, store } = mount(broken())
    toggle(root).click()
    root.querySelector<HTMLElement>('[data-problem-room]')!.click()
    expect(store.state.selection).toBe('lost')
    expect(list(root).hidden).toBe(true)

    toggle(root).click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(list(root).hidden).toBe(true)

    toggle(root).click()
    root.querySelector<HTMLElement>('[data-place-type="diner"]')!.click()
    expect(list(root).hidden).toBe(true)
  })

  it('tells a sketch under Free rules from a vault that arrived broken', () => {
    const { root, store } = mount(broken())
    expect(root.querySelector('[data-problems-note]')?.textContent).toBe('')
    store.setMode('free')
    expect(root.querySelector('[data-problems-note]')?.textContent)
      .toBe('Free rules let you sketch this. The game would not build it.')
  })

  it('names the floor of the room each problem is about', () => {
    const { root } = mount(broken())
    expect(root.querySelector('[data-problem-room="lost"]')?.textContent).toContain('FLOOR 4')
  })
})
