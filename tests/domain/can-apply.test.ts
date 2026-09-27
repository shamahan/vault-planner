import { describe, it, expect } from 'vitest'
import { applyOp, createVault, roomsOnFloor, type Vault } from '../../src/domain/vault'
import { canApply, validate } from '../../src/domain/validate'

function vaultWith(...rooms: Vault['rooms']): Vault {
  const v = createVault()
  v.rooms.push(...rooms)
  return v
}

describe('canApply: geometry holds in both modes', () => {
  for (const mode of ['strict', 'free'] as const) {
    it(`refuses a room off the edge in ${mode} mode`, () => {
      const v = vaultWith({ id: 'e', type: 'elevator', floor: 0, x: 9, w: 1 })
      const verdict = canApply(v, { kind: 'place', type: 'weapon_workshop', floor: 0, x: 24 }, mode)
      expect(verdict.ok).toBe(false)
      if (!verdict.ok) expect(verdict.reason).toMatch(/fit/i)
    })

    it(`refuses an overlap in ${mode} mode`, () => {
      const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3 })
      const verdict = canApply(v, { kind: 'place', type: 'garden', floor: 0, x: 10 }, mode)
      expect(verdict.ok).toBe(false)
      if (!verdict.ok) expect(verdict.blame).toContain('a')
    })

    it(`places a fourth room beside a full group as its own room, in ${mode} mode`, () => {
      // In the real game a merged group stops at three: a fourth diner
      // placed beside one does not refuse, and it does not grow the group
      // past its cap either -- it stands next to it as a separate room.
      const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 9 })
      const verdict = canApply(v, { kind: 'place', type: 'diner', floor: 0, x: 18 }, mode)
      expect(verdict.ok).toBe(true)

      const after = applyOp(v, { kind: 'place', type: 'diner', floor: 0, x: 18 })
      const diners = roomsOnFloor(after, 0)
        .filter((r) => r.type === 'diner')
        .sort((p, q) => p.x - q.x)
      expect(diners).toHaveLength(2)
      expect(diners[0]).toMatchObject({ x: 9, w: 9 })
      expect(diners[1]).toMatchObject({ x: 18, w: 3 })
    })

    it(`refuses touching the vault door in ${mode} mode`, () => {
      const v = createVault()
      expect(canApply(v, { kind: 'remove', id: 'door' }, mode).ok).toBe(false)
      expect(canApply(v, { kind: 'move', id: 'door', floor: 1, x: 0 }, mode).ok).toBe(false)
    })
  }
})

