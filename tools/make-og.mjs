/**
 * Renders tools/og-image.html to site/og.png, the card social platforms and
 * chat apps show when someone pastes a link to the site.
 *
 *     node tools/make-og.mjs
 *
 * The PNG is committed, because `site/` is copied to the deploy verbatim and
 * there is no build step there to generate it. Committing a binary nobody
 * can reproduce is the thing worth avoiding, not committing the binary --
 * hence this script and its source file beside it.
 *
 * Chromium comes from the Playwright install the e2e suite already needs,
 * so this adds no dependency. It is not wired into `npm run build`: the card
 * changes when the wording or the brand does, which is rare and deliberate,
 * and a build that silently rewrote a committed binary on every run would be
 * worse than remembering to run this.
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The layout box, in CSS pixels. 1200x630 is the 1.91:1 frame every social
// platform crops to. The file itself comes out at twice this in each
// direction -- see deviceScaleFactor below -- and site/index.html declares
// those real pixel dimensions, which is what og:image:width means.
const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2

const source = new URL('./og-image.html', import.meta.url)
const output = fileURLToPath(new URL('../site/og.png', import.meta.url))

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  // Social cards are shown at whatever pixel density the reader's screen
  // has, and are routinely scaled up in previews. Two device pixels per CSS
  // pixel is the difference between crisp 9px room labels and a smear. The
  // aspect ratio is what platforms crop to, and doubling both sides leaves
  // it at 1.91:1; the declared og:image:width follows the file, since that
  // property means the image's real pixel width and nothing else.
  deviceScaleFactor: SCALE,
})

await page.goto(source.href, { waitUntil: 'load' })

// The card is set in Archivo and JetBrains Mono from Google Fonts. Shooting
// before they arrive bakes a fallback-font card into the repository, and the
// mistake is invisible afterwards -- the PNG looks like a deliberate choice.
// `display=block` in the stylesheet keeps the text from painting in a
// fallback at all, and this waits for the real thing.
await page.evaluate(() => document.fonts.ready)

await page.locator('.card').screenshot({ path: output })
await browser.close()

console.log(`wrote ${output} — ${WIDTH * SCALE}x${HEIGHT * SCALE} (a ${WIDTH}x${HEIGHT} card at ${SCALE}x)`)
