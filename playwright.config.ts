import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Vite's base, and the one place the editor's path is written for this
  // suite: the specs navigate to './' rather than to '/', because the
  // preview server serves the whole site and '/' is the landing page.
  use: { baseURL: 'http://localhost:4173/planner/' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    // Waits for the editor rather than for the root: the root answers as
    // soon as the landing page is copied, which is before the build that
    // produced it is necessarily the one being tested.
    url: 'http://localhost:4173/planner/',
    // Never reuse. The command above is "build, then serve dist", so a
    // reused server is one that is still serving the dist of whatever the
    // source looked like when it started -- edit a file, run the suite, and
    // it passes against the old build. That cost a bogus green on a layout
    // fix once already: the test was checked for vacuity against a stale
    // server, reported passing without the fix, and looked like a test that
    // asserted nothing. A rebuild per run takes under a second.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
