import { test, expect } from '@playwright/test'
import { CELLS_PER_FLOOR } from '../src/domain/grid'
import { CELL_PX, FLOOR_GAP_PX, FLOOR_PX, SCENE_GUTTER_PX, SCENE_PAD_PX } from '../src/render/theme'

/**
 * Every navigation here is `./`, meaning baseURL itself, which is the
 * editor at /planner/. It cannot be '/': the preview server now serves the
 * whole site, so the root of the origin is the landing page, and an editor
 * test that went there would find no editor and fail four different ways
 * without ever saying why. Relative also keeps the path in exactly one
 * place -- playwright.config.ts, pinned to Vite's base.
 */

test('place a room, reload, and export a picture that is not empty', async ({ page }) => {
  await page.goto('./')

  // The vault starts with its door and nothing else.
  await expect(page.locator('[data-room-id]')).toHaveCount(1)

  await page.click('[data-place-type="elevator"]')
  const door = page.locator('[data-room-id="door"]')
  const box = await door.boundingBox()
  if (!box) throw new Error('the vault door was not drawn')
  await page.mouse.click(box.x + box.width + 6, box.y + box.height / 2)
  await expect(page.locator('[data-room-id]')).toHaveCount(2)

  // The autosave survives a reload.
  await page.reload()
  await expect(page.locator('[data-room-id]')).toHaveCount(2)

  // The PNG export produces real bytes. This is the part no unit test can reach.
  const download = page.waitForEvent('download')
  await page.click('[data-action="export-png"]')
  const file = await download
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const bytes = Buffer.concat(chunks)

  expect(bytes.length).toBeGreaterThan(2000)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
})

test('each pane scrolls on its own and the page does not scroll at all', async ({ page }) => {
  // Short enough that the room list and the 25 floors both overflow.
  await page.setViewportSize({ width: 1100, height: 600 })
  await page.goto('./')

  const measured = await page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector) as HTMLElement
      return {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
      }
    }
    return {
      body: (document.querySelector('.body') as HTMLElement).clientHeight,
      palette: read('.palette'),
      scene: read('.scene-scroll'),
      problems: read('.problems'),
    }
  })

  // The load-bearing assertion. panels.ts renders each panel inside a
  // wrapper div, and while those wrappers were in normal flow the wrapper
  // grew to the room list's full content height instead of the viewport's
  // -- so .palette measured roughly 1400px here, its own overflow never
  // engaged, and the surplus went to the document, which scrolled the
  // toolbar off the top the moment anyone used the wheel over the panel.
  expect(measured.body).toBeGreaterThan(0)
  expect(measured.body).toBeLessThan(600)
  for (const pane of [measured.palette, measured.scene, measured.problems]) {
    expect(pane.overflowY).toBe('auto')
    expect(pane.clientHeight).toBe(measured.body)
  }

  // The two panes with more content than room hold it inside themselves.
  expect(measured.palette.scrollHeight).toBeGreaterThan(measured.palette.clientHeight)
  expect(measured.scene.scrollHeight).toBeGreaterThan(measured.scene.clientHeight)

  // And using the wheel over the room list moves the room list, nothing else.
  const toolbarBefore = await page.locator('.toolbar').boundingBox()
  await page.mouse.move(120, 300)
  await page.mouse.wheel(0, 1200)
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.palette')!.scrollTop))
    .toBeGreaterThan(0)

  const toolbarAfter = await page.locator('.toolbar').boundingBox()
  expect(toolbarAfter!.y).toBe(toolbarBefore!.y)
  expect(await page.evaluate(() => document.querySelector('.scene-scroll')!.scrollTop)).toBe(0)
})

test('every room name fits on one line, with its details on the next', async ({ page }) => {
  await page.goto('./')

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.palette button')].map((button) => {
      const label = button.querySelector('.label') as HTMLElement
      const hint = button.querySelector('.hint') as HTMLElement
      // A Range counts line boxes. The label itself is a grid item, so it is
      // blockified and getClientRects() on the element always returns one
      // rect whether the text wrapped or not.
      const range = document.createRange()
      range.selectNodeContents(label)
      return {
        name: label.textContent ?? '',
        lines: range.getClientRects().length,
        labelBottom: label.getBoundingClientRect().bottom,
        hintTop: hint.getBoundingClientRect().top,
      }
    }),
  )

  expect(rows.length).toBeGreaterThan(20)
  for (const row of rows) {
    // The name had to share its line with the S.P.E.C.I.A.L. letter, the
    // population requirement and the width, so "Water Purification" wrapped
    // to two lines while the grey text stayed beside it.
    expect(row.lines, `"${row.name}" wrapped onto ${row.lines} lines`).toBe(1)
    expect(row.hintTop, `"${row.name}" keeps its details beside the name`)
      .toBeGreaterThanOrEqual(row.labelBottom)
  }
})

