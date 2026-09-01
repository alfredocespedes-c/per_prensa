import { describe, expect, it } from 'vitest'
import { construirDetector, recortarTexto } from '../src/dominio/menciones.js'

const CONCEPTOS = ['CONAF', 'Corporación Nacional Forestal']
const detector = construirDetector(CONCEPTOS)

describe('detecta', () => {
  it('detecta CONAF en cualquier combinación de mayúsculas', () => {
    expect(detector.detecta('brigadistas de CONAF trabajaron')).toBe(true)
    expect(detector.detecta('brigadistas de Conaf trabajaron')).toBe(true)
    expect(detector.detecta('brigadistas de conaf trabajaron')).toBe(true)
  })

  it('NO detecta palabras que contienen el concepto (CONAFE)', () => {
    expect(detector.detecta('la cooperativa CONAFE anunció')).toBe(false)
    expect(detector.detecta('la cooperativa Conafe anunció')).toBe(false)
    expect(detector.detecta('los CONAFes del sur')).toBe(false)
  })

  it('NO detecta cuando sigue una letra con tilde (donde \\b fallaría)', () => {
    expect(detector.detecta('palabra inventada CONAFé aquí')).toBe(false)
  })

  it('detecta con puntuación adyacente', () => {
    expect(detector.detecta('el organismo (CONAF) informó')).toBe(true)
    expect(detector.detecta('lo confirmó CONAF.')).toBe(true)
    expect(detector.detecta('según «CONAF» el brote')).toBe(true)
    expect(detector.detecta('respondió CONAF')).toBe(true)
  })

  it('detecta la frase completa, con y sin tildes', () => {
    expect(detector.detecta('la Corporación Nacional Forestal indicó')).toBe(true)
    expect(detector.detecta('la corporación nacional forestal indicó')).toBe(true)
    expect(detector.detecta('la Corporacion Nacional Forestal indicó')).toBe(true)
  })

  it('detecta la frase con espacios múltiples o salto de línea entre palabras', () => {
    expect(detector.detecta('Corporación  Nacional\nForestal')).toBe(true)
  })

  it('no detecta en textos sin mención, vacíos o no-string', () => {
    expect(detector.detecta('los bomberos apagaron el incendio')).toBe(false)
    expect(detector.detecta('')).toBe(false)
    expect(detector.detecta(null)).toBe(false)
    expect(detector.detecta(undefined)).toBe(false)
  })
})

describe('extraerExtracto', () => {
  it('devuelve null si no hay mención', () => {
    expect(detector.extraerExtracto('texto sin la sigla', 100)).toBe(null)
  })

  it('marca la mención como resaltada y el resto no', () => {
    const segmentos = detector.extraerExtracto('personal de CONAF llegó al lugar', 100)
    expect(segmentos).toEqual([
      { texto: 'personal de ', resaltado: false },
      { texto: 'CONAF', resaltado: true },
      { texto: ' llegó al lugar', resaltado: false },
    ])
  })

  it('conserva la grafía original de la mención (Conaf, no CONAF)', () => {
    const segmentos = detector.extraerExtracto('equipo de Conaf en terreno', 100)
    const resaltados = segmentos.filter((s) => s.resaltado)
    expect(resaltados).toEqual([{ texto: 'Conaf', resaltado: true }])
  })

  it('resalta múltiples menciones dentro de la ventana', () => {
    const segmentos = detector.extraerExtracto(
      'CONAF confirmó que la Corporación Nacional Forestal evalúa el plan',
      200,
    )
    expect(segmentos.filter((s) => s.resaltado).map((s) => s.texto)).toEqual([
      'CONAF',
      'Corporación Nacional Forestal',
    ])
  })

  it('centra la ventana en la primera mención y agrega marcas de recorte', () => {
    const relleno = 'palabra '.repeat(60) // 480 caracteres antes de la mención
    const texto = `${relleno}CONAF anunció medidas. ${'cola '.repeat(60)}`
    const segmentos = detector.extraerExtracto(texto, 120)
    expect(segmentos[0].texto).toBe('(...) ')
    expect(segmentos.at(-1).texto).toBe(' (...)')
    expect(segmentos.some((s) => s.resaltado && s.texto === 'CONAF')).toBe(true)
    const largoTotal = segmentos.reduce((suma, s) => suma + s.texto.length, 0)
    expect(largoTotal).toBeLessThanOrEqual(120 + '(...) '.length + ' (...)'.length)
  })

  it('jamás corta una mención en el borde de la ventana', () => {
    // Segunda mención justo donde terminaría la ventana.
    const texto = `CONAF inicia plan. ${'x'.repeat(70)} Corporación Nacional Forestal cierra`
    const segmentos = detector.extraerExtracto(texto, 90)
    for (const segmento of segmentos.filter((s) => s.resaltado)) {
      expect(['CONAF', 'Corporación Nacional Forestal']).toContain(segmento.texto)
    }
    // La segunda mención, al no caber completa, no aparece ni cortada.
    const textoPlano = segmentos.map((s) => s.texto).join('')
    expect(textoPlano).not.toMatch(/Corporación(?! Nacional Forestal)/u)
  })

  it('funciona con la mención al inicio y al final del texto', () => {
    expect(detector.extraerExtracto('CONAF al inicio', 100)[0]).toEqual({
      texto: 'CONAF',
      resaltado: true,
    })
    const alFinal = detector.extraerExtracto('al final está CONAF', 100)
    expect(alFinal.at(-1)).toEqual({ texto: 'CONAF', resaltado: true })
  })
})

describe('construirDetector', () => {
  it('exige al menos un concepto', () => {
    expect(() => construirDetector([])).toThrow()
    expect(() => construirDetector(null)).toThrow()
  })

  it('rechaza una lista que solo trae conceptos vacíos o en blanco', () => {
    expect(() => construirDetector([''])).toThrow()
    expect(() => construirDetector(['   '])).toThrow()
    expect(() => construirDetector(['\t', '\n'])).toThrow()
    expect(() => construirDetector([null, undefined, 42])).toThrow()
  })

  // La regresión que de verdad duele: un concepto en blanco junto a uno válido
  // convertía al detector en "matchea cualquier cosa". El texto DEBE llevar
  // puntuación — con dos no-alfanuméricos adyacentes es donde casa la alternativa
  // vacía. Sin puntuación este test pasa con y sin el bug (sería una tautología).
  it('ignora los conceptos en blanco sin volverse un comodín', () => {
    const detector = construirDetector(['CONAF', '   '])
    expect(detector.detecta('Los bomberos apagaron el incendio.')).toBe(false)
    expect(detector.detecta('Hoy, en Chile hubo alerta')).toBe(false)
    expect(detector.detecta('La CONAF informó.')).toBe(true)
    expect(detector.extraerExtracto('Los bomberos apagaron el incendio.')).toBeNull()
  })
})

describe('recortarTexto', () => {
  it('no toca textos cortos', () => {
    expect(recortarTexto('texto corto', 100)).toBe('texto corto')
  })

  it('corta en límite de palabra y marca la continuación', () => {
    const resultado = recortarTexto('una frase bastante larga que no cabe', 15)
    expect(resultado).toBe('una frase (...)')
  })

  it('tolera no-strings', () => {
    expect(recortarTexto(null)).toBe('')
  })
})
