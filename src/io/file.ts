import type { Vault } from '../domain/vault'
import { downloadBlob, DOWNLOAD_STEM } from './export'
import { parseVault, serializeVault } from './schema'

export function downloadVaultJson(v: Vault): void {
  const blob = new Blob([serializeVault(v)], { type: 'application/json' })
  downloadBlob(blob, `${DOWNLOAD_STEM}.json`)
}

export async function readVaultFile(file: File): Promise<Vault> {
  return parseVault(await file.text())
}
