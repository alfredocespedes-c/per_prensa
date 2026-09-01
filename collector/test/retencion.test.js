import { describe, expect, it } from 'vitest'
import {
  CAMPOS_ANALISIS_DE_TEXTO,
  aplicarRetencionEnVentana,
  calcularCortes,
  limpiarAnalisis,
  resumenDePurga,
  yaPurgada,
} from '../src/dominio/retencion.js'

const AHORA = new Date('2026-08-11T12:00:00Z')
const CONFIG = {
  retencionExtractoDias: 180,
  retencionMetadatosDias: 400,
  retencionEjecucionesDias: 400,
}

function analisisCompleto(sobrescribe = {}) {
  return {
    version: 3,
    sentimiento: 'negativa',
    polaridad: -0.4,
    score: -8,
    keywords: ['incendio', 'conaf'],
    categorias: ['emergencias'],
    personas: ['Juan Pérez'],
    organizaciones: ['CONAF'],
    lugares: ['Parque Nacional Conguillío'],
    regiones: ['araucania'],
    riesgo: 'alto',
    prioridad: 1,
    importancia: 88,
    ambito: 'regional',
    cantidadPalabras: 420,
    ...sobrescribe,
  }
}

describe('calcularCortes', () => {
  it('cada corte queda a la distancia declarada de "ahora"', () => {
    const { corteExtracto, corteMetadatos, corteEjecuciones } = calcularCortes(AHORA, CONFIG)
    const dias = (fecha) => Math.round((AHORA - fecha) / 86_400_000)
    expect(dias(corteExtracto)).toBe(180)
    expect(dias(corteMetadatos)).toBe(400)
    expect(dias(corteEjecuciones)).toBe(400)
  })

  it('rechaza que el texto se retenga MÁS que la fila que lo contiene', () => {
    // Sin esta guarda, la fila se borraría a los 100 días con su extracto intacto y la
    // política declarada ("el texto se purga a los 180") nunca llegaría a aplicarse.
    expect(() =>
      calcularCortes(AHORA, { ...CONFIG, retencionExtractoDias: 180, retencionMetadatosDias: 100 }),
    ).toThrow(/no puede superar/i)
  })

  it('rechaza valores no enteros, cero o negativos en vez de corregirlos', () => {
    // Un borrado no se deshace: mejor no correr que correr con un corte inventado.
    for (const malo of [0, -1, 1.5, null, undefined, '180', NaN]) {
      expect(() => calcularCortes(AHORA, { ...CONFIG, retencionExtractoDias: malo })).toThrow()
    }
  })

  it('rechaza una fecha inválida', () => {
    expect(() => calcularCortes(new Date('no-es-fecha'), CONFIG)).toThrow(/fecha válida/i)
    expect(() => calcularCortes('2026-08-11', CONFIG)).toThrow(/fecha válida/i)
  })
})

describe('limpiarAnalisis', () => {
  it('quita los campos derivados del texto y conserva los agregados', () => {
    const limpio = limpiarAnalisis(analisisCompleto())

    for (const campo of CAMPOS_ANALISIS_DE_TEXTO) {
      expect(limpio).not.toHaveProperty(campo)
    }
    // Lo que sostiene el mapa y las estadísticas históricas sobrevive.
    expect(limpio.sentimiento).toBe('negativa')
    expect(limpio.categorias).toEqual(['emergencias'])
    expect(limpio.regiones).toEqual(['araucania'])
    expect(limpio.riesgo).toBe('alto')
    expect(limpio.importancia).toBe(88)
  })

  it('no muta el objeto original', () => {
    const original = analisisCompleto()
    limpiarAnalisis(original)
    expect(original.keywords).toEqual(['incendio', 'conaf'])
    expect(original.personas).toEqual(['Juan Pérez'])
  })

  it('conserva un campo desconocido en vez de descartarlo en silencio', () => {
    // La lista negra es corta y explícita; lo que se agregue al enriquecimiento en el
    // futuro sobrevive por defecto y se decide a conciencia, no por olvido.
    const limpio = limpiarAnalisis(analisisCompleto({ metricaNueva: 42 }))
    expect(limpio.metricaNueva).toBe(42)
  })

  it('devuelve null si tras limpiar solo queda la versión', () => {
    expect(limpiarAnalisis({ version: 3, keywords: ['a'], personas: ['b'] })).toBeNull()
  })

  it('devuelve null ante entradas que no son un objeto de análisis', () => {
    expect(limpiarAnalisis(null)).toBeNull()
    expect(limpiarAnalisis(undefined)).toBeNull()
    expect(limpiarAnalisis(['a'])).toBeNull()
    expect(limpiarAnalisis('texto')).toBeNull()
  })
})

