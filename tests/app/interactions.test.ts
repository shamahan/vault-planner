// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest'
import { Store } from '../../src/app/state'
import { mountCanvas, cellFromPoint, resolvePlacement, clampToFloor } from '../../src/app/interactions'
import { createVault, findRoom, type Vault } from '../../src/domain/vault'
import { canApply } from '../../src/domain/validate'
import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../../src/domain/grid'
import { CELL_PX, COLORS, FLOOR_GAP_PX, FLOOR_PX, SCENE_GUTTER_PX, SCENE_PAD_PX } from '../../src/render/theme'

// mountCanvas binds its keydown listener to `document`, which every test in
// this file shares. Without disposing of it, an earlier test's listener
// stays live -- bound to that test's own (discarded) store -- and fires
// again on every later test's keydown dispatches. mount() collects the
// disposer so afterEach can tear each one down.
let cleanups: Array<() => void> = []

function mount(vault: Vault = createVault()) {
  localStorage.clear()
  document.body.innerHTML = '<main id="canvas"></main>'
  const canvas = document.querySelector<HTMLElement>('#canvas')!
  const store = new Store(vault)
  cleanups.push(mountCanvas(canvas, store))
  return { canvas, store }
}

function clickRoom(canvas: HTMLElement, id: string) {
  canvas.querySelector(`[data-room-id="${id}"]`)!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/**
 * jsdom gives every element a zero rect and reports the SVG's viewBox as
 * all zeros too. Stubbing both explicitly (rather than relying on jsdom's
 * defaults) makes the scale jsdom falls back to -- `rect.width / viewBoxWidth
 * || 1` is 1 -- an intentional, documented part of the test rather than an
 * accident of the test environment.
 */
function stubZeroLayout(svg: SVGSVGElement): void {
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect
  Object.defineProperty(svg, 'viewBox', {
    value: { baseVal: { width: 0, height: 0, x: 0, y: 0 } },
    configurable: true,
  })
}

function clickCell(canvas: HTMLElement, clientX: number, clientY: number): void {
  const svg = canvas.querySelector('svg')!
  stubZeroLayout(svg)
  canvas.querySelector('[data-cell-target]')!.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX, clientY }),
  )
}

/**
 * jsdom 25 has no PointerEvent and no pointer capture. The canvas reads
 * pointerId, pointerType and button off its pointer events and calls the
 * three capture methods on itself; this is the least that satisfies both,
 * kept here so the production code carries nothing for jsdom's sake.
 */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

beforeAll(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
})

beforeEach(() => localStorage.clear())

afterEach(() => {
  cleanups.forEach((dispose) => dispose())
  cleanups = []
})

describe('canvas interactions', () => {
  it('draws the vault it was given', () => {
    const { canvas } = mount()
    expect(canvas.querySelector('[data-room-id="door"]')).not.toBeNull()
  })

  it('selects a room when it is clicked', () => {
    const { canvas, store } = mount()
    clickRoom(canvas, 'door')
    expect(store.state.selection).toBe('door')
  })

  it('shows a refusal in words instead of doing nothing', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    // Floor 5 is empty and the vault has no elevator anywhere, so any room
    // placed there has no route back to the vault door -- strict mode must
    // refuse it. Coordinates are derived from the theme constants, the same
    // way cellFromPoint's own tests below derive theirs, so a change to the
    // theme moves this click along with the grid instead of missing it.
    const clientX = SCENE_GUTTER_PX + 10 * CELL_PX + 1
    const clientY = SCENE_PAD_PX + 5 * (FLOOR_PX + FLOOR_GAP_PX) + 1
    clickCell(canvas, clientX, clientY)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '')
      .toMatch(/no route back to the vault door/i)
  })

  it('deletes the selected room on Delete', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id
    store.select(id)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.state.vault.rooms.some((r) => r.id === id)).toBe(false)
  })

  it('never deletes the vault door', () => {
    const { store } = mount()
    store.select('door')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(store.state.vault.rooms.some((r) => r.id === 'door')).toBe(true)
  })

  it('says why the vault door will not delete, instead of just refusing silently', () => {
    const { canvas, store } = mount()
    store.select('door')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '')
      .toMatch(/vault door is part of the vault/i)
  })

  /**
   * Escape means "never mind" -- it should leave whichever of the two
   * modes the editor is in. It only ever left one of them: an armed room
   * went down, and a selected room stayed selected, outline, close handle
   * and all, with nothing else on the keyboard able to let go of it.
   */
  it('puts an armed room down on Escape', () => {
    const { store } = mount()
    store.setTool('diner')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(store.state.tool).toBeNull()
  })

  it('lets go of a selected room on Escape', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.select(store.state.vault.rooms.find((r) => r.type === 'elevator')!.id)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(store.state.selection).toBeNull()
  })

  it('leaves room shortcuts alone while the vault name is being typed into', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id
    store.select(id)

    // Dispatching on the input (not on document) gives the event a real
    // target, exactly as a keystroke typed into the toolbar's actual
    // #vault-name field would -- the keydown listener lives on `document`
    // and would otherwise see this as a shortcut meant for the canvas.
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    )

    expect(store.state.vault.rooms.some((r) => r.id === id)).toBe(true)
    expect(store.state.vault.rooms.find((r) => r.id === id)?.x).toBe(9)
  })

  it('undoes on ctrl+z and redoes on ctrl+shift+z', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    expect(store.state.vault.rooms).toHaveLength(1)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    expect(store.state.vault.rooms).toHaveLength(2)
  })

  it('repaints when the store changes', () => {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(canvas.querySelectorAll('[data-room-id]')).toHaveLength(2)
  })

  it('sets the level of the selected room from the number keys', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'diner', floor: 0, x: 9 })
    const diner = store.state.vault.rooms.find((r) => r.type === 'diner')!
    store.select(diner.id)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }))
    expect(findRoom(store.state.vault, diner.id)?.level).toBe(3)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))
    expect(findRoom(store.state.vault, diner.id)?.level).toBe(2)
  })

  it('refuses the level a room already has, and leaves undo alone', () => {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'diner', floor: 0, x: 9 })
    const dinerId = store.state.vault.rooms.find((r) => r.type === 'diner')!.id
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 12 })
    store.undo()
    expect(store.canRedo).toBe(true)

    store.select(dinerId)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))

    expect(store.canRedo).toBe(true) // the queued redo must survive
    expect(canvas.querySelector('[data-refusal]')?.textContent).toBe('The Diner is already level 1.')
  })

  it('leaves a merged room whole on "s", now that rooms are never split', () => {
    const { store } = mount()
    store.setMode('free')
    store.run({ kind: 'place', type: 'diner', floor: 1, x: 6 })
    store.run({ kind: 'place', type: 'diner', floor: 1, x: 9 })
    const merged = store.state.vault.rooms.find((r) => r.type === 'diner')!
    store.select(merged.id)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    expect(store.state.vault.rooms.filter((r) => r.type === 'diner')).toHaveLength(1)
  })

  it('does not take Ctrl+2 or Cmd+2 as a level', () => {
    const { store } = mount()
    store.run({ kind: 'place', type: 'diner', floor: 0, x: 9 })
    const diner = store.state.vault.rooms.find((r) => r.type === 'diner')!
    store.select(diner.id)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }))
    expect(findRoom(store.state.vault, diner.id)?.level).toBeUndefined()
  })
})

