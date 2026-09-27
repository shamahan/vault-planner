import { kindOf } from '../domain/catalog'
import { CELLS_PER_FLOOR, FLOOR_COUNT, floorLabel } from '../domain/grid'
import type { Problem } from '../domain/validate'
import { levelOf, type Room, type RoomId, type Vault } from '../domain/vault'
import { escapeText } from '../shared/escape'
import { glyphDefs } from './icons'
import {
  CELL_PX,
  COLORS,
  FLOOR_GAP_PX,
  FLOOR_PX,
  FONT_STACK,
  GROUP_COLORS,
  SCENE_GUTTER_PX,
  SCENE_PAD_PX,
  tint,
} from './theme'

export type SceneOptions = {
  problems?: Problem[]
  selection?: RoomId | null
  /**
   * A heading above the grid. Nothing in the app passes one today: the
   * export used to head the picture with the vault's name, and with the
   * name no longer settable that only ever published a default. Kept
   * because heading a scene is a thing this renderer can do, and the next
   * caller that wants one should not have to rebuild the band and its
   * height arithmetic; it is covered by its own tests.
   */
  title?: string
  legend?: boolean
  /**
   * Every position where the currently-armed room type could legally be
   * placed. Adjacent positions overlap heavily -- one per legal starting
   * cell -- so this is merged per floor (see mergeRuns) into runs of
   * contiguous territory before it is drawn, rather than one mark per
   * position. Purely a display hint -- omit it (rather than passing an
   * empty array) when no tool is armed. A PNG or SVG export never asks for
   * this, so an exported picture never has it in it.
   */
  candidates?: Array<{ floor: number; x: number; w: number }>
  /**
   * Under Free rules, the spots where the armed or carried room merely
   * fits: accepted by Free rules, but with no route to the vault door, so
   * Strict would refuse them. Drawn dimmer than `candidates` (which, under
   * either rules, are the spots that do keep a route) and never over them.
   * Omit it, like `candidates`, when there is nothing to show.
   */
  freeOnly?: Array<{ floor: number; x: number; w: number }>
}

const PAD = SCENE_PAD_PX
const GUTTER = SCENE_GUTTER_PX
const LEGEND_ROW = 22
const TITLE_H = 58

function floorsShown(): number[] {
  // Every floor is drawn, always -- not just the ones a room happens to
  // occupy. Otherwise a fresh vault (or any vault whose deepest room is
  // near the top) shows almost nothing of the 25 floors there are to build
  // on, which is no way to aim a placement. FLOOR_COUNT is the one and only
  // bound here, so this can never build an array longer than a vault
  // actually has floors.
  return Array.from({ length: FLOOR_COUNT }, (_, i) => i)
}

