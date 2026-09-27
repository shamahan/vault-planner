import { describe, it, expect } from 'vitest'
import { applyOp, createVault, findRoom, levelOf, reorderPlan, roomsOnFloor, type Vault } from '../../src/domain/vault'

function vaultWith(...rooms: Vault['rooms']): Vault {
  const v = createVault()
  v.rooms.push(...rooms)
  return v
}

describe('operations', () => {
  it('places a room at its base width', () => {
    const v = applyOp(createVault(), { kind: 'place', type: 'diner', floor: 0, x: 9 })
    const placed = roomsOnFloor(v, 0).find((r) => r.type === 'diner')
    expect(placed).toMatchObject({ floor: 0, x: 9, w: 3 })
  })

  it('leaves the vault it was given untouched', () => {
    const before = createVault()
    const after = applyOp(before, { kind: 'place', type: 'diner', floor: 0, x: 9 })
    expect(before.rooms).toHaveLength(1)
    expect(after.rooms).toHaveLength(2)
  })

  it('merges into a neighbour of the same type', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3 })
    const after = applyOp(v, { kind: 'place', type: 'diner', floor: 0, x: 12 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ x: 9, w: 6 })
  })

  it('merges on the left as well as the right', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 12, w: 3 })
    const after = applyOp(v, { kind: 'place', type: 'diner', floor: 0, x: 9 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ x: 9, w: 6 })
  })

  it('welds two groups together when a room lands between them', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'b', type: 'diner', floor: 0, x: 15, w: 3 },
    )
    const after = applyOp(v, { kind: 'place', type: 'diner', floor: 0, x: 12 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ x: 9, w: 9 })
  })

  it('never merges a kind whose maxMerge is one', () => {
    const v = vaultWith({ id: 'a', type: 'elevator', floor: 1, x: 6, w: 1 })
    const after = applyOp(v, { kind: 'place', type: 'elevator', floor: 1, x: 7 })
    expect(roomsOnFloor(after, 1).filter((r) => r.type === 'elevator')).toHaveLength(2)
  })

  it('removes one room and removes many', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'b', type: 'garden', floor: 0, x: 12, w: 3 },
    )
    expect(findRoom(applyOp(v, { kind: 'remove', id: 'a' }), 'a')).toBeUndefined()
    expect(applyOp(v, { kind: 'removeMany', ids: ['a', 'b'] }).rooms).toHaveLength(1)
  })

  it('moves a room and merges it where it lands', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'b', type: 'diner', floor: 1, x: 20, w: 3 },
    )
    const after = applyOp(v, { kind: 'move', id: 'b', floor: 0, x: 12 })
    const diners = after.rooms.filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ floor: 0, x: 9, w: 6 })
  })

  it('renames the vault', () => {
    expect(applyOp(createVault(), { kind: 'rename', name: 'Vault 76' }).name).toBe('Vault 76')
  })
})