describe('resolvePlacement', () => {
  // The author's own bug report: an elevator at cell 6, a three-wide room
  // (a generator), and exactly two accepted positions either side of it --
  // the footprint at 3 (cells 3-5) and the one at 7 (cells 7-9).
  const candidates = [{ x: 3, w: 3 }, { x: 7, w: 3 }]

  it('keeps an exact match on an accepted left edge', () => {
    expect(resolvePlacement(candidates, 3)).toBe(3)
    expect(resolvePlacement(candidates, 7)).toBe(7)
  })

  it('snaps a cursor inside the left footprint to its left edge', () => {
    expect(resolvePlacement(candidates, 4)).toBe(3)
    expect(resolvePlacement(candidates, 5)).toBe(3)
  })

  it('snaps a cursor inside the right footprint to its left edge', () => {
    expect(resolvePlacement(candidates, 8)).toBe(7)
    expect(resolvePlacement(candidates, 9)).toBe(7)
  })

  it('leaves the cursor on the elevator itself unchanged, so canApply refuses it and explains why', () => {
    expect(resolvePlacement(candidates, 6)).toBe(6)
  })

  it('returns the cursor unchanged when there are no candidates at all', () => {
    expect(resolvePlacement([], 12)).toBe(12)
  })

  it('picks the larger x when the cursor falls inside two overlapping footprints', () => {
    // Two hypothetical positions for a 5-wide room, [2,7) and [4,9), both
    // contain cursor 6; rule 2 picks the nearer one, which is always the
    // larger x once containment (x <= cursorX) holds.
    expect(resolvePlacement([{ x: 2, w: 5 }, { x: 4, w: 5 }], 6)).toBe(4)
  })

  it('resolves a tie on x the only way it can be observed: both share the winning x', () => {
    // Two candidates at the same x cannot be told apart by resolvePlacement's
    // return value -- it hands back a candidate's x, not the candidate
    // itself, so a genuine tie is unobservable from outside the function.
    // This pins the code's actual tie-breaking mechanics (the first
    // containing match sets the result; a later one only overrides on a
    // *strictly* smaller distance, per the "distance < bestDistance" check)
    // rather than asserting a preference between the two entries.
    const tied = [{ x: 3, w: 3 }, { x: 3, w: 6 }]
    expect(resolvePlacement(tied, 4)).toBe(3)
    expect(resolvePlacement([...tied].reverse(), 4)).toBe(3)
  })
})

describe('clampToFloor', () => {
  it('holds a three-wide room flush against the right edge instead of overflowing', () => {
    expect(clampToFloor(25, 3)).toBe(CELLS_PER_FLOOR - 3)
  })

  it('leaves a cursor already at the left edge alone', () => {
    expect(clampToFloor(0, 3)).toBe(0)
  })

  it('holds a negative cursor at the left edge', () => {
    expect(clampToFloor(-5, 3)).toBe(0)
  })

  it('leaves a one-wide room at the last cell alone -- it already fits', () => {
    expect(clampToFloor(25, 1)).toBe(25)
  })

  it('holds a nine-wide room well clear of the right edge', () => {
    expect(clampToFloor(25, 9)).toBe(CELLS_PER_FLOOR - 9)
  })
})

