import type { RoomGroup } from '../domain/catalog'

export const CELL_PX = 22
export const FLOOR_PX = 56
export const FLOOR_GAP_PX = 4

/**
 * Left/top page padding and the row-label gutter, in pixels. A later task
 * (mouse position -> grid cell) needs exactly these two offsets to invert
 * the same transform this file's consumers use to draw. Defined once here
 * so that task imports them instead of restating the numbers.
 */
export const SCENE_PAD_PX = 28
export const SCENE_GUTTER_PX = 34

export const COLORS = {
  background: '#0e1412',
  floor: '#0f1613',
  line: '#202b26',
  /**
   * The boundaries between cells on a floor: a step above the floor, well
   * below its outline, so the 26 cells read as slots without the grid
   * turning into a mesh.
   */
  cell: '#18221e',
  text: '#dce5e0',
  dim: '#7e8e87',
  faint: '#5d6c66',
  problem: '#6c7b75',
  // Same hex as GROUP_COLORS.power, by coincidence -- shared by the selected-
  // room outline and the candidate wash. Harmless: a power room still has
  // its own stroke, icon, rounded corners and label, so it is never mistaken
  // for a plain amber selection/candidate wash. Keep this in mind before
  // "fixing" the duplicate by picking a different accent -- that would be
  // free to reintroduce the very ambiguity this coincidence happens to avoid.
  selection: '#e3a63c',
  /**
   * The value `.problems .ok` in style.css already uses for "no problems,
   * every room has a route to the door" -- the one place the palette
   * already draws the distinction between sound and not. The hover ghost
   * (see scene.ts's ghost slot) borrows it for a placement `canApply` would
   * accept, so accepted/refused reuses colours the app already speaks
   * rather than inventing a new pair.
   */
  accepted: '#9faea7',
} as const

/**
 * Every value here is held to a measured bar, not to taste -- see
 * palette-check.ts and palette.test.ts. Each colour reaches at least 4.5:1
 * contrast against COLORS.background (the WCAG AA text bar: a room draws
 * its glyph and label in this colour, so it *is* text), and every pair is
 * at least 25 apart by CIE76 ΔE, so no two groups read as the same smear
 * of grey-blue at a glance. `infra` is additionally the single highest-
 * contrast colour of the eleven: it covers both the elevator and the vault
 * door, and in the game the elevator shaft is the brightest, warmest thing
 * in the room -- that is the quality this palette reproduces.
 *
 * `season` was added later (seasonal/crossover rooms, see catalog.ts) and
 * re-solved the whole palette against the same two floors rather than just
 * appending a colour: `food`, `storage` and `infra` moved a little to make
 * room, `living` and `crafting` moved a hair, and `power`, `water`,
 * `medical`, `training` and `misc` are untouched. Tightest pair is now
 * `storage`/`infra` at 28.09 ΔE -- see season-group-report.md for the full
 * pairwise table.
 */
export const GROUP_COLORS: Record<RoomGroup, string> = {
  power: '#e3a63c',
  food: '#d7603a',
  water: '#60b2cb',
  living: '#4ab971',
  medical: '#b47bda',
  training: '#7b8ed4',
  storage: '#b67c47',
  crafting: '#d27491',
  misc: '#8fa47c',
  infra: '#fdc990',
  season: '#16b29e',
}

/** System stack only: an exported PNG renders the SVG with no access to web fonts. */
export const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
