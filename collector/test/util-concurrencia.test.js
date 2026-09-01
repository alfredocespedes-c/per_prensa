import { describe, expect, it } from 'vitest'
import { mapaConLimite } from '../src/adaptadores/util-concurrencia.js'

// mapaConLimite es el tope de cortesía hacia los medios: N peticiones a la vez, no más.
describe('mapaConLimite', () => {
  it('procesa todos los ítems y preserva el orden de entrada aunque terminen desordenados', async () => {
    const items = [50, 10, 30, 5, 20]
    // El más lento entra primero: si el orden dependiera de la terminación, saldría al final.
    const resultados = await mapaConLimite(items, 2, async (item) => {
      await new Promise((resolver) => setTimeout(resolver, item))
      return item * 2
    })

    expect(resultados).toEqual([100, 20, 60, 10, 40])
  })

  it('nunca hay más de `limite` tareas en vuelo', async () => {
    let enVuelo = 0
    let maximo = 0
    const liberadores = []
    let completados = 0

    const promesa = mapaConLimite([1, 2, 3, 4, 5], 2, (item) => {
      enVuelo += 1
      maximo = Math.max(maximo, enVuelo)
      // Cada tarea queda pendiente hasta que el test la libera, un tick a la vez.
      return new Promise((resolver) => {
        liberadores.push(() => {
          enVuelo -= 1
          completados += 1
          resolver(item)
        })
      })
    })

    // Se liberan de a una; entre medio se cede el event loop para que el trabajador
    // tome la siguiente tarea. El máximo observado jamás supera el límite.
    while (completados < 5) {
      await new Promise((resolver) => setTimeout(resolver, 0))
      if (liberadores.length > 0) liberadores.shift()()
    }

    expect(await promesa).toEqual([1, 2, 3, 4, 5])
    expect(maximo).toBe(2)
  })

  it('pasa el índice del ítem como segundo argumento', async () => {
    const indices = await mapaConLimite(['a', 'b', 'c'], 3, async (_, indice) => indice)
    expect(indices).toEqual([0, 1, 2])
  })

  it('un error en una tarea se propaga al llamador (no se traga)', async () => {
    await expect(
      mapaConLimite([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('falla en el ítem 2')
        return item
      }),
    ).rejects.toThrow('falla en el ítem 2')
  })

  it('lista vacía devuelve [] sin invocar la función', async () => {
    let llamadas = 0
    const resultados = await mapaConLimite([], 4, async () => { llamadas += 1 })

    expect(resultados).toEqual([])
    expect(llamadas).toBe(0)
  })

  it('un límite mayor que el número de ítems funciona (cada ítem se procesa una sola vez)', async () => {
    const vistos = []
    const resultados = await mapaConLimite([1, 2], 10, async (item) => {
      vistos.push(item)
      return item + 1
    })

    expect(resultados).toEqual([2, 3])
    expect(vistos.sort()).toEqual([1, 2])
  })
})
