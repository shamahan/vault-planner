// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createVault } from '../../src/domain/vault'
import { exportSvgSource, DOWNLOAD_STEM } from '../../src/io/export'
import { readVaultFile } from '../../src/io/file'
import { serializeVault } from '../../src/io/schema'

// Polyfill Blob.text() for jsdom, which lacks this standard API (production does not need it)
if (!Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
      reader.readAsText(this)
    })
  }
}

describe('export', () => {
  it('puts the legend into the picture and no name over it', () => {
    const svg = exportSvgSource(createVault('Vault 76'))
    expect(svg).toContain('ROOMS IN THIS VAULT')
    // The name survives in the format but is no longer settable, so heading
    // every exported picture with it just published a default nobody chose.
    expect(svg).not.toContain('Vault 76')
  })

  it('never draws candidate marks in an export, even with a tool armed elsewhere', () => {
    // exportSvgSource never asks renderScene for candidates -- there is no
    // tool armed in an exported picture, so there is nothing to highlight.
    const svg = exportSvgSource(createVault())
    expect(svg).not.toContain('stroke-dasharray="3 3"')
  })

  it('exports the hover ghost hidden -- only the browser layer ever reveals it', () => {
    // renderScene always emits the ghost slot (screen and export share one
    // renderer), but exportSvgSource never touches the DOM to reveal it, so
    // an exported picture must carry it exactly as rendered: hidden.
    const svg = exportSvgSource(createVault())
    expect(svg).toMatch(/<rect data-ghost[^>]*visibility="hidden"/)
  })

  it('is well-formed XML, which svgToPngBlob loads as strict XML unlike inline HTML', () => {
    // A DOMParser catches what the earlier assertions here cannot: browsers
    // parse inline SVG leniently as HTML but parse an <img>/Image source as
    // strict XML, so a value-less attribute (legal HTML, illegal XML) once
    // slipped through every string-matching test here yet still broke every
    // PNG and SVG export in a real browser -- svgToPngBlob's Image.onerror
    // rejected silently, with nothing at the unit level to catch it.
    const svg = exportSvgSource(createVault())
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('writes an svg a browser will accept on its own', () => {
    const svg = exportSvgSource(createVault())
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('names both downloads after the editor, taking nothing from the file', () => {
    // A hand-edited JSON file could carry any name at all; none of it
    // reaches the filename, so there is no sanitising left to get wrong.
    expect(`${DOWNLOAD_STEM}.png`).toBe('vault-planner.png')
    expect(`${DOWNLOAD_STEM}.json`).toBe('vault-planner.json')
  })

  it('reads a vault back from a file', async () => {
    const v = createVault('Vault 76')
    const file = new File([serializeVault(v)], 'vault.json', { type: 'application/json' })
    expect(await readVaultFile(file)).toEqual(v)
  })

  it('reports a broken file instead of guessing', async () => {
    const file = new File(['nonsense'], 'vault.json', { type: 'application/json' })
    await expect(readVaultFile(file)).rejects.toThrow(/not JSON/i)
  })
})
