// Test de integración de la composición (src/main.js): fuentes, repositorios,
// extractor y archivador mockeados — el dominio corre de verdad. Fija el
// contrato del estado publicado y las reglas operativas del cron: cuándo una
// corrida cuenta como fallida, que Postgres nunca bote la corrida (fail-open)
// y que la ventana respete su tope. 100% offline.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECCIONES } from '../src/dominio/secciones.js'
import { crearNoticia } from '../src/dominio/noticia.js'

const h = vi.hoisted(() => {
  return {
    parametros: {},
    medios: [],
    obtenerRss: null,
    obtenerGoogle: null,
    obtenerContenido: null,
    omitidasPorMuro: 0,
    estadoRepo: null,
    historicoRepo: null,
    archivador: null,
    crearArchivador: null,
    crearRepoConceptos: null,
  }
})

vi.mock('../src/config/parametros.js', () => h.parametros)
vi.mock('../src/config/medios.js', () => ({ MEDIOS: h.medios, MEDIOS_SITEMAP: [] }))
vi.mock('../src/adaptadores/fuente-rss.js', () => ({
  crearFuenteRss: () => ({ obtener: h.obtenerRss }),
}))
vi.mock('../src/adaptadores/fuente-google-news.js', () => ({
  crearFuenteGoogleNews: () => ({ obtener: h.obtenerGoogle }),
}))
vi.mock('../src/adaptadores/resolver-google-news.js', () => ({
  crearResolutorGoogleNews: () => ({}),
}))
vi.mock('../src/adaptadores/fuente-sitemap-news.js', () => ({
  crearFuenteSitemapNews: () => ({ obtener: async () => ({ items: [], cache: new Set() }) }),
}))
vi.mock('../src/adaptadores/extractor-contenido.js', () => ({
  crearExtractorContenido: () => ({
    obtenerContenido: h.obtenerContenido,
    // Contador de muros de pago. El doble tiene que exponerlo: main.js lo lee SIEMPRE
    // para emitir la línea del resumen, también cuando vale cero.
    estadisticas: () => ({ omitidasPorMuro: h.omitidasPorMuro ?? 0 }),
  }),
}))
vi.mock('../src/adaptadores/repositorio-json.js', () => ({
  crearRepositorioJson: (entrada) =>
    String(entrada).includes('historico') ? h.historicoRepo : h.estadoRepo,
}))
vi.mock('../src/adaptadores/archivador-postgres.js', () => ({
  crearArchivadorPostgres: (...args) => h.crearArchivador(...args),
}))
vi.mock('../src/adaptadores/repositorio-conceptos-postgres.js', () => ({
  crearRepositorioConceptosPostgres: (...args) => h.crearRepoConceptos(...args),
}))

const MEDIO = { id: 'medio-uno', nombre: 'Medio Uno', tipo: 'digital', feedUrl: 'https://mediouno.cl/rss' }

const itemRss = (n = 1) => ({
  titular: `CONAF anuncia plan de manejo ${n}`,
  url: `https://mediouno.cl/nota-${n}`,
  fecha: '2026-08-01T12:00:00Z',
  texto: 'La Corporación Nacional Forestal presentó el plan.',
})

// Noticia "previa" tal como quedó publicada en una corrida anterior: con
// eventId ya asignado, para que una corrida sin novedades no la modifique.
const previaPublicada = () => {
  const noticia = crearNoticia({
    medio: MEDIO,
    titular: 'CONAF fiscaliza tala ilegal',
    url: 'https://mediouno.cl/previa',
    fechaMedio: '2026-08-01T10:00:00Z',
    fechaDeteccion: '2026-08-01T10:00:00Z',
    extracto: [{ texto: 'CONAF fiscaliza', resaltado: true }],
  })
  noticia.eventId = null
  // v3: el marcado suave de exclusiones asigna estos campos en cada corrida; una
  // previa real ya los trae, y con la misma lista la re-asignación es estable.
  noticia.excluida = false
  noticia.excluidaPor = []
  // Ídem con la atribución por concepto (nivel 1 del boletín): se recalcula en cada
  // corrida, así que una previa real ya viene con estos campos. El titular de esta
  // fixture menciona CONAF, que es el primer concepto de la semilla.
  noticia.conceptosDetectados = ['CONAF']
  noticia.conceptoPrincipal = 'CONAF'
  return noticia
}

