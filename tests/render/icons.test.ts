import { describe, it, expect } from 'vitest'
import { GLYPH_PATHS, roomGlyph, uiIcon, UI_PATHS, type UiIcon } from '../../src/render/icons'
import { kindOf } from '../../src/domain/catalog'
import { GROUP_COLORS } from '../../src/render/theme'

describe('icons', () => {
  it('draws a room glyph in its group colour, hidden from assistive tech', () => {
    const svg = roomGlyph(kindOf('diner'), 20)
    expect(svg).toContain(`d="${GLYPH_PATHS.cutlery}"`)
    expect(svg).toContain(`stroke="${GROUP_COLORS.food}"`)
    expect(svg).toContain('aria-hidden="true"')
    expect(svg).toContain('width="20"')
  })

  it('draws interface icons in the colour of the text around them', () => {
    for (const name of Object.keys(UI_PATHS) as UiIcon[]) {
      const svg = uiIcon(name)
      expect(svg).toContain(`d="${UI_PATHS[name]}"`)
      expect(svg).toContain('stroke="currentColor"')
      expect(svg).toContain('aria-hidden="true"')
    }
  })
})
