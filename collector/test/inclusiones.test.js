import { describe, expect, it } from 'vitest'
import {
  construirEvaluadorInclusion,
  marcarConceptos,
  resumenDeInclusiones,
  textoDeAtribucion,
} from '../src/dominio/inclusiones.js'

const noticia = (titular, extracto = [], url = null) => ({
  id: `https://m.cl/${titular.slice(0, 12)}`,
  url: url ?? `https://m.cl/${titular.slice(0, 12)}`,
  titular,
  extracto,
})

const ORDEN = ['CONAF', 'Parque Nacional', 'forestal']

describe('construirEvaluadorInclusion', () => {
  it('devuelve los conceptos detectados EN ORDEN DE PRIORIDAD', () => {
    // El orden es la información: el primero será el concepto principal. Ordenar
    // alfabéticamente destruiría la decisión del admin.
    const evaluador = construirEvaluadorInclusion(ORDEN)
    expect(evaluador.evaluar('La CONAF administra el Parque Nacional')).toEqual([
      'CONAF',
      'Parque Nacional',
    ])
  })

  it('cambiar el orden cambia la prioridad', () => {
    const alReves = construirEvaluadorInclusion(['Parque Nacional', 'CONAF'])
    expect(alReves.evaluar('La CONAF administra el Parque Nacional')[0]).toBe('Parque Nacional')
  })

  it('hereda las reglas de detección: sin distinguir mayúsculas ni tildes, con límites', () => {
    const evaluador = construirEvaluadorInclusion(['CONAF'])
    expect(evaluador.evaluar('la conaf informó')).toEqual(['CONAF'])
    expect(evaluador.evaluar('CONAFE abrió matrículas')).toEqual([])
  })

  it('descarta conceptos vacíos o nulos sin lanzar', () => {
    // Solo se filtra lo que no puede producir patrón. La validación FINA (largo mínimo,
    // número de palabras) vive en dominio/conceptos.js y en el CHECK de la tabla, así que
    // acá no hace falta repetirla: basta con no reventar la corrida.
    const evaluador = construirEvaluadorInclusion(['CONAF', '   ', null, undefined, ''])
    expect(evaluador.conceptos).toEqual(['CONAF'])
  })

  it('no repite un concepto duplicado en la lista', () => {
    expect(construirEvaluadorInclusion(['CONAF', 'CONAF']).conceptos).toEqual(['CONAF'])
  })
})