describe('candidate highlighting', () => {
  // Candidates are drawn as one merged run per contiguous stretch of legal
  // territory (see mergeRuns in src/render/scene.ts), each run a `<g
  // data-candidate="true">` wrapping the fill wash and the bottom accent
  // bar -- no stroke-dasharray involved any more, since that vocabulary is
  // reserved for a room the validator blames.
  function candidateMarks(canvas: HTMLElement): SVGGElement[] {
    return [...canvas.querySelectorAll('g[data-candidate="true"]')] as SVGGElement[]
  }

  it('shows no candidates when no tool is armed', () => {
    const { canvas } = mount()
    expect(candidateMarks(canvas)).toHaveLength(0)
  })

  it('marks legal spots for the armed tool, none of them a selectable room', () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    // setTool alone does not repaint; the store only notifies on an emit,
    // and setTool does emit, so this reads the canvas after that repaint.
    const marks = candidateMarks(canvas)
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) expect(mark.closest('[data-room-id]')).toBeNull()
  })

  it('marks only spots canApply actually accepts', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    const marks = candidateMarks(canvas)
    expect(marks.length).toBeGreaterThan(0)
    // A run's left edge is always a position canApply accepted -- runs are
    // built only from accepted spans, so a run can start no earlier than
    // the leftmost accepted span merged into it.
    const fill = marks[0]!.querySelector('rect')!
    const x = Math.round((Number(fill.getAttribute('x')) - 1 - SCENE_GUTTER_PX) / CELL_PX)
    const top = Number(fill.getAttribute('y')) - 3
    const floor = Math.round((top - SCENE_PAD_PX) / (FLOOR_PX + FLOOR_GAP_PX))
    expect(canApply(store.state.vault, { kind: 'place', type: 'diner', floor, x }, store.state.mode).ok)
      .toBe(true)
  })

  it('clears the candidates once the tool is disarmed', () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    expect(candidateMarks(canvas).length).toBeGreaterThan(0)
    store.setTool(null)
    expect(candidateMarks(canvas)).toHaveLength(0)
  })

  it('lights only the connected spots under Strict rules', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    expect(canvas.querySelectorAll('g[data-candidate="true"]')).toHaveLength(1)
    expect(canvas.querySelectorAll('g[data-candidate="free-only"]')).toHaveLength(0)
  })

  it('adds the dim tier under Free rules, where the room only fits', () => {
    const { canvas, store } = mount()
    store.setMode('free')
    store.setTool('diner')
    // The one connected strip is beside the door; the top floor is dim
    // past it, and each of the other 24 floors is one dim run end to end.
    expect(canvas.querySelectorAll('g[data-candidate="true"]')).toHaveLength(1)
    expect(canvas.querySelectorAll('g[data-candidate="free-only"]')).toHaveLength(25)
  })
})

describe('scroll position', () => {
  it('survives a repaint instead of resetting to the top', () => {
    // jsdom does no layout, so scrollTop/scrollLeft never clamp to a real
    // range here -- assigning and reading back a plain number is enough to
    // prove the value crosses a repaint, which is what canvas.innerHTML
    // wholesale replacement used to destroy (see the mountCanvas comment).
    const { canvas, store } = mount()
    const scroller = canvas.querySelector<HTMLElement>('.scene-scroll')!
    scroller.scrollTop = 400
    scroller.scrollLeft = 55

    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })

    const scrollerAfter = canvas.querySelector<HTMLElement>('.scene-scroll')!
    expect(scrollerAfter).toBe(scroller) // the same element, not a fresh one
    expect(scrollerAfter.scrollTop).toBe(400)
    expect(scrollerAfter.scrollLeft).toBe(55)
  })
})

describe('hover ghost', () => {
  function ghost(canvas: HTMLElement): SVGRectElement {
    return canvas.querySelector('[data-ghost]') as SVGRectElement
  }

  function moveTo(canvas: HTMLElement, clientX: number, clientY: number): void {
    const svg = canvas.querySelector('svg')!
    stubZeroLayout(svg)
    canvas.querySelector('[data-cell-target]')!.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX, clientY }),
    )
  }

  // The handler throttles updates to one per animation frame (see
  // interactions.ts); a real frame is the simplest way to observe the
  // result without reaching into the module's internals.
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }

  it('is present but hidden before the cursor ever moves', () => {
    const { canvas } = mount()
    expect(ghost(canvas)).not.toBeNull()
    expect(ghost(canvas).getAttribute('visibility')).toBe('hidden')
    expect(ghost(canvas).hasAttribute('data-room-id')).toBe(false)
  })

  it('becomes visible at the cell cellFromPoint reports, once a tool is armed', async () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    // Same cell the "resolves to floor 0, cell 9" click test below aims at.
    moveTo(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()
    expect(ghost(canvas).getAttribute('visibility')).toBe('visible')
    expect(ghost(canvas).getAttribute('x')).toBe(String(SCENE_GUTTER_PX + 9 * CELL_PX + 1))
    expect(ghost(canvas).getAttribute('y')).toBe(String(SCENE_PAD_PX + 3))
  })

  it('differs in stroke between a placement canApply accepts and one it refuses', async () => {
    const { canvas, store } = mount()
    store.setTool('elevator')

    // Floor 0, cell 9 touches the vault door: canApply accepts it.
    moveTo(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()
    const acceptedStroke = ghost(canvas).getAttribute('stroke')

    // Floor 5 is empty and nothing on it has a route to the vault door.
    moveTo(canvas, SCENE_GUTTER_PX + 10 * CELL_PX + 1, SCENE_PAD_PX + 5 * (FLOOR_PX + FLOOR_GAP_PX) + 1)
    await nextFrame()
    const refusedStroke = ghost(canvas).getAttribute('stroke')

    expect(acceptedStroke).toBe(COLORS.accepted)
    expect(refusedStroke).toBe(COLORS.problem)
    expect(acceptedStroke).not.toBe(refusedStroke)
  })

  it('hides again once the tool is disarmed', async () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    moveTo(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()
    expect(ghost(canvas).getAttribute('visibility')).toBe('visible')

    store.setTool(null)
    expect(ghost(canvas).getAttribute('visibility')).toBe('hidden')
  })

  it('hides when the cursor leaves the canvas', async () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    moveTo(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()
    expect(ghost(canvas).getAttribute('visibility')).toBe('visible')

    canvas.dispatchEvent(new MouseEvent('mouseleave'))
    expect(ghost(canvas).getAttribute('visibility')).toBe('hidden')
  })

  it('hides on a mousemove outside the grid, the same as no tool armed', async () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    moveTo(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()
    expect(ghost(canvas).getAttribute('visibility')).toBe('visible')

    // Left of the gutter -- cellFromPoint now reports this as outside the
    // grid rather than clamping it to cell 0.
    moveTo(canvas, SCENE_GUTTER_PX - 100, SCENE_PAD_PX + 1)
    await nextFrame()
    expect(ghost(canvas).getAttribute('visibility')).toBe('hidden')
  })

  it('keeps a three-wide room inside the floor when armed at the far right', async () => {
    const { canvas, store } = mount()
    store.setTool('power_generator') // baseWidth 3, per the catalog
    // The last legal cell on the floor. Before clampToFloor, the ghost's
    // left edge landed here and its width ran three cells further right,
    // hanging well off the floor's own drawn edge.
    moveTo(canvas, SCENE_GUTTER_PX + (CELLS_PER_FLOOR - 1) * CELL_PX + 1, SCENE_PAD_PX + 1)
    await nextFrame()

    // Assert against the scene's own geometry -- the floor row it actually
    // drew -- rather than a hardcoded pixel figure. A floor row is the rect
    // filled with the cell pattern: the floor colour alone also fills the
    // pattern's own tile and the ground under every room.
    const floorRect = [...canvas.querySelectorAll('rect')]
      .find((r) => r.getAttribute('fill') === 'url(#cells)')!
    const floorLeft = Number(floorRect.getAttribute('x'))
    const floorRight = floorLeft + Number(floorRect.getAttribute('width'))

    const g = ghost(canvas)
    const ghostLeft = Number(g.getAttribute('x'))
    const ghostRight = ghostLeft + Number(g.getAttribute('width'))

    expect(ghostLeft).toBeGreaterThanOrEqual(floorLeft)
    expect(ghostRight).toBeLessThanOrEqual(floorRight)
  })

  it('snaps to the same footprint a click there would resolve to, and shows it as accepted', async () => {
    const { canvas, store } = mount()
    // Same setup as the click-snapping test: floor 1 has only an elevator
    // at cell 9, so a three-wide generator has exactly two accepted spots,
    // 6 and 10. This is the property §5 and §8 both hinge the design on --
    // the ghost and the click share resolvePlacement (and canApply) so
    // they can never show different answers for the same cursor position.
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.run({ kind: 'place', type: 'elevator', floor: 1, x: 9 })
    store.setTool('power_generator')

    // Cell 8, inside the footprint at 6, same as the click test resolves.
    moveTo(canvas, SCENE_GUTTER_PX + 8 * CELL_PX + 1, SCENE_PAD_PX + (FLOOR_PX + FLOOR_GAP_PX) + 1)
    await nextFrame()

    expect(ghost(canvas).getAttribute('x')).toBe(String(SCENE_GUTTER_PX + 6 * CELL_PX + 1))
    expect(ghost(canvas).getAttribute('stroke')).toBe(COLORS.accepted)
  })
})

