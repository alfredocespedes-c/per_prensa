#!/usr/bin/env node
// Arnés de desarrollo: sirve /api/me y /api/noticias sin levantar Postgres ni el IAM.
//
// Por qué existe: /eventos, /mapa y /regiones están detrás de RutaProtegida y
// ProveedorDatos pega a /api/noticias. Sin backend esas vistas no se renderizan, así
// que no hay forma de MIRAR el resultado (que es la única verificación que vale).
//
// La fixture frontend/public/data/noticias.json no trae `eventId` (es anterior a la
// Fase 2), así que este stub se los inyecta usando el clustering REAL del collector:
// los ids quedan con el formato auténtico `evt:<URL canónica>` — con `:`, `//` y a
// veces `?`/`#` — que es exactamente lo que la ruta por query param tiene que
// aguantar. Una fixture con ids sintéticos no probaría nada.
//
// Uso:
//   node scripts/servidor-stub.mjs [--puerto 8787] [--umbral 0.35] [--anonimo]
//   VITE_API_PROXY_TARGET=http://localhost:8787 npm run dev     (en frontend/)
//
// --anonimo simula a un visitante SIN sesión: /api/me responde 401 y /api/noticias
// devuelve la superficie PÚBLICA, con la misma proyección que hace el backend real
// (ver backend/app/servicios/mapeo.py). Es la única forma de mirar la portada pública
// tal como la ve alguien de la calle sin levantar Postgres ni el IAM.
//
// NO usar en producción: no valida sesión, no tiene cookies, no tiene secretos.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { asignarEventos } from '../collector/src/dominio/eventos.js'
import { UMBRAL_EVENTO, VENTANA_EVENTO_DIAS, UMBRAL_DUPLICADO } from '../collector/src/config/parametros.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(RAIZ, 'frontend', 'public', 'data', 'noticias.json')

function argumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto
}

const PUERTO = Number(argumento('puerto', 8787))
const UMBRAL = Number(argumento('umbral', UMBRAL_EVENTO))
const ANONIMO = process.argv.includes('--anonimo')

// Espejo de CAMPOS_INTERNOS en backend/app/servicios/mapeo.py. Si allá se agrega uno,
// acá también: el stub existe para poder MIRAR lo que ve el público, y un stub que
// muestre de más deja de servir para eso.
const CAMPOS_INTERNOS = [
  'extracto', 'analisis', 'eventId', 'excluida', 'excluidaPor', 'conceptosDetectados',
  // El nombre de quien firma no sale a la portada pública.
  'autor',
]

// `imagen` NO es un campo interno: es un campo que dejó de existir. El backend real no
// puede enviarlo (la columna se eliminó de `noticias` y `NoticiaPublicaOut` lleva
// `extra="forbid"`), pero la fixture es anterior a esa decisión y trae 202 URL de
// imágenes de medios. Si el stub las dejara pasar, mirar las vistas con él mostraría algo
// que el sistema ya no hace: se quitan en LAS DOS superficies, no solo en la pública.
function sinImagen(noticia) {
  const { imagen: _descartada, ...resto } = noticia
  return resto
}

function aSuperficiePublica(estado) {
  return {
    ...estado,
    noticias: estado.noticias.map((noticia) => {
      const publica = sinImagen(noticia)
      for (const campo of CAMPOS_INTERNOS) delete publica[campo]
      return publica
    }),
  }
}

const SESION = {
  usuario: 'lmonsalve',
  email: 'luis.monsalve@conaf.cl',
  rol: 'admin',
  esAdmin: true,
  expiraEn: Math.floor(Date.now() / 1000) + 8 * 3600,
}

// Mínimo para que /#/configuracion renderice; el stub es de solo lectura.
const AHORA = new Date().toISOString()
const concepto = (id, texto, tipo, orden, tiposOcultos = []) => ({
  id, texto, tipo, orden, tiposOcultos, activo: true,
  creadoEn: AHORA, creadoPor: 'stub', actualizadoEn: AHORA, actualizadoPor: 'stub',
})

const CONCEPTOS = {
  conceptos: [
    concepto(1, 'CONAF', 'incluir', 1),
    concepto(2, 'Corporación Nacional Forestal', 'incluir', 2, ['tv']),
    concepto(3, 'Parque Nacional', 'incluir', 3),
    concepto(4, 'CONAFE', 'excluir', 0),
  ],
  // Nivel 2 de la jerarquía, con su orden global.
  secciones: [
    { id: 'escrita', nombre: 'Prensa Escrita', orden: 1 },
    { id: 'regional', nombre: 'Prensa Regional', orden: 2 },
    { id: 'radio', nombre: 'Radio', orden: 3 },
    { id: 'digital', nombre: 'Digital', orden: 4 },
    { id: 'tv', nombre: 'Televisión', orden: 5 },
    { id: 'otros', nombre: 'Otros medios', orden: 6 },
    { id: 'internacional', nombre: 'Medios internacionales', orden: 7 },
  ],
  proximaAplicacion: new Date(Date.now() + 3600_000).toISOString(),
  editable: true,
}

