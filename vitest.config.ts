import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['tests/app/**', 'jsdom']],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
