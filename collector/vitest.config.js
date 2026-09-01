import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'text-summary'],
      // Trinquete: fijado justo bajo lo medido (88/87/80/92 al activarlo) para
      // frenar regresiones sin fricción. Subir al agregar cobertura, no bajar.
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 78,
        functions: 90,
      },
    },
  },
})