// Bandeja de retiros: una pendiente y una aplicada, para poder mirar los dos estados.
const RETIROS = [
  {
    id: 1, ambito: 'noticia', clave: 'https://www.latercera.com/nota-ejemplo',
    estado: 'pendiente', solicitante: 'Jefatura de prensa', contacto: 'prensa@latercera.com',
    motivo: 'Solicitamos no listar esta nota.', creadoEn: AHORA,
    aplicadoEn: null, aplicadoPor: null,
  },
  {
    id: 2, ambito: 'medio', clave: 'el-ovallino', estado: 'aplicado',
    solicitante: 'Dirección', contacto: 'contacto@elovallino.cl', motivo: null,
    creadoEn: AHORA, aplicadoEn: AHORA, aplicadoPor: 'lmonsalve',
  },
]

function resumirEventos(noticias) {
  const grupos = new Map()
  for (const n of noticias) {
    if (!n.eventId) continue
    grupos.set(n.eventId, (grupos.get(n.eventId) ?? 0) + 1)
  }
  const tamanos = [...grupos.values()].sort((a, b) => b - a)
  return { cantidad: grupos.size, tamanos }
}

async function cargarDatos() {
  const datos = JSON.parse(await readFile(FIXTURE, 'utf8'))

  // Antes que nada: fuera las imágenes, en las dos superficies (ver sinImagen).
  datos.noticias = datos.noticias.map(sinImagen)

  const mapa = asignarEventos(datos.noticias, {
    umbralEvento: UMBRAL,
    ventanaEventoDias: VENTANA_EVENTO_DIAS,
    umbralDuplicado: UMBRAL_DUPLICADO,
  })
  // La fixture es anterior a la jerarquía por concepto: se reparte de forma determinista
  // para poder MIRAR el nivel 1 del boletín. TODAS quedan atribuidas: el boletín no tiene
  // bloque "otras" y una noticia sin concepto es un defecto, no una categoría.
  const CONCEPTOS_DEMO = ['CONAF', 'Corporación Nacional Forestal', 'Parque Nacional']
  datos.noticias.forEach((noticia, indice) => {
    noticia.eventId = mapa.get(noticia.id) ?? null
    const principal = CONCEPTOS_DEMO[indice % CONCEPTOS_DEMO.length]
    noticia.conceptoPrincipal = principal
    noticia.conceptosDetectados = [principal]
  })

  // Nivel 1 con su orden, como lo entrega el backend. Un par de noticias se fechan HOY
  // para poder mirar la marca (la fixture tiene semanas de antigüedad).
  datos.conceptos = CONCEPTOS_DEMO.map((texto, i) => ({ texto, orden: i + 1 }))
  for (const noticia of datos.noticias.slice(0, 5)) {
    noticia.fecha = new Date().toISOString()
  }

  const { cantidad, tamanos } = resumirEventos(datos.noticias)
  console.log(
    `[stub] ${datos.noticias.length} noticias · umbral ${UMBRAL} · ` +
      `${cantidad} eventos · tamaños ${tamanos.slice(0, 8).join(', ') || '—'}`,
  )
  if (cantidad < 3) {
    console.warn(
      `[stub] AVISO: solo ${cantidad} eventos. Para ver la UI de eventos, reintentar con ` +
        `--umbral 0.20 (la fixture es heterogénea y el umbral de producción agrupa poco).`,
    )
  }
  return datos
}

const datos = await cargarDatos()

const servidor = createServer((peticion, respuesta) => {
  const ruta = new URL(peticion.url, 'http://localhost').pathname
  const responder = (codigo, cuerpo) => {
    const texto = JSON.stringify(cuerpo)
    respuesta.writeHead(codigo, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    respuesta.end(texto)
  }

  if (ruta === '/api/me') {
    return ANONIMO ? responder(401, { detail: 'sesion_requerida' }) : responder(200, SESION)
  }
  if (ruta === '/api/noticias') {
    return responder(200, ANONIMO ? aSuperficiePublica(datos) : datos)
  }
  if (ruta === '/api/conceptos') return responder(200, CONCEPTOS)
  if (ruta.startsWith('/api/conceptos/')) return responder(204, {})
  if (ruta === '/api/retiros') {
    if (peticion.method === 'POST') return responder(201, { recibida: true })
    return responder(200, { retiros: RETIROS })
  }
  if (ruta === '/api/auth/logout') return responder(200, { ok: true })
  return responder(404, { detail: `sin stub para ${ruta}` })
})

servidor.listen(PUERTO, () => {
  console.log(
    `[stub] escuchando en http://localhost:${PUERTO} · superficie ${ANONIMO ? 'PÚBLICA (anónimo)' : 'INTERNA (admin)'}`,
  )
})
