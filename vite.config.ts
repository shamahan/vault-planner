import { defineConfig } from 'vite'

export default defineConfig({
  // The site lives on a custom domain, where the repository name is not part
  // of any URL: dist/ is served at the root of vault.shamahan.com. So the
  // editor's /planner prefix has to be a real directory rather than something
  // GitHub prepends, which is what outDir arranges -- and base has to match
  // it, or the built index.html asks for its assets at the wrong path and the
  // page comes up blank. playwright.config.ts pins the same path.
  base: '/planner/',
  build: { outDir: 'dist/planner' },
})