function roomGroup(room: Room, opts: SceneOptions, top: number): string {
  const kind = kindOf(room.type)
  const color = GROUP_COLORS[kind.group]
  const blamed = (opts.problems ?? []).some((p) => p.rooms.includes(room.id))
  const selected = opts.selection === room.id

  const x = GUTTER + room.x * CELL_PX
  const w = room.w * CELL_PX - 2
  const h = FLOOR_PX - 6
  const stroke = blamed ? COLORS.problem : color
  const attrs = [
    `data-room-id="${escapeText(room.id)}"`,
    // What the drag layer may pick up. The vault door never is: every
    // operation on it is refused (see validate.ts).
    kind.placeable ? 'data-movable="true"' : '',
    blamed ? 'data-problem="true"' : '',
    selected ? 'data-selected="true"' : '',
    `transform="translate(${x + 1} ${top + 3})"`,
    blamed ? 'opacity="0.6"' : '',
  ].filter(Boolean).join(' ')

  const level = levelOf(room)
  const title = kind.maxLevel > 1 ? `${kind.name}, level ${level}` : kind.name
  const body: string[] = [
    `<title>${escapeText(title)}</title>`,
    // The room's tint is translucent; the floor colour under it keeps the
    // cell boundaries drawn on the floor from showing through the room.
    `<rect width="${w}" height="${h}" rx="3" fill="${COLORS.floor}"/>`,
    `<rect width="${w}" height="${h}" rx="3" fill="${tint(stroke, 0.13)}" ` +
    `stroke="${stroke}" stroke-width="1"${blamed ? ' stroke-dasharray="3 3"' : ''}/>`,
  ]
  if (selected) {
    body.push(`<rect width="${w}" height="${h}" rx="3" fill="none" ` +
      `stroke="${COLORS.selection}" stroke-width="2"/>`)
  }
  // The level, as dots in the top-left corner: one per level the kind has,
  // filled up to the room's own. Top-left because the top-right corner is
  // the selected room's delete handle. The elevator has no levels and the
  // door is never changed, so neither carries any.
  if (kind.maxLevel > 1) {
    const dots: string[] = []
    for (let i = 0; i < kind.maxLevel; i++) {
      const fill = i < level ? stroke : tint(stroke, 0.28)
      dots.push(`<circle cx="${6 + i * 6}" cy="6" r="2" fill="${fill}"/>`)
    }
    body.push(`<g data-level="${level}">${dots.join('')}</g>`)
  }
  // Deleting a room was reachable only by pressing Delete, which is logical
  // and invisible -- there was nothing on screen to say it was possible. So
  // the selected room carries a handle for it in its top-right corner. Only
  // the selected room: one per floor at most, rather than 26 crosses to read
  // past. The vault door never gets one, because it cannot be deleted at all
  // (validate.ts refuses every operation on a room whose kind is not
  // placeable) and a control that always refuses is worse than no control.
  // The geometry is in the room's own coordinates -- the <g> around it is
  // already translated to the room's corner -- and fits the narrowest room
  // there is, a one-cell elevator at 20 units wide.
  if (selected && kind.placeable) {
    const cx = w - 10
    const cy = 10
    const arm = 3.2
    body.push(
      `<g data-delete-room="${escapeText(room.id)}" cursor="pointer">` +
      `<title>Delete this ${escapeText(kind.name.toLowerCase())}</title>` +
      `<circle cx="${cx}" cy="${cy}" r="7.5" fill="${COLORS.background}" ` +
      `stroke="${COLORS.selection}" stroke-width="1.5"/>` +
      `<path d="M${cx - arm} ${cy - arm}L${cx + arm} ${cy + arm}` +
      `M${cx + arm} ${cy - arm}L${cx - arm} ${cy + arm}" ` +
      `stroke="${COLORS.selection}" stroke-width="1.5" stroke-linecap="round"/>` +
      `</g>`,
    )
  }

  const iconSize = room.w === 1 ? 13 : 17
  const showLabel = room.w >= 3
  const iconY = showLabel ? h / 2 - iconSize / 2 - 6 : h / 2 - iconSize / 2
  body.push(
    `<use href="#glyph-${kind.glyph}" x="${w / 2 - iconSize / 2}" y="${iconY}" ` +
    `width="${iconSize}" height="${iconSize}" color="${stroke}"/>`,
  )
  if (showLabel) {
    body.push(
      `<text x="${w / 2}" y="${h / 2 + 14}" text-anchor="middle" font-size="9" ` +
      `fill="${stroke}" font-family="${FONT_STACK}">${escapeText(kind.name)}</text>`,
    )
  }

  return `<g ${attrs}>${body.join('')}</g>`
}

/**
 * Merges a floor's accepted footprints -- one span per legal starting cell,
 * so neighbouring positions overlap almost completely -- into the smallest
 * set of contiguous runs that cover the same cells. Piling N nearly-
 * identical boxes on screen reads as N empty rooms; one mark per run reads
 * as "you can land anywhere along here." Pure and exported so the merge can
 * be tested on its own, without going through a rendered scene.
 *
 * Spans need not arrive sorted or non-overlapping. Two spans merge when one
 * starts at or before the cell the other ends on -- touching counts as
 * contiguous, not just overlapping -- so `{x:0,w:3}` and `{x:3,w:2}` merge
 * into one run despite sharing no cell.
 */
export function mergeRuns(spans: Array<{ x: number; w: number }>): Array<{ x: number; w: number }> {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.x - b.x)
  const runs: Array<{ x: number; w: number }> = []
  let run = { x: sorted[0]!.x, w: sorted[0]!.w }
  for (const span of sorted.slice(1)) {
    const runEnd = run.x + run.w
    if (span.x > runEnd) {
      runs.push(run)
      run = { x: span.x, w: span.w }
    } else {
      run = { x: run.x, w: Math.max(runEnd, span.x + span.w) - run.x }
    }
  }
  runs.push(run)
  return runs
}

/**
 * `runs` with every cell that `cover` covers taken out -- what is left of
 * each run on either side of each cover. Pure and exported so it can be
 * tested on its own. The free-only tier is drawn through this against the
 * lit one, so a cell some connected footprint covers is lit and nothing
 * else, even where a free-only footprint also reaches it.
 */
export function subtractRuns(
  runs: Array<{ x: number; w: number }>,
  cover: Array<{ x: number; w: number }>,
): Array<{ x: number; w: number }> {
  const out: Array<{ x: number; w: number }> = []
  for (const run of runs) {
    let pieces = [run]
    for (const c of cover) {
      pieces = pieces.flatMap((p) => {
        const end = p.x + p.w
        const cEnd = c.x + c.w
        if (cEnd <= p.x || c.x >= end) return [p]
        const left = c.x > p.x ? [{ x: p.x, w: c.x - p.x }] : []
        const right = cEnd < end ? [{ x: cEnd, w: end - cEnd }] : []
        return [...left, ...right]
      })
    }
    out.push(...pieces)
  }
  return out.sort((a, b) => a.x - b.x)
}

