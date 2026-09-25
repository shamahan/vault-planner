import './style.css'
import { Store, loadSaved } from './app/state'
import { mountPanels } from './app/panels'
import { mountCanvas } from './app/interactions'
import { chooseBetweenLayouts, confirmNewVault } from './app/dialogs'
import { createVault, type Vault } from './domain/vault'
import { downloadVaultJson, readVaultFile } from './io/file'
import { downloadBlob, DOWNLOAD_STEM, exportSvgSource, svgToPngBlob } from './io/export'
import { encodeShare, decodeShare } from './io/share'

/**
 * The startup rule, as a pure decision: never hand someone a different
 * vault than the one they had without asking, but don't ask when there is
 * nothing of theirs to lose. `incoming` is `null` for "there was no share
 * link to read" -- that and "the link failed to decode" are the only two
 * ways a link can be absent, and a decode failure is handled by the caller
 * before this is ever consulted, so this function only has to weigh a
 * link that decoded fine against whatever, if anything, was saved.
 */
export function pickStartupVault(saved: Vault | null, incoming: Vault | null): 'incoming' | 'saved' | 'ask' {
  if (!incoming) return 'saved'
  if (!saved || saved.rooms.length <= 1) return 'incoming'
  return 'ask'
}

function clearShareHash(): void {
  history.replaceState(null, '', location.pathname + location.search)
}

/**
 * "New" has to clear more than the vault in memory. The autosave takes care
 * of itself -- the blank vault is written over the old one on the way
 * through the store -- but a layout shared earlier leaves its entire payload
 * in the address bar, and startup prefers a link to an autosave holding
 * nothing but the vault door (see pickStartupVault). Without dropping the
 * hash the editor looks emptied and the next reload puts the old layout
 * straight back, which is the one thing New promises will not happen.
 */
export function startNewVault(store: Store): void {
  store.replaceVault(createVault())
  clearShareHash()
}

async function initialVault(): Promise<Vault> {
  const saved = loadSaved()
  const hash = location.hash.slice(1)
  if (!hash) return saved ?? createVault()

  let incoming: Vault
  try {
    incoming = await decodeShare(hash)
  } catch (error) {
    alert(error instanceof Error ? error.message : 'This link could not be read.')
    return saved ?? createVault()
  }

  switch (pickStartupVault(saved, incoming)) {
    case 'incoming':
      // Otherwise a reload re-asks: the hash is still there, now weighing
      // the link against the copy of it that was just accepted and saved.
      clearShareHash()
      return incoming
    case 'saved':
      // pickStartupVault only returns 'saved' when there is no incoming
      // vault to weigh against, and we already know there is one here.
      return saved ?? createVault()
    case 'ask':
      if ((await chooseBetweenLayouts(incoming, saved as Vault)) === 'incoming') return incoming
      clearShareHash()
      return saved as Vault
  }
}

async function main(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app')
  if (!root) return

  const store = new Store(await initialVault())
  mountPanels(root, store)
  mountCanvas(root.querySelector<HTMLElement>('[data-canvas]')!, store)

  root.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!button) return
    const vault = store.state.vault

    try {
      switch (button.dataset.action) {
        case 'new':
          if (await confirmNewVault(store)) startNewVault(store)
          break
        case 'save':
          downloadVaultJson(vault)
          break
        case 'open': {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'application/json,.json'
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
              store.replaceVault(await readVaultFile(file))
            } catch (error) {
              alert(error instanceof Error ? error.message : 'That file could not be read.')
            }
          }
          input.click()
          break
        }
        case 'share': {
          const url = `${location.origin}${location.pathname}#${await encodeShare(vault)}`
          // Put the link in the address bar first: if the clipboard refuses
          // (an insecure origin, an unfocused document, no permission), the
          // person still has a working link to copy by hand instead of the
          // click doing nothing at all.
          history.replaceState(null, '', url)
          if (!navigator.clipboard) {
            throw new Error('This browser will not copy to the clipboard. The link is in the address bar.')
          }
          await navigator.clipboard.writeText(url)
          alert('Link copied to the clipboard.')
          break
        }
        case 'export-png':
          downloadBlob(await svgToPngBlob(exportSvgSource(vault)), `${DOWNLOAD_STEM}.png`)
          break
        case 'undo':
          store.undo()
          break
        case 'redo':
          store.redo()
          break
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'That could not be done.')
    }
  })

  window.addEventListener('dragover', (event) => {
    // Preventing default unconditionally blocks dropping text into the
    // vault-name field along with everything else; only claim the drag when
    // it is actually carrying a file.
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
  })
  window.addEventListener('drop', async (event) => {
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    event.preventDefault()
    try {
      store.replaceVault(await readVaultFile(file))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'That file could not be read.')
    }
  })
}

void main()
