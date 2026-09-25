import { describe, it, expect } from 'vitest'
import { applyOp, createVault, findRoom, roomsOnFloor, type Vault } from '../../src/domain/vault'

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

  it('splits a merged room back into single rooms', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 9 })
    const after = applyOp(v, { kind: 'split', id: 'a' })
    const diners = roomsOnFloor(after, 0).filter((r) => r.type === 'diner')
    expect(diners).toHaveLength(3)
    expect(diners.map((r) => r.x).sort((p, q) => p - q)).toEqual([9, 12, 15])
    expect(diners.every((r) => r.w === 3)).toBe(true)
  })

  it('leaves a single room alone when asked to split it', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3 })
    expect(applyOp(v, { kind: 'split', id: 'a' }).rooms).toHaveLength(2)
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
