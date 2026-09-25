import { ELEVATOR_TYPE } from './catalog'
import { touches } from './grid'
import { roomsOnFloor, VAULT_DOOR_ID, type Room, type RoomId, type Vault } from './vault'

function neighbours(v: Vault, room: Room): RoomId[] {
  const out: RoomId[] = []

  for (const other of roomsOnFloor(v, room.floor)) {
    if (other.id !== room.id && touches(room, other)) out.push(other.id)
  }

  // An elevator joins the elevator directly above and below it: that is the shaft.
  if (room.type === ELEVATOR_TYPE) {
    for (const floor of [room.floor - 1, room.floor + 1]) {
      for (const other of roomsOnFloor(v, floor)) {
        if (other.type === ELEVATOR_TYPE && other.x === room.x) out.push(other.id)
      }
    }
  }

  return out
}

export function reachableFrom(v: Vault, rootId: RoomId): Set<RoomId> {
  const byId = new Map(v.rooms.map((r) => [r.id, r]))
  const seen = new Set<RoomId>()
  const root = byId.get(rootId)
  if (!root) return seen

  const queue: RoomId[] = [rootId]
  seen.add(rootId)
  while (queue.length > 0) {
    const id = queue.shift() as RoomId
    const room = byId.get(id)
    if (!room) continue
    for (const next of neighbours(v, room)) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

export function unreachableRooms(v: Vault): RoomId[] {
  const reached = reachableFrom(v, VAULT_DOOR_ID)
  return v.rooms.filter((r) => !reached.has(r.id)).map((r) => r.id)
}

/** Rooms that lose every route to the door once `id` is gone. Excludes `id`. */
export function dependentsOf(v: Vault, id: RoomId): RoomId[] {
  const before = reachableFrom(v, VAULT_DOOR_ID)
  const without: Vault = { ...v, rooms: v.rooms.filter((r) => r.id !== id) }
  const after = reachableFrom(without, VAULT_DOOR_ID)
  return [...before].filter((r) => r !== id && !after.has(r))
}
