// Setup global de vitest (ver vite.config.js, bloque `test`).
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin `globals: true`, testing-library no registra su auto-cleanup: hacerlo
// aquí evita que el DOM de un test contamine al siguiente.
afterEach(cleanup)

// Los tests deben ser 100% offline: cualquier fetch no mockeado es un bug del
// test, no una dependencia legítima. Los tests que necesiten red la stubean
// con vi.stubGlobal('fetch', ...).
globalThis.fetch = () => {
  throw new Error('fetch sin mockear: los tests no deben tocar la red')
}