describe('cellFromPoint', () => {
  it('converts a point on a known cell and floor, at scale 1', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 100, top: 50, width }
    // Cell 4 spans [gutter + 4*CELL_PX, gutter + 5*CELL_PX). Floor 1 spans
    // [pad + (FLOOR_PX+GAP), pad + 2*(FLOOR_PX+GAP)).
    const clientX = rect.left + SCENE_GUTTER_PX + 4 * CELL_PX + 3
    const clientY = rect.top + SCENE_PAD_PX + (FLOOR_PX + FLOOR_GAP_PX) + 5
    expect(cellFromPoint(rect, width, clientX, clientY)).toEqual({ floor: 1, x: 4 })
  })

  // These four used to assert a clamped result -- cell 0, cell 25, or floor
  // 0 -- for a point outside the grid. That was the bug the author reported:
  // a click in the gutter or past the last cell/floor still placed a room,
  // just at whatever cell the clamp produced instead of where the person
  // pointed. cellFromPoint now reports "outside" as `null` instead of
  // guessing a position, so these assert `null` for the same four points.

  it('returns null for a point left of the gutter', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX - 100 // well left of the grid, in the gutter
    const clientY = SCENE_PAD_PX + 1
    expect(cellFromPoint(rect, width, clientX, clientY)).toBeNull()
  })

  it('returns null for a point right of the last cell', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX + 1000 * CELL_PX // well right of the grid
    const clientY = SCENE_PAD_PX + 1
    expect(cellFromPoint(rect, width, clientX, clientY)).toBeNull()
  })

  it('returns null for a point above the first floor', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX + 1
    const clientY = SCENE_PAD_PX - 1000
    expect(cellFromPoint(rect, width, clientX, clientY)).toBeNull()
  })

  it('returns null for a point below the last floor', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX + 1
    const clientY = SCENE_PAD_PX + FLOOR_COUNT * (FLOOR_PX + FLOOR_GAP_PX) + 1000
    expect(cellFromPoint(rect, width, clientX, clientY)).toBeNull()
  })

  it('still returns a cell for a point inside the grid, at the very last floor and cell', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX + (CELLS_PER_FLOOR - 1) * CELL_PX + 1
    const clientY = SCENE_PAD_PX + (FLOOR_COUNT - 1) * (FLOOR_PX + FLOOR_GAP_PX) + 1
    expect(cellFromPoint(rect, width, clientX, clientY)).toEqual({ floor: FLOOR_COUNT - 1, x: CELLS_PER_FLOOR - 1 })
  })

  it('returns a cell for a point at the very first floor and cell', () => {
    const width = SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX
    const rect = { left: 0, top: 0, width }
    const clientX = SCENE_GUTTER_PX
    const clientY = SCENE_PAD_PX
    expect(cellFromPoint(rect, width, clientX, clientY)).toEqual({ floor: 0, x: 0 })
  })

  it('resolves to floor 0, cell 9 -- the cell immediately right of the vault door', () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    clickCell(canvas, SCENE_GUTTER_PX + 9 * CELL_PX + 1, SCENE_PAD_PX + 1)
    expect(store.state.vault.rooms.some((r) => r.type === 'elevator')).toBe(true)
  })

  it('places nothing and leaves the vault unchanged when a click lands outside the grid', () => {
    const { canvas, store } = mount()
    store.setTool('elevator')
    const before = store.state.vault
    // In the floor-number gutter -- nothing was aimed at, so nothing should
    // happen: no placement, and no refusal text either (there was no
    // attempt to refuse).
    clickCell(canvas, SCENE_GUTTER_PX - 100, SCENE_PAD_PX + 1)
    expect(store.state.vault).toBe(before)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '').toBe('')
  })

  it('clears a stale refusal message when clicking outside the grid', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    // Floor 5 is empty and the vault has no elevator anywhere, so any room
    // placed there has no route back to the vault door -- strict mode must
    // refuse it. First show a refusal by attempting a failed placement.
    const clientX = SCENE_GUTTER_PX + 10 * CELL_PX + 1
    const clientY = SCENE_PAD_PX + 5 * (FLOOR_PX + FLOOR_GAP_PX) + 1
    clickCell(canvas, clientX, clientY)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '')
      .toMatch(/no route back to the vault door/i)
    // Now click outside the grid. The refusal from the previous failed
    // placement should be cleared, and the vault should be unchanged.
    const before = store.state.vault
    clickCell(canvas, SCENE_GUTTER_PX - 100, SCENE_PAD_PX + 1)
    expect(store.state.vault).toBe(before)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '').toBe('')
  })
})

