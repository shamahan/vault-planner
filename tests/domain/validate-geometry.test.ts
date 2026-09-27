import { describe, it, expect } from 'vitest'
import { createVault, VAULT_DOOR_ID, type Vault } from '../../src/domain/vault'
import { validate } from '../../src/domain/validate'

function withRooms(...rooms: Vault['rooms']): Vault {
  const v = createVault()
  v.rooms.push(...rooms)
  return v
}

describe('validate: geometry', () => {
  it('finds nothing wrong with a fresh vault', () => {
    expect(validate(createVault())).toEqual([])
  })

  it('reports a room hanging off the right edge', () => {
    const v = withRooms({ id: 'a', type: 'weapon_workshop', floor: 1, x: 18, w: 9 })
    const kinds = validate(v).map((p) => p.kind)
    expect(kinds).toContain('out-of-bounds')
  })

  it('numbers a floor from one for a person, though the model counts it from zero', () => {
    // Floor 0 is the model's top floor. The message a person reads has to
    // call it "floor 1" -- the model's own indexing is not something to
    // show them.
    const v = withRooms({ id: 'a', type: 'weapon_workshop', floor: 0, x: 20, w: 9 })
    const problem = validate(v).find((p) => p.kind === 'out-of-bounds')
    expect(problem?.message).toContain('floor 1')
    expect(problem?.message).not.toContain('floor 0')
  })

  it('reports two rooms sharing a cell', () => {
    const v = withRooms(
      { id: 'a', type: 'diner', floor: 1, x: 7, w: 3 },
      { id: 'b', type: 'garden', floor: 1, x: 9, w: 3 },
    )
    const overlap = validate(v).find((p) => p.kind === 'overlap')
    expect(overlap).toBeDefined()
    expect(overlap!.rooms.sort()).toEqual(['a', 'b'])
  })

  it('allows two rooms that only touch', () => {
    const v = withRooms(
      { id: 'a', type: 'diner', floor: 1, x: 7, w: 3 },
      { id: 'b', type: 'garden', floor: 1, x: 10, w: 3 },
    )
    expect(validate(v).some((p) => p.kind === 'overlap')).toBe(false)
  })

  it('reports a width its kind cannot have', () => {
    const v = withRooms({ id: 'a', type: 'diner', floor: 1, x: 7, w: 4 })
    expect(validate(v).some((p) => p.kind === 'bad-width')).toBe(true)
  })

  it('accepts every legal merge width and rejects one too far', () => {
    expect(validate(withRooms({ id: 'a', type: 'diner', floor: 1, x: 7, w: 9 }))
      .some((p) => p.kind === 'bad-width')).toBe(false)
    expect(validate(withRooms({ id: 'a', type: 'overseers_office', floor: 1, x: 7, w: 12 }))
      .some((p) => p.kind === 'bad-width')).toBe(true)
  })

  it('reports a door that moved, and a second door', () => {
    const moved = createVault()
    moved.rooms[0]!.x = 3
    expect(validate(moved).some((p) => p.kind === 'door-misplaced')).toBe(true)

    const twice = withRooms({ id: 'd2', type: 'vault_door', floor: 0, x: 10, w: 9 })
    expect(validate(twice).some((p) => p.kind === 'door-misplaced')).toBe(true)
  })

  it('reports a missing door', () => {
    const v = createVault()
    v.rooms = v.rooms.filter((r) => r.id !== VAULT_DOOR_ID)
    expect(validate(v).some((p) => p.kind === 'door-misplaced')).toBe(true)
  })

  it('gives every problem a message a person can read', () => {
    const v = withRooms({ id: 'a', type: 'diner', floor: 1, x: 24, w: 3 })
    for (const p of validate(v)) expect(p.message.length).toBeGreaterThan(0)
  })

  it('reports a room above the highest level its kind has', () => {
    const v = withRooms({ id: 'a', type: 'barbershop', floor: 1, x: 7, w: 6, level: 3 })
    const problem = validate(v).find((p) => p.kind === 'bad-level')
    expect(problem).toEqual({ kind: 'bad-level', message: 'Barbershop cannot be level 3.', rooms: ['a'] })
  })
})
