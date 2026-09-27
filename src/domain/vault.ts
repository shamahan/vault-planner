import { VAULT_DOOR_TYPE, kindOf } from './catalog'
import { overlaps, touches } from './grid'

export type RoomId = string

export type Level = 1 | 2 | 3

export type Room = {
  id: RoomId
  type: string
  floor: number
  /** Leftmost cell. The room occupies [x, x + w). */
  x: number
  w: number
  /**
   * Absent means 1: every room is built at level 1, and files written
   * before levels existed carry none. Read it through levelOf, never
   * directly, so the two spellings of level 1 can never disagree.
   */
  level?: Level
}

export function levelOf(r: Room): Level {
  return r.level ?? 1
}

export type Vault = {
  schemaVersion: 1
  name: string
  rooms: Room[]
}

/** The door is a normal record so the reachability graph needs no special case. */
export const VAULT_DOOR_ID = 'door'

export function createVault(name = 'Vault 111'): Vault {
  return {
    schemaVersion: 1,
    name,
    rooms: [
      { id: VAULT_DOOR_ID, type: VAULT_DOOR_TYPE, floor: 0, x: 0, w: kindOf(VAULT_DOOR_TYPE).baseWidth },
    ],
  }
}

export function roomsOnFloor(v: Vault, floor: number): Room[] {
  return v.rooms.filter((r) => r.floor === floor)
}

export function findRoom(v: Vault, id: RoomId): Room | undefined {
  return v.rooms.find((r) => r.id === id)
}

export function nextRoomId(v: Vault): RoomId {
  const taken = new Set(v.rooms.map((r) => r.id))
  let n = v.rooms.length
  let id = `r${n}`
  while (taken.has(id)) id = `r${++n}`
  return id
}

export type Op =
  | { kind: 'place'; type: string; floor: number; x: number }
  | { kind: 'remove'; id: RoomId }
  | { kind: 'removeMany'; ids: RoomId[] }
  | { kind: 'move'; id: RoomId; floor: number; x: number }
  | { kind: 'swap'; id: RoomId; with: RoomId; x: number }
  | { kind: 'split'; id: RoomId }
  | { kind: 'rename'; name: string }

function clone(v: Vault): Vault {
  return { ...v, rooms: v.rooms.map((r) => ({ ...r })) }
}

/**
 * Absorbs the same-type rooms that touch `seed` into it, left and right,
 * up to `baseWidth * maxMerge`. A neighbour that would push the group past
 * that limit is left standing on its own: in the real game a fourth room
 * beside an already-full group of three does not refuse to be placed, it
 * simply does not join a group that has no room left in it. The `bad-width`
 * rule in validate.ts still exists, but only to catch a record that is
 * already over-wide when it arrives from outside (a hand-edited file, an
 * old share link) -- this function itself never produces one.
 */
function mergeNeighbours(rooms: Room[], seed: Room): Room[] {
  const kind = kindOf(seed.type)
  if (kind.maxMerge <= 1) return rooms
  const limit = kind.baseWidth * kind.maxMerge

  let group = { ...seed }
  const absorbed = new Set<RoomId>([seed.id])

  let grew = true
  while (grew) {
    grew = false
    for (const r of rooms) {
      if (absorbed.has(r.id)) continue
      if (r.floor !== group.floor || r.type !== group.type) continue
      if (!touches(group, r)) continue
      if (group.w + r.w > limit) continue
      group = { ...group, x: Math.min(group.x, r.x), w: group.w + r.w }
      absorbed.add(r.id)
      grew = true
    }
  }

  return rooms.filter((r) => !absorbed.has(r.id)).concat(group)
}

function splitRoom(rooms: Room[], id: RoomId, nextId: () => RoomId): Room[] {
  const room = rooms.find((r) => r.id === id)
  if (!room) return rooms
  const base = kindOf(room.type).baseWidth
  const parts = room.w / base
  if (!Number.isInteger(parts) || parts <= 1) return rooms

  const pieces: Room[] = []
  for (let i = 0; i < parts; i++) {
    pieces.push({
      id: i === 0 ? room.id : nextId(),
      type: room.type,
      floor: room.floor,
      x: room.x + i * base,
      w: base,
    })
  }
  return rooms.filter((r) => r.id !== id).concat(pieces)
}

/**
 * Where B lands when A swaps places with it and takes left edge `x`:
 * inside the span A leaves, against its left edge -- unless A and B share
 * a floor and that would cross A's new span, in which case against its
 * right edge. The right edge is then always clear: A's new span has to
 * cover B's old one, so if B stood left of A, A now ends no further right
 * than `B.x + A.w`, which is at most where A's old span ends less B's
 * width; mirrored, B on the right never needs the right edge at all.
 * Exported because the drag layer draws B's ghost where this puts it.
 */
export function swapLanding(a: Room, b: Room, x: number): number {
  if (a.floor !== b.floor) return a.x
  return overlaps({ x: a.x, w: b.w }, { x, w: a.w }) ? a.x + a.w - b.w : a.x
}

export function applyOp(v: Vault, op: Op): Vault {
  const next = clone(v)

  switch (op.kind) {
    case 'rename':
      next.name = op.name
      return next

    case 'place': {
      const room: Room = {
        id: nextRoomId(next),
        type: op.type,
        floor: op.floor,
        x: op.x,
        w: kindOf(op.type).baseWidth,
      }
      next.rooms = mergeNeighbours(next.rooms.concat(room), room)
      return next
    }

    case 'remove':
      next.rooms = next.rooms.filter((r) => r.id !== op.id)
      return next

    case 'removeMany': {
      const gone = new Set(op.ids)
      next.rooms = next.rooms.filter((r) => !gone.has(r.id))
      return next
    }

    case 'move': {
      const room = next.rooms.find((r) => r.id === op.id)
      if (!room) return next
      room.floor = op.floor
      room.x = op.x
      next.rooms = mergeNeighbours(next.rooms, room)
      return next
    }

    case 'swap': {
      const a = next.rooms.find((r) => r.id === op.id)
      const b = next.rooms.find((r) => r.id === op.with)
      if (!a || !b || a === b) return next
      const bFloor = b.floor
      const bx = swapLanding(a, b, op.x)
      b.floor = a.floor
      b.x = bx
      a.floor = bFloor
      a.x = op.x
      next.rooms = mergeNeighbours(next.rooms, a)
      // A can absorb B outright -- same type, landing side by side -- and
      // then there is no B left to merge.
      const survivor = next.rooms.find((r) => r.id === op.with)
      if (survivor) next.rooms = mergeNeighbours(next.rooms, survivor)
      return next
    }

    case 'split': {
      const used = new Set(next.rooms.map((r) => r.id))
      let n = 0
      const nextId = () => {
        let id = `s${n++}`
        while (used.has(id)) id = `s${n++}`
        used.add(id)
        return id
      }
      next.rooms = splitRoom(next.rooms, op.id, nextId)
      return next
    }
  }
}
