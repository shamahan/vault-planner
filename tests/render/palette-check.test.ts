import { describe, it, expect } from 'vitest'
import { contrastRatio, colorDistance } from '../../src/render/palette-check'

describe('contrastRatio', () => {
  it('gives black and white the maximum ratio, 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('gives a colour against itself the minimum ratio, 1:1', () => {
    expect(contrastRatio('#e3a63c', '#e3a63c')).toBeCloseTo(1, 5)
  })

  it('does not care about argument order', () => {
    expect(contrastRatio('#0e1412', '#e3a63c')).toBeCloseTo(contrastRatio('#e3a63c', '#0e1412'), 10)
  })

  it('matches a hand-computed pair: mid-grey against black is about 5.28:1', () => {
    // Relative luminance of #808080 is ((0x80/255)^~2.2-ish via the WCAG
    // piecewise curve) = 0.21586; against black (luminance 0) that gives
    // (0.21586 + 0.05) / (0 + 0.05) = 5.317.
    expect(contrastRatio('#808080', '#000000')).toBeCloseTo(5.317, 2)
  })
})

describe('colorDistance', () => {
  it('gives a colour against itself zero distance', () => {
    expect(colorDistance('#123456', '#123456')).toBe(0)
  })

  it('is symmetric', () => {
    expect(colorDistance('#e3a63c', '#4fa0c9')).toBeCloseTo(colorDistance('#4fa0c9', '#e3a63c'), 10)
  })

  it('matches a hand-computed pair: pure red against pure green is about 170.6 dE', () => {
    // Lab(#ff0000) is about (53.24, 80.09, 67.20); Lab(#00ff00) is about
    // (87.73, -86.18, 83.18). The Euclidean distance between them is
    // sqrt(34.49^2 + 166.27^2 + 15.98^2) = 170.56.
    expect(colorDistance('#ff0000', '#00ff00')).toBeCloseTo(170.56, 1)
  })

  it('gives black and white a large distance, about 100 dE', () => {
    expect(colorDistance('#000000', '#ffffff')).toBeCloseTo(100, 0)
  })

  it('matches a hand-computed pair on the linear (non-cube-root) branch: the app background against its own line colour is about 11.2 dE', () => {
    // Both #0e1412 and #202b26 are dark enough that at least one of them
    // exercises the CIE linear branch f(t) = (kappa*t + 16) / 116 with a
    // nonzero t, unlike the black/white and red/green pairs above (black
    // gives t = 0, which zeroes the branch regardless of its coefficient;
    // red and green never dip below the epsilon threshold at all).
    //
    // #0e1412 (14, 20, 18) linearises to (0.004392, 0.006994, 0.006049),
    // giving XYZ (0.005404, 0.006373, 0.006667) and, against the D65 white
    // point, normalised components (0.005686, 0.006373, 0.006123) -- all
    // three below epsilon = 216/24389 = 0.008856, so all three channels of
    // f take the linear branch. With the corrected coefficient
    // kappa/116 = (24389/27)/116 = 7.787037, f gives (0.182199, 0.187556,
    // 0.185608), so Lab(#0e1412) is about (5.76, -2.68, 0.39).
    //
    // #202b26 (32, 43, 38) linearises to (0.014443, 0.024159, 0.019384),
    // giving XYZ (0.018093, 0.021748, 0.021579) and normalised components
    // (0.019036, 0.021748, 0.019819) -- all three above epsilon, so this
    // colour takes the ordinary cube-root branch: Lab(#202b26) is about
    // (16.38, -6.06, 1.70).
    //
    // Distance: sqrt((5.76-16.38)^2 + (-2.68-(-6.06))^2 + (0.39-1.70)^2)
    // = sqrt((-10.62)^2 + 3.38^2 + (-1.31)^2) = sqrt(112.84 + 11.43 + 1.72)
    // = sqrt(125.99) = 11.22.
    expect(colorDistance('#0e1412', '#202b26')).toBeCloseTo(11.2, 1)
  })
})
