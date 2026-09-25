import { describe, it, expect } from 'vitest'
import { createVault, VAULT_DOOR_ID, type Vault } from '../../src/domain/vault'
import { reachableFrom, unreachableRooms, dependentsOf } from '../../src/domain/reachability'

/** Door 0-9, elevator at 9 running down, a diner hanging off each elevator. */
function shaftVault(): Vault {
  const v = createVault()
  v.rooms.push(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
    { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
    { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
  )
  return v
}

describe('reachability', () => {
  it('reaches everything joined to the door', () => {
    const reached = reachableFrom(shaftVault(), VAULT_DOOR_ID)
    expect([...reached].sort()).toEqual(['d0', 'd1', 'door', 'e0', 'e1'])
  })

  it('does not step from a room to the floor below', () => {
    const v = createVault()
    v.rooms.push(
      { id: 'd0', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'd1', type: 'diner', floor: 1, x: 9, w: 3 },
    )
    expect(reachableFrom(v, VAULT_DOOR_ID).has('d1')).toBe(false)
  })

  it('joins elevators only when they share a column', () => {
    const v = createVault()
    v.rooms.push(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 12, w: 1 },
    )
    expect(reachableFrom(v, VAULT_DOOR_ID).has('e1')).toBe(false)
  })

  it('needs rooms to touch, not merely to sit on one floor', () => {
    const v = createVault()
    v.rooms.push({ id: 'far', type: 'diner', floor: 0, x: 13, w: 3 })
    expect(unreachableRooms(v)).toEqual(['far'])
  })

  it('calls nothing unreachable in a sound vault', () => {
    expect(unreachableRooms(shaftVault())).toEqual([])
  })

  it('names what a removal would cut off, without the room itself', () => {
    expect(dependentsOf(shaftVault(), 'e0').sort()).toEqual(['d0', 'd1', 'e1'])
    expect(dependentsOf(shaftVault(), 'd1')).toEqual([])
  })

  it('cuts off the whole vault when the first elevator goes', () => {
    const v = shaftVault()
    expect(dependentsOf(v, 'e0')).not.toContain('door')
    expect(dependentsOf(v, 'e0')).toHaveLength(3)
  })

  it('keeps a room reachable when another path survives', () => {
    const v = createVault()
    v.rooms.push(
      { id: 'a', type: 'diner', floor: 0, x: 9, w: 3 },
      { id: 'b', type: 'garden', floor: 0, x: 12, w: 3 },
      { id: 'c', type: 'medbay', floor: 0, x: 15, w: 3 },
    )
    // b is the only bridge to c
    expect(dependentsOf(v, 'b')).toEqual(['c'])
    // a is a leaf toward the door side, removing it strands nothing
    expect(dependentsOf(v, 'c')).toEqual([])
  })
})
