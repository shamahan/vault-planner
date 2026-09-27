import { applyOp, createVault, type Op, type RoomId, type Vault } from '../domain/vault'
import { canApply, type Mode, type Verdict } from '../domain/validate'
import { parseVault, serializeVault } from '../io/schema'

export const STORAGE_KEY_VAULT = 'vault-planner:vault'
export const STORAGE_KEY_MODE = 'vault-planner:mode'

export type AppState = {
  vault: Vault
  mode: Mode
  selection: RoomId | null
  tool: string | null
}

export function loadSaved(): Vault | null {
  try {
    const text = localStorage.getItem(STORAGE_KEY_VAULT)
    return text ? parseVault(text) : null
  } catch {
    return null
  }
}

export function loadMode(): Mode {
  try {
    return localStorage.getItem(STORAGE_KEY_MODE) === 'free' ? 'free' : 'strict'
  } catch {
    return 'strict'
  }
}

export class Store {
  private past: Vault[] = []
  private future: Vault[] = []
  private listeners = new Set<(s: AppState) => void>()
  private current: AppState

  constructor(vault: Vault = createVault(), mode: Mode = loadMode()) {
    this.current = { vault, mode, selection: null, tool: null }
  }

  get state(): AppState {
    return this.current
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  subscribe(fn: (s: AppState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.current)
  }

  private commit(vault: Vault): void {
    this.past.push(this.current.vault)
    this.future = []
    this.current = { ...this.current, vault }
    this.autosave()
    this.emit()
  }

  run(op: Op): Verdict {
    const verdict = canApply(this.current.vault, op, this.current.mode)
    if (verdict.ok) this.commit(applyOp(this.current.vault, op))
    return verdict
  }

  replaceVault(vault: Vault): void {
    this.commit(vault)
  }

  setMode(mode: Mode): void {
    this.current = { ...this.current, mode }
    try {
      localStorage.setItem(STORAGE_KEY_MODE, mode)
    } catch { /* private mode: the editor still works */ }
    this.emit()
  }

  /**
   * `selection` and `tool` are two modes, and the editor is only ever in
   * one of them: the arrow keys move the selection, Delete removes it, S
   * splits it, and a click on the grid places the armed room. Holding both
   * at once leaves all of those keys aimed at a room the hand has already
   * moved on from -- still outlined, still wearing its close handle, while
   * the palette says something else is about to be placed.
   *
   * So entering one mode leaves the other, and the pair of setters is
   * where that is decided. It used to be decided at every call site
   * instead: the three on the canvas each cleared the other by hand, and
   * the two in the panels did not -- the palette left the selection up,
   * the problems list left the palette armed. Two omissions in opposite
   * directions out of five call sites is the argument for keeping it here,
   * where there is one of it.
   *
   * Clearing is not entering, though. Escape puts an armed room down and a
   * click on empty grid deselects; neither is a reason to disturb the half
   * that was already empty, so only a non-null value displaces the other.
   */
  select(selection: RoomId | null): void {
    this.current = { ...this.current, selection, tool: selection ? null : this.current.tool }
    this.emit()
  }

  setTool(tool: string | null): void {
    this.current = { ...this.current, tool, selection: tool ? null : this.current.selection }
    this.emit()
  }

  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(this.current.vault)
    this.current = { ...this.current, vault: previous, selection: null }
    this.autosave()
    this.emit()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.current.vault)
    this.current = { ...this.current, vault: next, selection: null }
    this.autosave()
    this.emit()
  }

  private autosave(): void {
    // Written synchronously, with no debounce: every accepted op is one
    // JSON.stringify plus one setItem, so a reload right after an edit never
    // loses it. The design called for a debounce to protect against a
    // per-frame drag flooding localStorage, but a drag here commits nothing
    // until it is let go -- the frames in between only move its ghosts --
    // so edits still arrive one discrete operation at a time, there is
    // nothing to coalesce, and a trailing timer would only be a live handle
    // this Store has no dispose method to clear.
    try {
      localStorage.setItem(STORAGE_KEY_VAULT, serializeVault(this.current.vault))
    } catch { /* quota or private mode: losing the autosave beats crashing */ }
  }
}
