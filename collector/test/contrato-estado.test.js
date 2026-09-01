// Contrato de datos del estado publicado (noticias.json).
//
// Este shape lo consumen CUATRO lados a la vez:
//   1. el archivador Postgres (adaptadores/archivador-postgres.js → db/schema.sql),
//   2. el backend FastAPI (backend/app/schemas.py, EstadoNoticiasOut/NoticiaOut),
//   3. el frontend (frontend/src/contexto/ProveedorDatos.jsx y componentes),
//   4. el propio collector al releer su estado previo (main.js).
// Un cambio de contrato exige tocar los cuatro; este test es el tripwire del
// lado collector. Los tests espejo del backend son tests/test_schemas.py y
// tests/test_mapeo.py.
import { describe, expect, it } from 'vitest'
import { crearNoticia } from '../src/dominio/noticia.js'
import { SECCIONES } from '../src/dominio/secciones.js'

// Validador a mano (sin dependencias): claves y tipos del contrato.
function validarNoticia(noticia) {
  const errores = []
  const exigir = (condicion, mensaje) => {
    if (!condicion) errores.push(mensaje)
  }

  const CLAVES_OBLIGATORIAS = [
    'id',
    'url',
    'medioId',
    'medioNombre',
    'seccionId',
    'titular',
    'fecha',
    'fechaDeteccion',
    'extracto',
  ]
  for (const clave of CLAVES_OBLIGATORIAS) {
    exigir(clave in noticia, `falta la clave obligatoria "${clave}"`)
  }

  exigir(typeof noticia.id === 'string' && noticia.id !== '', 'id debe ser string no vacío')
  exigir(typeof noticia.url === 'string' && noticia.url.startsWith('http'), 'url debe ser http(s)')
  exigir(typeof noticia.medioId === 'string' && noticia.medioId !== '', 'medioId debe ser string no vacío')
  exigir(typeof noticia.medioNombre === 'string', 'medioNombre debe ser string')
  exigir(typeof noticia.seccionId === 'string', 'seccionId debe ser string')
  exigir(typeof noticia.titular === 'string' && noticia.titular !== '', 'titular debe ser string no vacío')
  // fecha del medio: ISO-8601 o null (regla de dominio/noticia.js); la de
  // detección siempre existe — es la que ordena en ausencia de la otra
  // (mismo par Optional/obligatorio que NoticiaOut en el backend).
  const esIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
  exigir(noticia.fecha === null || esIso(noticia.fecha), 'fecha debe ser ISO-8601 o null')
  exigir(esIso(noticia.fechaDeteccion), 'fechaDeteccion debe ser ISO-8601')
  // Extracto YA segmentado: el frontend pinta resaltado sin re-detectar.
  exigir(Array.isArray(noticia.extracto), 'extracto debe ser lista')
  for (const fragmento of noticia.extracto ?? []) {
    exigir(typeof fragmento.texto === 'string', 'extracto[].texto debe ser string')
    exigir(typeof fragmento.resaltado === 'boolean', 'extracto[].resaltado debe ser boolean')
  }
  // `imagen` NO está entre las claves permitidas, y por eso la lista blanca del final la
  // rechaza sola si alguien la reintroduce: el sistema dejó de tratar imágenes de noticias
  // por decisión del departamento legal.

  // Claves opcionales (las agregan el enriquecimiento y los eventos DESPUÉS de
  // crearNoticia; el backend las modela como Optional):
  if ('autor' in noticia) {
    exigir(noticia.autor == null || typeof noticia.autor === 'string', 'autor debe ser string o null')
  }
  if ('fechaReal' in noticia) {
    exigir(noticia.fechaReal == null || esIso(noticia.fechaReal), 'fechaReal debe ser ISO-8601 o null')
  }
  if ('eventId' in noticia) {
    exigir(noticia.eventId === null || typeof noticia.eventId === 'string', 'eventId debe ser string o null')
  }
  if ('analisis' in noticia) {
    exigir(
      noticia.analisis === null || typeof noticia.analisis === 'object',
      'analisis debe ser objeto o null',
    )
  }
  // v3: marcado suave de exclusiones (dominio/exclusiones.js) — siempre asignados
  // en la ventana publicada; el frontend oculta las excluidas sin borrarlas.
  if ('excluida' in noticia) {
    exigir(typeof noticia.excluida === 'boolean', 'excluida debe ser boolean')
  }
  if ('excluidaPor' in noticia) {
    exigir(
      Array.isArray(noticia.excluidaPor) && noticia.excluidaPor.every((c) => typeof c === 'string'),
      'excluidaPor debe ser lista de strings',
    )
  }
  // v3 (jerarquía): atribución por concepto, ver dominio/inclusiones.js.
  if ('conceptosDetectados' in noticia) {
    exigir(
      Array.isArray(noticia.conceptosDetectados) &&
        noticia.conceptosDetectados.every((c) => typeof c === 'string'),
      'conceptosDetectados debe ser lista de strings',
    )
  }
  if ('conceptoPrincipal' in noticia) {
    exigir(
      noticia.conceptoPrincipal === null || typeof noticia.conceptoPrincipal === 'string',
      'conceptoPrincipal debe ser string o null',
    )
  }

  // GUARDA: ninguna clave DE MÁS.
  //
  // Hasta acá el validador comprueba que estén las obligatorias y que las opcionales, si
  // están, tengan el tipo correcto. Nunca preguntaba si SOBRA alguna, y esa es justo la
  // forma que tomaría la regresión que más importa evitar: el cuerpo del artículo se
  // descarga para detectar la mención y se descarta, y lo único que se persiste es el
  // extracto acotado. Un campo `texto` o `cuerpo` nuevo en la noticia convertiría al
  // sistema en un archivo de artículos completos —exactamente lo que el diseño evita— y
  // habría pasado este contrato sin que nada fallara.
  //
  // Por eso es lista blanca y no lista negra de `texto`/`cuerpo`: la regresión puede
  // llamarse `contenido`, `html` o `bodyText`, y una lista negra solo atrapa los nombres
  // que a alguien se le ocurrieron hoy.
  const CLAVES_PERMITIDAS = new Set([
    ...CLAVES_OBLIGATORIAS,
    'autor',
    'fechaReal',
    'eventId',
    'analisis',
    'excluida',
    'excluidaPor',
    'conceptosDetectados',
    'conceptoPrincipal',
  ])
  const sobrantes = Object.keys(noticia).filter((clave) => !CLAVES_PERMITIDAS.has(clave))
  exigir(
    sobrantes.length === 0,
    `claves de noticia inesperadas: ${sobrantes.sort().join(', ')} — si alguna guarda el ` +
      'cuerpo del artículo, el sistema pasó de citar a archivar (ver puertos/extractor-de-contenido.js)',
  )
  return errores
}

