import { describe, it, expect } from 'vitest'
import {
  MAX_ACTIVOS_POR_TIPO,
  acotarConsulta,
  esConceptoValido,
  normalizarConcepto,
  plegarConcepto,
  sanearConceptos,
} from '../src/dominio/conceptos.js'
import { construirDetector } from '../src/dominio/menciones.js'

const incluir = (...textos) => textos.map((texto) => ({ texto, tipo: 'incluir' }))

describe('normalizarConcepto', () => {
  it('colapsa espacios internos y recorta', () => {
    expect(normalizarConcepto('  Parque   Nacional ')).toBe('Parque Nacional')
  })

  it('normaliza a NFC', () => {
    // Un texto pegado desde Word/macOS viene descompuesto (a + acento combinante).
    // Sin NFC el patrón resultante no matchea NUNCA y el concepto rinde cero
    // noticias en silencio.
    const nfd = 'Corporación Nacional Forestal'.normalize('NFD')
    expect(nfd.length).toBeGreaterThan('Corporación Nacional Forestal'.length)
    expect(normalizarConcepto(nfd)).toBe('Corporación Nacional Forestal')
  })

  it('tolera null y no-strings', () => {
    expect(normalizarConcepto(null)).toBe('')
    expect(normalizarConcepto(undefined)).toBe('')
  })
})

describe('un concepto en NFC sí detecta menciones (regresión del pegado desde Word)', () => {
  it('el concepto normalizado matchea el texto real', () => {
    const nfd = 'Corporación Nacional Forestal'.normalize('NFD')
    const texto = 'la Corporación Nacional Forestal informó'
    // Sin normalizar: no detecta.
    expect(construirDetector([nfd]).detecta(texto)).toBe(false)
    // Normalizado por el dominio: sí.
    expect(construirDetector([normalizarConcepto(nfd)]).detecta(texto)).toBe(true)
  })
})

describe('esConceptoValido', () => {
  it('rechaza vacíos y solo-espacios', () => {
    expect(esConceptoValido('')).toBe(false)
    expect(esConceptoValido('   ')).toBe(false)
    expect(esConceptoValido(null)).toBe(false)
  })

  it('rechaza por largo mínimo y máximo', () => {
    expect(esConceptoValido('ab')).toBe(false)
    expect(esConceptoValido('abc')).toBe(true)
    expect(esConceptoValido('x'.repeat(81))).toBe(false)
  })

  it('rechaza frases de más de 8 palabras', () => {
    expect(esConceptoValido('una frase larguísima con demasiadas palabras para ser concepto')).toBe(false)
  })

  it('rechaza texto sin ningún alfanumérico', () => {
    // '...' sobrevive al escapado de menciones.js y se vuelve ruido puro.
    expect(esConceptoValido('...')).toBe(false)
    expect(esConceptoValido('---')).toBe(false)
  })

  it('rechaza comillas: romperían la consulta de Google News', () => {
    // fuente-google-news.js arma `"a" OR "b"`; una comilla adentro rompe la sintaxis
    // y tumba la red de seguridad de cobertura.
    expect(esConceptoValido('incendio" OR "')).toBe(false)
    expect(esConceptoValido('“forestal”')).toBe(false)
  })

  it('acepta conceptos multipalabra reales', () => {
    expect(esConceptoValido('Corporación Nacional Forestal')).toBe(true)
    expect(esConceptoValido('Parque Nacional')).toBe(true)
  })
})