test('arming a room leaves the palette scrolled where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 })
  await page.goto('./')

  await page.mouse.move(120, 300)
  await page.mouse.wheel(0, 900)
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.palette')!.scrollTop))
    .toBeGreaterThan(200)

  // Click something already on screen: Playwright scrolls a button into
  // view before clicking it, which would move the list itself and make the
  // measurement below meaningless.
  const visible = await page.evaluate(() => {
    const palette = document.querySelector('.palette') as HTMLElement
    const box = palette.getBoundingClientRect()
    const button = [...palette.querySelectorAll<HTMLElement>('[data-place-type]')].find((b) => {
      const r = b.getBoundingClientRect()
      return r.top >= box.top && r.bottom <= box.bottom
    })
    return { type: button?.dataset.placeType ?? null, scrollTop: palette.scrollTop }
  })
  expect(visible.type).not.toBeNull()

  const button = page.locator(`[data-place-type="${visible.type}"]`)
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')

  // Arming a room repaints the panels. While that repaint replaced the
  // palette's markup wholesale it destroyed the element holding the scroll
  // position, so picking a room from halfway down the list snapped the list
  // back to the top.
  expect(await page.evaluate(() => document.querySelector('.palette')!.scrollTop))
    .toBe(visible.scrollTop)
})

test('drag a room onto another to swap them, then onto free cells to move it', async ({ page }) => {
  await page.goto('./')

  const scene = page.locator('.scene > svg')
  // The centre of a cell on the page, from the scene's own geometry, scaled
  // by however wide the svg is actually drawn.
  const cell = async (floor: number, x: number): Promise<{ x: number; y: number }> => {
    const box = await scene.boundingBox()
    if (!box) throw new Error('the scene was not drawn')
    const scale = box.width / (SCENE_GUTTER_PX + CELLS_PER_FLOOR * CELL_PX + SCENE_PAD_PX)
    return {
      x: box.x + (SCENE_GUTTER_PX + (x + 0.5) * CELL_PX) * scale,
      y: box.y + (SCENE_PAD_PX + floor * (FLOOR_PX + FLOOR_GAP_PX) + FLOOR_PX / 2) * scale,
    }
  }
  const place = async (type: string, floor: number, x: number): Promise<void> => {
    // The palette button toggles: clicking an armed one puts it down.
    const button = page.locator(`[data-place-type="${type}"]`)
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click()
    const at = await cell(floor, x)
    await page.mouse.click(at.x, at.y)
  }
  // A room with levels is titled "Diner, level 1"; the elevator and the
  // door carry no level. Anchored at both ends either way, so "Diner"
  // never matches some other room with the word inside its name.
  const room = (name: string) =>
    page.locator('[data-room-id]', { has: page.locator('title', { hasText: new RegExp(`^${name}(, level \\d)?$`) }) })
  const dragFromTo = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }

  // Floor 1: door, elevator at 9, diner [10,13), living room [13,16).
  // Floor 2: an elevator under the first, and nothing else.
  await place('elevator', 0, 9)
  await place('elevator', 1, 9)
  await place('diner', 0, 10)
  await place('living_room', 0, 13)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-room-id]')).toHaveCount(5)

  // The diner onto the living room: the same width, so they trade places.
  await dragFromTo(await cell(0, 11), await cell(0, 14))
  const diner = await room('Diner').boundingBox()
  const living = await room('Living Room').boundingBox()
  expect(diner!.x).toBeGreaterThan(living!.x)

  // The diner, now at the end of the row, onto the empty floor below.
  // Strict rules slide it to the one spot there that connects: against
  // the elevator, at cell 10.
  await dragFromTo(await cell(0, 14), await cell(1, 18))
  const moved = await room('Diner').boundingBox()
  expect(moved!.y).toBeGreaterThan(living!.y)
  expect(moved!.x).toBeGreaterThan((await cell(1, 9)).x)
  expect(moved!.x).toBeLessThan((await cell(1, 10)).x)
})