describe('snapping a click to the footprint it falls inside', () => {
  it('places the room at the footprint the cursor is inside, not the cell clicked', () => {
    const { canvas, store } = mount()
    // Floor 1's only occupant is an elevator at cell 9, wired to floor 0's
    // (which touches the vault door) so both floors stay reachable in
    // strict mode. That leaves exactly two accepted spots for a three-wide
    // generator on floor 1 -- 6 and 10, either side of the elevator -- the
    // same shape as the resolvePlacement unit tests above.
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.run({ kind: 'place', type: 'elevator', floor: 1, x: 9 })
    store.setTool('power_generator')

    // Cell 8 sits inside the footprint at 6 (cells 6-8) but is not itself
    // an accepted left edge -- an unsnapped click here would land on cell
    // 8 and get refused for overlapping the elevator.
    const clientX = SCENE_GUTTER_PX + 8 * CELL_PX + 1
    const clientY = SCENE_PAD_PX + (FLOOR_PX + FLOOR_GAP_PX) + 1
    clickCell(canvas, clientX, clientY)

    const generator = store.state.vault.rooms.find((r) => r.type === 'power_generator')
    expect(generator?.floor).toBe(1)
    expect(generator?.x).toBe(6)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '').toBe('')
  })
})

describe('putting the armed room down', () => {
  it('disarms the palette when the click lands off the grid', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    // clientX 0 is in the floor-number gutter: cellFromPoint returns null.
    clickCell(canvas, 0, 200)
    expect(store.state.tool).toBeNull()
    expect(store.state.vault.rooms).toHaveLength(1)
  })

  it('says nothing when it does, because nothing was refused', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    clickCell(canvas, 0, 200)
    expect(canvas.querySelector('[data-refusal]')?.textContent).toBe('')
  })

  it('picks up a room clicked while a tool is armed instead of refusing', () => {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id
    store.setTool('diner')

    clickRoom(canvas, id)

    // No legal footprint overlaps an existing room, so this used to be a
    // guaranteed "overlaps" refusal and nothing else.
    expect(store.state.tool).toBeNull()
    expect(store.state.selection).toBe(id)
    expect(store.state.vault.rooms).toHaveLength(2)
    expect(canvas.querySelector('[data-refusal]')?.textContent).toBe('')
  })
})