/**
 * A merged run of legal territory for the armed room type -- illuminated
 * ground, not an outlined box. Candidates used to be drawn as room-sized
 * dashed rectangles, which is the exact vocabulary roomGroup uses for a
 * room the validator blames (same dash, same stroke width, same corner
 * radius): an armed tool and a broken vault looked identical. This drops
 * every one of those cues -- no stroke, no dash, no corner radius -- and
 * draws a soft accent wash across the run plus a solid accent bar along its
 * bottom edge instead: a lit strip under the cells where the room may land,
 * which cannot be mistaken for a room outline. The hover ghost already
 * shows the exact footprint that will be placed, so this only needs to say
 * *where*, not repeat *what shape*.
 *
 * It carries no `data-room-id` -- it is not a room, so it must never be
 * selectable or read as one by a click handler that looks for that
 * attribute -- and no pointer events of its own, so it never steals a click
 * meant for the grid underneath it.
 */
function candidateRun(run: { x: number; w: number }, top: number): string {
  const x = GUTTER + run.x * CELL_PX
  const w = run.w * CELL_PX - 2
  const h = FLOOR_PX - 6
  const barH = 3
  return (
    `<g data-candidate="true" pointer-events="none">` +
    `<rect x="${x + 1}" y="${top + 3}" width="${w}" height="${h}" fill="${tint(COLORS.selection, 0.1)}"/>` +
    `<rect x="${x + 1}" y="${top + 3 + h - barH}" width="${w}" height="${barH}" fill="${COLORS.selection}"/>` +
    `</g>`
  )
}

/**
 * A run of the free-only tier: the same ground candidateRun lights, only
 * dimmer and with no accent bar -- the bar is what says "this keeps a
 * route to the door", and these spots do not. No data-room-id and no
 * pointer events, for the same reasons as candidateRun.
 */
function freeOnlyRun(run: { x: number; w: number }, top: number): string {
  const x = GUTTER + run.x * CELL_PX
  const w = run.w * CELL_PX - 2
  const h = FLOOR_PX - 6
  return (
    `<g data-candidate="free-only" pointer-events="none">` +
    `<rect x="${x + 1}" y="${top + 3}" width="${w}" height="${h}" fill="${tint(COLORS.selection, 0.05)}"/>` +
    `</g>`
  )
}

/**
 * The floor fill, tiled a cell at a time from the grid's left edge: the
 * floor colour with a 1px boundary down its right-hand side. In user space
 * so every floor lines up with the same cells; the boundary falls in the
 * 1px gap roomGroup leaves either side of a room, and rooms lay the floor
 * colour under themselves, so the lines show only on empty ground.
 */
function cellPattern(): string {
  return (
    `<defs><pattern id="cells" x="${GUTTER}" y="0" width="${CELL_PX}" height="${FLOOR_PX}" ` +
    `patternUnits="userSpaceOnUse">` +
    `<rect width="${CELL_PX}" height="${FLOOR_PX}" fill="${COLORS.floor}"/>` +
    `<rect x="${CELL_PX - 1}" width="1" height="${FLOOR_PX}" fill="${COLORS.cell}"/>` +
    `</pattern></defs>`
  )
}

/**
 * A single, empty slot for the hover ghost -- the room outline that follows
 * the cursor while a tool is armed (see docs/superpowers/specs, §8). This
 * function, and renderScene, never colour or position it: it takes no data
 * from SceneOptions and is always emitted, screen and export alike. Only
 * the browser layer (src/app/interactions.ts), which alone knows where the
 * mouse is, reveals and moves it -- by mutating this element's attributes
 * directly on mousemove instead of asking for a whole repaint, which is
 * the only way a per-pixel-move update stays cheap. It starts hidden, has
 * no data-room-id (so a click handler's `closest('[data-room-id]')` never
 * mistakes it for a room and it never becomes selectable), and ignores its
 * own pointer events so it never steals a click meant for the grid under
 * it. It is the SVG's last child so it always paints over rooms and
 * candidate marks.
 */
function ghostSlot(): string {
  // A value-less `data-ghost` attribute (as HTML's shorthand allows) is not
  // legal XML; `svgToPngBlob` loads this exact string into an `<img>`,
  // which parses SVG as strict XML, and a malformed attribute there fails
  // the image decode silently, breaking every export. Every attribute here
  // carries a value for the same reason the rest of this file's markup
  // already does.
  return (
    '<rect data-ghost="true" x="0" y="0" width="0" height="0" fill="none" ' +
    'stroke-width="2" stroke-dasharray="4 3" pointer-events="none" visibility="hidden"/>'
  )
}

