import { kindOf, VAULT_DOOR_TYPE } from './catalog'
import { floorLabel, isFloor, overlaps, withinFloor } from './grid'
import { applyOp, findRoom, levelOf, reorderPlan, roomsOnFloor, VAULT_DOOR_ID, type Op, type Room, type RoomId, type Vault } from './vault'
import { dependentsOf, unreachableRooms } from './reachability'

export type ProblemKind =
  | 'out-of-bounds' | 'overlap' | 'bad-width' | 'bad-level' | 'door-misplaced' | 'unreachable'

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
    if (levelOf(r) > kindOf(r.type).maxLevel) {
      problems.push({
        kind: 'bad-level',
        message: `${kindOf(r.type).name} cannot be level ${levelOf(r)}.`,
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
    case 'remove': case 'move': case 'level': return [op.id]
    case 'swap': case 'reorder': return [op.id, op.with]
    case 'removeMany': return op.ids
    default: return []
  }
}

/**
 * Blame should only ever name a room the caller can look up. `problem.rooms`
 * and `newlyStranded` are computed against the hypothetical `after` vault,
 * which can contain ids born inside this op (a fresh placement, a merge that
 * relabels a group) that do not exist in `v`. Filter
 * down to ids `v` actually has; if none survive, fall back to the ids the
 * op itself names (empty for `place`, which names none).
 */
function survivingBlame(v: Vault, ids: RoomId[], op: Op): RoomId[] {
  const survivors = ids.filter((id) => findRoom(v, id) !== undefined)
  return survivors.length > 0 ? survivors : touchedIds(op)
}

/**
 * What makes a swap wrong before any geometry is worked out. Both rooms
 * are known to exist: canApply has already looked each of them up.
 */
function swapRefusal(v: Vault, op: Extract<Op, { kind: 'swap' }>): Verdict | null {
  const a = findRoom(v, op.id) as Room
  const b = findRoom(v, op.with) as Room
  const aName = kindOf(a.type).name
  const bName = kindOf(b.type).name
  if (a.id === b.id) return refuse('A room cannot swap places with itself.', [a.id])
  if (b.w > a.w) {
    // Same type on both sides ("The Diner is wider than the Diner") reads as
    // a copy-paste mistake, not a real distinction between the two rooms.
    return a.type === b.type
      ? refuse(`That ${bName} is wider than this one and would not fit in its place.`, [b.id])
      : refuse(`The ${bName} is wider than the ${aName} and would not fit in its place.`, [b.id])
  }
  // A swap puts A where B stood. An x that leaves part of B's old span
  // uncovered is a move plus a relocation, not a swap; the drag layer
  // never builds one, so this only guards the op against a bad caller.
  if (op.x > b.x || op.x + a.w < b.x + b.w) {
    return refuse(`The ${aName} has to cover the ${bName} to swap places with it.`, [a.id, b.id])
  }
  return null
}

/**
 * What makes a reorder wrong before any geometry is worked out. Both rooms
 * are known to exist: canApply has already looked each of them up.
 */
function reorderRefusal(v: Vault, op: Extract<Op, { kind: 'reorder' }>): Verdict | null {
  const a = findRoom(v, op.id) as Room
  const b = findRoom(v, op.with) as Room
  if (a.id === b.id) return refuse('A room cannot swap places with itself.', [a.id])
  const plan = reorderPlan(v, op.id, op.with)
  // The drag layer builds a reorder only for two rooms in one unbroken row;
  // this guards the op against a caller that does not check.
  if (!plan) {
    return refuse(`The ${kindOf(a.type).name} and the ${kindOf(b.type).name} are not in one unbroken row.`, [a.id, b.id])
  }
  // touchedIds has already refused the door as A or B. In a vault laid out
  // by the rules it can be nothing else -- it stands at the far left of
  // floor 0 -- but a hand-edited file can put it mid-row, among the rooms
  // that would shift.
  const door = plan.moved.find((id) => !kindOf((findRoom(v, id) as Room).type).placeable)
  if (door) return refuse('The vault door is part of the vault and cannot be changed.', [door])
  return null
}

/**
 * What makes a level change wrong before it is tried. The room is known to
 * exist: canApply has already looked it up. Asking for the level a room
 * already has is refused rather than let through, because store.run would
 * otherwise commit an unchanged vault -- one more undo step, and any redo
 * the person had queued thrown away, for nothing they could see.
 */
function levelRefusal(v: Vault, op: Extract<Op, { kind: 'level' }>): Verdict | null {
  const room = findRoom(v, op.id) as Room
  const kind = kindOf(room.type)
  if (!Number.isInteger(op.level) || op.level < 1 || op.level > kind.maxLevel) {
    return kind.maxLevel === 1
      ? refuse(`The ${kind.name} has no levels.`, [room.id])
      : refuse(`The ${kind.name} goes from level 1 to level ${kind.maxLevel}.`, [room.id])
  }
  if (op.level === levelOf(room)) {
    return refuse(`The ${kind.name} is already level ${op.level}.`, [room.id])
  }
  return null
}

/**
 * A new overlap reads as a description of the result -- "Diner and Lounge
 * overlap on floor 3" -- which is right for a placement and odd as the
 * answer to a move. When the room being moved is one of the pair, say what
 * the move ran into instead. The moved room still has its id in `after`:
 * mergeNeighbours hands a merged group the id of the room that seeded it.
 */
function refusalText(op: Op, after: Vault, problem: Problem): string {
  if (problem.kind !== 'overlap') return problem.message
  if (op.kind !== 'move' && op.kind !== 'swap') return problem.message
  if (!problem.rooms.includes(op.id)) return problem.message
  const moved = findRoom(after, op.id)
  const otherId = problem.rooms.find((id) => id !== op.id)
  const other = otherId === undefined ? undefined : findRoom(after, otherId)
  if (!moved || !other) return problem.message
  return `No room for the ${kindOf(moved.type).name} here: the ${kindOf(other.type).name} is in the way.`
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

  if (op.kind === 'swap') {
    const refusal = swapRefusal(v, op)
    if (refusal) return refusal
  }
  if (op.kind === 'reorder') {
    const refusal = reorderRefusal(v, op)
    if (refusal) return refusal
  }
  if (op.kind === 'level') {
    const refusal = levelRefusal(v, op)
    if (refusal) return refusal
  }

  const after = applyOp(v, op)

  // Geometry: always, in both modes. Keyed by the span each problem
  // describes (kind + floor/x/w of the rooms involved), not by room id:
  // ids churn under merge, so an id-keyed comparison can mistake
  // a newly-corrupted room for a pre-existing one with the same id.
  const geometryBefore = new Set(geometryProblems(v).map((p) => spanKey(v, p)))
  for (const problem of geometryProblems(after)) {
    if (geometryBefore.has(spanKey(after, problem))) continue
    return refuse(refusalText(op, after, problem), survivingBlame(v, problem.rooms, op))
  }

  if (mode === 'free') return { ok: true }

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