function validarEstado(estado) {
  const errores = []
  const exigir = (condicion, mensaje) => {
    if (!condicion) errores.push(mensaje)
  }

  exigir(
    JSON.stringify(Object.keys(estado).sort()) ===
      JSON.stringify([
        'conceptosExcluidos',
        'generadoEn',
        'noticias',
        'resolucionesGoogle',
        // Caché de robots.txt por origen, hermana de resolucionesGoogle y sitemapVisto.
        // Estaba ausente de esta lista y de ESTADO_DORADO desde que main.js empezó a
        // publicarla: el contrato pasaba porque validaba una fixture que tampoco la traía,
        // o sea que la guarda de nivel estado se estaba aplicando a una forma que ya no
        // era la real.
        'robotsCache',
        'secciones',
        'sitemapVisto',
        'tamanoVentana',
      ]),
    `claves del estado inesperadas: ${Object.keys(estado).sort().join(', ')}`,
  )
  exigir(!Number.isNaN(Date.parse(estado.generadoEn)), 'generadoEn debe ser ISO-8601')
  exigir(Number.isInteger(estado.tamanoVentana) && estado.tamanoVentana > 0, 'tamanoVentana debe ser entero > 0')
  exigir(Array.isArray(estado.secciones), 'secciones debe ser lista')
  for (const seccion of estado.secciones ?? []) {
    exigir(typeof seccion.id === 'string', 'seccion.id debe ser string')
    exigir(typeof seccion.nombre === 'string', 'seccion.nombre debe ser string')
    exigir(Number.isInteger(seccion.orden), 'seccion.orden debe ser entero')
  }
  exigir(typeof estado.resolucionesGoogle === 'object', 'resolucionesGoogle debe ser objeto')
  exigir(typeof estado.sitemapVisto === 'object', 'sitemapVisto debe ser objeto')
  exigir(
    Array.isArray(estado.conceptosExcluidos) &&
      estado.conceptosExcluidos.every((c) => typeof c === 'string'),
    'conceptosExcluidos debe ser lista de strings',
  )
  for (const noticia of estado.noticias ?? []) {
    errores.push(...validarNoticia(noticia).map((e) => `noticia ${noticia.id}: ${e}`))
  }
  return errores
}