describe('swap', () => {
  it('trades two rooms of the same width between floors', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 10, w: 3 },
      { id: 'b', type: 'garden', floor: 1, x: 4, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 4 })
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 4, w: 3 })
    expect(findRoom(after, 'b')).toMatchObject({ floor: 0, x: 10, w: 3 })
  })

  it('puts a narrower target against the left edge of the span it moves into', () => {
    const v = vaultWith(
      { id: 'a', type: 'overseers_office', floor: 0, x: 10, w: 6 },
      { id: 'b', type: 'diner', floor: 1, x: 4, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 4 })
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 4, w: 6 })
    expect(findRoom(after, 'b')).toMatchObject({ floor: 0, x: 10, w: 3 })
  })

  it('puts the target against the right edge when the left would cross the room it swapped with', () => {
    // Office [3,9), diner [0,3) on its left. The office takes [0,6); the
    // diner at the office's old left edge, [3,6), would sit inside it.
    const v = vaultWith(
      { id: 'a', type: 'overseers_office', floor: 1, x: 3, w: 6 },
      { id: 'b', type: 'diner', floor: 1, x: 0, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 0 })
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 0, w: 6 })
    expect(findRoom(after, 'b')).toMatchObject({ floor: 1, x: 6, w: 3 })
  })

  it('keeps the left edge when the target stood on the right', () => {
    const v = vaultWith(
      { id: 'a', type: 'overseers_office', floor: 1, x: 0, w: 6 },
      { id: 'b', type: 'diner', floor: 1, x: 6, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 3 })
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 3, w: 6 })
    expect(findRoom(after, 'b')).toMatchObject({ floor: 1, x: 0, w: 3 })
  })

  it('merges each room with its new neighbours, keeping its id', () => {
    const v = vaultWith(
      { id: 'n', type: 'diner', floor: 1, x: 0, w: 3 },
      { id: 'b', type: 'garden', floor: 1, x: 3, w: 3 },
      { id: 'a', type: 'diner', floor: 2, x: 10, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 3 })
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 0, w: 6 })
    expect(findRoom(after, 'n')).toBeUndefined()
    expect(findRoom(after, 'b')).toMatchObject({ floor: 2, x: 10, w: 3 })
  })

  it('survives the room absorbing its own target', () => {
    // Two diners side by side but unmerged, as a hand-edited file can hold
    // them. After the swap they touch again and weld: there is no B left
    // for the second merge to start from.
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 1, x: 0, w: 6 },
      { id: 'b', type: 'diner', floor: 1, x: 6, w: 3 },
    )
    const after = applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 3 })
    expect(findRoom(after, 'b')).toBeUndefined()
    expect(findRoom(after, 'a')).toMatchObject({ floor: 1, x: 0, w: 9 })
  })

  it('leaves the vault it was given untouched', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 10, w: 3 },
      { id: 'b', type: 'garden', floor: 1, x: 4, w: 3 },
    )
    applyOp(v, { kind: 'swap', id: 'a', with: 'b', x: 4 })
    expect(findRoom(v, 'a')).toMatchObject({ floor: 0, x: 10 })
    expect(findRoom(v, 'b')).toMatchObject({ floor: 1, x: 4 })
  })
})

describe('operations: room levels', () => {
  it('builds a new room at level 1', () => {
    const v = applyOp(createVault(), { kind: 'place', type: 'diner', floor: 0, x: 9 })
    const placed = roomsOnFloor(v, 0).find((r) => r.type === 'diner')!
    expect(levelOf(placed)).toBe(1)
  })

  it('does not merge a new room into a neighbour of another level', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3, level: 3 })
    const after = applyOp(v, { kind: 'place', type: 'diner', floor: 0, x: 12 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(2)
  })

  it('sets the level of the whole room', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 6 })
    const after = applyOp(v, { kind: 'level', id: 'a', level: 2 })
    expect(findRoom(after, 'a')).toMatchObject({ x: 9, w: 6, level: 2 })
  })

  it('merges a raised room into a neighbour that is already at that level', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'b', type: 'diner', floor: 0, x: 12, w: 3, level: 3 },
    )
    const after = applyOp(v, { kind: 'level', id: 'a', level: 3 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ id: 'a', x: 9, w: 6, level: 3 })
  })

  it('merges a lowered room the same way', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3, level: 3 },
      { id: 'b', type: 'diner', floor: 0, x: 12, w: 3 },
    )
    const after = applyOp(v, { kind: 'level', id: 'a', level: 1 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(1)
    expect(diners[0]).toMatchObject({ x: 9, w: 6 })
    expect(levelOf(diners[0]!)).toBe(1)
  })

  it('leaves a level-matched neighbour alone when the merge would outgrow the cap', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 9, level: 3 },
      { id: 'b', type: 'diner', floor: 0, x: 18, w: 3 },
    )
    const after = applyOp(v, { kind: 'level', id: 'b', level: 3 })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(2)
    expect(findRoom(after, 'b')).toMatchObject({ x: 18, w: 3, level: 3 })
  })

  it('does not merge a moved room into a neighbour of another level', () => {
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3, level: 2 },
      { id: 'b', type: 'diner', floor: 1, x: 12, w: 3 },
    )
    const after = applyOp(v, { kind: 'move', id: 'b', floor: 0, x: 12 })
    expect(roomsOnFloor(after, 0).filter((r) => r.type === 'diner')).toHaveLength(2)
  })
})

