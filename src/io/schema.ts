import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../domain/grid'
import type { Room, Vault } from '../domain/vault'

export const CURRENT_SCHEMA_VERSION = 1

export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function readRoom(raw: unknown, index: number): Room {
  if (!isRecord(raw)) throw new SchemaError(`Room ${index} is not an object.`)
  const { id, type, floor, x, w } = raw
  if (typeof id !== 'string' || id.length === 0) throw new SchemaError(`Room ${index} has no id.`)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new SchemaError(`Room ${index} has an invalid id.`)
  if (typeof type !== 'string') throw new SchemaError(`Room ${id} has no type.`)
  try {
    kindOf(type)
  } catch {
    throw new SchemaError(`Room ${id} has an unknown type: ${type}.`)
  }
  for (const [key, value] of [['floor', floor], ['x', x], ['w', w]] as const) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new SchemaError(`Room ${id} has a bad ${key}.`)
    }
  }
  // These are sanity bounds a hostile or corrupted file could otherwise use
  // to hand the renderer numbers it cannot survive (an absurd floor makes it
  // try to allocate an array that size). Legality of a room's exact geometry
  // -- does it overlap another, is its width one this kind allows -- stays
  // validate()'s job; this only keeps out-of-range numbers from reaching it.
  if (!((floor as number) >= 0 && (floor as number) < FLOOR_COUNT)) {
    throw new SchemaError(`Room ${id} has a floor out of range: ${floor}.`)
  }
  if (!((x as number) >= 0 && (x as number) < CELLS_PER_FLOOR)) {
    throw new SchemaError(`Room ${id} has an x out of range: ${x}.`)
  }
  if (!((w as number) > 0 && (w as number) <= CELLS_PER_FLOOR)) {
    throw new SchemaError(`Room ${id} has a width out of range: ${w}.`)
  }
  return { id, type, floor: floor as number, x: x as number, w: w as number }
}

export function parseVault(text: string): Vault {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SchemaError('This file is not JSON.')
  }
  if (!isRecord(raw)) throw new SchemaError('This file does not describe a vault.')

  const version = raw.schemaVersion
  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      `This file was written for schema version ${String(version)}; ` +
      `this editor reads version ${CURRENT_SCHEMA_VERSION}.`,
    )
  }
  if (typeof raw.name !== 'string') throw new SchemaError('The vault has no name.')
  if (!Array.isArray(raw.rooms)) throw new SchemaError('The vault has no rooms list.')

  const rooms = raw.rooms.map(readRoom)
  const ids = new Set<string>()
  for (const r of rooms) {
    if (ids.has(r.id)) throw new SchemaError(`Duplicate room id: ${r.id}.`)
    ids.add(r.id)
  }

  return { schemaVersion: 1, name: raw.name, rooms }
}

export function serializeVault(v: Vault): string {
  return JSON.stringify(
    { schemaVersion: v.schemaVersion, name: v.name, rooms: v.rooms },
    null,
    2,
  )
}
