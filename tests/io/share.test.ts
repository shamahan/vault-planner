import { describe, it, expect } from 'vitest'
import { createVault } from '../../src/domain/vault'
import { encodeShare, decodeShare } from '../../src/io/share'
import { serializeVault } from '../../src/io/schema'

function bigVault() {
  const v = createVault('Vault 76')
  for (let floor = 1; floor < 20; floor++) {
    v.rooms.push({ id: `e${floor}`, type: 'elevator', floor, x: 6, w: 1 })
    v.rooms.push({ id: `d${floor}`, type: 'diner', floor, x: 7, w: 9 })
  }
  return v
}

describe('share links', () => {
  it('survives a round trip', async () => {
    const v = bigVault()
    expect(await decodeShare(await encodeShare(v))).toEqual(v)
  })

  it('produces a payload that is safe in a url hash', async () => {
    const payload = await encodeShare(bigVault())
    expect(payload).toMatch(/^v1[zp]\.[A-Za-z0-9_-]+$/)
  })

  it('keeps a large vault comfortably inside a url', async () => {
    const payload = await encodeShare(bigVault())
    expect(payload.length).toBeLessThan(2000)
  })

  it('encodes the compact form, not the pretty-printed file, so the link stays short', async () => {
    const v = bigVault()
    // serializeVault's indentation is a readability feature of the
    // downloaded file, not of a link nobody reads by eye. Turn compression
    // off so the payload length reflects the raw JSON encodeShare chose,
    // and check it against the size the pretty-printed form would have
    // produced -- it must be meaningfully smaller, not just under the url
    // budget by luck of compression.
    const original = globalThis.CompressionStream
    // @ts-expect-error deliberately removing the api for this test
    delete globalThis.CompressionStream
    try {
      const payload = await encodeShare(v)
      const prettyLength = ('v1p.' + serializeVault(v)).length // rough upper bound, pre-base64
      expect(payload.length).toBeLessThan(prettyLength)
      expect(await decodeShare(payload)).toEqual(v)
    } finally {
      globalThis.CompressionStream = original
    }
  })

  it('falls back to plain base64 when compression is missing', async () => {
    const original = globalThis.CompressionStream
    // @ts-expect-error deliberately removing the api for this test
    delete globalThis.CompressionStream
    try {
      const payload = await encodeShare(createVault())
      expect(payload.startsWith('v1p.')).toBe(true)
      expect(await decodeShare(payload)).toEqual(createVault())
    } finally {
      globalThis.CompressionStream = original
    }
  })

  it('still reads a compressed payload after the fallback was used', async () => {
    const compressed = await encodeShare(createVault())
    expect(compressed.startsWith('v1z.')).toBe(true)
    expect(await decodeShare(compressed)).toEqual(createVault())
  })

  it('refuses a payload it does not recognise', async () => {
    await expect(decodeShare('v9q.AAAA')).rejects.toThrow(/link/i)
    await expect(decodeShare('garbage')).rejects.toThrow(/link/i)
  })

  it('rejects v1z with invalid deflate data (uncompressed bytes)', async () => {
    // Encode plain bytes as if they were deflate-compressed
    const plainBytes = new TextEncoder().encode('not deflate data')
    let binary = ''
    for (const byte of plainBytes) binary += String.fromCharCode(byte)
    const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const payload = 'v1z.' + base64url
    await expect(decodeShare(payload)).rejects.toThrow(/link/i)
  })

  it('rejects v1z with truncated deflate data', async () => {
    // Encode a real vault and get a compressed payload
    const compressed = await encodeShare(createVault())
    // Take only the first 10 characters of the base64url part
    const truncated = 'v1z.' + compressed.slice('v1z.'.length, 'v1z.'.length + 10)
    await expect(decodeShare(truncated)).rejects.toThrow(/link/i)
  })

  it('carries room levels', async () => {
    const v = createVault()
    v.rooms.push({ id: 'd', type: 'diner', floor: 0, x: 9, w: 3, level: 2 })
    expect((await decodeShare(await encodeShare(v))).rooms).toContainEqual(v.rooms[1])
  })
})
