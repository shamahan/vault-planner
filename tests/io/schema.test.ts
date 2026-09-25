import { describe, it, expect } from 'vitest'
import { createVault, type Vault } from '../../src/domain/vault'
import { parseVault, serializeVault, SchemaError } from '../../src/io/schema'

describe('schema', () => {
  it('survives a round trip unchanged', () => {
    const v = createVault('Vault 76')
    v.rooms.push({ id: 'a', type: 'diner', floor: 2, x: 7, w: 9 })
    expect(parseVault(serializeVault(v))).toEqual(v)
  })

  it('serialises to the exact same text twice', () => {
    const v = createVault()
    expect(serializeVault(v)).toBe(serializeVault(parseVault(serializeVault(v))))
  })

  it('refuses text that is not JSON', () => {
    expect(() => parseVault('not json')).toThrow(SchemaError)
  })

  it('refuses a future schema version by name', () => {
    expect(() => parseVault(JSON.stringify({ schemaVersion: 99, name: 'x', rooms: [] })))
      .toThrow(/version 99/i)
  })

  it('refuses a missing schema version', () => {
    expect(() => parseVault(JSON.stringify({ name: 'x', rooms: [] }))).toThrow(SchemaError)
  })

  it('refuses a room with an unknown type', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'spa', floor: 0, x: 0, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/spa/)
  })

  it('refuses a room missing a field', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 0 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(SchemaError)
  })

  it('refuses duplicate ids', () => {
    const bad = {
      schemaVersion: 1, name: 'x',
      rooms: [
        { id: 'a', type: 'diner', floor: 0, x: 0, w: 3 },
        { id: 'a', type: 'garden', floor: 0, x: 3, w: 3 },
      ],
    }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/duplicate/i)
  })

  it('accepts a structurally sound but disconnected vault', () => {
    const lonely: Vault = {
      schemaVersion: 1, name: 'x',
      rooms: [{ id: 'a', type: 'diner', floor: 4, x: 12, w: 3 }],
    }
    expect(parseVault(JSON.stringify(lonely)).rooms).toHaveLength(1)
  })

  it('rejects a room id containing a quote', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'r"bad', type: 'diner', floor: 0, x: 0, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/invalid id/i)
  })

  it('accepts a valid alphanumeric room id', () => {
    const good = { schemaVersion: 1, name: 'x', rooms: [{ id: 'r1', type: 'diner', floor: 0, x: 0, w: 3 }] }
    expect(parseVault(JSON.stringify(good)).rooms[0]!.id).toBe('r1')
  })

  it('rejects a floor far outside the vault, the way a hostile share link would try', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 100000000, x: 0, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/floor/i)
  })

  it('rejects a negative floor', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: -1, x: 0, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/floor/i)
  })

  it('rejects a negative x', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 0, x: -1, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/x/i)
  })

  it('rejects an x past the edge of a floor', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 0, x: 26, w: 3 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/x/i)
  })

  it('rejects a zero width', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 0, x: 0, w: 0 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/width/i)
  })

  it('rejects a width wider than a whole floor', () => {
    const bad = { schemaVersion: 1, name: 'x', rooms: [{ id: 'a', type: 'diner', floor: 0, x: 0, w: 27 }] }
    expect(() => parseVault(JSON.stringify(bad))).toThrow(/width/i)
  })
})
