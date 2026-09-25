import { describe, it, expect } from 'vitest'
import { applyOp, createVault, roomsOnFloor, type Op, type Vault } from '../../src/domain/vault'
import { canApply, validate, type Mode } from '../../src/domain/validate'
import { unreachableRooms } from '../../src/domain/reachability'
import { placeableKinds } from '../../src/domain/catalog'
import { CELLS_PER_FLOOR, isFloor, overlaps, spanEnd, withinFloor } from '../../src/domain/grid'

/** Tiny deterministic PRNG so a failure is reproducible from its seed. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * Positions likely to touch something that already exists: just past the
 * right edge of a room, just before its left edge, or straight down a
 * floor from it. Drawing x uniformly over the whole floor almost never
 * lands next to anything, so a generator built that way can't exercise the
 * rules it's meant to be stress-testing.
 */
function candidatePositions(v: Vault, width: number): { floor: number; x: number }[] {
  const out: { floor: number; x: number }[] = []
  for (const r of v.rooms) {
    out.push({ floor: r.floor, x: spanEnd(r) })
    if (r.x - width >= 0) out.push({ floor: r.floor, x: r.x - width })
    out.push({ floor: r.floor + 1, x: r.x })
  }
  return out
}

function fits(v: Vault, floor: number, x: number, width: number): boolean {
  const span = { x, w: width }
  if (!isFloor(floor) || !withinFloor(span)) return false
  return !roomsOnFloor(v, floor).some((r) => overlaps(span, r))
}

function randomOp(v: Vault, rand: () => number): Op {
  const kinds = placeableKinds()
  const rooms = v.rooms.filter((r) => r.id !== 'door')
  const roll = rand()

  // Destructive ops only once there is enough standing to make them
  // interesting; otherwise every run degenerates into a near-empty vault.
  const destructive = rooms.length > 8 && roll >= 0.6

  if (!destructive) {
    const elevator = kinds.find((k) => k.id === 'elevator')
    // Bias toward elevators: floor 0 fills up fast, and without an
    // elevator to dig down with, nothing below it is ever reachable again.
    const kind = elevator && rand() < 0.3 ? elevator : kinds[Math.floor(rand() * kinds.length)]!
    const width = kind.baseWidth
    const candidates = candidatePositions(v, width).filter((c) => fits(v, c.floor, c.x, width))
    let floor: number
    let x: number
    if (candidates.length > 0 && rand() < 0.85) {
      const c = candidates[Math.floor(rand() * candidates.length)]!
      floor = c.floor
      x = c.x
    } else {
      floor = Math.floor(rand() * 6)
      x = Math.floor(rand() * CELLS_PER_FLOOR)
    }
    return { kind: 'place', type: kind.id, floor, x }
  }

  const victim = rooms[Math.floor(rand() * rooms.length)]!
  const destroyRoll = rand()
  if (destroyRoll < 0.5) return { kind: 'remove', id: victim.id }
  if (destroyRoll < 0.75) return { kind: 'split', id: victim.id }
  return {
    kind: 'move',
    id: victim.id,
    floor: Math.floor(rand() * 6),
    x: Math.floor(rand() * CELLS_PER_FLOOR),
  }
}

function run(mode: Mode, seed: number, steps = 200): { v: Vault; accepted: number } {
  const rand = rng(seed)
  let v = createVault()
  let accepted = 0
  for (let i = 0; i < steps; i++) {
    const op = randomOp(v, rand)
    if (canApply(v, op, mode).ok) {
      v = applyOp(v, op)
      accepted++
    }
  }
  return { v, accepted }
}

// Measured against the generator above across seeds 1-25, 200 steps each
// (see task-6-report.md for the full table): strict mode's worst seed still
// reaches 22 rooms and 35 accepted ops; free mode's worst seed reaches 57
// rooms and 162 accepted ops. These floors sit comfortably under both, so
// they hold today and exist to catch a future change that quietly makes
// the generator stop doing real work (e.g. reverting to uniform x) rather
// than to encode today's exact numbers.
const MIN_ROOMS = 15
const MIN_ACCEPTED = 25

describe('invariants over random sequences', () => {
  it('keeps a strict-mode vault connected, whatever the sequence', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { v, accepted } = run('strict', seed)
      expect({ seed, stranded: unreachableRooms(v) }).toEqual({ seed, stranded: [] })
      expect(v.rooms.length, `seed ${seed}: only ${v.rooms.length} rooms`).toBeGreaterThan(MIN_ROOMS)
      expect(accepted, `seed ${seed}: only ${accepted} ops accepted`).toBeGreaterThan(MIN_ACCEPTED)
    }
  })

  it('keeps geometry sound in free mode, whatever the sequence', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { v, accepted } = run('free', seed)
      const geometry = validate(v).filter((p) => p.kind !== 'unreachable')
      expect({ seed, geometry }).toEqual({ seed, geometry: [] })
      expect(v.rooms.length, `seed ${seed}: only ${v.rooms.length} rooms`).toBeGreaterThan(MIN_ROOMS)
      expect(accepted, `seed ${seed}: only ${accepted} ops accepted`).toBeGreaterThan(MIN_ACCEPTED)
    }
  })

  it('never lets a strict action grow the stranded set, even on a broken vault', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let { v } = run('free', seed, 60)
      const rand = rng(seed + 9000)
      for (let i = 0; i < 60; i++) {
        const before = new Set(unreachableRooms(v))
        const op = randomOp(v, rand)
        if (!canApply(v, op, 'strict').ok) continue
        // A split mints a fresh id for every piece past the first (see
        // domain/vault.ts's splitRoom), so splitting a room that was already
        // stranded produces ids this loop has never seen before -- correctly
        // stranded, since a split cannot change reachability, but absent
        // from `before` by construction. Skip the id-churn check for that
        // one case rather than the whole test; a split of a room that was
        // NOT already stranded still has to leave every id, old or new,
        // reachable, so the assertion below still guards that half.
        const splittingAlreadyStranded = op.kind === 'split' && before.has(op.id)
        v = applyOp(v, op)
        if (splittingAlreadyStranded) continue
        for (const id of unreachableRooms(v)) {
          expect(before.has(id), `seed ${seed}, step ${i}: "${id}" is newly stranded`).toBe(true)
        }
      }
    }
  })
})