describe('the delete handle', () => {
  it('deletes the room it belongs to', () => {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id
    store.select(id)

    canvas.querySelector(`[data-delete-room="${id}"]`)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(store.state.vault.rooms.some((r) => r.id === id)).toBe(false)
  })

  /**
   * There used to be a test here for the handle outranking an armed tool.
   * It armed one and selected a room in the same breath, which the store
   * no longer allows: arming puts the selection down, so there is never a
   * handle on screen while a room is armed. What the handle still has to
   * outrank is the room beneath it -- covered directly above, since
   * without that the click would fall through to selecting it again.
   */

  it('refuses through the same path Delete does, reason and all', () => {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.run({ kind: 'place', type: 'diner', floor: 0, x: 10 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id
    store.select(id)

    // removeRoom offers the cascade on a refusal, and confirmCascade is a
    // browser confirm() jsdom does not implement.
    const confirmed = vi.spyOn(window, 'confirm').mockReturnValue(false)
    canvas.querySelector(`[data-delete-room="${id}"]`)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(store.state.vault.rooms.some((r) => r.id === id)).toBe(true)
    expect(canvas.querySelector('[data-refusal]')?.textContent ?? '').not.toBe('')
    expect(confirmed).toHaveBeenCalled()
    confirmed.mockRestore()
  })
})

describe('dragging a room', () => {
  // Floor 0: door [0,9), elevator e0 at 9, diner d0 [10,13).
  // Floor 1: elevator e1 at 9, garden g1 [10,13), free from 13 on.
  function dragVault(): Vault {
    const v = createVault()
    v.rooms.push(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
      { id: 'g1', type: 'garden', floor: 1, x: 10, w: 3 },
    )
    return v
  }

  type At = { floor: number; x: number }
  const px = (x: number): number => SCENE_GUTTER_PX + x * CELL_PX + 1
  const py = (floor: number): number => SCENE_PAD_PX + floor * (FLOOR_PX + FLOOR_GAP_PX) + 1

  function pointer(target: Element, type: string, clientX: number, clientY: number, pointerType = 'mouse'): void {
    // A real press or move still has the primary button down; only the
    // pointerup that lets go of it does not -- `buttons` is what
    // onPointerMove checks to catch a button that came up unseen.
    target.dispatchEvent(
      new FakePointerEvent(type, { bubbles: true, clientX, clientY, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerType }),
    )
  }

  // A press reads the svg's layout, and so does every frame after it -- but
  // taking hold of a room selects it, which repaints the scene and replaces
  // the svg, so the stub has to go on again after the first move.
  function press(canvas: HTMLElement, id: string, at: At, pointerType = 'mouse'): void {
    stubZeroLayout(canvas.querySelector('svg')!)
    pointer(canvas.querySelector(`[data-room-id="${id}"]`)!, 'pointerdown', px(at.x), py(at.floor), pointerType)
  }

  function moveTo(canvas: HTMLElement, at: At, pointerType = 'mouse'): void {
    pointer(canvas, 'pointermove', px(at.x), py(at.floor), pointerType)
    stubZeroLayout(canvas.querySelector('svg')!)
  }

  function release(canvas: HTMLElement, at: At, pointerType = 'mouse'): void {
    pointer(canvas, 'pointerup', px(at.x), py(at.floor), pointerType)
  }

  function drag(canvas: HTMLElement, id: string, from: At, to: At): void {
    press(canvas, id, from)
    moveTo(canvas, to)
    release(canvas, to)
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()))
  }

  const refusal = (canvas: HTMLElement): string => canvas.querySelector('[data-refusal]')?.textContent ?? ''

  it('stays a click when the pointer barely moves', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    pointer(canvas, 'pointermove', px(10) + 2, py(0))
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    release(canvas, { floor: 0, x: 10 })
    clickRoom(canvas, 'd0')
    expect(store.state.selection).toBe('d0')
    expect(store.canUndo).toBe(false)
  })

  it('never starts a drag from a press whose button let go unseen', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    // The pointer travels past the threshold, but its button is already up
    // -- exactly what a flick out past the canvas edge and a release out
    // there, with nothing in between crossing the threshold, looks like.
    canvas.dispatchEvent(
      new FakePointerEvent('pointermove', {
        bubbles: true,
        clientX: px(18),
        clientY: py(1),
        button: 0,
        buttons: 0,
      }),
    )
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    expect(store.state.selection).toBeNull()
  })

  it('never lets a stale press from an unseen release pick up a later room', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    // No pointerup at all -- the release happened outside the canvas, so
    // the canvas never heard it and `press` was left pointing at d0.
    press(canvas, 'door', { floor: 0, x: 3 })
    moveTo(canvas, { floor: 1, x: 18 })
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
  })

  it('moves a room dropped on free cells, as one undo step', () => {
    const { canvas, store } = mount(dragVault())
    // Strict mode: of floor 1's free cells only x 13, against the garden, connects.
    drag(canvas, 'd0', { floor: 0, x: 10 }, { floor: 1, x: 18 })
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 1, x: 13 })
    store.undo()
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
    expect(store.canUndo).toBe(false)
  })

  it('swaps a room dropped on another, and keeps it selected', () => {
    const { canvas, store } = mount(dragVault())
    drag(canvas, 'd0', { floor: 0, x: 10 }, { floor: 1, x: 11 })
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 1, x: 10 })
    expect(findRoom(store.state.vault, 'g1')).toMatchObject({ floor: 0, x: 10 })
    expect(store.state.selection).toBe('d0')
  })

  it('lets an elevator past a wider room in its row, as one undo step', () => {
    const v = dragVault()
    v.rooms.push(
      { id: 'w2', type: 'weapon_workshop', floor: 2, x: 0, w: 9 },
      { id: 'x2', type: 'elevator', floor: 2, x: 9, w: 1 },
    )
    const { canvas, store } = mount(v)
    // Floor 2 has no route to the door either way; free rules keep the
    // test about the reorder, not about connectivity.
    store.setMode('free')
    drag(canvas, 'x2', { floor: 2, x: 9 }, { floor: 2, x: 4 })
    expect(findRoom(store.state.vault, 'x2')).toMatchObject({ floor: 2, x: 0 })
    expect(findRoom(store.state.vault, 'w2')).toMatchObject({ floor: 2, x: 1 })
    store.undo()
    expect(findRoom(store.state.vault, 'x2')).toMatchObject({ floor: 2, x: 9 })
    expect(store.canUndo).toBe(false)
  })

  it('says why a drop is refused and leaves the vault alone', () => {
    const { canvas, store } = mount(dragVault())
    const before = store.state.vault
    drag(canvas, 'd0', { floor: 0, x: 10 }, { floor: 0, x: 3 })
    expect(store.state.vault).toBe(before)
    expect(refusal(canvas)).toMatch(/vault door/i)
  })

  it('shows both ghosts while a swap is aimed, and puts them away on Escape', async () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 11 })
    await nextFrame()
    const ghost = canvas.querySelector('[data-ghost]')!
    const swapGhost = canvas.querySelector('[data-ghost-swap]')!
    expect(ghost.getAttribute('visibility')).toBe('visible')
    expect(ghost.getAttribute('x')).toBe(String(SCENE_GUTTER_PX + 10 * CELL_PX + 1))
    expect(ghost.getAttribute('y')).toBe(String(SCENE_PAD_PX + (FLOOR_PX + FLOOR_GAP_PX) + 3))
    expect(ghost.getAttribute('stroke')).toBe(COLORS.accepted)
    expect(swapGhost.getAttribute('visibility')).toBe('visible')
    expect(swapGhost.getAttribute('y')).toBe(String(SCENE_PAD_PX + 3))
    expect(canvas.querySelector('[data-room-id="d0"]')!.hasAttribute('data-dragging')).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // Looked up again: ending a drag repaints the scene to take its
    // highlight down, so the ghosts above are no longer the ones on screen.
    expect(canvas.querySelector('[data-ghost]')!.getAttribute('visibility')).toBe('hidden')
    expect(canvas.querySelector('[data-ghost-swap]')!.getAttribute('visibility')).toBe('hidden')
    expect(canvas.querySelector('[data-dragging]')).toBeNull()

    release(canvas, { floor: 1, x: 11 })
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
  })

  it('ignores the arrow keys mid-drag', () => {
    const { canvas, store } = mount(dragVault())
    // Free mode, so that ArrowRight on the selected diner would be accepted
    // if it got through.
    store.setMode('free')
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 0, x: 18 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
  })

  it('swallows the click a browser sends after the drop', () => {
    const { canvas, store } = mount(dragVault())
    drag(canvas, 'd0', { floor: 0, x: 10 }, { floor: 1, x: 18 })
    // Unswallowed, a click on the bare canvas would deselect.
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(store.state.selection).toBe('d0')
  })

  it('does not eat the next real click when no click followed the drop', () => {
    const { canvas, store } = mount(dragVault())
    drag(canvas, 'd0', { floor: 0, x: 10 }, { floor: 1, x: 18 })
    // Let go outside the canvas: no click came. The next click is a real
    // one, and like every real click it starts with a press.
    pointer(canvas.querySelector('[data-room-id="door"]')!, 'pointerdown', px(3), py(0))
    clickRoom(canvas, 'door')
    expect(store.state.selection).toBe('door')
  })

  it('leaves touch to scroll the scene', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 }, 'touch')
    moveTo(canvas, { floor: 1, x: 18 }, 'touch')
    release(canvas, { floor: 1, x: 18 }, 'touch')
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
  })

  it('picks a room up with a finger held still on it, and drops it where the finger lets go', () => {
    vi.useFakeTimers()
    try {
      const { canvas, store } = mount(dragVault())
      press(canvas, 'd0', { floor: 0, x: 10 }, 'touch')
      expect(canvas.querySelector('[data-dragging]')).toBeNull()
      vi.advanceTimersByTime(500)
      expect(canvas.querySelector('[data-room-id="d0"]')?.hasAttribute('data-dragging')).toBe(true)
      stubZeroLayout(canvas.querySelector('svg')!)
      moveTo(canvas, { floor: 1, x: 13 }, 'touch')
      release(canvas, { floor: 1, x: 13 }, 'touch')
      expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 1, x: 13 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets a finger that moves before the long press scroll, and picks nothing up', () => {
    vi.useFakeTimers()
    try {
      const { canvas } = mount(dragVault())
      press(canvas, 'd0', { floor: 0, x: 10 }, 'touch')
      pointer(canvas, 'pointermove', px(10) + 20, py(0), 'touch')
      vi.advanceTimersByTime(500)
      expect(canvas.querySelector('[data-dragging]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the browser's own menu out of a long press", () => {
    const { canvas } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 }, 'touch')
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    canvas.querySelector('[data-room-id="d0"]')!.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  it('puts an armed palette room down on taking hold of a room', () => {
    const { canvas, store } = mount(dragVault())
    store.setTool('diner')
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 18 })
    expect(store.state.tool).toBeNull()
    expect(store.state.selection).toBe('d0')
  })

  it('never picks up the vault door', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'door', { floor: 0, x: 3 })
    moveTo(canvas, { floor: 1, x: 18 })
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    expect(store.state.selection).toBeNull()
  })

  it('mousemove mid-drag leaves the drag ghost alone', async () => {
    const { canvas } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 11 })
    await nextFrame()
    const ghost = canvas.querySelector('[data-ghost]')!
    expect(ghost.getAttribute('visibility')).toBe('visible')

    // Without the `if (drag) return` guard in onMouseMove, this would hide
    // the drag's own ghost and leave it never redrawn -- onMouseMove only
    // ever draws the hover ghost for an armed palette tool, and no tool is
    // armed mid-drag.
    canvas.querySelector('[data-cell-target]')!.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: px(11), clientY: py(1) }),
    )
    await nextFrame()
    expect(ghost.getAttribute('visibility')).toBe('visible')
  })

  it('pointercancel abandons a drag', () => {
    const { canvas, store } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 18 })
    pointer(canvas, 'pointercancel', px(18), py(1))
    expect(canvas.querySelector('[data-dragging]')).toBeNull()
    expect(canvas.querySelector('[data-ghost]')!.getAttribute('visibility')).toBe('hidden')

    release(canvas, { floor: 1, x: 18 })
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
    expect(store.canUndo).toBe(false)
  })

  it('a drop back where the room stands commits nothing', () => {
    const { canvas, store } = mount(dragVault())
    // Strict mode: on floor 0 only x 10 connects, so the plan is 'stay'.
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 0, x: 15 })
    release(canvas, { floor: 0, x: 15 })
    expect(findRoom(store.state.vault, 'd0')).toMatchObject({ floor: 0, x: 10 })
    expect(store.canUndo).toBe(false)
  })

  it('drops a press whose room a keystroke removed before the drag threshold', () => {
    const { canvas, store } = mount(dragVault())
    store.select('d0')
    press(canvas, 'd0', { floor: 0, x: 10 })
    // Strict mode allows removing d0: e0/g1 on floor 1 keep their own route.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    moveTo(canvas, { floor: 1, x: 18 })
    expect(canvas.classList.contains('dragging')).toBe(false)
  })

  it('re-aims the ghost when the scene scrolls under a still pointer', async () => {
    const { canvas } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 18 })
    await nextFrame()
    const ghost = canvas.querySelector('[data-ghost]')!
    expect(ghost.getAttribute('y')).toBe(String(SCENE_PAD_PX + (FLOOR_PX + FLOOR_GAP_PX) + 3))

    // Scrolled down by one floor: the same pointer is now over floor 2.
    const svg = canvas.querySelector('svg')!
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: -(FLOOR_PX + FLOOR_GAP_PX), width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect
    canvas.querySelector('.scene-scroll')!.dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(ghost.getAttribute('y')).toBe(String(SCENE_PAD_PX + 2 * (FLOOR_PX + FLOOR_GAP_PX) + 3))
  })

  it('lights where the carried room could go, and clears it once the room is let go', () => {
    const { canvas } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 16 })
    expect(canvas.querySelectorAll('g[data-candidate="true"]').length).toBeGreaterThan(0)
    expect(canvas.querySelector('[data-room-id="d0"]')?.hasAttribute('data-dragging')).toBe(true)
    release(canvas, { floor: 1, x: 16 })
    expect(canvas.querySelectorAll('g[data-candidate]')).toHaveLength(0)
  })

  it('adds the dim tier to a drag under Free rules, and clears it when the drag is abandoned', () => {
    const { canvas, store } = mount(dragVault())
    store.setMode('free')
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 5, x: 4 })
    expect(canvas.querySelectorAll('g[data-candidate="free-only"]').length).toBeGreaterThan(0)
    pointer(canvas, 'pointercancel', px(4), py(5))
    expect(canvas.querySelectorAll('g[data-candidate]')).toHaveLength(0)
  })
  it('says in the dock what dropping the room will do while it is carried', () => {
    const { canvas } = mount(dragVault())
    press(canvas, 'd0', { floor: 0, x: 10 })
    moveTo(canvas, { floor: 1, x: 16 })
    expect(canvas.querySelector('[data-bar="carrying"]')?.textContent).toContain('Moving Diner')
    release(canvas, { floor: 1, x: 16 })
    expect(canvas.querySelector('[data-bar="carrying"]')).toBeNull()
  })
})

