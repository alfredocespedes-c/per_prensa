// GUARDA: el extracto almacenado nunca supera LARGO_EXTRACTO.
//
// El largo del extracto es, literalmente, lo que un tribunal mediría: es la única parte
// del contenido del medio que este sistema conserva. `LARGO_EXTRACTO` estaba declarado en
// config/parametros.js sin ninguna prueba que comprobara que el sistema lo respeta.
//
// Se importa la constante REAL, no un 500 escrito a mano. Si alguien la sube, este test
// debe seguir midiendo lo que el sistema hace de verdad; la guarda contra un valor
// desmedido es la aserción explícita de más abajo.

import { describe, expect, it } from 'vitest'
import { LARGO_EXTRACTO } from '../src/config/parametros.js'
import { construirDetector, recortarTexto } from '../src/dominio/menciones.js'

const detector = construirDetector(['CONAF', 'Corporación Nacional Forestal'])

// Marcas de recorte que añade extraerExtracto cuando la ventana no llega a los bordes
// (misma convención que el boletín antiguo). NO son palabras del medio: son notación
// propia que indica "acá hay texto omitido", y por eso se miden aparte.
const MARCA_INICIO = '(...) '
const MARCA_FIN = ' (...)'
const MARGEN_MARCAS = MARCA_INICIO.length + MARCA_FIN.length // 12

const largoDe = (segmentos) => segmentos.reduce((n, s) => n + s.texto.length, 0)

/**
 * Caracteres del MEDIO en el extracto, descontando nuestras marcas de recorte.
 *
 * Esta es la cifra que importa: es la porción de la obra ajena que el sistema conserva.
 * Medir el total en bruto contaría los `(...)` como si fueran del medio.
 */
const largoDelMedio = (segmentos) =>
  segmentos.reduce((n, s) => {
    if (s.texto === MARCA_INICIO || s.texto === MARCA_FIN) return n
    return n + s.texto.length
  }, 0)

/** Cuerpo largo con la mención en la posición pedida. */
function cuerpo({ antes = 4000, despues = 4000, mencion = 'CONAF' } = {}) {
  return `${'palabra '.repeat(antes / 8)}${mencion}${' palabra'.repeat(despues / 8)}`
}

describe('largo del extracto almacenado', () => {
  it('el tope declarado es un valor de cita, no de reproducción', () => {
    // Aserción sobre el PARÁMETRO, no sobre el comportamiento. Es la que impide que
    // alguien "arregle" un test fallido subiendo la constante.
    expect(LARGO_EXTRACTO).toBeLessThanOrEqual(500)
    expect(LARGO_EXTRACTO).toBeGreaterThan(0)
  })

  it('un cuerpo largo produce un extracto que no supera el tope', () => {
    const segmentos = detector.extraerExtracto(cuerpo(), LARGO_EXTRACTO)
    expect(largoDelMedio(segmentos)).toBeLessThanOrEqual(LARGO_EXTRACTO)
  })

  it('el total almacenado excede el tope solo por las marcas de recorte', () => {
    // Hallazgo que destapó esta guarda: las marcas `(...)` se añaden DESPUÉS de calcular
    // la ventana, así que el array almacenado puede medir hasta 12 caracteres más que
    // LARGO_EXTRACTO. No son palabras del medio, pero significa que el número declarado
    // "500" no es literalmente el largo del campo. Se fija el margen para que nadie lo
    // amplíe sin darse cuenta.
    const segmentos = detector.extraerExtracto(cuerpo(), LARGO_EXTRACTO)
    expect(largoDe(segmentos)).toBeLessThanOrEqual(LARGO_EXTRACTO + MARGEN_MARCAS)
  })

  it('la mención sigue dentro del recorte, esté donde esté en el cuerpo', () => {
    // Un recorte que respetara el tope pero perdiera la mención dejaría un extracto sin
    // el resaltado que justifica que la noticia esté en el boletín: cumpliría la letra y
    // fallaría el propósito.
    for (const posicion of [
      { antes: 0, despues: 8000 },
      { antes: 4000, despues: 4000 },
      { antes: 8000, despues: 0 },
    ]) {
      const segmentos = detector.extraerExtracto(cuerpo(posicion), LARGO_EXTRACTO)
      expect(largoDelMedio(segmentos)).toBeLessThanOrEqual(LARGO_EXTRACTO)
      expect(segmentos.some((s) => s.resaltado)).toBe(true)
    }
  })

  it('con varias menciones tampoco se pasa del tope', () => {
    const texto = `${'relleno '.repeat(500)}CONAF${' relleno'.repeat(50)}CONAF${' relleno'.repeat(500)}`
    const segmentos = detector.extraerExtracto(texto, LARGO_EXTRACTO)
    expect(largoDelMedio(segmentos)).toBeLessThanOrEqual(LARGO_EXTRACTO)
  })

  it('un cuerpo más corto que el tope se conserva entero, sin rellenar', () => {
    const corto = 'La CONAF informó del cierre preventivo.'
    const segmentos = detector.extraerExtracto(corto, LARGO_EXTRACTO)
    expect(largoDe(segmentos)).toBe(corto.length)
  })

  it('el recorte sin mención (fallback) también respeta el tope', () => {
    // recortarTexto es la vía por la que se guarda texto cuando no hay mención que
    // centrar. Si esa vía ignorara el tope, el sistema archivaría el arranque completo de
    // un artículo.
    expect(recortarTexto(cuerpo(), LARGO_EXTRACTO).length).toBeLessThanOrEqual(
      LARGO_EXTRACTO + 6, // ' (...)' que marca la continuación
    )
  })

  it('el medidor detecta un exceso (no es decorativo)', () => {
    // Si `extraerExtracto` ignorase su parámetro, los casos de arriba pasarían igual y la
    // guarda sería un adorno. Acá se le pide un tope grande y se comprueba que el
    // resultado CRECE: prueba que el parámetro se está usando.
    const conTopeGrande = detector.extraerExtracto(cuerpo(), 3000)
    expect(largoDelMedio(conTopeGrande)).toBeGreaterThan(LARGO_EXTRACTO)
  })

  it('largoDelMedio no cuenta las marcas de recorte', () => {
    // La resta de las marcas es lo que hace honesta la medición; si el ayudante se
    // rompiera, toda la guarda mediría de menos y dejaría pasar excesos reales.
    const segmentos = [
      { texto: MARCA_INICIO, resaltado: false },
      { texto: 'doce chars.', resaltado: false },
      { texto: MARCA_FIN, resaltado: false },
    ]
    expect(largoDe(segmentos)).toBe(11 + MARGEN_MARCAS)
    expect(largoDelMedio(segmentos)).toBe(11)
  })
})