/**
 * The second ghost a drag needs when it would swap two rooms: where the
 * room under the pointer would go. The same as ghostSlot in every respect
 * -- always emitted, hidden, every attribute valued, no pointer events, no
 * data-room-id, moved only by src/app/interactions.ts -- and emitted just
 * before it, so the dragged room's own ghost stays the SVG's last child.
 */
function swapGhostSlot(): string {
  return (
    '<rect data-ghost-swap="true" x="0" y="0" width="0" height="0" fill="none" ' +
    'stroke-width="2" stroke-dasharray="4 3" pointer-events="none" visibility="hidden"/>'
  )
}

function legendBlock(v: Vault, y: number, width: number): string {
  const counts = new Map<string, number>()
  for (const r of v.rooms) counts.set(r.type, (counts.get(r.type) ?? 0) + 1)

  const columns = 3
  const columnWidth = (width - PAD * 2) / columns
  const rows: string[] = [
    `<text x="${PAD}" y="${y}" font-size="10" letter-spacing="1.4" fill="${COLORS.dim}" ` +
    `font-family="${FONT_STACK}">ROOMS IN THIS VAULT</text>`,
  ]

  let i = 0
  for (const [type, count] of counts) {
    const kind = kindOf(type)
    const color = GROUP_COLORS[kind.group]
    const cx = PAD + (i % columns) * columnWidth
    const cy = y + 18 + Math.floor(i / columns) * LEGEND_ROW
    rows.push(
      `<rect x="${cx}" y="${cy}" width="16" height="16" rx="3" fill="${tint(color, 0.13)}" stroke="${tint(color, 0.46)}"/>`,
      `<use href="#glyph-${kind.glyph}" x="${cx + 3}" y="${cy + 3}" width="10" height="10" color="${color}"/>`,
      `<text x="${cx + 24}" y="${cy + 12}" font-size="11" fill="${COLORS.text}" ` +
      `font-family="${FONT_STACK}">${escapeText(kind.name)}</text>`,
      `<text x="${cx + columnWidth - 30}" y="${cy + 12}" font-size="10" fill="${COLORS.faint}" ` +
      `font-family="${FONT_STACK}">&#215;${count}</text>`,
    )
    i++
  }
  return rows.join('')
}

export function renderScene(v: Vault, opts: SceneOptions = {}): string {
  const floors = floorsShown()
  const gridWidth = CELLS_PER_FLOOR * CELL_PX
  const width = gridWidth + GUTTER + PAD
  const titleHeight = opts.title ? TITLE_H : 0
  const gridHeight = floors.length * (FLOOR_PX + FLOOR_GAP_PX)
  const legendRows = opts.legend ? Math.ceil(new Set(v.rooms.map((r) => r.type)).size / 3) : 0
  const legendHeight = opts.legend ? 30 + legendRows * LEGEND_ROW : 0
  const height = PAD + titleHeight + gridHeight + legendHeight + PAD

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="${FONT_STACK}">`,
    glyphDefs(),
    cellPattern(),
    `<rect width="${width}" height="${height}" fill="${COLORS.background}"/>`,
  ]

  if (opts.title) {
    parts.push(
      `<text x="${PAD}" y="${PAD + 22}" font-size="22" font-weight="600" fill="${COLORS.text}">` +
      `${escapeText(opts.title)}</text>`,
    )
  }

  const gridTop = PAD + titleHeight
  floors.forEach((floor, index) => {
    const top = gridTop + index * (FLOOR_PX + FLOOR_GAP_PX)
    parts.push(
      `<text x="${GUTTER - 10}" y="${top + FLOOR_PX / 2 + 4}" text-anchor="end" font-size="11" ` +
      `fill="${COLORS.faint}">${floorLabel(floor)}</text>`,
      `<rect x="${GUTTER}" y="${top}" width="${gridWidth}" height="${FLOOR_PX}" rx="3" ` +
      `fill="url(#cells)" stroke="${COLORS.line}"/>`,
    )
    const onFloor = (spots?: Array<{ floor: number; x: number; w: number }>) =>
      (spots ?? []).filter((c) => c.floor === floor).map((c) => ({ x: c.x, w: c.w }))
    const lit = mergeRuns(onFloor(opts.candidates))
    for (const run of subtractRuns(mergeRuns(onFloor(opts.freeOnly)), lit)) {
      parts.push(freeOnlyRun(run, top))
    }
    for (const run of lit) parts.push(candidateRun(run, top))
    for (const room of v.rooms.filter((r) => r.floor === floor)) {
      parts.push(roomGroup(room, opts, top))
    }
  })

  if (opts.legend) {
    parts.push(legendBlock(v, gridTop + gridHeight + 24, width))
  }

  parts.push(swapGhostSlot())
  parts.push(ghostSlot())
  parts.push('</svg>')
  return parts.join('')
}
