import { describe, it, expect } from 'vitest'
import { COLORS, GROUP_COLORS } from '../../src/render/theme'
import { contrastRatio, colorDistance } from '../../src/render/palette-check'

/**
 * The floor group colours double as text colour (see theme.ts): a room
 * draws its glyph and label in its group colour over a tint of the same
 * colour. That makes WCAG's text contrast bar the right bar to hold them
 * to, and makes "can I tell training from misc apart" a measurable
 * question instead of a matter of taste.
 *
 * Both floors are measured against the real palette below, not picked to
 * make it pass: MIN_CONTRAST is the WCAG AA bar for text (4.5:1), and
 * MIN_DISTANCE is the tightest pairwise CIE76 distance this palette
 * actually holds (see palette-report.md for the full pairwise table).
 */
const MIN_CONTRAST = 4.5
const MIN_DISTANCE = 25

describe('GROUP_COLORS palette', () => {
  const groups = Object.entries(GROUP_COLORS) as [string, string][]

  it.each(groups)('%s reaches the %s:1 text-contrast floor against the background', (group, hex) => {
    const ratio = contrastRatio(COLORS.background, hex)
    expect(ratio, `${group} (${hex}) contrast against background is only ${ratio.toFixed(2)}:1`)
      .toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  const pairs: [string, string, string, string][] = []
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const [groupA, hexA] = groups[i]!
      const [groupB, hexB] = groups[j]!
      pairs.push([groupA, hexA, groupB, hexB])
    }
  }

  it.each(pairs)('%s and %s stay at least the distance floor apart', (groupA, hexA, groupB, hexB) => {
    const distance = colorDistance(hexA, hexB)
    expect(
      distance,
      `${groupA} (${hexA}) and ${groupB} (${hexB}) are only ${distance.toFixed(2)} apart, below the ${MIN_DISTANCE} floor`,
    ).toBeGreaterThanOrEqual(MIN_DISTANCE)
  })

  it('makes the elevator/vault-door group the brightest colour on the grid', () => {
    const infraContrast = contrastRatio(COLORS.background, GROUP_COLORS.infra)
    for (const [group, hex] of groups) {
      if (group === 'infra') continue
      const ratio = contrastRatio(COLORS.background, hex)
      expect(infraContrast, `infra (${GROUP_COLORS.infra}) should out-contrast ${group} (${hex})`)
        .toBeGreaterThan(ratio)
    }
  })
})