describe('marcarConceptos', () => {
  it('asigna conceptoPrincipal y la lista completa', () => {
    const ventana = [noticia('CONAF visita el Parque Nacional Conguillío')]
    marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))

    expect(ventana[0].conceptoPrincipal).toBe('CONAF')
    expect(ventana[0].conceptosDetectados).toEqual(['CONAF', 'Parque Nacional'])
  })

  it('evalúa titular Y extracto, no solo el titular', () => {
    const ventana = [
      noticia('Incendio en la zona', [{ texto: 'según la ', resaltado: false }, { texto: 'CONAF', resaltado: true }]),
    ]
    marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))
    expect(ventana[0].conceptoPrincipal).toBe('CONAF')
  })

  it('atribuye por la URL cuando el titular y el extracto no bastan', () => {
    // Es lo que cierra el caso "sin concepto". El slug repite el titular del medio, y es
    // la única señal cuando el extracto viene vacío (ítems que entran por la búsqueda de
    // Google, que no entrega cuerpo). Sin esto había que inventar un bloque "Otras
    // menciones" en el boletín para que esas noticias no desaparecieran.
    const ventana = [
      noticia(
        'Extienden el cierre preventivo hasta el 27 de julio',
        [],
        'https://ucvradio.cl/news/conaf-extiende-el-cierre-preventivo-de-las-areas-protegidas',
      ),
    ]

    marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))

    expect(ventana[0].conceptoPrincipal).toBe('CONAF')
  })

  it('el dominio NO cuenta como atribución', () => {
    // Si contara, cualquier nota de un medio llamado "conaf.cl" quedaría atribuida sin
    // mencionar nada. La señal es la ruta, no el host.
    expect(textoDeAtribucion({ url: 'https://conaf.cl/algo', titular: 'x', extracto: [] })).not.toMatch(
      /conaf\b/i,
    )
  })

  it('convierte los guiones del slug en espacios', () => {
    // El detector exige límites de palabra: "conaf-extiende" no casaría con «CONAF».
    const texto = textoDeAtribucion({
      url: 'https://m.cl/2026/08/conaf-extiende-cierre',
      titular: 'x',
      extracto: [],
    })
    expect(texto).toContain('conaf extiende cierre')
  })

  it('una noticia que aun así no se puede atribuir queda en null y se CUENTA', () => {
    // No es una categoría del boletín: es un defecto. El boletín se organiza por concepto
    // y no tiene bloque "otras", así que una noticia sin atribuir no se muestra.
    const ventana = [noticia('Nota sin menciones literales', [], 'https://m.cl/nota-generica')]
    const resultado = marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))

    expect(ventana[0].conceptoPrincipal).toBeNull()
    expect(resultado.sinConcepto).toBe(1)
  })

  it('lo que pasa el detector de ingesta SIEMPRE queda atribuido', () => {
    // GUARDA de la invariante que sostiene el boletín sin bloque "otras": si una noticia
    // entró porque `detecta(titular + texto)` dio verdadero, la atribución no puede
    // fallar. Si esto se rompiera, habría noticias recolectadas que no se muestran en
    // ninguna parte — pérdida de cobertura silenciosa.
    const casos = [
      noticia('CONAF anuncia plan', []),
      noticia('Incendio en la zona', [{ texto: 'la CONAF informó', resaltado: true }]),
      noticia('Nuevo Parque Nacional en Aysén', []),
      noticia('Plan forestal 2026', []),
    ]

    const resultado = marcarConceptos(casos, construirEvaluadorInclusion(ORDEN))

    expect(resultado.sinConcepto).toBe(0)
    expect(casos.every((n) => n.conceptoPrincipal !== null)).toBe(true)
  })

  it('es idempotente: volver a marcar no cambia nada', () => {
    // Como las exclusiones: se recalcula sobre la ventana completa en cada corrida, así
    // que tiene que ser un punto fijo o `generadoEn` se movería cada hora sin motivo.
    const ventana = [noticia('CONAF y el Parque Nacional')]
    const evaluador = construirEvaluadorInclusion(ORDEN)
    marcarConceptos(ventana, evaluador)
    const primera = JSON.stringify(ventana)
    marcarConceptos(ventana, evaluador)
    expect(JSON.stringify(ventana)).toBe(primera)
  })

  it('reordenar los conceptos reagrupa la ventana sin volver a la red', () => {
    const ventana = [noticia('CONAF y el Parque Nacional')]
    marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))
    expect(ventana[0].conceptoPrincipal).toBe('CONAF')

    marcarConceptos(ventana, construirEvaluadorInclusion(['Parque Nacional', 'CONAF']))
    expect(ventana[0].conceptoPrincipal).toBe('Parque Nacional')
  })

  it('cuenta por concepto para el resumen', () => {
    const ventana = [noticia('CONAF actúa'), noticia('CONAF y Parque Nacional'), noticia('otra cosa')]
    const resultado = marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN))

    expect(resultado.porConcepto.get('CONAF')).toBe(2)
    expect(resultado.porConcepto.get('Parque Nacional')).toBe(1)
    expect(resultado.total).toBe(3)
  })
})

describe('resumenDeInclusiones', () => {
  it('reporta el conteo por concepto y las sin clasificar', () => {
    const ventana = [noticia('CONAF actúa'), noticia('otra cosa', [], 'https://m.cl/generica')]
    const lineas = resumenDeInclusiones(marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN)))

    expect(lineas.join('\n')).toContain('«CONAF»')
    expect(lineas.join('\n')).toContain('Sin concepto identificado: 1/2')
  })

  it('una noticia sin atribuir sube pasos_fallidos, no pasos_ok', () => {
    // main.js cuenta las líneas [FALLO] para la auditoría de la corrida. Marcarlo como
    // [OK] escondería una pérdida de cobertura entre el ruido normal del resumen.
    const ventana = [noticia('sin nada', [], 'https://m.cl/generica')]
    const lineas = resumenDeInclusiones(marcarConceptos(ventana, construirEvaluadorInclusion(ORDEN)))

    expect(lineas.some((l) => l.startsWith('[FALLO]') && l.includes('Sin concepto'))).toBe(true)
  })
})
