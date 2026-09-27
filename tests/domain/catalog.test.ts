import { describe, it, expect } from 'vitest'
import {
  ROOM_KINDS, kindOf, placeableKinds, VAULT_DOOR_TYPE, ELEVATOR_TYPE,
} from '../../src/domain/catalog'
import { CELLS_PER_FLOOR } from '../../src/domain/grid'

describe('catalog', () => {
  it('holds the 28 rooms of the game', () => {
    expect(ROOM_KINDS).toHaveLength(28)
  })

  it('gives every kind a unique id', () => {
    const ids = ROOM_KINDS.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('looks a kind up by id and refuses an unknown one', () => {
    expect(kindOf('power_generator').name).toBe('Power Generator')
    expect(() => kindOf('nope')).toThrow(/unknown room type/i)
  })

  it('makes the vault door the only room you cannot place', () => {
    const fixed = ROOM_KINDS.filter((k) => !k.placeable)
    expect(fixed.map((k) => k.id)).toEqual([VAULT_DOOR_TYPE])
    expect(placeableKinds()).toHaveLength(27)
  })

  it('sizes the elevator at one cell and the vault door at nine', () => {
    expect(kindOf(ELEVATOR_TYPE).baseWidth).toBe(1)
    expect(kindOf(VAULT_DOOR_TYPE).baseWidth).toBe(9)
  })

  it('never lets a fully merged room outgrow a floor', () => {
    for (const k of ROOM_KINDS) {
      expect(k.baseWidth * k.maxMerge).toBeLessThanOrEqual(CELLS_PER_FLOOR)
    }
  })

  it('only merges rooms of the base width three', () => {
    for (const k of ROOM_KINDS) {
      if (k.maxMerge > 1) expect(k.baseWidth).toBe(3)
    }
  })

  it('keeps the fixed-width rooms unmergeable', () => {
    for (const id of ['overseers_office', 'barbershop', 'weapon_workshop', 'ultracite_mine']) {
      expect(kindOf(id).maxMerge).toBe(1)
    }
    expect(kindOf('overseers_office').baseWidth).toBe(6)
    expect(kindOf('weapon_workshop').baseWidth).toBe(9)
  })

  it('upgrades every room to level 3 but the elevator, the door and the barbershop', () => {
    // From the game's own table (see the fallout-shelter-room-parameters
    // note): the elevator has no upgrades, the barbershop stops at 2, and
    // the vault door's upgrades exist in the game but the planner never
    // lets anyone change the door, so it is not modelled.
    expect(kindOf(ELEVATOR_TYPE).maxLevel).toBe(1)
    expect(kindOf(VAULT_DOOR_TYPE).maxLevel).toBe(1)
    expect(kindOf('barbershop').maxLevel).toBe(2)
    const rest = ROOM_KINDS.filter((k) => ![ELEVATOR_TYPE, VAULT_DOOR_TYPE, 'barbershop'].includes(k.id))
    expect(rest).toHaveLength(25)
    for (const k of rest) expect(k.maxLevel, k.id).toBe(3)
  })
})
