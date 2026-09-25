/**
 * Lays site/ over the build output, turning dist/ into the directory the
 * deploy publishes: the landing page, the CNAME that claims the domain and
 * the rest of the root, with the editor in dist/planner where Vite put it.
 *
 * This is the tail of `npm run build`, so dist/ is the whole site from the
 * moment it exists -- on CI and on a laptop alike, assembled by this code
 * rather than by a shell line that only the workflow had.
 *
 * The copy is written out rather than delegated to fs.cp, which is still
 * flagged experimental on the Node the workflow pins and would warn on
 * every deploy. Recursing over two directories is not worth a warning.
 */
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

function copyInto(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    const dest = join(to, entry.name)
    if (entry.isDirectory()) copyInto(src, dest)
    else copyFileSync(src, dest)
  }
}

copyInto('site', 'dist')
console.log('site/ copied over dist/')
