import { describe, it, expect } from 'vitest'
import { renderDock, type DockState } from '../../src/app/dock'
import { createVault } from '../../src/domain/vault'

function state(over: Partial<DockState> = {}): DockState {
  const vault = createVault()
  vault.rooms.push(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'd0', type: 'diner', floor: 0, x: 10, w: 6, level: 2 },
    { id: 'b0', type: 'barbershop', floor: 1, x: 10, w: 6 },
  )
  return { vault, mode: 'strict', selection: null, tool: null, carrying: null, ...over }
}

describe('renderDock', () => {
  it('shows nothing when nothing is selected, armed or carried', () => {
    expect(renderDock(state())).toBe('')
  })

  it('describes a selected room and offers everything the keys do as buttons', () => {
    const html = renderDock(state({ selection: 'd0' }))
    expect(html).toContain('data-bar="selected"')
    expect(html).toContain('<strong>Diner</strong>')
    expect(html).toContain('Floor 1 · 6 cells · level 2')
    for (const dir of ['left', 'right', 'up', 'down']) expect(html).toContain(`data-nudge="${dir}"`)
    expect(html.match(/data-set-level="\d"/g))
      .toEqual(['data-set-level="1"', 'data-set-level="2"', 'data-set-level="3"'])
    expect(html).toContain('data-set-level="2" aria-pressed="true"')
    expect(html).toContain('data-delete-room="d0"')
    expect(html).toContain('data-deselect')
  })

  it('offers only the levels a room has', () => {
    expect(renderDock(state({ selection: 'b0' })).match(/data-set-level/g)).toHaveLength(2)
    const elevator = renderDock(state({ selection: 'e0' }))
    expect(elevator).not.toContain('data-set-level')
    expect(elevator).toContain('Floor 1 · 1 cell')
  })

  it('offers nothing to do to the vault door but let go of it', () => {
    const html = renderDock(state({ selection: 'door' }))
    expect(html).toContain('<strong>Vault Door</strong>')
    expect(html).not.toContain('data-nudge')
    expect(html).not.toContain('data-delete-room')
    expect(html).toContain('data-deselect')
  })

  it('says how to place the armed room, and names the two tiers only under Free rules', () => {
    const strict = renderDock(state({ tool: 'diner' }))
    expect(strict).toContain('data-bar="placing"')
    expect(strict).toContain('Placing Diner')
    expect(strict).toContain('at level 1')
    expect(strict).toContain('data-stop-placing')
    expect(strict).not.toContain('class="legend"')
    expect(renderDock(state({ tool: 'diner', mode: 'free' }))).toContain('Fits, Free rules only')
    expect(renderDock(state({ tool: 'elevator' }))).not.toContain('level')
  })

  it('puts the carried room ahead of everything else', () => {
    const html = renderDock(state({ carrying: 'd0', selection: 'd0' }))
    expect(html).toContain('data-bar="carrying"')
    expect(html).toContain('Moving Diner')
    expect(html).not.toContain('data-nudge')
  })

  it('escapes the room id it hands to the Delete button', () => {
    const s = state()
    s.vault.rooms.push({ id: 'r"x', type: 'lounge', floor: 2, x: 0, w: 3 })
    expect(renderDock({ ...s, selection: 'r"x' })).toContain('data-delete-room="r&quot;x"')
  })
})
