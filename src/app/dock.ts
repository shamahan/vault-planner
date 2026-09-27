import { kindOf } from '../domain/catalog'
import { floorLabel } from '../domain/grid'
import type { Mode } from '../domain/validate'
import { findRoom, levelOf, type RoomId, type Vault } from '../domain/vault'
import { roomGlyph, uiIcon } from '../render/icons'
import { GROUP_COLORS, tint } from '../render/theme'
import { escapeText } from '../shared/escape'

/** What the bar under the grid shows, read from the editor's state. */
export type DockState = {
  vault: Vault
  mode: Mode
  selection: RoomId | null
  tool: string | null
  /** The room being dragged, if one is. */
  carrying: RoomId | null
}

const SEP = '<span class="sep" aria-hidden="true"></span>'

function tile(type: string): string {
  const kind = kindOf(type)
  return `<span class="tile" style="background:${tint(GROUP_COLORS[kind.group], 0.14)}">${roomGlyph(kind, 20)}</span>`
}

function what(title: string, detail: string): string {
  return `<span class="what"><strong>${escapeText(title)}</strong><span>${escapeText(detail)}</span></span>`
}

/**
 * The two tiers the highlight draws, named. Only under Free rules: under
 * Strict there is one tier, and the bar says what it means already.
 */
function legend(mode: Mode): string {
  if (mode !== 'free') return ''
  return SEP +
    '<span class="legend"><span class="swatch lit"></span>Keeps a route to the door</span>' +
    '<span class="legend"><span class="swatch dim"></span>Fits, Free rules only</span>'
}

function carryingBar(s: DockState, id: RoomId): string {
  const room = findRoom(s.vault, id)
  if (!room) return ''
  return '<div class="bar" data-bar="carrying" role="status">' +
    tile(room.type) +
    what(`Moving ${kindOf(room.type).name}`, 'Drop it on a lit strip, or on another room to swap them') +
    legend(s.mode) + SEP +
    '<span class="hint"><kbd>Esc</kbd> to cancel</span></div>'
}

function placingBar(s: DockState, type: string): string {
  const kind = kindOf(type)
  const detail = kind.maxLevel > 1
    ? 'Click a lit strip to build it at level 1. It stays armed for the next one.'
    : 'Click a lit strip to build it. It stays armed for the next one.'
  return '<div class="bar" data-bar="placing">' +
    tile(type) + what(`Placing ${kind.name}`, detail) + legend(s.mode) + SEP +
    '<span class="hint"><kbd>Esc</kbd> to stop</span>' +
    '<button type="button" data-stop-placing>Stop</button></div>'
}

const NUDGES = [
  ['left', 'Move left', '←'],
  ['right', 'Move right', '→'],
  ['up', 'Move up a floor', '↑'],
  ['down', 'Move down a floor', '↓'],
] as const

function selectedBar(s: DockState, id: RoomId): string {
  const room = findRoom(s.vault, id)
  if (!room) return ''
  const kind = kindOf(room.type)
  const deselect =
    '<button type="button" class="icon-only" data-deselect aria-label="Deselect" title="Deselect (Esc)">' +
    `${uiIcon('close', 18)}</button>`
  if (!kind.placeable) {
    return '<div class="bar" data-bar="selected">' + tile(room.type) +
      what(kind.name, `Floor ${floorLabel(room.floor)} · part of the vault, it stays where it is`) +
      SEP + deselect + '</div>'
  }

  const level = levelOf(room)
  const cells = room.w === 1 ? '1 cell' : `${room.w} cells`
  const detail = `Floor ${floorLabel(room.floor)} · ${cells}` + (kind.maxLevel > 1 ? ` · level ${level}` : '')
  const nudges = NUDGES.map(([dir, label, key]) =>
    `<button type="button" class="icon-only" data-nudge="${dir}" aria-label="${label}" title="${label} (${key})">` +
    `${uiIcon(dir, 18)}</button>`).join('')
  let levels = ''
  if (kind.maxLevel > 1) {
    const buttons = Array.from({ length: kind.maxLevel }, (_, i) => i + 1).map((n) =>
      `<button type="button" data-set-level="${n}" aria-pressed="${n === level}" ` +
      `aria-label="Level ${n}" title="Level ${n} (${n})">${n}</button>`).join('')
    levels = SEP + '<span class="label" aria-hidden="true">Level</span>' +
      `<span class="seg" role="group" aria-label="Level">${buttons}</span>` +
      `<kbd>1–${kind.maxLevel}</kbd>`
  }
  return '<div class="bar" data-bar="selected">' + tile(room.type) + what(kind.name, detail) +
    SEP + nudges + levels + SEP +
    `<button type="button" class="danger" data-delete-room="${escapeText(room.id)}">Delete <kbd>Del</kbd></button>` +
    SEP + deselect + '</div>'
}

/**
 * The bar under the grid: while a room is carried, what dropping it does;
 * while one is armed, how to place it; while one is selected, everything
 * the keys do to it, as buttons -- the only way to do those things without
 * a keyboard. Nothing otherwise. The same state that decides what the keys
 * mean decides the bar, so the two cannot disagree.
 */
export function renderDock(s: DockState): string {
  if (s.carrying) return carryingBar(s, s.carrying)
  if (s.tool) return placingBar(s, s.tool)
  if (s.selection) return selectedBar(s, s.selection)
  return ''
}