const estadoPrevioBase = (noticias, extras = {}) => ({
  generadoEn: '2026-08-01T00:00:00.000Z',
  tamanoVentana: 100,
  secciones: SECCIONES,
  noticias,
  conceptosExcluidos: [],
  resolucionesGoogle: {},
  sitemapVisto: {},
  ...extras,
})

async function correrMain() {
  vi.resetModules()
  const { main } = await import('../src/main.js')
  await main()
}

const estadoGuardado = () => h.estadoRepo.guardar.mock.calls.at(-1)[0]

let argvOriginal

beforeEach(() => {
  argvOriginal = process.argv
  process.argv = ['node', 'main.js']
  process.exitCode = undefined

  // Los factories de vi.mock capturan h.parametros y h.medios UNA sola vez
  // (el registro de mocks sobrevive a resetModules): hay que mutarlos in situ,
  // nunca reasignarlos.
  for (const clave of Object.keys(h.parametros)) delete h.parametros[clave]
  Object.assign(h.parametros, {
    TAMANO_VENTANA: 100,
    LARGO_EXTRACTO: 500,
    TIMEOUT_FEED_MS: 1000,
    USER_AGENT: 'test/1.0',
    // Apagado en los tests: la política pediría /robots.txt de verdad y estas pruebas
    // son herméticas (test/setup.js hace lanzar cualquier fetch no simulado).
    ROBOTS_ACTIVO: false,
    ROBOTS_TTL_HORAS: 24,
    CRAWL_DELAY_POR_DEFECTO_MS: 0,
    CRAWL_DELAY_MAXIMO_MS: 10_000,
    GOOGLE_NEWS_ACTIVO: false,
    GOOGLE_NEWS_PARAMS: {},
    MAX_RESOLUCIONES_POR_CORRIDA: 10,
    DOMINIOS_EXCLUIDOS: [],
    SITEMAP_ACTIVO: false,
    MAX_DESCARGAS_SITEMAP_POR_CORRIDA: 10,
    ENRIQUECIMIENTO_ACTIVO: false,
    MAX_DESCARGAS_POR_CORRIDA: 10,
    VERSION_ANALISIS: 3,
    UMBRAL_EVENTO: 0.35,
    VENTANA_EVENTO_DIAS: 14,
    UMBRAL_DUPLICADO: 0.85,
    HISTORICO_MAX_DIAS: 400,
    RETENCION_EXTRACTO_DIAS: 180,
    RETENCION_METADATOS_DIAS: 400,
    RETENCION_EJECUCIONES_DIAS: 400,
    TAMANO_LOTE_PURGA: 500,
    POSTGRES_ACTIVO: false,
    // v3: conceptos administrados desde la base. Apagado por defecto en estos
    // tests: los conceptos vienen de la semilla config/conceptos.js real.
    CONCEPTOS_DESDE_BD: false,
    GOOGLE_NEWS_MAX_LARGO_CONSULTA: 1500,
  })
  h.medios.splice(0, h.medios.length, { ...MEDIO })
  h.obtenerRss = vi.fn(async () => [])
  h.obtenerGoogle = vi.fn(async () => ({ items: [], cache: new Map() }))
  h.obtenerContenido = vi.fn(async () => null)
  h.estadoRepo = { cargar: vi.fn(async () => null), guardar: vi.fn(async () => {}) }
  h.historicoRepo = { cargar: vi.fn(async () => null), guardar: vi.fn(async () => {}) }
  h.archivador = {
    archivar: vi.fn(async () => {}),
    registrarEjecucion: vi.fn(async () => {}),
    cerrar: vi.fn(async () => {}),
  }
  h.crearArchivador = vi.fn(() => h.archivador)
  h.crearRepoConceptos = vi.fn(() => ({
    obtener: async () => ({ incluir: [], excluir: [], incluirPorPrioridad: [], descartados: 0 }),
    cerrar: async () => {},
  }))

  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.argv = argvOriginal
  process.exitCode = undefined
  vi.restoreAllMocks()
})

