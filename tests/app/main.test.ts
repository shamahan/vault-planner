// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { pickStartupVault, startNewVault } from '../../src/main'
import { createVault } from '../../src/domain/vault'
import { Store, loadSaved } from '../../src/app/state'

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', location.pathname)
})

describe('pickStartupVault', () => {
  it('keeps the saved vault when there is no link to weigh against it (no hash)', () => {
    expect(pickStartupVault(createVault(), null)).toBe('saved')
  })

  it('falls back to an empty vault when neither a save nor a link exists', () => {
    expect(pickStartupVault(null, null)).toBe('saved')
  })

  it('takes the link when there is nothing saved to lose (hash, no autosave)', () => {
    expect(pickStartupVault(null, createVault('Linked'))).toBe('incoming')
  })

  it('takes the link over an autosave that never left the door in place (hash over an empty autosave)', () => {
    expect(pickStartupVault(createVault(), createVault('Linked'))).toBe('incoming')
  })

  it('asks before replacing real, saved work (hash over a real autosave)', () => {
    const saved = createVault()
    saved.rooms.push({ id: 'r1', type: 'elevator', floor: 0, x: 9, w: 1 })
    expect(pickStartupVault(saved, createVault('Linked'))).toBe('ask')
  })
})

describe('startNewVault', () => {
  it('leaves nothing of the old layout for a reload to find', () => {
    const store = new Store(createVault('Old'))
    store.run({ kind: 'place', type: 'elevator', floor: 0, x: 9 })
    // What a Share click leaves behind: the whole layout, in the URL.
    history.replaceState(null, '', `${location.pathname}#v1p.the-old-layout`)

    startNewVault(store)

    expect(store.state.vault.rooms).toHaveLength(1)
    expect(loadSaved()?.rooms).toHaveLength(1)
    expect(loadSaved()?.name).not.toBe('Old')
    // Without this the autosave is blank, startup prefers the link to a
    // blank autosave, and the reload brings "Old" straight back.
    expect(location.hash).toBe('')
  })

  it('still clears the link when there was no layout to clear', () => {
    const store = new Store(createVault())
    history.replaceState(null, '', `${location.pathname}#v1p.something`)
    startNewVault(store)
    expect(location.hash).toBe('')
  })
})
