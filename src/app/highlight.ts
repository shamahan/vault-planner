import { CELLS_PER_FLOOR, FLOOR_COUNT } from '../domain/grid'
import { canApply, type Mode } from '../domain/validate'
import type { Op, Vault } from '../domain/vault'

/** A footprint a room could take: its floor, left edge and width. */
export type Spot = { floor: number; x: number; w: number }

/**
 * Where a room could go, in two tiers. `connected`: the spots that keep a
 * route to the vault door -- what Strict rules accept, whichever rules are
 * on, since that is what makes a spot worth building on. `freeOnly`: the
 * spots where the room merely fits, which only Free rules accept; always
 * empty under Strict rules.
 */
export type Highlight = { connected: Spot[]; freeOnly: Spot[] }

/**
 * Tries `opAt(floor, x)` at every left edge of every floor. Strict rules
 * are Free rules plus the route to the door, so under Free rules a spot
 * Free refuses is never tried against Strict, and under Strict rules one
 * call per spot is all it takes.
 */
export function highlightFor(v: Vault, mode: Mode, w: number, opAt: (floor: number, x: number) => Op): Highlight {
  const connected: Spot[] = []
  const freeOnly: Spot[] = []
  for (let floor = 0; floor < FLOOR_COUNT; floor++) {
    for (let x = 0; x < CELLS_PER_FLOOR; x++) {
      const op = opAt(floor, x)
      if (mode === 'strict') {
        if (canApply(v, op, 'strict').ok) connected.push({ floor, x, w })
        continue
      }
      if (!canApply(v, op, 'free').ok) continue
      if (canApply(v, op, 'strict').ok) connected.push({ floor, x, w })
      else freeOnly.push({ floor, x, w })
    }
  }
  return { connected, freeOnly }
}
