// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Store, STORAGE_KEY_VAULT, STORAGE_KEY_MODE, loadSaved, loadMode } from '../../src/app/state'
import { createVault } from '../../src/domain/vault'

beforeEach(() => localStorage.clear())

describe('store', () => {
  it('refuses an operation the rules reject and leaves the vault alone', () => {
    const store = new Store(createVault())
    const verdict = store.run({ kind: 'place', type: 'diner', floor: 4, x: 12 })
    expect(verdict.ok).toBe(false)
    expect(store.state.vault.rooms).toHaveLength(1)
  })

  it('applies an operation the rules accept', () => {
    const store = new Store(createVault())
    expect(store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 }).ok).toBe(true)
    expect(store.state.vault.rooms).toHaveLength(2)
  })

  it('tells subscribers once per accepted change', () => {
    const store = new Store(createVault())
    const seen = vi.fn()
    store.subscribe(seen)
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.run({ kind: 'place', type: 'diner', floor: 9, x: 20 }) // refused
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('undoes and redoes an accepted change', () => {
    const store = new Store(createVault())
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(store.canUndo).toBe(true)
    store.undo()
    expect(store.state.vault.rooms).toHaveLength(1)
    expect(store.canRedo).toBe(true)
    store.redo()
    expect(store.state.vault.rooms).toHaveLength(2)
  })

  it('drops the redo branch once something new happens', () => {
    const store = new Store(createVault())
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    store.undo()
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(store.canRedo).toBe(false)
  })

  it('does not undo past the empty vault', () => {
    const store = new Store(createVault())
    store.undo()
    expect(store.canUndo).toBe(false)
    expect(store.state.vault.rooms).toHaveLength(1)
  })

  /**
   * Arming a room and having one selected are two modes, and the editor
   * only ever meant to be in one of them: the arrow keys move the
   * selection, Delete removes it and a click places the armed room, so
   * holding both leaves every one of those keys pointing at a room the
   * hand has already moved on from. Every call site on the canvas already
   * cleared the other by hand; the two in the panels did not, once in each
   * direction. Enforcing it here is what makes the pair unable to drift.
   */
  it('puts the selection down when a room is armed', () => {
    const store = new Store(createVault())
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id

    store.select(id)
    store.setTool('diner')

    expect(store.state.tool).toBe('diner')
    expect(store.state.selection).toBeNull()
  })

  it('puts the armed room down when one is selected', () => {
    const store = new Store(createVault())
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id

    store.setTool('diner')
    store.select(id)

    expect(store.state.selection).toBe(id)
    expect(store.state.tool).toBeNull()
  })

  /**
   * Clearing one is not entering the other, though. Escape puts an armed
   * room down and a click on empty grid deselects; neither is a reason to
   * disturb the half that was already empty.
   */
  it('leaves the other alone when one is merely cleared', () => {
    const store = new Store(createVault())
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    const id = store.state.vault.rooms.find((r) => r.type === 'elevator')!.id

    store.select(id)
    store.select(null)
    expect(store.state.selection).toBeNull()

    store.setTool('diner')
    store.setTool(null)
    expect(store.state.tool).toBeNull()
  })

  it('autosaves the vault and reads it back', () => {
    const store = new Store(createVault('Vault 76'))
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    expect(localStorage.getItem(STORAGE_KEY_VAULT)).toBeTruthy()
    expect(loadSaved()?.name).toBe('Vault 76')
  })

  it('keeps the mode out of the vault and in its own key', () => {
    const store = new Store(createVault())
    store.setMode('free')
    expect(localStorage.getItem(STORAGE_KEY_MODE)).toBe('free')
    expect(JSON.stringify(store.state.vault)).not.toContain('free')
    expect(loadMode()).toBe('free')
  })

  it('defaults to strict mode', () => {
    expect(new Store(createVault()).state.mode).toBe('strict')
    expect(loadMode()).toBe('strict')
  })

  it('forgets a saved vault it cannot read instead of crashing', () => {
    localStorage.setItem(STORAGE_KEY_VAULT, '{{{')
    expect(loadSaved()).toBeNull()
  })
})
