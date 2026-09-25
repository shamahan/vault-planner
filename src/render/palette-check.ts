/**
 * Pure colour maths used to hold the palette to a measured bar instead of
 * to taste. No DOM, no dependency -- just hex strings in, numbers out.
 */

type RGB = { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

/** WCAG relative luminance of one sRGB channel, 0-255. */
function channelLuminance(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of a colour, 0 (black) to 1 (white). */
function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/**
 * WCAG contrast ratio between two hex colours, 1:1 (identical) to 21:1
 * (black on white). Order of the two colours does not matter.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** sRGB channel (0-255) to linear-light, for CIEXYZ conversion. */
function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function rgbToXyz({ r, g, b }: RGB): { x: number; y: number; z: number } {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  // sRGB -> CIEXYZ, D65 white point.
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    z: rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  }
}

// D65 reference white, CIEXYZ.
const WHITE = { x: 0.95047, y: 1.0, z: 1.08883 }

function xyzToLab({ x, y, z }: { x: number; y: number; z: number }): {
  l: number
  a: number
  b: number
} {
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 / 116) * t + 16 / 116)
  const fx = f(x / WHITE.x)
  const fy = f(y / WHITE.y)
  const fz = f(z / WHITE.z)
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function hexToLab(hex: string): { l: number; a: number; b: number } {
  return xyzToLab(rgbToXyz(hexToRgb(hex)))
}

/**
 * CIE76 Delta-E: Euclidean distance between two colours in CIELAB. Rough
 * but adequate for "are these two chips distinguishable at a glance" --
 * 0 is identical, and differences above roughly 20-25 read as clearly
 * different colours rather than shades of the same one.
 */
export function colorDistance(a: string, b: string): number {
  const la = hexToLab(a)
  const lb = hexToLab(b)
  return Math.sqrt((la.l - lb.l) ** 2 + (la.a - lb.a) ** 2 + (la.b - lb.b) ** 2)
}