describe('main: contrato del estado publicado', () => {
  it('publica el estado con la forma exacta que consumen frontend y Postgres', async () => {
    h.obtenerRss = vi.fn(async () => [itemRss()])
    await correrMain()

    const estado = estadoGuardado()
    // Contrato: si esta lista cambia, hay que tocar db/schema.sql, el backend
    // y el frontend a la vez.
    expect(Object.keys(estado).sort()).toEqual(
      [
        'generadoEn',
        'noticias',
        'conceptosExcluidos',
        'resolucionesGoogle',
        // Caché de robots.txt por origen: hermana de resolucionesGoogle y sitemapVisto.
        'robotsCache',
        'secciones',
        'sitemapVisto',
        'tamanoVentana',
      ].sort(),
    )
    expect(estado.secciones).toEqual(SECCIONES)
    expect(estado.tamanoVentana).toBe(100)
    expect(estado.noticias).toHaveLength(1)
    const noticia = estado.noticias[0]
    expect(noticia.medioId).toBe('medio-uno')
    expect(noticia.seccionId).toBe('digital')
    expect(noticia.titular).toContain('CONAF')
    // El extracto va YA segmentado con el resaltado resuelto (el frontend no
    // re-implementa la detección).
    expect(noticia.extracto.some((s) => s.resaltado)).toBe(true)
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('descarta los ítems del feed que no mencionan los conceptos', async () => {
    h.obtenerRss = vi.fn(async () => [
      itemRss(),
      { titular: 'Sube el dólar', url: 'https://mediouno.cl/dolar', fecha: null, texto: 'Economía.' },
    ])
    await correrMain()
    expect(estadoGuardado().noticias).toHaveLength(1)
  })

  it('respeta el tope de la ventana móvil (TAMANO_VENTANA)', async () => {
    h.parametros.TAMANO_VENTANA = 2
    h.obtenerRss = vi.fn(async () => [itemRss(1), itemRss(2), itemRss(3)])
    await correrMain()
    const estado = estadoGuardado()
    expect(estado.noticias).toHaveLength(2)
    expect(estado.tamanoVentana).toBe(2)
  })

  it('una previa que superó la retención de texto se publica SIN extracto', async () => {
    // Extremo a extremo de la política de retención. Importa que ocurra acá y no solo en
    // la purga nocturna de Postgres: el archivador hace upsert de la ventana completa
    // cada hora, así que si esta noticia conservara su extracto se lo devolvería a la
    // base y el borrado de las 06:30 no serviría de nada.
    const vieja = previaPublicada()
    vieja.fechaDeteccion = new Date(Date.now() - 200 * 86_400_000).toISOString()
    vieja.analisis = { version: 3, sentimiento: 'neutra', keywords: ['tala'], regiones: ['maule'] }
    h.estadoRepo.cargar = vi.fn(async () => estadoPrevioBase([vieja]))

    await correrMain()

    const publicada = estadoGuardado().noticias.find((n) => n.id === vieja.id)
    expect(publicada.extracto).toEqual([])
    expect(publicada.analisis).not.toHaveProperty('keywords')
    // La referencia bibliográfica sobrevive: sigue siendo un enlace útil al original.
    expect(publicada.titular).toBe('CONAF fiscaliza tala ilegal')
    expect(publicada.url).toBe('https://mediouno.cl/previa')
    expect(publicada.analisis.regiones).toEqual(['maule'])
  })

  it('una previa dentro de la retención conserva su extracto', async () => {
    const reciente = previaPublicada()
    reciente.fechaDeteccion = new Date(Date.now() - 10 * 86_400_000).toISOString()
    h.estadoRepo.cargar = vi.fn(async () => estadoPrevioBase([reciente]))

    await correrMain()

    const publicada = estadoGuardado().noticias.find((n) => n.id === reciente.id)
    expect(publicada.extracto).toEqual([{ texto: 'CONAF fiscaliza', resaltado: true }])
  })

  it('una previa que arrastra `imagen` de una versión anterior se depura del estado', async () => {
    // El hueco que esto cierra: la cadena de PRODUCCIÓN de imágenes se cortó, pero el
    // estado de trabajo persiste entre corridas y las previas se releen tal cual. Sin
    // limpieza explícita, un og:image de antes de la decisión legal se reescribía en el
    // archivo cada hora, para siempre — verificado sobre `fusionar` antes del arreglo.
    const previa = previaPublicada()
    previa.imagen = 'https://mediouno.cl/og-image-vieja.jpg'
    h.estadoRepo.cargar = vi.fn(async () => estadoPrevioBase([previa]))

    await correrMain()

    const publicada = estadoGuardado().noticias.find((n) => n.id === previa.id)
    expect(publicada).toBeDefined()
    expect(publicada).not.toHaveProperty('imagen')
    expect(JSON.stringify(estadoGuardado())).not.toContain('og-image-vieja')
    // Y la corrida lo reporta: una limpieza silenciosa no deja saber cuándo terminó.
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('una corrida sin novedades conserva generadoEn (no simula frescura)', async () => {
    const previa = previaPublicada()
    h.estadoRepo.cargar = vi.fn(async () => estadoPrevioBase([previa]))
    await correrMain()
    expect(estadoGuardado().generadoEn).toBe('2026-08-01T00:00:00.000Z')
  })

  it('una corrida con novedades renueva generadoEn', async () => {
    const previa = previaPublicada()
    h.estadoRepo.cargar = vi.fn(async () => estadoPrevioBase([previa]))
    h.obtenerRss = vi.fn(async () => [itemRss()])
    await correrMain()
    expect(estadoGuardado().generadoEn).not.toBe('2026-08-01T00:00:00.000Z')
  })

  it('aborta si un medio configurado tiene un tipo de sección desconocido', async () => {
    // La validación corre ANTES de tocar la red: un error de edición en
    // config/medios.js debe reventar el arranque, no publicar datos rotos.
    h.medios.splice(0, h.medios.length, { ...MEDIO, tipo: 'chatarra' })
    vi.resetModules()
    const { main } = await import('../src/main.js')
    await expect(main()).rejects.toThrow('Tipo de medio desconocido')
    expect(h.estadoRepo.guardar).not.toHaveBeenCalled()
  })
})

describe('main: criterio de corrida fallida', () => {
  it('marca exitCode 1 si ninguna fuente entregó nada (no desplegar vacío)', async () => {
    h.obtenerRss = vi.fn(async () => {
      throw new Error('feed caído')
    })
    await correrMain()
    expect(process.exitCode).toBe(1)
    // El estado igual se guarda: la página conserva la última versión buena.
    expect(h.estadoRepo.guardar).toHaveBeenCalled()
  })

  it('con al menos una fuente curada respondiendo, la corrida es exitosa', async () => {
    h.medios.splice(
      0,
      h.medios.length,
      { ...MEDIO },
      { ...MEDIO, id: 'medio-dos', nombre: 'Medio Dos', feedUrl: 'https://mediodos.cl/rss' },
    )
    let llamada = 0
    h.obtenerRss = vi.fn(async () => {
      llamada += 1
      if (llamada === 1) throw new Error('feed caído')
      return []
    })
    await correrMain()
    expect(process.exitCode ?? 0).toBe(0)
  })
})

describe('main: Google News como red de seguridad', () => {
  it('si Google falla, la corrida sigue y conserva la caché de resoluciones previa', async () => {
    h.parametros.GOOGLE_NEWS_ACTIVO = true
    h.obtenerGoogle = vi.fn(async () => {
      throw new Error('batchexecute cambió')
    })
    const previa = previaPublicada()
    h.estadoRepo.cargar = vi.fn(async () =>
      estadoPrevioBase([previa], { resolucionesGoogle: { 'CBM=': 'https://mediouno.cl/previa' } }),
    )
    await correrMain()
    expect(process.exitCode ?? 0).toBe(0)
    expect(estadoGuardado().resolucionesGoogle).toEqual({ 'CBM=': 'https://mediouno.cl/previa' })
  })

  it('las noticias de Google entran con la sección que trae su clasificación', async () => {
    h.parametros.GOOGLE_NEWS_ACTIVO = true
    h.obtenerGoogle = vi.fn(async () => ({
      items: [
        {
          titular: 'CONAF combate incendio',
          url: 'https://otromedio.cl/nota',
          fecha: '2026-08-01T13:00:00Z',
          texto: '',
          medioId: 'otromedio.cl',
          medioNombre: 'Otro Medio',
          seccionId: 'otros',
        },
      ],
      cache: new Map(),
    }))
    await correrMain()
    const noticia = estadoGuardado().noticias.find((n) => n.medioId === 'otromedio.cl')
    expect(noticia).toBeDefined()
    expect(noticia.seccionId).toBe('otros')
  })
})

describe('main: enriquecimiento fail-open', () => {
  it('si el extractor no obtiene contenido, la noticia queda con analisis null y la corrida no falla', async () => {
    h.parametros.ENRIQUECIMIENTO_ACTIVO = true
    h.obtenerRss = vi.fn(async () => [itemRss()])
    h.obtenerContenido = vi.fn(async () => null)
    await correrMain()
    const noticia = estadoGuardado().noticias[0]
    expect(noticia.analisis).toBeNull()
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('con contenido descargado, propaga autor y agrega el análisis versionado', async () => {
    h.parametros.ENRIQUECIMIENTO_ACTIVO = true
    h.obtenerRss = vi.fn(async () => [itemRss()])
    h.obtenerContenido = vi.fn(async () => ({
      texto: 'CONAF presentó un plan de manejo forestal en la región del Biobío.',
      autor: 'Redacción',
      fechaPublicacion: '2026-08-01T11:00:00Z',
    }))
    await correrMain()
    const noticia = estadoGuardado().noticias[0]
    expect(noticia.autor).toBe('Redacción')
    expect(noticia.analisis).not.toBeNull()
    expect(noticia.analisis.version).toBe(3)
  })

  it('aunque un extractor futuro devuelva una imagen, la noticia publicada NO la lleva', async () => {
    // GUARDA de extremo a extremo de la decisión del departamento legal. Las guardas de
    // extractor-contenido.test.js cubren el productor; esta cubre el trayecto completo:
    // si alguien repone la extracción, main.js no debe volver a propagarla al estado.
    h.parametros.ENRIQUECIMIENTO_ACTIVO = true
    h.obtenerRss = vi.fn(async () => [itemRss()])
    h.obtenerContenido = vi.fn(async () => ({
      imagen: 'https://mediouno.cl/foto.jpg',
      texto: 'CONAF presentó un plan de manejo forestal en la región del Biobío.',
      autor: 'Redacción',
      fechaPublicacion: '2026-08-01T11:00:00Z',
    }))
    await correrMain()
    const noticia = estadoGuardado().noticias[0]
    expect(noticia).not.toHaveProperty('imagen')
    expect(JSON.stringify(estadoGuardado())).not.toContain('foto.jpg')
  })
})

describe('main: sumidero Postgres (fail-open)', () => {
  it('con POSTGRES_ACTIVO apagado jamás se instancia el archivador', async () => {
    h.obtenerRss = vi.fn(async () => [itemRss()])
    await correrMain()
    expect(h.crearArchivador).not.toHaveBeenCalled()
  })

  it('activo: archiva el estado, registra la ejecución y cierra el pool', async () => {
    h.parametros.POSTGRES_ACTIVO = true
    h.obtenerRss = vi.fn(async () => [itemRss()])
    await correrMain()
    expect(h.archivador.archivar).toHaveBeenCalledWith(estadoGuardado())
    const registro = h.archivador.registrarEjecucion.mock.calls[0][0]
    expect(registro.exito).toBe(true)
    expect(registro.noticiasPublicadas).toBe(1)
    expect(registro.noticiasNuevas).toBe(1)
    expect(h.archivador.cerrar).toHaveBeenCalled()
  })

  it('un fallo de Postgres no hace fallar la corrida y aun así cierra el pool', async () => {
    h.parametros.POSTGRES_ACTIVO = true
    h.obtenerRss = vi.fn(async () => [itemRss()])
    h.archivador.archivar = vi.fn(async () => {
      throw new Error('conexión rechazada')
    })
    await correrMain()
    expect(process.exitCode ?? 0).toBe(0)
    expect(h.archivador.cerrar).toHaveBeenCalled()
  })
})