describe('yaPurgada', () => {
  it('una fila recién archivada no está purgada', () => {
    expect(
      yaPurgada({ extracto: [{ texto: 'CONAF', resaltado: true }], analisis: analisisCompleto() }),
    ).toBe(false)
  })

  it('una fila sin extracto pero con keywords todavía tiene texto que purgar', () => {
    expect(yaPurgada({ extracto: [], analisis: analisisCompleto() })).toBe(false)
  })

  it('una fila con extracto pero con el análisis ya limpio sigue sin purgar', () => {
    expect(
      yaPurgada({
        extracto: [{ texto: 'CONAF', resaltado: true }],
        analisis: limpiarAnalisis(analisisCompleto()),
      }),
    ).toBe(false)
  })

  it('el resultado de purgar es un punto fijo: purgar dos veces no cambia nada', () => {
    // Es lo que evita que la purga reescriba cada noche las mismas filas, inflando
    // actualizada_en y el WAL sin que nada haya cambiado.
    expect(yaPurgada({ extracto: [], analisis: limpiarAnalisis(analisisCompleto()) })).toBe(true)
    expect(yaPurgada({ extracto: [], analisis: null })).toBe(true)
  })
})

describe('aplicarRetencionEnVentana', () => {
  const CORTE = new Date('2026-02-12T12:00:00Z') // 180 días antes de AHORA

  function enVentana(fechaDeteccion, sobrescribe = {}) {
    return {
      id: `https://m.cl/${fechaDeteccion}`,
      titular: 'CONAF controla incendio',
      fechaDeteccion,
      extracto: [{ texto: 'CONAF', resaltado: true }, { texto: ' controla', resaltado: false }],
      analisis: analisisCompleto(),
      ...sobrescribe,
    }
  }

  it('vacía el texto de las noticias anteriores al corte', () => {
    const ventana = [enVentana('2025-12-01T00:00:00Z')]
    expect(aplicarRetencionEnVentana(ventana, CORTE)).toBe(1)

    expect(ventana[0].extracto).toEqual([])
    expect(ventana[0].analisis).not.toHaveProperty('keywords')
    // Lo que NO es contenido del medio se conserva: sigue siendo una referencia útil.
    expect(ventana[0].titular).toBe('CONAF controla incendio')
    expect(ventana[0].analisis.sentimiento).toBe('negativa')
  })

  it('no toca las noticias posteriores al corte', () => {
    const ventana = [enVentana('2026-08-01T00:00:00Z')]
    expect(aplicarRetencionEnVentana(ventana, CORTE)).toBe(0)
    expect(ventana[0].extracto).toHaveLength(2)
    expect(ventana[0].analisis.keywords).toEqual(['incendio', 'conaf'])
  })

  it('el texto purgado NO resucita en la corrida siguiente', () => {
    // Es la razón de existir de esta función. El archivador hace upsert de la ventana
    // COMPLETA cada hora: si una noticia vieja conservara su extracto acá, la corrida de
    // las 07:00 se lo devolvería a la base y la purga de las 06:30 no serviría de nada.
    const ventana = [enVentana('2025-12-01T00:00:00Z')]
    aplicarRetencionEnVentana(ventana, CORTE)
    const trasPrimera = JSON.stringify(ventana)

    expect(aplicarRetencionEnVentana(ventana, CORTE)).toBe(0)
    expect(JSON.stringify(ventana)).toBe(trasPrimera)
  })

  it('una fecha de detección ilegible se deja intacta en vez de purgarse', () => {
    // Fail-open: ante un dato corrupto, no borrar. Lo contrario destruiría contenido por
    // un error de parseo.
    const ventana = [enVentana('fecha-rota'), enVentana(undefined)]
    expect(aplicarRetencionEnVentana(ventana, CORTE)).toBe(0)
    expect(ventana[0].extracto).toHaveLength(2)
    expect(ventana[1].extracto).toHaveLength(2)
  })

  it('tolera una ventana vacía o ausente', () => {
    expect(aplicarRetencionEnVentana([], CORTE)).toBe(0)
    expect(aplicarRetencionEnVentana(null, CORTE)).toBe(0)
  })

  it('exige una fecha de corte válida', () => {
    expect(() => aplicarRetencionEnVentana([], new Date('x'))).toThrow(/corte válida/i)
  })
})

describe('resumenDePurga', () => {
  const base = {
    diasExtracto: 180,
    diasMetadatos: 400,
    diasEjecuciones: 400,
    extractosPurgados: 12,
    noticiasBorradas: 3,
    ejecucionesBorradas: 24,
  }

  it('reporta los tres cortes con sus conteos', () => {
    const lineas = resumenDePurga({ ...base, simulacion: false })
    expect(lineas).toHaveLength(3)
    expect(lineas[0]).toContain('180')
    expect(lineas[0]).toContain('12')
    expect(lineas[1]).toContain('3')
    expect(lineas[2]).toContain('24')
    expect(lineas.every((linea) => linea.startsWith('[OK]'))).toBe(true)
  })

  it('en simulación lo dice en la PRIMERA línea', () => {
    // Si el aviso fuera al final, un log truncado haría creer que sí se purgó.
    const lineas = resumenDePurga({ ...base, simulacion: true })
    expect(lineas[0]).toMatch(/SIMULACIÓN/)
    expect(lineas[0]).toMatch(/no se escribió nada/i)
  })
})
