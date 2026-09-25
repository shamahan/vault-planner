/**
 * Renders site/favicon.svg to the two bitmaps that sit beside it:
 *
 *     node tools/make-icons.mjs
 *
 *   site/favicon.ico          32x32, for a browser that cannot draw an SVG
 *                             favicon, and for whatever asks for
 *                             /favicon.ico without reading the page
 *   site/apple-touch-icon.png 180x180, the home-screen icon iOS asks for
 *
 * Committed for the reason og.png is: site/ is copied to the deploy verbatim
 * and has no build step to make them. The SVG is the source; these are its
 * renders, and this script is how they are reproduced.
 *
 * Chromium comes from the Playwright install the e2e suite already needs,
 * as in make-og.mjs.
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const site = (name) => fileURLToPath(new URL(`../site/${name}`, import.meta.url))
const svg = readFileSync(site('favicon.svg'), 'utf8')
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const browser = await chromium.launch()
const page = await browser.newPage({
  deviceScaleFactor: 1,
  // favicon.svg darkens its amber for a light browser. Headless Chromium
  // reports light by default, which would bake the light-theme colour into
  // both files -- and neither is ever shown on a light ground: the .ico
  // stands in for the SVG on dark and light tabs alike, and the touch icon
  // carries its own dark plate.
  colorScheme: 'dark',
})

async function render(size, { plate, inset }) {
  const mark = size - inset * 2
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0;background:${plate ?? 'transparent'}">` +
    `<img src="${src}" width="${mark}" height="${mark}" style="display:block;margin:${inset}px"></body>`,
  )
  await page.locator('img').evaluate((img) => img.decode())
  return page.screenshot({ omitBackground: !plate })
}

// An .ico is a directory of images, and a PNG may stand in for the bitmap in
// an entry -- every browser that reads .ico at all reads that form. One entry
// at 32 is enough: a tab at 16 scales it down, and anything sharper than that
// is what the SVG is for.
const png32 = await render(32, { inset: 0 })
const header = Buffer.alloc(6 + 16)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // one image
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt8(0, 8) // no palette
header.writeUInt8(0, 9) // reserved
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png32.length, 14)
header.writeUInt32LE(header.length, 18) // the image starts right after this
writeFileSync(site('favicon.ico'), Buffer.concat([header, png32]))

// iOS fills a transparent touch icon with black and rounds the corners
// itself, so the plate is the page's own ground, square, and the mark keeps
// clear of the corners the mask will take.
writeFileSync(site('apple-touch-icon.png'), await render(180, { plate: '#0e1412', inset: 24 }))

await browser.close()
console.log('wrote site/favicon.ico (32x32) and site/apple-touch-icon.png (180x180)')
