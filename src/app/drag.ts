import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR } from '../domain/grid'
import { canApply, type Mode, type Verdict } from '../domain/validate'
import { findRoom, roomsOnFloor, swapLanding, type Op, type Room, type RoomId, type Vault } from '../domain/vault'

/** The room taken hold of, and how many cells right of its left edge the pointer took it. */
export type DragStart = { id: RoomId; grabOffset: number }

/** A footprint to draw: where a room would stand if the drop happened now. */
export type Ghost = { floor: number; x: number; w: number }

/**
 * What letting go would do. `cancel`: the pointer is off the grid, and the
 * drag is abandoned. `stay`: the room would land where it already stands,
 * so there is nothing to commit. `run`: an op canApply accepts. `refuse`:
 * one it does not, with its reason. `swapGhost` is where the room under
 * the pointer would go, when there is one that can go anywhere.
 */
export type DropPlan =
  | { kind: 'cancel' }
  | { kind: 'stay'; ghost: Ghost }
  | { kind: 'run'; op: Op; ghost: Ghost; swapGhost?: Ghost }
  | { kind: 'refuse'; verdict: Extract<Verdict, { ok: false }>; ghost: Ghost; swapGhost?: Ghost }

type Cell = { floor: number; x: number }

/** The value in `xs` (ascending) nearest `target`, the smaller on a tie; null for none. */
export function nearest(xs: number[], target: number): number | null {
  let best: number | null = null
  for (const x of xs) {
    if (best === null || Math.abs(x - target) < Math.abs(best - target)) best = x
  }
  return best
}

/**
 * Holds a left edge where a room of width `w` stays on the floor -- the
 * same clamp as interactions.ts's clampToFloor, restated because that
 * module imports this one.
 */
function keepOnFloor(x: number, w: number): number {
  return Math.max(0, Math.min(CELLS_PER_FLOOR - w, x))
}

/**
 * The run of free cells on `floor` around `cell`, counting the dragged
 * room's own cells as free -- it is about to leave them. `cell` must not be
 * inside any other room: the resolver has already made that case a swap.
 */
function freeRunAround(vault: Vault, floor: number, cell: number, dragged: RoomId): { x: number; w: number } {
  let left = 0
  let right = CELLS_PER_FLOOR
  for (const r of roomsOnFloor(vault, floor)) {
    if (r.id === dragged) continue
    if (r.x + r.w <= cell) left = Math.max(left, r.x + r.w)
    else if (r.x > cell) right = Math.min(right, r.x)
  }
  return { x: left, w: right - left }
}

/**
 * Builds the function a drag asks, every frame, "what would letting go
 * here do?" The same answer draws the ghosts and runs on release, so the
 * two can never disagree.
 *
 * One rule places the room for a move and a swap alike: of the left edges
 * geometrically on offer, keep those canApply accepts, and take the one
 * nearest where the pointer holds the room -- its cell less the grab
 * offset. On free cells the edges on offer are those that keep the room
 * inside the free run under the pointer; over another room, those at which
 * the dragged room covers it whole. With none accepted, the room is drawn
 * where the pointer holds it and the refusal says why.
 *
 * Accepted edges are worked out once per floor-and-run or per target and
 * kept for the rest of the drag: the vault cannot change while one is in
 * progress, so there is no key to invalidate.
 */
export function createDropResolver(vault: Vault, mode: Mode, drag: DragStart): (cell: Cell | null) => DropPlan {
  const room = findRoom(vault, drag.id)
  const accepted = new Map<string, number[]>()

  const acceptedAmong = (key: string, from: number, to: number, opAt: (x: number) => Op): number[] => {
    let xs = accepted.get(key)
    if (!xs) {
      xs = []
      for (let x = from; x <= to; x++) {
        if (canApply(vault, opAt(x), mode).ok) xs.push(x)
      }
      accepted.set(key, xs)
    }
    return xs
  }

  const judge = (op: Op, ghost: Ghost, swapGhost?: Ghost): DropPlan => {
    const verdict = canApply(vault, op, mode)
    return verdict.ok ? { kind: 'run', op, ghost, swapGhost } : { kind: 'refuse', verdict, ghost, swapGhost }
  }

  const planMove = (a: Room, cell: Cell, want: number): DropPlan => {
    const run = freeRunAround(vault, cell.floor, cell.x, a.id)
    const opAt = (x: number): Op => ({ kind: 'move', id: a.id, floor: cell.floor, x })
    const last = run.x + run.w - a.w
    const xs = acceptedAmong(`move:${cell.floor}:${run.x}`, run.x, last, opAt)
    // With nothing accepted, keep the ghost inside the free run when the room
    // fits there at all; clamping only to the floor can push it onto the
    // neighbour, and canApply would then blame the neighbour, not the real reason.
    const x = nearest(xs, want) ?? (last >= run.x ? Math.max(run.x, Math.min(last, want)) : keepOnFloor(want, a.w))
    const ghost = { floor: cell.floor, x, w: a.w }
    if (cell.floor === a.floor && x === a.x) return { kind: 'stay', ghost }
    return judge(opAt(x), ghost)
  }

  const planSwap = (a: Room, b: Room, want: number): DropPlan => {
    // Every left edge at which A covers the whole of B and stays on the floor.
    const from = Math.max(0, b.x + b.w - a.w)
    const to = Math.min(CELLS_PER_FLOOR - a.w, b.x)
    const onOffer = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
    const opAt = (x: number): Op => ({ kind: 'swap', id: a.id, with: b.id, x })
    const xs = acceptedAmong(`swap:${b.id}`, from, to, opAt)
    // Same rule as planMove's fallback: with nothing accepted, stay within
    // the geometric range (A covering B) when there is one, rather than
    // clamping straight to the floor and landing on some other neighbour.
    const x = nearest(xs, want) ?? nearest(onOffer, want) ?? keepOnFloor(want, a.w)
    const ghost = { floor: b.floor, x, w: a.w }
    // Draw where B would go only if B can go anywhere: never the vault
    // door, and never a room too wide for the span A leaves.
    const swapGhost = kindOf(b.type).placeable && b.w <= a.w
      ? { floor: a.floor, x: swapLanding(a, b, x), w: b.w }
      : undefined
    if (a.type === b.type && a.w === b.w) {
      // Two rooms alike in type and width trade places with nothing anyone
      // could see, but store.run would still commit it -- an unchanged
      // vault pushed onto the undo stack, redo cleared. Refused here, before
      // the store, as canApply does for a room asked for the level it
      // already has.
      return {
        kind: 'refuse',
        verdict: {
          ok: false,
          reason: 'These two rooms are the same; swapping them would change nothing.',
          blame: [a.id, b.id],
        },
        ghost,
        swapGhost,
      }
    }
    return judge(opAt(x), ghost, swapGhost)
  }

  return (cell) => {
    if (!room || !cell) return { kind: 'cancel' }
    const want = cell.x - drag.grabOffset
    // Looked up in the vault, not the DOM: while the canvas holds pointer
    // capture every pointer event targets the canvas itself.
    const target = roomsOnFloor(vault, cell.floor)
      .find((r) => r.id !== room.id && r.x <= cell.x && cell.x < r.x + r.w)
    return target ? planSwap(room, target, want) : planMove(room, cell, want)
  }
}
