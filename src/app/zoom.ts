/** The zooms the + and − buttons step through. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/**
 * The most Fit will enlarge the grid. Past this a wide window buys bigger
 * rooms and fewer floors on screen, which is a worse trade for planning
 * than white space either side.
 */
export const FIT_MAX = 1.25

/**
 * The scale that lays the whole grid, `natural` px wide at 100%, across
 * `available` px -- never past FIT_MAX, never under the smallest step.
 * With nothing laid out yet (either width not above zero) there is nothing
 * to fit to, and 100% is the honest answer.
 */
export function fitScale(available: number, natural: number): number {
  if (!(available > 0) || !(natural > 0)) return 1
  return Math.max(ZOOM_STEPS[0], Math.min(FIT_MAX, available / natural))
}

/**
 * The next step above (`dir` 1) or below (-1) `scale`, which need not be a
 * step itself -- Fit rarely lands on one -- or `scale` again at either end.
 */
export function stepZoom(scale: number, dir: 1 | -1): number {
  const next = dir > 0
    ? ZOOM_STEPS.find((s) => s > scale + 1e-6)
    : [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6)
  return next ?? scale
}
