import { describe, it, expect } from 'vitest'
import {
  createVault, roomsOnFloor, findRoom, nextRoomId, levelOf, VAULT_DOOR_ID,
} from '../../src/domain/vault'
import { VAULT_DOOR_TYPE } from '../../src/domain/catalog'

describe('vault', () => {
  it('starts with the vault door and nothing else', () => {
    const v = createVault()
    expect(v.rooms).toHaveLength(1)
    expect(v.rooms[0]).toEqual({
      id: VAULT_DOOR_ID, type: VAULT_DOOR_TYPE, floor: 0, x: 0, w: 9,
    })
    expect(v.schemaVersion).toBe(2)
  })

  it('takes a name and falls back to one', () => {
    expect(createVault('Vault 76').name).toBe('Vault 76')
    expect(createVault().name).toBe('Vault 111')
  })

  it('lists the rooms of one floor only', () => {
    const v = createVault()
    v.rooms.push({ id: 'a', type: 'elevator', floor: 1, x: 6, w: 1 })
    expect(roomsOnFloor(v, 0).map((r) => r.id)).toEqual([VAULT_DOOR_ID])
    expect(roomsOnFloor(v, 1).map((r) => r.id)).toEqual(['a'])
  })

  it('finds a room by id', () => {
    const v = createVault()
    expect(findRoom(v, VAULT_DOOR_ID)?.type).toBe(VAULT_DOOR_TYPE)
    expect(findRoom(v, 'missing')).toBeUndefined()
  })

  it('hands out an id nothing else uses', () => {
    const v = createVault()
    const id = nextRoomId(v)
    expect(findRoom(v, id)).toBeUndefined()
    v.rooms.push({ id, type: 'elevator', floor: 1, x: 6, w: 1 })
    expect(nextRoomId(v)).not.toBe(id)
  })

  it('reads a room with no level as level 1', () => {
    expect(levelOf({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3 })).toBe(1)
    expect(levelOf({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3, level: 3 })).toBe(3)
  })
})
