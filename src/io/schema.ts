import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../domain/grid'
import type { Level, Room, Vault } from '../domain/vault'

export const CURRENT_SCHEMA_VERSION = 2

export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isLevel(x: unknown): x is Level {
  return x === 1 || x === 2 || x === 3
}

function readRoom(raw: unknown, index: number): Room {
  if (!isRecord(raw)) throw new SchemaError(`Room ${index} is not an object.`)
  const { id, type, floor, x, w, level } = raw
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
  // Legality against the kind's own cap stays validate()'s job, as with
  // width: this only keeps out values no room could ever have.
  if (level !== undefined && !isLevel(level)) {
    throw new SchemaError(`Room ${id} has a bad level.`)
  }
  const room: Room = { id, type, floor: floor as number, x: x as number, w: w as number }
  if (isLevel(level)) room.level = level
  return room
}

export function parseVault(text: string): Vault {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SchemaError('This file is not JSON.')
  }
  if (!isRecord(raw)) throw new SchemaError('This file does not describe a vault.')

  // Version 1 predates room levels, so its rooms simply have none and read
  // as level 1. It is still read -- every old file and share link is
  // version 1 -- and comes back as version 2, the only one this writes.
  const version = raw.schemaVersion
  if (version !== 1 && version !== CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      `This file was written for schema version ${String(version)}; ` +
      'this editor reads versions 1 and 2.',
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

  return { schemaVersion: CURRENT_SCHEMA_VERSION, name: raw.name, rooms }
}

export function serializeVault(v: Vault): string {
  return JSON.stringify(
    { schemaVersion: v.schemaVersion, name: v.name, rooms: v.rooms },
    null,
    2,
  )
}
