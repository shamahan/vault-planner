import type { RoomKind } from '../domain/catalog'
import { GROUP_COLORS } from './theme'

export const GLYPH_PATHS: Record<string, string> = {
  /**
   * The vault door is also the site's mark: an eight-tooth cog -- the door
   * in the game is one -- with V and P inside, the P's bowl hung off the V's
   * right arm. site/favicon.svg, and the copies of this glyph in
   * site/index.html and tools/og-image.html, draw this exact path, and
   * tests/site/landing.test.ts holds them to it. Change one, change all.
   */
  vault_door:
    'M10.3 3.47L10.6 1.59A10.5 10.5 0 0 1 13.4 1.59L13.7 3.47A8.7 8.7 0 0 1 16.83 4.77L18.37 3.65A10.5 10.5 0 0 1 20.35 5.63L19.23 7.17A8.7 8.7 0 0 1 20.53 10.3L22.41 10.6A10.5 10.5 0 0 1 22.41 13.4L20.53 13.7A8.7 8.7 0 0 1 19.23 16.83L20.35 18.37A10.5 10.5 0 0 1 18.37 20.35L16.83 19.23A8.7 8.7 0 0 1 13.7 20.53L13.4 22.41A10.5 10.5 0 0 1 10.6 22.41L10.3 20.53A8.7 8.7 0 0 1 7.17 19.23L5.63 20.35A10.5 10.5 0 0 1 3.65 18.37L4.77 16.83A8.7 8.7 0 0 1 3.47 13.7L1.59 13.4A10.5 10.5 0 0 1 1.59 10.6L3.47 10.3A8.7 8.7 0 0 1 4.77 7.17L3.65 5.63A10.5 10.5 0 0 1 5.63 3.65L7.17 4.77A8.7 8.7 0 0 1 10.3 3.47ZM7.28 8.25L10.28 15.75L13.28 8.25H14.68A2.1 2.1 0 0 1 14.68 12.45H11.6',
  elevator: 'M12 3v18M12 3l-4 5M12 3l4 5M12 21l-4-5M12 21l4-5',
  bolt: 'M13 2L5 14h6l-2 8 8-12h-6l2-8z',
  reactor: 'M12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 110-5M12 3a9 9 0 019 9M12 21a9 9 0 01-9-9M19.8 16.5A9 9 0 017.5 19.8M4.2 7.5A9 9 0 0116.5 4.2',
  crystal: 'M12 3l4 5-4 13-4-13 4-5zM8 8h8',
  cutlery: 'M6 3v7a2 2 0 004 0V3M8 12v9M16.5 3c-1.4 1.2-2 3-2 5 0 1.8.9 3 2 3s2-1.2 2-3c0-2-.6-3.8-2-5zM16.5 11v10',
  sprout: 'M12 21V9M12 9C9.5 9 6 7.5 6 4c3.5 0 6 2 6 5zM12 11c2.5 0 6-1.5 6-5-3.5 0-6 2-6 5z',
  bottle: 'M10 3h4v2.5l1.5 2V21h-7V7.5L10 5.5V3zM8.5 12h7',
  drop: 'M12 3c4.2 5.2 6 7.8 6 10.2A6 6 0 116 13.2C6 10.8 7.8 8.2 12 3z',
  drop_filtered: 'M12 3c4.2 5.2 6 7.8 6 10.2A6 6 0 116 13.2C6 10.8 7.8 8.2 12 3zM8.5 14h7M9.5 17h5',
  bed: 'M3 19v-8M3 15h18v4M21 19v-4M6.5 12.5a2 2 0 104 0 2 2 0 10-4 0M11.5 12.5H21',
  crate: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
  cross: 'M10 3h4v6h6v4h-6v6h-4v-6H4V9h6V3z',
  flask: 'M9.5 3v6.5L4.5 18a2 2 0 001.8 3h11.4a2 2 0 001.8-3l-5-8.5V3M8 3h8M7.5 14h9',
  barbell: 'M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12',
  runner: 'M13.5 4a1.6 1.6 0 110 .01M11 21l1.6-5.6L9 13l1-5 3.5 2 3 1M6 9.5l3-1M14.6 15l3 2 .9 4',
  shield: 'M12 3l7.5 3v6c0 4.3-3.2 7.6-7.5 9.5C7.7 19.6 4.5 16.3 4.5 12V6L12 3z',
  book: 'M4 5a2 2 0 012-2h5v17H6a2 2 0 00-2 2V5zM20 5a2 2 0 00-2-2h-5v17h5a2 2 0 012 2V5z',
  pulse: 'M3 12.5h3.5L9 7.5l3.5 9 2.5-4h6',
  cup: 'M5 8h11v6.5A4.5 4.5 0 0111.5 19h-2A4.5 4.5 0 015 14.5V8zM16 9.5h1.8a2.2 2.2 0 010 4.4H16M4 21h14',
  die: 'M4 4h16v16H4V4zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01',
  hammer: 'M14.5 3.5l6 6-2.5 2.5-6-6 2.5-2.5zM11 8L4 15v5h5l7-7',
  hammer_spark: 'M14.5 3.5l6 6-2.5 2.5-6-6 2.5-2.5zM11 8L4 15v5h5l7-7M4 4l2.5 2.5',
  jumpsuit: 'M9 3l3 2 3-2 5 3-2 4-2-1v12H8V9L6 10 4 6l5-3z',
  palette: 'M12 3a9 9 0 000 18c1.5 0 2-1 1.5-2-.6-1.2.3-2 1.5-2h1.5A4.5 4.5 0 0021 12.5C21 7.3 16.9 3 12 3zM7.5 10.5h.01M11 7.5h.01M15 8.5h.01',
  desk: 'M4 18h16M6 18v-7h12v7M9 11V7h6v4M12 13v2',
  broadcast: 'M12 10a2 2 0 110 4 2 2 0 110-4M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.5 5.5a9 9 0 000 13M18.5 5.5a9 9 0 010 13',
  scissors: 'M7 4l10 14M17 4L7 18M6.5 18.5a2 2 0 110 .01M17.5 18.5a2 2 0 110 .01',
}

export function glyphDefs(): string {
  const symbols = Object.entries(GLYPH_PATHS).map(
    ([id, d]) =>
      `<symbol id="glyph-${id}" viewBox="0 0 24 24">` +
      `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" ` +
      `stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
  )
  return `<defs>${symbols.join('')}</defs>`
}

/** A room's glyph as a standalone svg, stroked in its group colour. */
export function roomGlyph(kind: RoomKind, size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${GLYPH_PATHS[kind.glyph] ?? ''}" fill="none" stroke="${GROUP_COLORS[kind.group]}" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}

/**
 * The interface's own icons, on the same 24-unit grid as the room glyphs
 * but drawn in currentColor, so each takes the colour of the text or button
 * it sits in.
 */
export const UI_PATHS = {
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  info: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 11v5M12 8h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
} as const

export type UiIcon = keyof typeof UI_PATHS

/** Decoration only: the button or text beside it carries the meaning. */
export function uiIcon(name: UiIcon, size = 16): string {
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    `<path d="${UI_PATHS[name]}" fill="none" stroke="currentColor" stroke-width="1.75" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}