describe('canApply: connectivity is strict only', () => {
  it('refuses a room with no route in strict mode', () => {
    const v = createVault()
    const verdict = canApply(v, { kind: 'place', type: 'diner', floor: 0, x: 12 }, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/route|reach/i)
  })

  it('allows the same room in free mode', () => {
    const v = createVault()
    expect(canApply(v, { kind: 'place', type: 'diner', floor: 0, x: 12 }, 'free').ok).toBe(true)
  })

  it('allows a room that touches the door', () => {
    const v = createVault()
    expect(canApply(v, { kind: 'place', type: 'elevator', floor: 0, x: 9 }, 'strict').ok).toBe(true)
  })

  it('only digs down where an elevator already is', () => {
    const v = vaultWith({ id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 })
    expect(canApply(v, { kind: 'place', type: 'elevator', floor: 1, x: 9 }, 'strict').ok).toBe(true)
    expect(canApply(v, { kind: 'place', type: 'elevator', floor: 1, x: 12 }, 'strict').ok).toBe(false)
  })

  it('refuses a deletion that would strand rooms, and names them', () => {
    const v = vaultWith(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
      { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
    )
    const verdict = canApply(v, { kind: 'remove', id: 'e0' }, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.blame.sort()).toEqual(['d1', 'e1'])
      expect(verdict.reason).toMatch(/2 rooms/)
    }
  })

  it('allows the same deletion in free mode', () => {
    const v = vaultWith(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
    )
    expect(canApply(v, { kind: 'remove', id: 'e0' }, 'free').ok).toBe(true)
  })

  it('allows removing everything that depends on a room at once', () => {
    const v = vaultWith(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
      { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
    )
    expect(canApply(v, { kind: 'removeMany', ids: ['e0', 'e1', 'd1'] }, 'strict').ok).toBe(true)
  })

  it('reports the generic refusal singular for exactly one stranded room', () => {
    const v = vaultWith(
      { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
      { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
      { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
    )
    const verdict = canApply(v, { kind: 'move', id: 'd1', floor: 1, x: 20 }, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.reason).toBe('That would leave 1 room with no route to the vault door.')
    }
  })
})

describe('canApply: strict mode over an already broken vault', () => {
  const broken = (): Vault => vaultWith(
    { id: 'lost', type: 'diner', floor: 3, x: 12, w: 3 },
  )

  it('lets you tidy a vault it would never have let you build', () => {
    expect(validate(broken()).some((p) => p.kind === 'unreachable')).toBe(true)
    expect(canApply(broken(), { kind: 'remove', id: 'lost' }, 'strict').ok).toBe(true)
  })

  it('still refuses to make it worse', () => {
    const v = broken()
    expect(canApply(v, { kind: 'place', type: 'garden', floor: 5, x: 0 }, 'strict').ok).toBe(false)
  })

  it('allows a move that leaves the count of stranded rooms alone', () => {
    const v = broken()
    expect(canApply(v, { kind: 'move', id: 'lost', floor: 3, x: 15 }, 'strict').ok).toBe(true)
  })
})

describe('canApply: the merge cap', () => {
  it('drops a room between two full groups next to both, welding neither', () => {
    // Two already-full triples (width 9 each) with a three-cell gap between
    // them. A room placed in the gap touches both, but joining either one
    // would push it past its cap (9 + 3 = 12 > 9), so mergeNeighbours (once
    // the cap is restored) leaves all three as separate, adjacent records
    // instead of welding two nine-wide groups into one twelve-wide one.
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 1, x: 0, w: 9 },
      { id: 'b', type: 'diner', floor: 1, x: 12, w: 9 },
    )
    const verdict = canApply(v, { kind: 'place', type: 'diner', floor: 1, x: 9 }, 'free')
    expect(verdict.ok).toBe(true)

    const after = applyOp(v, { kind: 'place', type: 'diner', floor: 1, x: 9 })
    const diners = roomsOnFloor(after, 1)
      .filter((r) => r.type === 'diner')
      .sort((p, q) => p.x - q.x)
    expect(diners).toHaveLength(3)
    expect(diners.map((r) => ({ x: r.x, w: r.w }))).toEqual([
      { x: 0, w: 9 },
      { x: 9, w: 3 },
      { x: 12, w: 9 },
    ])
  })
})

describe('canApply: refusal edge cases', () => {
  it('refuses a removeMany that includes the vault door among other ids', () => {
    const v = vaultWith({ id: 'a', type: 'diner', floor: 0, x: 9, w: 3 })
    expect(canApply(v, { kind: 'removeMany', ids: ['a', 'door'] }, 'strict').ok).toBe(false)
  })

  it('refuses an op naming a room the vault does not have', () => {
    const v = createVault()
    const verdict = canApply(v, { kind: 'remove', id: 'ghost' }, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/no room/i)
  })

  it('lands a move beside a full group instead of over-merging past the limit', () => {
    // 'a' is already a full triple (width 9). Moving 'b' to touch it used to
    // merge into one width-12 record, which the bad-width rule then refused
    // -- but that was refusing a placement the game allows. With the cap
    // restored, 'b' simply does not join 'a' and the move succeeds.
    const v = vaultWith(
      { id: 'a', type: 'diner', floor: 0, x: 10, w: 9 },
      { id: 'b', type: 'diner', floor: 0, x: 22, w: 3 },
    )
    const verdict = canApply(v, { kind: 'move', id: 'b', floor: 0, x: 19 }, 'free')
    expect(verdict.ok).toBe(true)

    const after = applyOp(v, { kind: 'move', id: 'b', floor: 0, x: 19 })
    const diners = after.rooms.filter((r) => r.type === 'diner').sort((p, q) => p.x - q.x)
    expect(diners).toHaveLength(2)
    expect(diners[0]).toMatchObject({ x: 10, w: 9 })
    expect(diners[1]).toMatchObject({ x: 19, w: 3 })
  })
})

describe('canApply: swap', () => {
  // Floor 0: door [0,9), elevator e0 at 9, diner d0 [10,13), office o0 [13,19).
  // Floor 1: elevator e1 at 9, garden g1 [10,13), lounge l1 [13,16).
  // Floor 3: a medbay with no route to anything.
  const swapVault = (): Vault => vaultWith(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
    { id: 'o0', type: 'overseers_office', floor: 0, x: 13, w: 6 },
    { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
    { id: 'g1', type: 'garden', floor: 1, x: 10, w: 3 },
    { id: 'l1', type: 'lounge', floor: 1, x: 13, w: 3 },
    { id: 'lost', type: 'medbay', floor: 3, x: 0, w: 3 },
  )

  it('accepts two rooms of the same width', () => {
    expect(canApply(swapVault(), { kind: 'swap', id: 'd0', with: 'g1', x: 10 }, 'strict').ok).toBe(true)
  })

  it('accepts a narrower target that fits where the wider room stood', () => {
    expect(canApply(swapVault(), { kind: 'swap', id: 'o0', with: 'l1', x: 13 }, 'strict').ok).toBe(true)
  })

  it('says the same-type target is wider than "this one", not the same name twice', () => {
    const v = vaultWith(
      { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
      { id: 'd2', type: 'diner', floor: 2, x: 10, w: 6 },
    )
    const verdict = canApply(v, { kind: 'swap', id: 'd1', with: 'd2', x: 10 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.reason).toBe('That Diner is wider than this one and would not fit in its place.')
      expect(verdict.blame).toEqual(['d2'])
    }
  })

  it('refuses a target wider than the room dropped on it', () => {
    const verdict = canApply(swapVault(), { kind: 'swap', id: 'l1', with: 'o0', x: 13 }, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.reason).toBe("The Overseer's Office is wider than the Lounge and would not fit in its place.")
      expect(verdict.blame).toEqual(['o0'])
    }
  })

  it('names what is in the way when the wider room has no room beside the target', () => {
    // The office over the garden needs three cells more; from x 10 they are the lounge's.
    const verdict = canApply(swapVault(), { kind: 'swap', id: 'o0', with: 'g1', x: 10 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.reason).toBe("No room for the Overseer's Office here: the Lounge is in the way.")
    }
  })

  it('refuses the vault door on either side', () => {
    const v = vaultWith({ id: 'w1', type: 'weapon_workshop', floor: 1, x: 10, w: 9 })
    const ops = [
      { kind: 'swap', id: 'door', with: 'w1', x: 10 },
      { kind: 'swap', id: 'w1', with: 'door', x: 0 },
    ] as const
    for (const op of ops) {
      const verdict = canApply(v, op, 'free')
      expect(verdict.ok).toBe(false)
      // Not /vault door/i: that also matches the door-misplaced geometry
      // message, so this would still pass even if touchedIds dropped op.with.
      if (!verdict.ok) {
        expect(verdict.reason).toBe('The vault door is part of the vault and cannot be changed.')
        expect(verdict.blame).toEqual(['door'])
      }
    }
  })

  it('refuses a room it cannot find', () => {
    const verdict = canApply(swapVault(), { kind: 'swap', id: 'd0', with: 'nowhere', x: 10 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/no room/i)
  })

  it('refuses a room swapping with itself', () => {
    const verdict = canApply(swapVault(), { kind: 'swap', id: 'd0', with: 'd0', x: 10 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('A room cannot swap places with itself.')
  })

  it('refuses an x that leaves part of the target uncovered', () => {
    const verdict = canApply(swapVault(), { kind: 'swap', id: 'o0', with: 'l1', x: 16 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe("The Overseer's Office has to cover the Lounge to swap places with it.")
  })

  it('refuses in strict mode a swap that strands a room, and allows it in free mode', () => {
    // The garden goes where the medbay was, with no route; the medbay
    // gains one. One stranded room traded for another is still a new one.
    const op = { kind: 'swap', id: 'g1', with: 'lost', x: 0 } as const
    const verdict = canApply(swapVault(), op, 'strict')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('That would leave 1 room with no route to the vault door.')
    expect(canApply(swapVault(), op, 'free').ok).toBe(true)
  })

  it('answers a move that runs into a room with what is in the way', () => {
    const verdict = canApply(swapVault(), { kind: 'move', id: 'l1', floor: 1, x: 11 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe('No room for the Lounge here: the Garden is in the way.')
  })

  it('still describes a placement overlap the way it always has', () => {
    const verdict = canApply(swapVault(), { kind: 'place', type: 'garden', floor: 0, x: 11 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/overlap on floor 1\.$/)
  })
})

describe('canApply: room levels', () => {
  const connected = () => vaultWith(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
    { id: 'b0', type: 'barbershop', floor: 0, x: 13, w: 6 },
  )

  it('raises a room in either mode', () => {
    for (const mode of ['strict', 'free'] as const) {
      expect(canApply(connected(), { kind: 'level', id: 'd0', level: 3 }, mode).ok).toBe(true)
    }
  })

  it('refuses a level the room does not have', () => {
    const verdict = canApply(connected(), { kind: 'level', id: 'b0', level: 3 }, 'free')
    expect(verdict).toEqual({ ok: false, reason: 'The Barbershop goes from level 1 to level 2.', blame: ['b0'] })
  })

  it('refuses any level on an elevator', () => {
    const verdict = canApply(connected(), { kind: 'level', id: 'e0', level: 2 }, 'free')
    expect(verdict).toEqual({ ok: false, reason: 'The Elevator has no levels.', blame: ['e0'] })
  })

  it('refuses the level the room already has, so undo is not given a no-op', () => {
    const verdict = canApply(connected(), { kind: 'level', id: 'd0', level: 1 }, 'strict')
    expect(verdict).toEqual({ ok: false, reason: 'The Diner is already level 1.', blame: ['d0'] })
  })

  it('refuses to change the vault door', () => {
    const verdict = canApply(connected(), { kind: 'level', id: 'door', level: 2 }, 'free')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toMatch(/vault door/i)
  })

  it('lets you change the level of a room that was already cut off, in strict mode', () => {
    // A level change can merge rooms but never changes which cells are
    // taken, so it cannot strand anything -- and it must not be blocked on
    // an already-broken vault, or that vault could not be tidied up.
    const v = vaultWith(
      { id: 'lost', type: 'diner', floor: 3, x: 12, w: 3 },
      { id: 'lost2', type: 'diner', floor: 3, x: 15, w: 3, level: 2 },
    )
    expect(canApply(v, { kind: 'level', id: 'lost', level: 2 }, 'strict').ok).toBe(true)
  })
})
