import type { Vault } from '../domain/vault'
import { downloadVaultJson } from '../io/file'
import type { Store } from './state'

/**
 * Plain confirm() dialogs. They are ugly, but they are the browser's own and
 * cannot be missed; a prettier modal is a change to make once the rest works.
 */
export async function confirmNewVault(store: Store): Promise<boolean> {
  const vault = store.state.vault
  if (vault.rooms.length <= 1) return true
  const rooms = vault.rooms.length - 1
  const keep = confirm(
    `Start a new vault?\n\nThis layout holds ${rooms} rooms and is saved in this ` +
    `browser only. Starting over replaces it and it cannot be recovered.\n\n` +
    `OK to download it as JSON first, Cancel to go straight on.`,
  )
  if (keep) downloadVaultJson(vault)
  return confirm('Clear the vault and start over?')
}

export async function confirmCascade(count: number): Promise<boolean> {
  return confirm(
    `Delete it together with the ${count - 1} ${count - 1 === 1 ? 'room' : 'rooms'} ` +
    `that depend on it?\n\nOne Ctrl+Z puts them all back.`,
  )
}

export async function chooseBetweenLayouts(
  incoming: Vault, current: Vault,
): Promise<'incoming' | 'current'> {
  const take = confirm(
    `This link carries a different vault.\n\n` +
    `Link: ${incoming.rooms.length} rooms.\n` +
    `Open here: ${current.rooms.length} rooms.\n\n` +
    `OK opens the link and replaces what you have. Cancel keeps yours.`,
  )
  return take ? 'incoming' : 'current'
}