describe('reorder', () => {
  // Floor 1: elevator e1 at 4, workshop r2 [5,14), workshop r3 [14,23), elevator e4 at 23.
  const row = (): Vault => vaultWith(
    { id: 'e1', type: 'elevator', floor: 1, x: 4, w: 1 },
    { id: 'r2', type: 'weapon_workshop', floor: 1, x: 5, w: 9 },
    { id: 'r3', type: 'outfit_workshop', floor: 1, x: 14, w: 9 },
    { id: 'e4', type: 'elevator', floor: 1, x: 23, w: 1 },
  )

  it('inserts a room before the one it lands on, shifting that one along', () => {
    const after = applyOp(row(), { kind: 'reorder', id: 'e4', with: 'r3' })
    expect(findRoom(after, 'e4')).toMatchObject({ floor: 1, x: 14 })
    expect(findRoom(after, 'r3')).toMatchObject({ floor: 1, x: 15 })
    expect(findRoom(after, 'r2')).toMatchObject({ floor: 1, x: 5 })
    expect(findRoom(after, 'e1')).toMatchObject({ floor: 1, x: 4 })
  })

  it('shifts every room between when it lands further along the row', () => {
    const after = applyOp(row(), { kind: 'reorder', id: 'e4', with: 'r2' })
    expect(findRoom(after, 'e4')).toMatchObject({ x: 5 })
    expect(findRoom(after, 'r2')).toMatchObject({ x: 6 })
    expect(findRoom(after, 'r3')).toMatchObject({ x: 15 })
  })

  it('moves right as well as left, ending where the room it lands on ended', () => {
    const after = applyOp(row(), { kind: 'reorder', id: 'e1', with: 'r3' })
    expect(findRoom(after, 'e1')).toMatchObject({ x: 22 })
    expect(findRoom(after, 'r2')).toMatchObject({ x: 4 })
    expect(findRoom(after, 'r3')).toMatchObject({ x: 13 })
    expect(findRoom(after, 'e4')).toMatchObject({ x: 23 })
  })

  it('lets an elevator past a wider room at the edge of the floor, and back', () => {
    // [elevator][workshop] against the right-hand edge: either one dropped
    // on the other gives the same [workshop][elevator].
    const edge = (): Vault => vaultWith(
      { id: 'e', type: 'elevator', floor: 1, x: 16, w: 1 },
      { id: 'w', type: 'weapon_workshop', floor: 1, x: 17, w: 9 },
    )
    for (const op of [
      { kind: 'reorder', id: 'e', with: 'w' },
      { kind: 'reorder', id: 'w', with: 'e' },
    ] as const) {
      const after = applyOp(edge(), op)
      expect(findRoom(after, 'w')).toMatchObject({ x: 16 })
      expect(findRoom(after, 'e')).toMatchObject({ x: 25 })
    }
  })

  it('merges rooms the shift brings together', () => {
    const v = vaultWith(
      { id: 'd1', type: 'diner', floor: 1, x: 0, w: 3 },
      { id: 'l', type: 'lounge', floor: 1, x: 3, w: 3 },
      { id: 'd2', type: 'diner', floor: 1, x: 6, w: 3 },
    )
    const after = applyOp(v, { kind: 'reorder', id: 'l', with: 'd2' })
    expect(findRoom(after, 'l')).toMatchObject({ x: 6 })
    expect(findRoom(after, 'd2')).toMatchObject({ x: 0, w: 6 })
    expect(findRoom(after, 'd1')).toBeUndefined()
  })

  it('leaves the vault it was given untouched', () => {
    const v = row()
    applyOp(v, { kind: 'reorder', id: 'e4', with: 'r3' })
    expect(findRoom(v, 'e4')).toMatchObject({ x: 23 })
    expect(findRoom(v, 'r3')).toMatchObject({ x: 14 })
  })

  it('plans the layout, and has no plan across free cells, across floors or for one room', () => {
    expect(reorderPlan(row(), 'e4', 'r2')).toEqual({ ax: 5, moved: ['r2', 'r3'], shift: 1, span: { x: 6, w: 18 } })
    const apart = vaultWith(
      { id: 'e', type: 'elevator', floor: 1, x: 4, w: 1 },
      { id: 'w', type: 'weapon_workshop', floor: 1, x: 17, w: 9 },
      { id: 'up', type: 'diner', floor: 2, x: 0, w: 3 },
    )
    expect(reorderPlan(apart, 'e', 'w')).toBeNull()
    expect(reorderPlan(apart, 'e', 'up')).toBeNull()
    expect(reorderPlan(apart, 'e', 'e')).toBeNull()
  })

  it('stops at an elevator between the two, leaving that drop to a swap', () => {
    // A full floor in the game is [9][E][6][E][9]: every room stands shoulder
    // to shoulder, and a reorder across an elevator would push it out of
    // its shaft.
    const v = vaultWith(
      { id: 'd', type: 'diner', floor: 1, x: 0, w: 9 },
      { id: 'e', type: 'elevator', floor: 1, x: 9, w: 1 },
      { id: 'g', type: 'garden', floor: 1, x: 10, w: 9 },
    )
    expect(reorderPlan(v, 'd', 'g')).toBeNull()
    expect(reorderPlan(v, 'g', 'd')).toBeNull()
    // The elevator may still be the room dropped on, or the room carried.
    expect(reorderPlan(v, 'd', 'e')).not.toBeNull()
    expect(reorderPlan(v, 'e', 'g')).not.toBeNull()
  })

  it('has no plan for two rooms lying on top of each other', () => {
    const v = vaultWith(
      { id: 'o', type: 'overseers_office', floor: 1, x: 0, w: 6 },
      { id: 'd', type: 'diner', floor: 1, x: 2, w: 3 },
    )
    expect(reorderPlan(v, 'o', 'd')).toBeNull()
  })

  it('keeps rooms of different levels apart when the shift brings them together', () => {
    const v = vaultWith(
      { id: 'd1', type: 'diner', floor: 1, x: 0, w: 3, level: 3 },
      { id: 'l', type: 'lounge', floor: 1, x: 3, w: 3 },
      { id: 'd2', type: 'diner', floor: 1, x: 6, w: 3 },
    )
    const after = applyOp(v, { kind: 'reorder', id: 'l', with: 'd2' })
    expect(findRoom(after, 'd1')).toMatchObject({ x: 0, w: 3 })
    expect(findRoom(after, 'd2')).toMatchObject({ x: 3, w: 3 })
  })

  it('merges the carried room where it lands, keeping its id', () => {
    const v = vaultWith(
      { id: 'd1', type: 'diner', floor: 1, x: 0, w: 3 },
      { id: 'l', type: 'lounge', floor: 1, x: 3, w: 3 },
      { id: 'a', type: 'diner', floor: 1, x: 6, w: 3 },
    )
    const after = applyOp(v, { kind: 'reorder', id: 'a', with: 'l' })
    expect(findRoom(after, 'a')).toMatchObject({ x: 0, w: 6 })
    expect(findRoom(after, 'd1')).toBeUndefined()
    expect(findRoom(after, 'l')).toMatchObject({ x: 6 })
  })
})
