import { describe, it, expect } from 'vitest'
import { applyOp, createVault, type Vault } from '../../src/domain/vault'
import { canApply, cascadeFor } from '../../src/domain/validate'
import { unreachableRooms } from '../../src/domain/reachability'

function tower(): Vault {
  const v = createVault()
  v.rooms.push(
    { id: 'e0', type: 'elevator', floor: 0, x: 9, w: 1 },
    { id: 'd0', type: 'diner', floor: 0, x: 10, w: 3 },
    { id: 'e1', type: 'elevator', floor: 1, x: 9, w: 1 },
    { id: 'd1', type: 'diner', floor: 1, x: 10, w: 3 },
    { id: 'e2', type: 'elevator', floor: 2, x: 9, w: 1 },
  )
  return v
}

describe('cascade delete', () => {
  it('takes the room and exactly what depends on it', () => {
    const op = cascadeFor(tower(), 'e1')
    expect(op.kind).toBe('removeMany')
    if (op.kind === 'removeMany') expect([...op.ids].sort()).toEqual(['d1', 'e1', 'e2'])
  })

  it('takes nothing extra when the room is a leaf', () => {
    const op = cascadeFor(tower(), 'd0')
    if (op.kind === 'removeMany') expect(op.ids).toEqual(['d0'])
  })

  it('leaves the vault connected afterwards', () => {
    const v = tower()
    const after = applyOp(v, cascadeFor(v, 'e0'))
    expect(unreachableRooms(after)).toEqual([])
    expect(after.rooms.map((r) => r.id)).toEqual(['door'])
  })

  it('produces an operation strict mode accepts', () => {
    const v = tower()
    expect(canApply(v, cascadeFor(v, 'e1'), 'strict').ok).toBe(true)
  })

  it('refuses to cascade the vault door', () => {
    const v = tower()
    expect(canApply(v, cascadeFor(v, 'door'), 'strict').ok).toBe(false)
  })
})
