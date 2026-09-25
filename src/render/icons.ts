export const GLYPH_PATHS: Record<string, string> = {
  vault_door: 'M4 20V6a8 8 0 0116 0v14M12 8a4 4 0 110 8 4 4 0 110-8M12 4v4M12 16v4M8 12H4M20 12h-4',
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
