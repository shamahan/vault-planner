import type { Vault } from '../domain/vault'
import { parseVault, SchemaError } from './schema'

const COMPRESSED = 'v1z.'
const PLAIN = 'v1p.'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function through(
  stream: { readable: ReadableStream<any>; writable: WritableStream<any> },
  input: Uint8Array
) {
  const writer = stream.writable.getWriter()
  writer.write(input).catch(() => {})
  writer.close().catch(() => {})
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const size = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export async function encodeShare(v: Vault): Promise<string> {
  // Unlike serializeVault (used for the downloaded file, where the
  // indentation is a readability feature), the link has no reader who
  // benefits from pretty-printing -- only a length limit -- so this encodes
  // the same fields with no indent argument, cutting the payload roughly in
  // half before it is even compressed.
  const compact = JSON.stringify({ schemaVersion: v.schemaVersion, name: v.name, rooms: v.rooms })
  const bytes = new TextEncoder().encode(compact)
  if (typeof CompressionStream === 'function') {
    const packed = await through(new CompressionStream('deflate-raw'), bytes)
    return COMPRESSED + toBase64Url(packed)
  }
  return PLAIN + toBase64Url(bytes)
}

export async function decodeShare(payload: string): Promise<Vault> {
  let bytes: Uint8Array
  try {
    if (payload.startsWith(COMPRESSED)) {
      const packed = fromBase64Url(payload.slice(COMPRESSED.length))
      // DecompressionStream may not exist in older runtimes; errors are caught below and wrapped in SchemaError
      bytes = await through(new DecompressionStream('deflate-raw'), packed)
    } else if (payload.startsWith(PLAIN)) {
      bytes = fromBase64Url(payload.slice(PLAIN.length))
    } else {
      throw new SchemaError('This link is not a vault layout.')
    }
  } catch (error) {
    if (error instanceof SchemaError) throw error
    throw new SchemaError('This link is damaged and cannot be read.')
  }
  return parseVault(new TextDecoder().decode(bytes))
}