// Fixture dorada: un estado como el que publica una corrida real (recortado).
const ESTADO_DORADO = {
  generadoEn: '2026-08-01T13:05:00.000Z',
  tamanoVentana: 1000,
  secciones: SECCIONES,
  noticias: [
    {
      id: 'https://mediouno.cl/nota-1',
      url: 'https://mediouno.cl/nota-1',
      medioId: 'medio-uno',
      medioNombre: 'Medio Uno',
      seccionId: 'digital',
      titular: 'CONAF anuncia plan de manejo',
      fecha: '2026-08-01T12:00:00.000Z',
      fechaDeteccion: '2026-08-01T13:00:00.000Z',
      extracto: [{ texto: 'CONAF anuncia', resaltado: true }],
      autor: null,
      fechaReal: null,
      eventId: null,
      analisis: { version: 4 },
      excluida: false,
      excluidaPor: [],
      conceptosDetectados: ['CONAF'],
      conceptoPrincipal: 'CONAF',
    },
  ],
  conceptosExcluidos: [],
  resolucionesGoogle: {},
  sitemapVisto: {},
  robotsCache: {},
}

describe('contrato del estado publicado', () => {
  it('la fixture dorada cumple el contrato (si esto falla, cambió el contrato)', () => {
    expect(validarEstado(ESTADO_DORADO)).toEqual([])
  })

  it('lo que produce crearNoticia cumple el contrato de noticia', () => {
    const noticia = crearNoticia({
      medio: { id: 'medio-uno', nombre: 'Medio Uno', tipo: 'digital' },
      titular: 'CONAF fiscaliza',
      url: 'https://mediouno.cl/nota-2',
      fechaMedio: 'no es una fecha',
      fechaDeteccion: '2026-08-01T13:00:00Z',
      extracto: [{ texto: 'CONAF', resaltado: true }],
    })
    expect(validarNoticia(noticia)).toEqual([])
  })

  it('el validador delata una noticia rota (no es decorativo)', () => {
    const rota = { ...ESTADO_DORADO.noticias[0], fechaDeteccion: null, extracto: [{ texto: 'x' }] }
    const errores = validarNoticia(rota)
    expect(errores.some((e) => e.includes('fechaDeteccion'))).toBe(true)
    expect(errores.some((e) => e.includes('resaltado'))).toBe(true)
  })

  // --- Guarda: el cuerpo del artículo no se persiste --------------------------------
  // El sistema descarga el cuerpo para detectar la mención y lo descarta; lo único que
  // almacena es el extracto acotado. Es la decisión que más exposición evita, y hasta
  // ahora nada impedía deshacerla: bastaba con que alguien añadiera un campo.

  it('rechaza una noticia que traiga el cuerpo del artículo', () => {
    const conCuerpo = {
      ...ESTADO_DORADO.noticias[0],
      texto: 'El cuerpo completo del artículo, que no debe persistirse jamás…',
    }

    const errores = validarNoticia(conCuerpo)

    expect(errores.some((e) => e.includes('texto'))).toBe(true)
    expect(errores.some((e) => e.includes('inesperadas'))).toBe(true)
  })

  it('rechaza una noticia que traiga una imagen', () => {
    // GUARDA de la decisión del departamento legal: las imágenes de noticias se
    // eliminaron de las dos superficies y el dato dejó de producirse. Si alguien
    // reintrodujera la extracción, el campo volvería a aparecer acá — y la lista blanca lo
    // delata sin que nadie tenga que acordarse de escribir un test nuevo.
    const errores = validarNoticia({
      ...ESTADO_DORADO.noticias[0],
      imagen: 'https://medio.cl/foto.jpg',
    })

    expect(errores.some((e) => e.includes('imagen'))).toBe(true)
  })

  it('rechaza cualquier clave de más, no solo las que se llaman "texto"', () => {
    // Lista blanca y no lista negra: la regresión puede llamarse `contenido`, `html` o
    // `bodyText`, y una lista negra solo atrapa los nombres que se le ocurrieron a quien
    // escribió el test.
    for (const clave of ['cuerpo', 'contenido', 'html', 'bodyText']) {
      const errores = validarNoticia({ ...ESTADO_DORADO.noticias[0], [clave]: 'x' })
      expect(errores.some((e) => e.includes(clave))).toBe(true)
    }
  })

  it('el estado completo también delata el cuerpo colado en una noticia', () => {
    // La guarda tiene que actuar por la vía real: validarEstado recorre las noticias.
    const estado = {
      ...ESTADO_DORADO,
      noticias: [{ ...ESTADO_DORADO.noticias[0], cuerpo: 'texto completo' }],
    }

    expect(validarEstado(estado).some((e) => e.includes('cuerpo'))).toBe(true)
  })

  it('el catálogo de secciones publicado es el del dominio', () => {
    // El backend siembra `secciones` desde db/schema.sql; el frontend pinta las
    // cabeceras desde aquí. Los ids deben ser exactamente los del dominio.
    expect(ESTADO_DORADO.secciones.map((s) => s.id)).toEqual([
      'escrita',
      'regional',
      'radio',
      'digital',
      'tv',
      'otros',
      'internacional',
    ])
  })
})
