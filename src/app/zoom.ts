/** The zooms the + and − buttons step through. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/**
 * The zoom the grid starts at, and goes back to on reset: 100%, or less
 * when 100% would not fit the grid, `natural` px wide at 100%, across
 * `available` px -- a phone, a narrow window -- but never under the
 * smallest step. It never enlarges the grid by itself: filling a wide
 * window would leave only a few floors on screen, and leave the grid
 * looking arbitrarily sized. With nothing laid out yet (either width not
 * above zero) there is nothing to fit, and 100% is the honest answer.
 */
export function defaultScale(available: number, natural: number): number {
  if (!(available > 0) || !(natural > 0)) return 1
  return Math.max(ZOOM_STEPS[0], Math.min(1, available / natural))
}

/**
 * The next step above (`dir` 1) or below (-1) `scale`, which need not be a
 * step itself -- a narrowed start rarely lands on one -- or `scale` again
 * at either end.
 */
export function stepZoom(scale: number, dir: 1 | -1): number {
  const next = dir > 0
    ? ZOOM_STEPS.find((s) => s > scale + 1e-6)
    : [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6)
  return next ?? scale
}