describe('the dock', () => {
  const bar = (canvas: HTMLElement) => canvas.querySelector('[data-dock-bar] .bar')
  const click = (canvas: HTMLElement, selector: string) =>
    canvas.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  function placedDiner() {
    const { canvas, store } = mount()
    store.run({ kind: 'place', type: 'diner', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'diner')!.id
    store.select(id)
    return { canvas, store, id }
  }

  it('is empty until something is selected, armed or carried', () => {
    const { canvas } = mount()
    expect(bar(canvas)).toBeNull()
  })

  it('sets the level of the selected room from its buttons', () => {
    const { canvas, store, id } = placedDiner()
    click(canvas, '[data-set-level="3"]')
    expect(findRoom(store.state.vault, id)?.level).toBe(3)
    expect(canvas.querySelector('[data-set-level="3"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('says why when it is asked for the level the room already has', () => {
    const { canvas } = placedDiner()
    click(canvas, '[data-set-level="1"]')
    expect(canvas.querySelector('[data-refusal]')?.textContent).toBe('The Diner is already level 1.')
  })

  it('moves the selected room with its arrow buttons, as the arrow keys do', () => {
    const { canvas, store, id } = placedDiner()
    store.setMode('free')
    click(canvas, '[data-nudge="right"]')
    expect(findRoom(store.state.vault, id)).toMatchObject({ floor: 0, x: 10 })
    click(canvas, '[data-nudge="down"]')
    expect(findRoom(store.state.vault, id)).toMatchObject({ floor: 1, x: 10 })
  })

  it('deletes the selected room from its Delete button', () => {
    const { canvas, store, id } = placedDiner()
    click(canvas, '[data-dock-bar] [data-delete-room]')
    expect(findRoom(store.state.vault, id)).toBeUndefined()
  })

  it('lets go of the selection, and puts an armed room down, from its buttons', () => {
    const { canvas, store } = placedDiner()
    click(canvas, '[data-deselect]')
    expect(store.state.selection).toBeNull()
    store.setTool('diner')
    click(canvas, '[data-stop-placing]')
    expect(store.state.tool).toBeNull()
  })

  it('never places the armed room through a click on the bar itself', () => {
    const { canvas, store } = mount()
    store.setTool('diner')
    const rooms = store.state.vault.rooms.length
    click(canvas, '[data-dock-bar] .bar')
    expect(store.state.vault.rooms).toHaveLength(rooms)
    expect(store.state.tool).toBe('diner')
  })
})

describe('zoom', () => {
  const svg = (canvas: HTMLElement) => canvas.querySelector<SVGSVGElement>('.scene svg')!
  const click = (canvas: HTMLElement, selector: string) =>
    canvas.querySelector(selector)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

  it('draws the scene at 100% when there is no layout to fit, and steps from there', () => {
    const { canvas } = mount()
    const natural = Number(svg(canvas).getAttribute('width'))
    expect(svg(canvas).style.width).toBe(`${natural}px`)
    click(canvas, '[data-zoom-step="1"]')
    expect(svg(canvas).style.width).toBe(`${Math.round(natural * 1.25)}px`)
    expect(canvas.querySelector('[data-zoom-level]')?.textContent).toBe('125%')
    expect(canvas.querySelector('[data-zoom-fit]')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps a chosen zoom across a repaint, and Fit goes back to following the window', () => {
    const { canvas, store } = mount()
    click(canvas, '[data-zoom-step="-1"]')
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(svg(canvas).style.width).toBe(`${Math.round(Number(svg(canvas).getAttribute('width')) * 0.75)}px`)
    click(canvas, '[data-zoom-fit]')
    expect(canvas.querySelector('[data-zoom-level]')?.textContent).toBe('100%')
    expect(canvas.querySelector('[data-zoom-fit]')?.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('pinching', () => {
  function fingers(canvas: HTMLElement) {
    const scroll = canvas.querySelector('.scene-scroll')!
    return (type: string, pointerId: number, clientX: number) =>
      scroll.dispatchEvent(new FakePointerEvent(type, {
        bubbles: true, clientX, clientY: 100, pointerId, pointerType: 'touch', button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }))
  }
  const width = (canvas: HTMLElement) => canvas.querySelector<SVGSVGElement>('.scene svg')!.style.width
  const natural = (canvas: HTMLElement) => Number(canvas.querySelector('.scene svg')!.getAttribute('width'))

  it('zooms with two fingers, in step with how far they spread', () => {
    const { canvas } = mount()
    const finger = fingers(canvas)
    finger('pointerdown', 1, 100)
    finger('pointerdown', 2, 200)
    finger('pointermove', 2, 250)
    expect(width(canvas)).toBe(`${Math.round(natural(canvas) * 1.5)}px`)
    expect(canvas.querySelector('[data-zoom-fit]')?.getAttribute('aria-pressed')).toBe('false')
    finger('pointerup', 2, 250)
    finger('pointerup', 1, 100)
  })

  it('stops at the ends of the zoom steps', () => {
    const { canvas } = mount()
    const finger = fingers(canvas)
    finger('pointerdown', 1, 100)
    finger('pointerdown', 2, 110)
    finger('pointermove', 2, 1000)
    expect(width(canvas)).toBe(`${Math.round(natural(canvas) * 2)}px`)
    finger('pointermove', 2, 101)
    expect(width(canvas)).toBe(`${Math.round(natural(canvas) * 0.5)}px`)
  })
})
