// Setup global de vitest (ver vitest.config.js).
//
// Los tests deben ser 100% offline y deterministas: cualquier fetch no mockeado
// es un bug del test. Los tests que necesiten "red" la stubean con
// vi.stubGlobal('fetch', ...), que pisa este stub y lo restaura al terminar.
globalThis.fetch = () => {
  throw new Error('fetch sin mockear: los tests no deben tocar la red')
}
