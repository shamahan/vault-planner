import { kindOf, VAULT_DOOR_TYPE } from './catalog'
import { floorLabel, isFloor, overlaps, withinFloor } from './grid'
import { applyOp, findRoom, roomsOnFloor, VAULT_DOOR_ID, type Op, type Room, type RoomId, type Vault } from './vault'
import { dependentsOf, unreachableRooms } from './reachability'

export type ProblemKind =
  | 'out-of-bounds' | 'overlap' | 'bad-width' | 'door-misplaced' | 'unreachable'

export type Problem = {
  kind: ProblemKind
  message: string
  rooms: RoomId[]
}

export function legalWidths(type: string): number[] {
  const kind = kindOf(type)
  const widths: number[] = []
  for (let k = 1; k <= kind.maxMerge; k++) widths.push(kind.baseWidth * k)
  return widths
}

function floorsOf(v: Vault): number[] {
  return [...new Set(v.rooms.map((r) => r.floor))].sort((a, b) => a - b)
}

function geometryProblems(v: Vault): Problem[] {
  const problems: Problem[] = []

  for (const r of v.rooms) {
    if (!isFloor(r.floor) || !withinFloor(r)) {
      problems.push({
        kind: 'out-of-bounds',
        message: `${kindOf(r.type).name} does not fit on floor ${floorLabel(r.floor)}.`,
        rooms: [r.id],
      })
    }
    if (!legalWidths(r.type).includes(r.w)) {
      problems.push({
        kind: 'bad-width',
        message: `${kindOf(r.type).name} cannot be ${r.w} cells wide.`,
        rooms: [r.id],
      })
    }
  }

  for (const floor of floorsOf(v)) {
    const rooms = roomsOnFloor(v, floor)
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i] as Room
        const b = rooms[j] as Room
        if (overlaps(a, b)) {
          problems.push({
            kind: 'overlap',
            message: `${kindOf(a.type).name} and ${kindOf(b.type).name} overlap on floor ${floorLabel(floor)}.`,
            rooms: [a.id, b.id],
          })
        }
      }
    }
  }

  const doors = v.rooms.filter((r) => r.type === VAULT_DOOR_TYPE)
  const door = doors[0]
  if (doors.length !== 1) {
    problems.push({
      kind: 'door-misplaced',
      message: `A vault has exactly one vault door; this one has ${doors.length}.`,
      rooms: doors.map((d) => d.id),
    })
  } else if (door && (door.id !== VAULT_DOOR_ID || door.floor !== 0 || door.x !== 0)) {
    problems.push({
      kind: 'door-misplaced',
      message: `The vault door belongs at the far left of floor ${floorLabel(0)}.`,
      rooms: [door.id],
    })
  }

  return problems
}

export function validate(v: Vault): Problem[] {
  const problems = geometryProblems(v)
  for (const id of unreachableRooms(v)) {
    const room = findRoom(v, id)
    problems.push({
      kind: 'unreachable',
      message: `${room ? kindOf(room.type).name : 'This room'} has no route to the vault door.`,
      rooms: [id],
    })
  }
  return problems
}

export type Mode = 'strict' | 'free'

export type Verdict =
  | { ok: true }
  | { ok: false; reason: string; blame: RoomId[] }

function refuse(reason: string, blame: RoomId[] = []): Verdict {
  return { ok: false, reason, blame }
}

function touchedIds(op: Op): RoomId[] {
  switch (op.kind) {
    case 'remove': case 'move': case 'split': return [op.id]
    case 'removeMany': return op.ids
    default: return []
  }
}

/**
 * Blame should only ever name a room the caller can look up. `problem.rooms`
 * and `newlyStranded` are computed against the hypothetical `after` vault,
 * which can contain ids born inside this op (a fresh placement, a merge that
 * relabels a group, a split's new pieces) that do not exist in `v`. Filter
 * down to ids `v` actually has; if none survive, fall back to the ids the
 * op itself names (empty for `place`, which names none).
 */
function survivingBlame(v: Vault, ids: RoomId[], op: Op): RoomId[] {
  const survivors = ids.filter((id) => findRoom(v, id) !== undefined)
  return survivors.length > 0 ? survivors : touchedIds(op)
}

export function canApply(v: Vault, op: Op, mode: Mode): Verdict {
  // The door is not yours to place, move or delete — and you can't touch
  // a room that isn't there.
  for (const id of touchedIds(op)) {
    const room = findRoom(v, id)
    if (!room) {
      return refuse(`There is no room "${id}" to change.`)
    }
    if (!kindOf(room.type).placeable) {
      return refuse('The vault door is part of the vault and cannot be changed.', [id])
    }
  }
  if (op.kind === 'place' && !kindOf(op.type).placeable) {
    return refuse('The vault door is part of the vault and cannot be placed.', [VAULT_DOOR_ID])
  }

  const after = applyOp(v, op)

  // Geometry: always, in both modes. Keyed by the span each problem
  // describes (kind + floor/x/w of the rooms involved), not by room id:
  // ids churn under merge and split, so an id-keyed comparison can mistake
  // a newly-corrupted room for a pre-existing one with the same id.
  const geometryBefore = new Set(geometryProblems(v).map((p) => spanKey(v, p)))
  for (const problem of geometryProblems(after)) {
    if (geometryBefore.has(spanKey(after, problem))) continue
    return refuse(problem.message, survivingBlame(v, problem.rooms, op))
  }

  if (mode === 'free') return { ok: true }

  // A split cannot change reachability, so it is exempt from the strict-mode
  // check below even though its fresh ids would otherwise look stranded.
  // The pieces tile the parent's contiguous span, so every neighbour that
  // touched the parent still touches one of the pieces, the pieces touch
  // each other, and a room's own reachability never depended on its id --
  // only on what touches what. (An elevator, the one type whose neighbour
  // set is not purely geometric, has maxMerge 1 and so is never splittable.)
  // The graph is therefore unchanged up to renaming nodes, and comparing
  // stranded-id sets before and after would wrongly blame the new ids for
  // a disconnection that never happened -- most visibly when splitting a
  // room that was already unreachable, which strict mode must still allow
  // so an already-broken vault can be repaired.
  if (op.kind === 'split') return { ok: true }

  // Strict: an action may never grow the set of rooms with no route to the door.
  const strandedBefore = new Set(unreachableRooms(v))
  const strandedAfter = unreachableRooms(after)
  const newlyStranded = strandedAfter.filter((id) => !strandedBefore.has(id))
  if (newlyStranded.length === 0) return { ok: true }

  if (op.kind === 'place') {
    return refuse('That spot has no route back to the vault door.', survivingBlame(v, newlyStranded, op))
  }

  const count = newlyStranded.length
  const noun = count === 1 ? 'room' : 'rooms'
  const message = op.kind === 'remove'
    ? `Removing it leaves ${count} ${noun} with no route to the vault door.`
    : `That would leave ${count} ${noun} with no route to the vault door.`
  return refuse(message, survivingBlame(v, newlyStranded, op))
}

function spanKey(v: Vault, p: Problem): string {
  const spans = p.rooms
    .map((id) => findRoom(v, id))
    .filter((r): r is Room => r !== undefined)
    .map((r) => `${r.floor}:${r.x}:${r.w}`)
    .sort()
  return `${p.kind}:${spans.join(',')}`
}

/** The room plus everything that would lose its route without it, as one operation. */
export function cascadeFor(v: Vault, id: RoomId): Op {
  return { kind: 'removeMany', ids: [id, ...dependentsOf(v, id)] }
}
