import { describe, it, expect } from 'vitest'
import {
  construirEvaluadorExclusion,
  marcarExclusiones,
  resumenDeExclusiones,
  textoDeFiltro,
} from '../src/dominio/exclusiones.js'

function noticia(titular, extractoTexto = '', extra = {}) {
  return {
    id: `https://medio.cl/${titular.slice(0, 12).replace(/\W+/g, '-')}`,
    url: 'https://medio.cl/nota',
    medioId: 'medio',
    medioNombre: 'Medio',
    seccionId: 'escrita',
    titular,
    fecha: '2026-08-01T10:00:00.000Z',
    fechaDeteccion: '2026-08-01T11:00:00.000Z',
    extracto: extractoTexto ? [{ texto: extractoTexto, resaltado: false }] : [],
    ...extra,
  }
}

describe('IDEMPOTENCIA — correr dos veces no cambia nada', () => {
  it('la segunda pasada no reporta cambios y el JSON es idéntico', () => {
    const evaluador = construirEvaluadorExclusion(['CMPC'])
    const ventana = [
      noticia('CMPC invertirá en su negocio forestal'),
      noticia('CONAF combate incendio en Biobío'),
    ]

    marcarExclusiones(ventana, evaluador)
    const tras1 = JSON.stringify(ventana)

    const segunda = marcarExclusiones(ventana, evaluador)
    // Captura el orden de claves y el orden de excluidaPor: si alguno fuera inestable,
    // el JSON cambiaría cada hora y `generadoEn` se movería sin motivo.
    expect(JSON.stringify(ventana)).toBe(tras1)
    expect(segunda.cambiadas).toBe(0)
  })
})

describe('REVERSIBILIDAD — quitar el concepto restaura la noticia', () => {
  it('se desmarca y conserva TODOS los demás campos', () => {
    const ventana = [noticia('CMPC y CONAF firman convenio', 'texto del convenio')]
    ventana[0].analisis = { version: 3, sentimiento: 'positiva' }
    ventana[0].eventId = 'evt:https://medio.cl/x'
    const antes = structuredClone(ventana[0])

    marcarExclusiones(ventana, construirEvaluadorExclusion(['CMPC']))
    expect(ventana[0].excluida).toBe(true)
    expect(ventana[0].excluidaPor).toEqual(['CMPC'])

    // Se quita el concepto: sin borrar nada, la noticia vuelve.
    marcarExclusiones(ventana, construirEvaluadorExclusion([]))
    expect(ventana[0].excluida).toBe(false)
    expect(ventana[0].excluidaPor).toEqual([])
    // La noticia SIGUE en el array (nunca se borró) y nada más se tocó.
    expect(ventana).toHaveLength(1)
    for (const campo of ['id', 'url', 'titular', 'fecha', 'fechaDeteccion', 'extracto', 'analisis', 'eventId']) {
      expect(ventana[0][campo]).toEqual(antes[campo])
    }
  })
})

describe('PRECEDENCIA — la exclusión gana', () => {
  it('una noticia que menciona un concepto incluido y uno excluido queda oculta', () => {
    // El daño colateral real: la nota menciona CONAF, pero también CMPC.
    const ventana = [noticia('CONAF y CMPC firman convenio de manejo del fuego')]
    marcarExclusiones(ventana, construirEvaluadorExclusion(['CMPC']))
    expect(ventana[0].excluida).toBe(true)
  })
})

describe('detección', () => {
  it('marca por titular y por extracto', () => {
    const evaluador = construirEvaluadorExclusion(['CMPC'])
    const porTitular = [noticia('CMPC anuncia planta')]
    const porExtracto = [noticia('Nueva planta en la región', 'la empresa CMPC informó que...')]
    marcarExclusiones(porTitular, evaluador)
    marcarExclusiones(porExtracto, evaluador)
    expect(porTitular[0].excluida).toBe(true)
    expect(porExtracto[0].excluida).toBe(true)
  })

  it('NO marca por subcadena (hereda los límites de palabra de menciones.js)', () => {
    const ventana = [noticia('CMPCorp abre oficina')]
    marcarExclusiones(ventana, construirEvaluadorExclusion(['CMPC']))
    expect(ventana[0].excluida).toBe(false)
  })

  it('es insensible a mayúsculas y tildes', () => {
    const ventana = [noticia('la corporacion nacional forestal informo')]
    marcarExclusiones(ventana, construirEvaluadorExclusion(['Corporación Nacional Forestal']))
    expect(ventana[0].excluida).toBe(true)
  })

  it('soporta conceptos multipalabra con espacios múltiples y saltos de línea', () => {
    const ventana = [noticia('visita al Parque\nNacional Conguillío')]
    marcarExclusiones(ventana, construirEvaluadorExclusion(['  Parque   Nacional ']))
    expect(ventana[0].excluida).toBe(true)
  })
})

