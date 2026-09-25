/**
 * The one escaper for text interpolated into HTML or SVG markup built as
 * strings. Covers all five characters that matter in both attribute and text
 * position, so nothing importing it has to reason about which subset is safe
 * for its particular slot.
 */
export function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
