import { describe, it, expect } from 'vitest'
import { createVault, type Vault } from '../../src/domain/vault'
import { mergeRuns, renderScene, subtractRuns } from '../../src/render/scene'
import { GLYPH_PATHS } from '../../src/render/icons'
import { COLORS } from '../../src/render/theme'
import { ROOM_KINDS } from '../../src/domain/catalog'
import { FLOOR_COUNT } from '../../src/domain/grid'

function sample(): Vault {
  const v = createVault('Vault 111')
  v.rooms.push(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'l0', type: 'living_room', floor: 0, x: 10, w: 9 },
    { id: 'e1', type: 'elevator', floor: 1, x: 6, w: 1 },
    { id: 'g1', type: 'power_generator', floor: 1, x: 7, w: 9 },
  )
  return v
}

describe('scene', () => {
  it('gives every catalog kind a glyph', () => {
    for (const kind of ROOM_KINDS) {
      expect(GLYPH_PATHS[kind.glyph], `missing glyph ${kind.glyph}`).toBeTruthy()
    }
  })

  it('draws one group per room, tagged with its id', () => {
    const svg = renderScene(sample())
    for (const id of ['door', 'e0', 'l0', 'e1', 'g1']) {
      expect(svg).toContain(`data-room-id="${id}"`)
    }
  })

  it('writes the room name into the picture', () => {
    expect(renderScene(sample())).toContain('Power Generator')
  })

  it('marks a room the problems list blames', () => {
    const svg = renderScene(sample(), {
      problems: [{ kind: 'unreachable', message: 'no route', rooms: ['g1'] }],
    })
    expect(svg).toMatch(/data-room-id="g1"[^>]*data-problem="true"/)
  })

  it('marks the selected room', () => {
    expect(renderScene(sample(), { selection: 'l0' }))
      .toMatch(/data-room-id="l0"[^>]*data-selected="true"/)
  })

  it('adds a title and a legend only when asked', () => {
    expect(renderScene(sample())).not.toContain('ROOMS IN THIS VAULT')
    const withLegend = renderScene(sample(), { title: 'Vault 111', legend: true })
    expect(withLegend).toContain('Vault 111')
    expect(withLegend).toContain('ROOMS IN THIS VAULT')
    expect(withLegend).toContain('Living Room')
  })

  it('names no font the exporter cannot resolve', () => {
    expect(renderScene(sample())).not.toMatch(/@import|fonts\.googleapis/)
  })

  it('names a one-cell room via its title even though no text fits', () => {
    const svg = renderScene(sample())
    expect(svg).toMatch(/data-room-id="e0"[^>]*><title>Elevator<\/title>/)
  })

  it('escapes a vault name containing markup-like characters', () => {
    const svg = renderScene(sample(), { title: 'Vault & <Sons> "Home"' })
    expect(svg).toContain('Vault &amp; &lt;Sons&gt; &quot;Home&quot;')
    expect(svg).not.toContain('<Sons>')
  })

  it('stays the same picture for the same vault', () => {
    expect(renderScene(sample())).toMatchSnapshot()
  })

  /**
   * One room's markup: from its own `<g data-room-id>` to the next room's.
   * Whatever sits between the two (floor rects, labels) draws no circles
   * and no data-level, so counting those in the slice counts the room's.
   */
  function roomMarkup(svg: string, id: string): string {
    return svg.split('<g data-room-id=').find((chunk) => chunk.startsWith(`"${id}"`)) ?? ''
  }

  it('dots a room with its level, one dot per level the kind has', () => {
    const v = sample()
    v.rooms.push({ id: 'b2', type: 'barbershop', floor: 2, x: 10, w: 6, level: 2 })
    const svg = renderScene(v)
    expect(roomMarkup(svg, 'g1')).toContain('data-level="1"')
    expect(roomMarkup(svg, 'g1').match(/<circle/g)).toHaveLength(3)
    expect(roomMarkup(svg, 'b2')).toContain('data-level="2"')
    expect(roomMarkup(svg, 'b2').match(/<circle/g)).toHaveLength(2)
  })

  it('draws no level dots on the elevator or the door', () => {
    const svg = renderScene(sample())
    for (const id of ['e0', 'door']) {
      expect(roomMarkup(svg, id)).toContain('<title>')
      expect(roomMarkup(svg, id)).not.toContain('data-level')
    }
  })

  it('names the level in the title of a room that has one', () => {
    const v = sample()
    v.rooms.find((r) => r.id === 'l0')!.level = 3
    expect(renderScene(v)).toMatch(/data-room-id="l0"[^>]*><title>Living Room, level 3<\/title>/)
  })

  it('takes the covered cells out of a run, leaving what is left on either side', () => {
    expect(subtractRuns([{ x: 0, w: 10 }], [{ x: 3, w: 2 }])).toEqual([{ x: 0, w: 3 }, { x: 5, w: 5 }])
    expect(subtractRuns([{ x: 0, w: 3 }], [{ x: 5, w: 2 }])).toEqual([{ x: 0, w: 3 }])
    expect(subtractRuns([{ x: 4, w: 3 }], [{ x: 0, w: 10 }])).toEqual([])
    expect(subtractRuns([{ x: 0, w: 6 }, { x: 10, w: 4 }], [{ x: 4, w: 7 }]))
      .toEqual([{ x: 0, w: 4 }, { x: 11, w: 3 }])
  })

  it('draws the free-only tier dimly, and never under a lit strip', () => {
    const svg = renderScene(sample(), {
      candidates: [{ floor: 2, x: 4, w: 3 }],
      freeOnly: [{ floor: 2, x: 0, w: 3 }, { floor: 2, x: 3, w: 3 }, { floor: 2, x: 10, w: 3 }],
    })
    const dim = [...svg.matchAll(/<g data-candidate="free-only"[^>]*>(.*?)<\/g>/g)]
    expect(dim).toHaveLength(2)
    // Cells 0-3 (the lit strip starts at 4) and 10-12.
    expect(dim[0]![0]).toContain(`width="${4 * 22 - 2}"`)
    expect(dim[1]![0]).toContain(`width="${3 * 22 - 2}"`)
    for (const [group, inner] of dim) {
      expect(group).toContain('pointer-events="none"')
      expect(inner!.match(/<rect/g)).toHaveLength(1)
    }
    expect(svg.match(/data-candidate="true"/g)).toHaveLength(1)
  })

  it('draws the cell boundaries on every floor', () => {
    const svg = renderScene(sample())
    expect(svg).toContain('<pattern id="cells"')
    expect(svg.match(/fill="url\(#cells\)"/g)).toHaveLength(FLOOR_COUNT)
  })

  it('lays the floor colour under each room, so the cell lines stay out of it', () => {
    // First thing after the title, under the room's own translucent tint.
    // (Not just "somewhere in the room's markup": the last room's slice runs
    // on over the empty floors below it, which are floor-coloured too.)
    const svg = renderScene(sample())
    for (const id of ['door', 'e0', 'l0', 'g1']) {
      expect(svg, id).toMatch(new RegExp(`data-room-id="${id}"[^>]*><title>[^<]*</title><rect [^>]*fill="${COLORS.floor}"/>`))
    }
  })

  it('draws no candidate marks when none are given', () => {
    expect(renderScene(sample())).not.toContain('data-candidate="true"')
  })

  it('draws a candidate mark that carries no data-room-id and no room vocabulary', () => {
    const svg = renderScene(sample(), { candidates: [{ floor: 2, x: 0, w: 3 }] })
    expect(svg).toContain('data-candidate="true"')
    // A candidate is illuminated territory, not an outlined box: it must
    // carry none of the vocabulary roomGroup uses for a room the validator
    // blames -- no dash, since that reads as "this room is cut off," and no
    // data-room-id, since it is not a room and must never be selectable.
    // (The ghost slot, unrelated to candidates, keeps its own dash -- so
    // this is asserted on the candidate group alone, not the whole scene.)
    const candidateGroup = svg.match(/<g data-candidate="true"[^>]*>.*?<\/g>/s)?.[0]
    expect(candidateGroup).toBeTruthy()
    expect(candidateGroup).toContain('pointer-events="none"')
    expect(candidateGroup).not.toContain('stroke-dasharray')
    expect(candidateGroup).not.toContain('data-room-id')
  })

  it('keeps a candidate mark visually distinct from a room the validator blames', () => {
    // Both g1 (blamed) and a candidate on floor 2 appear in the same scene,
    // exactly the collision the author reported: an armed tool's hints must
    // never be mistaken for rooms the vault already has trouble with.
    const svg = renderScene(sample(), {
      problems: [{ kind: 'unreachable', message: 'no route', rooms: ['g1'] }],
      candidates: [{ floor: 2, x: 0, w: 3 }],
    })
    const blamedRoom = svg.match(/<g[^>]*data-room-id="g1"[^>]*>.*?<\/g>/s)?.[0]
    const candidateGroup = svg.match(/<g data-candidate="true"[^>]*>.*?<\/g>/s)?.[0]
    expect(blamedRoom).toBeTruthy()
    expect(candidateGroup).toBeTruthy()
    // The blamed room keeps the dashed, stroked, rounded-corner outline...
    expect(blamedRoom).toContain('stroke-dasharray="3 3"')
    expect(blamedRoom).toContain('rx="3"')
    // ...none of which a candidate run carries any more.
    expect(candidateGroup).not.toContain('stroke-dasharray')
    expect(candidateGroup).not.toContain('rx="3"')
    expect(candidateGroup).not.toContain('stroke=')
  })

  it('merges overlapping per-cell candidates into one run instead of a jumble of boxes', () => {
    // The armed-tool candidate list has one entry per legal starting cell,
    // so neighbouring positions (x=0..3 for a width-3 room) overlap almost
    // completely. Before the merge this drew four near-identical boxes that
    // read as several empty rooms; now it must draw exactly one mark.
    const svg = renderScene(sample(), {
      candidates: [
        { floor: 2, x: 0, w: 3 },
        { floor: 2, x: 1, w: 3 },
        { floor: 2, x: 2, w: 3 },
        { floor: 2, x: 3, w: 3 },
      ],
    })
    expect((svg.match(/data-candidate="true"/g) ?? []).length).toBe(1)
  })

  it('always emits a hidden ghost slot that is never mistaken for a room', () => {
    const svg = renderScene(sample())
    const ghostTag = svg.match(/<rect data-ghost="true"[^>]*\/>/)?.[0]
    expect(ghostTag).toBeTruthy()
    expect(ghostTag).toContain('visibility="hidden"')
    expect(ghostTag).not.toContain('data-room-id')
    // Last child of the svg, so it always paints over rooms and candidates.
    expect(svg.trimEnd().endsWith(`${ghostTag}</svg>`)).toBe(true)
  })

  it('emits a second hidden ghost slot for a swap, just before the first', () => {
    const svg = renderScene(sample())
    const swapTag = svg.match(/<rect data-ghost-swap="true"[^>]*\/>/)?.[0]
    const ghostTag = svg.match(/<rect data-ghost="true"[^>]*\/>/)?.[0]
    expect(swapTag).toBeTruthy()
    expect(swapTag).toContain('visibility="hidden"')
    expect(swapTag).toContain('pointer-events="none"')
    expect(swapTag).not.toContain('data-room-id')
    // Every attribute carries a value: svgToPngBlob parses this as strict XML.
    expect(swapTag).toMatch(/^<rect( [a-z-]+="[^"]*")+\/>$/)
    expect(svg.trimEnd().endsWith(`${swapTag}${ghostTag}</svg>`)).toBe(true)
  })

  it('marks every room but the vault door as movable', () => {
    const svg = renderScene(sample())
    for (const id of ['e0', 'l0', 'e1', 'g1']) {
      expect(svg).toContain(`data-room-id="${id}" data-movable="true"`)
    }
    expect(svg).not.toMatch(/data-room-id="door" data-movable/)
  })

  it('does not try to draw a hundred-million floors for a room on an absurd floor', () => {
    const v = createVault()
    v.rooms.push({ id: 'a', type: 'diner', floor: 100000000, x: 0, w: 3 })
    const svg = renderScene(v)
    // The room itself is off the drawn grid (clamped to FLOOR_COUNT rows),
    // but rendering it must not hang or blow memory building the array of
    // floor rows in between -- that is the whole point of the clamp.
    expect((svg.match(/<rect x="34"/g) ?? []).length).toBeLessThanOrEqual(FLOOR_COUNT)
  })
})

describe('mergeRuns', () => {
  it('merges adjacent (touching) spans into one run', () => {
    expect(mergeRuns([{ x: 0, w: 3 }, { x: 3, w: 2 }])).toEqual([{ x: 0, w: 5 }])
  })

  it('keeps spans separate across a gap', () => {
    expect(mergeRuns([{ x: 0, w: 2 }, { x: 3, w: 2 }])).toEqual([{ x: 0, w: 2 }, { x: 3, w: 2 }])
  })

  it('merges overlapping spans', () => {
    expect(mergeRuns([{ x: 0, w: 3 }, { x: 2, w: 3 }])).toEqual([{ x: 0, w: 5 }])
  })

  it('leaves a single span unchanged', () => {
    expect(mergeRuns([{ x: 4, w: 3 }])).toEqual([{ x: 4, w: 3 }])
  })

  it('gives nothing for an empty list', () => {
    expect(mergeRuns([])).toEqual([])
  })

  it('merges out of order and fully-contained spans, and sorts the result', () => {
    expect(mergeRuns([
      { x: 10, w: 2 },
      { x: 0, w: 3 },
      { x: 1, w: 1 }, // fully inside the first run
      { x: 3, w: 3 }, // touches the first run's end
    ])).toEqual([{ x: 0, w: 6 }, { x: 10, w: 2 }])
  })
})

describe('the delete handle', () => {
  it('appears on the selected room, carrying the id it would delete', () => {
    const svg = renderScene(sample(), { selection: 'l0' })
    expect(svg).toContain('data-delete-room="l0"')
    // One handle, not one per room: the rest of the scene stays readable.
    expect(svg.match(/data-delete-room=/g)).toHaveLength(1)
  })

  it('appears on no room at all when nothing is selected', () => {
    expect(renderScene(sample())).not.toContain('data-delete-room')
  })

  it('never appears on the vault door, which cannot be deleted', () => {
    // Offering a control that always refuses is worse than offering none.
    expect(renderScene(sample(), { selection: 'door' })).not.toContain('data-delete-room')
  })

  it('fits inside the narrowest room there is', () => {
    // A one-cell elevator is 20 units wide and 50 tall. The handle is drawn
    // in the room's own coordinates, so a circle that overflowed them would
    // hang outside the room it belongs to.
    const svg = renderScene(sample(), { selection: 'e0' })
    const handle = svg.slice(svg.indexOf('data-delete-room="e0"'))
    const circle = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(handle)
    expect(circle).not.toBeNull()
    const cx = Number(circle?.[1])
    const cy = Number(circle?.[2])
    const r = Number(circle?.[3])
    expect(cx - r).toBeGreaterThan(0)
    expect(cx + r).toBeLessThan(1 * 22 - 2)
    expect(cy - r).toBeGreaterThan(0)
    expect(cy + r).toBeLessThan(56 - 6)
  })
})
