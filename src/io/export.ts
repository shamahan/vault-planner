import { renderScene } from '../render/scene'
import type { Vault } from '../domain/vault'

/**
 * No title. The picture used to be headed with the vault's name, which was
 * fine while there was a field to set it; with that field gone every export
 * came out headed "Vault 111" -- a name nobody chose, on everybody's
 * picture. The legend stays, and it is the part that does the work: it is
 * what makes a schematic readable to whoever it was sent to.
 */
export function exportSvgSource(v: Vault): string {
  return renderScene(v, { legend: true })
}

/**
 * Both downloads are named after the editor rather than after the vault,
 * which has no name to take one from any more. Being a constant also
 * dissolves the problem safeFilename() used to solve: it sanitised a name
 * that a hand-edited JSON file could have filled with "../../etc/passwd",
 * and there is now nothing from the file in the filename to sanitise.
 */
export const DOWNLOAD_STEM = 'vault-planner'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

/** Draws the very same SVG into a canvas. No second renderer, so no drift. */
export async function svgToPngBlob(svg: string, scale = 3): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('The picture could not be drawn.'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.width * scale
    canvas.height = image.height * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot draw the picture.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The picture came out empty.'))),
        'image/png',
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