describe('sanearConceptos', () => {
  it('separa incluir de excluir', () => {
    const { incluir: inc, excluir: exc } = sanearConceptos([
      { texto: 'CONAF', tipo: 'incluir' },
      { texto: 'CMPC', tipo: 'excluir' },
    ])
    expect(inc).toEqual(['CONAF'])
    expect(exc).toEqual(['CMPC'])
  })

  it('descarta inválidos y los cuenta', () => {
    const r = sanearConceptos(incluir('CONAF', '  ', 'ab', '...'))
    expect(r.incluir).toEqual(['CONAF'])
    expect(r.descartados).toBe(3)
  })

  it('deduplica ignorando mayúsculas y tildes', () => {
    const r = sanearConceptos(incluir('CONAF', 'conaf', 'Conaf', 'CÓNAF'))
    expect(r.incluir).toEqual(['CONAF'])
    expect(r.descartados).toBe(3)
  })

  it('ordena por largo descendente para la alternancia del regex', () => {
    const r = sanearConceptos(incluir('CONAF', 'Corporación Nacional Forestal', 'forestal'))
    expect(r.incluir).toEqual(['Corporación Nacional Forestal', 'forestal', 'CONAF'])
  })

  it('conserva el orden de creación en incluirPorPrioridad', () => {
    const r = sanearConceptos(incluir('CONAF', 'Corporación Nacional Forestal', 'forestal'))
    expect(r.incluirPorPrioridad).toEqual(['CONAF', 'Corporación Nacional Forestal', 'forestal'])
  })

  it('trunca por tope respetando el orden de creación, no el largo', () => {
    // Recortar por largo sacaría 'CONAF' (el más corto) primero, que es justamente el
    // concepto más importante del proyecto.
    const r = sanearConceptos(incluir('CONAF', 'Parque Nacional', 'Corporación Nacional Forestal'), {
      maxActivosPorTipo: 2,
    })
    expect(r.incluirPorPrioridad).toEqual(['CONAF', 'Parque Nacional'])
    expect(r.incluir).toContain('CONAF')
    expect(r.descartados).toBe(1)
  })

  it('tolera entrada vacía o nula', () => {
    expect(sanearConceptos(null).incluir).toEqual([])
    expect(sanearConceptos([]).excluir).toEqual([])
  })
})

describe('orden por largo: el caso de prefijo', () => {
  it('un concepto prefijo de otro degrada el resaltado si no se ordena', () => {
    const texto = 'el Parque Nacional Torres del Paine'
    const resaltado = (conceptos) =>
      construirDetector(conceptos)
        .extraerExtracto(texto, 200)
        .filter((s) => s.resaltado)
        .map((s) => s.texto)

    // Orden "malo": gana el más corto porque la alternancia es leftmost-first.
    expect(resaltado(['Parque', 'Parque Nacional'])).toEqual(['Parque'])
    // sanearConceptos lo arregla, sea cual sea el orden de entrada.
    expect(resaltado(sanearConceptos(incluir('Parque', 'Parque Nacional')).incluir)).toEqual([
      'Parque Nacional',
    ])
  })
})

describe('acotarConsulta', () => {
  it('respeta el presupuesto de caracteres', () => {
    const r = acotarConsulta(['CONAF', 'CMPC', 'forestal'], 20)
    expect(r.length).toBeLessThan(3)
    expect(r[0]).toBe('CONAF')
  })

  it('conserva el prefijo: nunca descarta los primeros (la semilla)', () => {
    const muchos = ['CONAF', 'CMPC', ...Array.from({ length: 200 }, (_, i) => `concepto-numero-${i}`)]
    const r = acotarConsulta(muchos, 1500)
    expect(r).toContain('CONAF')
    expect(r).toContain('CMPC')
    expect(r.length).toBeLessThan(muchos.length)
  })

  it('siempre deja al menos un concepto, aunque no quepa', () => {
    expect(acotarConsulta(['Corporación Nacional Forestal'], 5)).toEqual([
      'Corporación Nacional Forestal',
    ])
  })
})

describe('límites: el conjunto máximo compila y responde rápido', () => {
  it('MAX_ACTIVOS_POR_TIPO conceptos del largo máximo no rompen el detector', () => {
    // Medición real, no razonamiento: es el test que CALIBRA los límites.
    const sinteticos = Array.from({ length: MAX_ACTIVOS_POR_TIPO }, (_, i) =>
      `concepto ${String(i).padStart(3, '0')} ${'á'.repeat(60)}`,
    )
    const { incluir: lista } = sanearConceptos(incluir(...sinteticos))
    expect(lista.length).toBe(MAX_ACTIVOS_POR_TIPO)

    const detector = construirDetector(lista)
    const textoLargo = 'texto sin menciones. '.repeat(5000) // ~100 KB
    const inicio = Date.now()
    expect(detector.detecta(textoLargo)).toBe(false)
    expect(Date.now() - inicio).toBeLessThan(2000)
  })
})
