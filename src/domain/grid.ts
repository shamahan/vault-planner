/** A floor is eight rooms of three cells plus two elevators of one. */
export const CELLS_PER_FLOOR = 26

/** Floor 0 is the top floor, the one with the vault door. */
export const FLOOR_COUNT = 25

export type Span = { x: number; w: number }

export function spanEnd(s: Span): number {
  return s.x + s.w
}

export function overlaps(a: Span, b: Span): boolean {
  return a.x < spanEnd(b) && b.x < spanEnd(a)
}

export function touches(a: Span, b: Span): boolean {
  return spanEnd(a) === b.x || spanEnd(b) === a.x
}

export function withinFloor(s: Span): boolean {
  return s.w > 0 && s.x >= 0 && spanEnd(s) <= CELLS_PER_FLOOR
}

export function isFloor(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < FLOOR_COUNT
}

/** The model counts depth from 0; people count floors from 1. Display only. */
export function floorLabel(floor: number): string {
  return String(floor + 1)
}
