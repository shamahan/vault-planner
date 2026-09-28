import { describe, it, expect } from 'vitest'
import { defaultScale, stepZoom } from '../../src/app/zoom'

describe('zoom', () => {
  it('starts at 100%, and smaller only when 100% would not fit across', () => {
    expect(defaultScale(1000, 634)).toBe(1)
    expect(defaultScale(634, 634)).toBe(1)
    expect(defaultScale(500, 634)).toBeCloseTo(500 / 634)
  })

  it('never starts below the smallest step, and treats no layout at all as 100%', () => {
    expect(defaultScale(100, 634)).toBe(0.5)
    expect(defaultScale(0, 634)).toBe(1)
    expect(defaultScale(800, 0)).toBe(1)
  })

  it('steps to the next zoom up or down, and stops at either end', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    // From a narrowed start between two steps, to the step on either side.
    expect(stepZoom(0.87, 1)).toBe(1)
    expect(stepZoom(0.87, -1)).toBe(0.75)
    expect(stepZoom(2, 1)).toBe(2)
    expect(stepZoom(0.5, -1)).toBe(0.5)
  })
})
