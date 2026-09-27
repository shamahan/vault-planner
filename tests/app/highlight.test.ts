import { describe, it, expect } from 'vitest'
import { highlightFor } from '../../src/app/highlight'
import { canApply } from '../../src/domain/validate'
import { createVault, type Op, type Vault } from '../../src/domain/vault'

function vaultWith(...rooms: Vault['rooms']): Vault {
  const v = createVault()
  v.rooms.push(...rooms)
  return v
}

const placeDiner = (floor: number, x: number): Op => ({ kind: 'place', type: 'diner', floor, x })

describe('highlightFor', () => {
  it('under Strict rules lights only the spots Strict accepts, and nothing dim', () => {
    const h = highlightFor(createVault(), 'strict', 3, placeDiner)
    expect(h.connected).toEqual([{ floor: 0, x: 9, w: 3 }])
    expect(h.freeOnly).toEqual([])
  })

  it('under Free rules adds every other spot where the room fits, dimly', () => {
    const h = highlightFor(createVault(), 'free', 3, placeDiner)
    expect(h.connected).toEqual([{ floor: 0, x: 9, w: 3 }])
    // The top floor past the door fits a diner from x 10 to 23; every
    // other floor from 0 to 23.
    expect(h.freeOnly.filter((s) => s.floor === 0).map((s) => s.x))
      .toEqual(Array.from({ length: 14 }, (_, i) => 10 + i))
    expect(h.freeOnly.filter((s) => s.floor === 1)).toHaveLength(24)
  })

  it('splits exactly what Free accepts, and no spot lands in both tiers', () => {
    const v = vaultWith(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
    )
    const h = highlightFor(v, 'free', 3, placeDiner)
    const lit = new Set([...h.connected, ...h.freeOnly].map((s) => `${s.floor}:${s.x}`))
    expect(lit.size).toBe(h.connected.length + h.freeOnly.length)
    for (let floor = 0; floor < 3; floor++) {
      for (let x = 0; x < 26; x++) {
        expect(lit.has(`${floor}:${x}`), `${floor}:${x}`).toBe(canApply(v, placeDiner(floor, x), 'free').ok)
      }
    }
    for (const s of h.connected) expect(canApply(v, placeDiner(s.floor, s.x), 'strict').ok).toBe(true)
    for (const s of h.freeOnly) expect(canApply(v, placeDiner(s.floor, s.x), 'strict').ok).toBe(false)
  })

  it("counts a moved room's own cells as free", () => {
    const v = vaultWith({ id: 'd', type: 'diner', floor: 0, x: 9, w: 3 })
    const h = highlightFor(v, 'free', 3, (floor, x) => ({ kind: 'move', id: 'd', floor, x }))
    expect(h.connected).toEqual([{ floor: 0, x: 9, w: 3 }])
    expect(h.freeOnly).toContainEqual({ floor: 0, x: 10, w: 3 })
  })
})