describe('excluidaPor', () => {
  it('va ordenado alfabéticamente y sin duplicados, entre desordenada la lista', () => {
    const ventana = [noticia('CMPC y Arauco: forestal y CMPC otra vez')]
    marcarExclusiones(ventana, construirEvaluadorExclusion(['forestal', 'CMPC', 'CMPC', ' Arauco ']))
    expect(ventana[0].excluidaPor).toEqual(['Arauco', 'CMPC', 'forestal'])
  })
})

describe('bordes', () => {
  it('lista de exclusión vacía, null o undefined: nadie se marca y no lanza', () => {
    for (const lista of [[], null, undefined]) {
      const ventana = [noticia('CONAF informa')]
      expect(() => marcarExclusiones(ventana, construirEvaluadorExclusion(lista))).not.toThrow()
      expect(ventana[0].excluida).toBe(false)
      expect(ventana[0].excluidaPor).toEqual([])
    }
  })

  it('un concepto sin patrón útil se ignora en vez de tumbar la corrida', () => {
    // construirDetector(['...']) lanzaría; el evaluador lo descarta.
    const evaluador = construirEvaluadorExclusion(['   ', 'CMPC'])
    expect(evaluador.conceptos).toEqual(['CMPC'])
  })

  it('textoDeFiltro tolera extracto ausente, null, no-array o con segmentos raros', () => {
    expect(() => textoDeFiltro({ titular: 'x' })).not.toThrow()
    expect(() => textoDeFiltro({ titular: 'x', extracto: null })).not.toThrow()
    expect(() => textoDeFiltro({ titular: 'x', extracto: 'no-array' })).not.toThrow()
    expect(() => textoDeFiltro({ titular: 'x', extracto: [{}, null] })).not.toThrow()
    expect(() => textoDeFiltro({})).not.toThrow()
  })
})

describe('SIMETRÍA previa/nueva', () => {
  it('una previa (sin los campos) y una nueva con el mismo texto dan el mismo resultado', () => {
    // Tras fusionar ambas son el mismo tipo de objeto; el resultado no puede depender
    // de cuándo entró la noticia a la ventana.
    const previa = noticia('CMPC amplía planta', 'detalle')
    const nueva = noticia('CMPC amplía planta', 'detalle')
    nueva.excluida = false
    nueva.excluidaPor = []
    const evaluador = construirEvaluadorExclusion(['CMPC'])
    marcarExclusiones([previa], evaluador)
    marcarExclusiones([nueva], evaluador)
    expect(previa.excluida).toBe(nueva.excluida)
    expect(previa.excluidaPor).toEqual(nueva.excluidaPor)
  })
})

describe('resumen para lineasResumen', () => {
  it('reporta totales y marca los conceptos que no ocultan nada', () => {
    const evaluador = construirEvaluadorExclusion(['CMPC', 'Arauco'])
    const ventana = [noticia('CMPC invierte'), noticia('CONAF informa')]
    const lineas = resumenDeExclusiones(marcarExclusiones(ventana, evaluador), evaluador)
    expect(lineas[0]).toContain('1/2 ocultas, 1 visibles')
    expect(lineas.join('\n')).toContain('«Arauco»: oculta 0 — ¿mal escrito?')
    expect(lineas.join('\n')).toContain('«CMPC»: oculta 1')
  })

  it('avisa con [FALLO] si se oculta más de la mitad de la ventana', () => {
    const evaluador = construirEvaluadorExclusion(['CMPC'])
    const ventana = [noticia('CMPC uno'), noticia('CMPC dos'), noticia('CONAF tres')]
    const lineas = resumenDeExclusiones(marcarExclusiones(ventana, evaluador), evaluador)
    expect(lineas.some((l) => l.startsWith('[FALLO]') && l.includes('67%'))).toBe(true)
  })
})
