import { describe, it, expect } from 'vitest'
import { createDropResolver, nearest } from '../../src/app/drag'
import { createVault, type Vault } from '../../src/domain/vault'

function vaultWith(...rooms: Vault['rooms']): Vault {
  const v = createVault()
  v.rooms.push(...rooms)
  return v
}

// Floor 0: door [0,9), elevator e0 at 9, diner d0 [10,13).
// Floor 1: elevator e1 at 9, garden g1 [10,13), free from 13 on.
const base = (): Vault => vaultWith(
  { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
  { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
  { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
  { id: 'g1', type: 'garden', floor: 1, x: 10, w: 3 },
)

// Floor 0: door, elevator e0 at 9, office o0 [10,16).
// Floor 1: elevator e1 at 9, garden g1 [10,13), diner d1 [13,16).
const withOffice = (): Vault => vaultWith(
  { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
  { id: 'o0', type: 'overseers_office', floor: 0, x: 10, w: 6 },
  { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
  { id: 'g1', type: 'garden', floor: 1, x: 10, w: 3 },
  { id: 'd1', type: 'diner', floor: 1, x: 13, w: 3 },
)

describe('nearest', () => {
  it('takes the closest value', () => {
    expect(nearest([3, 10, 13], 11)).toBe(10)
  })

  it('takes the smaller of two equally close values', () => {
    expect(nearest([7, 9], 8)).toBe(7)
  })

  it('has nothing to offer from an empty list', () => {
    expect(nearest([], 4)).toBeNull()
  })
})

describe('createDropResolver', () => {
  it('abandons the drag off the grid', () => {
    const resolve = createDropResolver(base(), 'strict', { id: 'd0', grabOffset: 0 })
    expect(resolve(null)).toEqual({ kind: 'cancel' })
  })

  it('does nothing when the room would land where it stands', () => {
    const resolve = createDropResolver(base(), 'strict', { id: 'd0', grabOffset: 1 })
    expect(resolve({ floor: 0, x: 11 })).toEqual({ kind: 'stay', ghost: { floor: 0, x: 10, w: 3 } })
  })

  it('moves onto free cells, holding the room where it was grabbed', () => {
    // Grabbed one cell in, let go with the pointer on cell 15: left edge 14.
    const resolve = createDropResolver(base(), 'free', { id: 'd0', grabOffset: 1 })
    expect(resolve({ floor: 0, x: 15 })).toEqual({
      kind: 'run',
      op: { kind: 'move', id: 'd0', floor: 0, x: 14 },
      ghost: { floor: 0, x: 14, w: 3 },
    })
  })

  it("counts the dragged room's own cells as free", () => {
    // Grabbed by its right-hand cell and nudged two cells right: its new
    // footprint overlaps its old one, which it is about to leave.
    const resolve = createDropResolver(base(), 'free', { id: 'd0', grabOffset: 2 })
    expect(resolve({ floor: 0, x: 14 })).toMatchObject({
      kind: 'run',
      op: { kind: 'move', id: 'd0', floor: 0, x: 12 },
    })
  })

  it('keeps the room on the floor with the pointer on the last cell', () => {
    const resolve = createDropResolver(base(), 'free', { id: 'd0', grabOffset: 0 })
    expect(resolve({ floor: 2, x: 25 })).toMatchObject({ kind: 'run', ghost: { floor: 2, x: 23, w: 3 } })
  })

  it('in strict mode slides to the nearest spot that keeps a route', () => {
    // Floor 1 past the garden is free, but only x 13, against the garden, connects.
    const resolve = createDropResolver(base(), 'strict', { id: 'd0', grabOffset: 0 })
    expect(resolve({ floor: 1, x: 20 })).toMatchObject({
      kind: 'run',
      op: { kind: 'move', id: 'd0', floor: 1, x: 13 },
    })
  })

  it('refuses a floor with no route anywhere on it, and says so', () => {
    const resolve = createDropResolver(base(), 'strict', { id: 'd0', grabOffset: 0 })
    const plan = resolve({ floor: 5, x: 4 })
    expect(plan).toMatchObject({ kind: 'refuse', ghost: { floor: 5, x: 4, w: 3 } })
    if (plan.kind === 'refuse') expect(plan.verdict.reason).toMatch(/no route/)
  })

  it('refuses a gap too narrow for the room, naming what is in the way', () => {
    const v = base()
    v.rooms.push({ id: 'l1', type: 'lounge', floor: 1, x: 15, w: 3 })
    const resolve = createDropResolver(v, 'free', { id: 'd0', grabOffset: 0 })
    const plan = resolve({ floor: 1, x: 13 })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') {
      expect(plan.verdict.reason).toBe('No room for the Diner here: the Lounge is in the way.')
      expect(plan.ghost).toEqual({ floor: 1, x: 13, w: 3 })
    }
  })

  it('swaps with a room of the same width, showing where each would go', () => {
    const resolve = createDropResolver(base(), 'strict', { id: 'd0', grabOffset: 0 })
    expect(resolve({ floor: 1, x: 11 })).toEqual({
      kind: 'run',
      op: { kind: 'swap', id: 'd0', with: 'g1', x: 10 },
      ghost: { floor: 1, x: 10, w: 3 },
      swapGhost: { floor: 0, x: 10, w: 3 },
    })
  })

  it('covers a narrower target from the nearest edge canApply accepts', () => {
    // Over the diner the office could start anywhere from 10 to 13, but
    // only 13 clears the garden.
    const resolve = createDropResolver(withOffice(), 'strict', { id: 'o0', grabOffset: 0 })
    expect(resolve({ floor: 1, x: 14 })).toEqual({
      kind: 'run',
      op: { kind: 'swap', id: 'o0', with: 'd1', x: 13 },
      ghost: { floor: 1, x: 13, w: 6 },
      swapGhost: { floor: 0, x: 10, w: 3 },
    })
  })

  it('refuses a target wider than the room, and draws no ghost for it', () => {
    const resolve = createDropResolver(withOffice(), 'strict', { id: 'd1', grabOffset: 0 })
    const plan = resolve({ floor: 0, x: 12 })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') {
      expect(plan.verdict.reason).toBe("The Overseer's Office is wider than the Diner and would not fit in its place.")
      expect(plan.swapGhost).toBeUndefined()
    }
  })

  it('refuses the vault door as a target', () => {
    const resolve = createDropResolver(base(), 'free', { id: 'd0', grabOffset: 0 })
    const plan = resolve({ floor: 0, x: 3 })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') {
      // Not /vault door/i: that also matches the door-misplaced geometry
      // message, so this would still pass even if touchedIds dropped op.with.
      expect(plan.verdict.reason).toBe('The vault door is part of the vault and cannot be changed.')
      expect(plan.swapGhost).toBeUndefined()
    }
  })

  it('refuses a move into an unreachable gap with the real reason, not the bordering room', () => {
    // Floor 3: garden g3 [0,3), lounge l3 [6,9), a 3-wide gap between them --
    // both rooms and the gap are unreachable (no elevator reaches floor 3).
    const v = base()
    v.rooms.push(
      { id: 'g3', type: 'garden', floor: 3, x: 0, w: 3 },
      { id: 'l3', type: 'lounge', floor: 3, x: 6, w: 3 },
    )
    const resolve = createDropResolver(v, 'strict', { id: 'd0', grabOffset: 1 })

    for (const x of [3, 5]) {
      const plan = resolve({ floor: 3, x })
      expect(plan.kind).toBe('refuse')
      if (plan.kind === 'refuse') {
        expect(plan.ghost).toEqual({ floor: 3, x: 3, w: 3 })
        expect(plan.verdict.reason).toMatch(/no route/)
      }
    }
  })

  it('refuses a swap between two rooms alike in type and width, which would change nothing', () => {
    const v = base()
    v.rooms.push({ id: 'd2', type: 'diner', floor: 2, x: 4, w: 3 })
    const resolve = createDropResolver(v, 'free', { id: 'd0', grabOffset: 0 })
    const plan = resolve({ floor: 2, x: 5 })
    expect(plan.kind).toBe('refuse')
    if (plan.kind === 'refuse') {
      expect(plan.verdict.reason).toBe('These two rooms are the same; swapping them would change nothing.')
    }
  })

  it('swaps two rooms alike in type and width when their levels differ', () => {
    const v = base()
    v.rooms.push({ id: 'd2', type: 'diner', floor: 2, x: 4, w: 3, level: 3 })
    const resolve = createDropResolver(v, 'free', { id: 'd0', grabOffset: 0 })
    expect(resolve({ floor: 2, x: 5 })).toMatchObject({
      kind: 'run',
      op: { kind: 'swap', id: 'd0', with: 'd2', x: 4 },
    })
  })
})
