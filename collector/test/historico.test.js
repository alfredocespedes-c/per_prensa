import { describe, expect, it } from 'vitest'
import { actualizarHistorico } from '../src/dominio/historico.js'

// El histórico rota por antigüedad respecto de "ahora" (la función usa la hora
// real del sistema), así que las fechas de los fixtures se expresan como
// "hace N días".
function haceDias(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

function noticia({ id, dias, analisis, eventId } = {}) {
  return {
    id,
    fecha: haceDias(dias),
    medioId: 'la-tercera',
    seccionId: 'escrita',
    analisis,
    eventId,
  }
}

describe('actualizarHistorico', () => {
  it('una noticia actual entra al histórico como registro resumido', () => {
    // El histórico no guarda la noticia completa (titular, extracto, etc.):
    // solo el resumen analítico necesario para estadísticas futuras.
    const n = noticia({
      id: 'https://m.cl/a',
      dias: 1,
      analisis: { sentimiento: 'negativa', categorias: ['emergencias'], regiones: ['maule'], riesgo: 'alto' },
      eventId: 'ev-1',
    })
    const { registros } = actualizarHistorico(null, [n])
    expect(registros).toEqual([
      {
        id: 'https://m.cl/a',
        fecha: n.fecha,
        medioId: 'la-tercera',
        seccionId: 'escrita',
        sentimiento: 'negativa',
        categorias: ['emergencias'],
        regiones: ['maule'],
        riesgo: 'alto',
        eventId: 'ev-1',
      },
    ])
  })

  it('una noticia sin análisis entra igual, con los campos analíticos en null/vacío', () => {
    // El enriquecimiento es fail-open (puede devolver null): eso no debe
    // impedir que la noticia quede registrada en el histórico.
    const { registros } = actualizarHistorico(null, [noticia({ id: 'https://m.cl/sin', dias: 1 })])
    expect(registros[0].sentimiento).toBeNull()
    expect(registros[0].categorias).toEqual([])
    expect(registros[0].regiones).toEqual([])
    expect(registros[0].riesgo).toBeNull()
    expect(registros[0].eventId).toBeNull()
  })

  it('un registro previo que ya salió de la ventana de publicación permanece en el histórico', () => {
    // Ese es el propósito del histórico: retener lo que la ventana móvil de
    // ~100 noticias ya expulsó.
    const previo = { id: 'https://m.cl/vieja', fecha: haceDias(30), medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null }
    const { registros } = actualizarHistorico({ version: 1, registros: [previo] }, [noticia({ id: 'https://m.cl/nueva', dias: 1 })])
    expect(registros.map((r) => r.id)).toContain('https://m.cl/vieja')
  })

  it('los registros más viejos que el máximo de días rotan (desaparecen)', () => {
    const dentroDeVentana = { id: 'https://m.cl/ok', fecha: haceDias(10), medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null }
    const vencido = { id: 'https://m.cl/vencido', fecha: haceDias(20), medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null }
    const { registros } = actualizarHistorico({ version: 1, registros: [dentroDeVentana, vencido] }, [], 15)
    expect(registros.map((r) => r.id)).toEqual(['https://m.cl/ok'])
  })

  it('una noticia actual con fecha más vieja que el máximo tampoco entra', () => {
    // La rotación aplica también a la entrada nueva: el histórico nunca
    // acumula registros fuera de la ventana de retención.
    const { registros } = actualizarHistorico(null, [noticia({ id: 'https://m.cl/antigua', dias: 20 })], 15)
    expect(registros).toEqual([])
  })

  it('no duplica un registro ya presente: la versión actual pisa a la previa', () => {
    // Misma noticia vista en dos corridas (p.ej. re-enriquecida): debe quedar
    // una sola vez, con los datos de la corrida más reciente.
    const previo = { id: 'https://m.cl/x', fecha: haceDias(2), medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null }
    const actual = noticia({ id: 'https://m.cl/x', dias: 2, analisis: { sentimiento: 'positiva', categorias: [], regiones: [], riesgo: 'bajo' } })
    const { registros } = actualizarHistorico({ version: 1, registros: [previo] }, [actual])
    expect(registros).toHaveLength(1)
    expect(registros[0].sentimiento).toBe('positiva')
  })

  it('ordena por fecha descendente y desempata por id ascendente', () => {
    const mismaFecha = haceDias(5)
    const previos = [
      { id: 'https://m.cl/b', fecha: mismaFecha, medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null },
      { id: 'https://m.cl/a', fecha: mismaFecha, medioId: 'm', seccionId: 'otros', sentimiento: null, categorias: [], regiones: [], riesgo: null, eventId: null },
    ]
    const { registros } = actualizarHistorico({ version: 1, registros: previos }, [noticia({ id: 'https://m.cl/reciente', dias: 1 })])
    expect(registros.map((r) => r.id)).toEqual(['https://m.cl/reciente', 'https://m.cl/a', 'https://m.cl/b'])
  })

  it('con histórico previo null o vacío devuelve solo las actuales, con version 1', () => {
    // Primer arranque (rama data recién bootstrapeada): no debe fallar.
    expect(actualizarHistorico(null, [])).toEqual({ version: 1, registros: [] })
    expect(actualizarHistorico({ version: 1, registros: [] }, []).registros).toEqual([])
    const desdeNull = actualizarHistorico(null, [noticia({ id: 'https://m.cl/1', dias: 1 })])
    expect(desdeNull.version).toBe(1)
    expect(desdeNull.registros).toHaveLength(1)
  })
})
