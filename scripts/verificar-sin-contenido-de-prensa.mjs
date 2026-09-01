#!/usr/bin/env node
// GUARDA DE CI: que no entre contenido de prensa real al control de versiones.
//
// El repositorio está pensado para publicarse y ser reutilizado por otras instituciones.
// Un extracto olvidado en una fixture es una publicación mundial y permanente: el
// historial de git lo conserva aunque después se borre del árbol, y sacarlo exige
// reescribir la historia y forzar el push en todas las ramas.
//
// POR CONTENIDO, NO POR EXTENSIÓN. Buscar solo archivos .json dejaría pasar el caso real
// que hay hoy en este repo: `INSUMO/panel_menciones_conaf.jsx`, que es un .jsx con
// veinte fichas de prensa reales dentro.
//
// La señal es la DENSIDAD de enlaces a notas concretas de medios de la lista curada. Los
// fixtures legítimos usan dominios reales con rutas inventadas y cortas
// (`https://mediouno.cl/nota-1`); un volcado trae decenas de URLs con slugs largos.
// Distinguir "dominio real" de "nota real" es lo que impide que el CI quede rojo para
// siempre y alguien lo desactive.
//
// Uso:  node scripts/verificar-sin-contenido-de-prensa.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MEDIOS, MEDIOS_SITEMAP } from '../collector/src/config/medios.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Cuántos enlaces a notas concretas tolera un archivo antes de considerarse un volcado.
// Dos permiten un fixture con un par de casos; veinte fichas no pasan.
const UMBRAL = 3

// Rutas cuyo contenido es legítimamente una lista de medios o de notas verificadas: son
// el registro operativo del proyecto, no un corpus de prensa.
const PERMITIDOS = [
  'collector/src/config/medios.js', // la lista curada: dominios, no notas
  'docs/MEDIOS.md', // registro de verificación por medio
  'scripts/verificar-sin-contenido-de-prensa.mjs', // este archivo
]

// DEUDA CONOCIDA — no es una excepción permanente.
//
// `INSUMO/` está versionado y contiene veinte fichas de prensa reales con resúmenes,
// URLs y un campo `notas` con análisis interno de la UIA sobre la cobertura y sobre la
// propia institución. Sacarlo del control de versiones (y purgar el historial) es un
// cambio de contenido del repositorio que requiere decisión aparte, no una guarda.
//
// Está acá y no en PERMITIDOS para que se lea como lo que es: un pendiente. Al resolverlo,
// borrar esta lista entera y comprobar que la guarda sigue en verde.
const DEUDA_CONOCIDA = ['INSUMO/']

const dominios = [...MEDIOS, ...MEDIOS_SITEMAP]
  .map((m) => {
    try {
      return new URL(m.feedUrl ?? m.sitemapUrl).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  })
  .filter(Boolean)

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alternativas = dominios.map(escapar).join('|')

// Enlace a una NOTA concreta: dominio de la lista MÁS una ruta que parece un artículo
// —varios segmentos, o un slug largo con guiones—. El dominio por sí solo no basta: los
// fixtures legítimos usan dominios reales con rutas inventadas y cortas.
const ENLACE_A_NOTA = new RegExp(
  `https?://(?:www\\.)?(?:${alternativas})/(?:[\\w-]+/){2,}[\\w-]{10,}` +
    `|https?://(?:www\\.)?(?:${alternativas})/[\\w-]*(?:[\\w]-[\\w]){4,}[\\w-]*`,
  'gi',
)

function versionados() {
  return execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function excluido(archivo) {
  return (
    PERMITIDOS.includes(archivo) ||
    DEUDA_CONOCIDA.some((prefijo) => archivo.startsWith(prefijo)) ||
    /\.(png|jpe?g|gif|webp|svg|ico|pdf|woff2?)$/i.test(archivo)
  )
}

export function analizar() {
  const hallazgos = []
  for (const archivo of versionados()) {
    if (excluido(archivo)) continue
    let contenido
    try {
      contenido = readFileSync(path.join(RAIZ, archivo), 'utf8')
    } catch {
      continue // binario o ilegible
    }
    const enlaces = [...contenido.matchAll(ENLACE_A_NOTA)].map((m) => m[0])
    if (enlaces.length >= UMBRAL) {
      hallazgos.push({ archivo, cantidad: enlaces.length, muestra: enlaces.slice(0, 3) })
    }
  }
  return hallazgos
}

const hallazgos = analizar()

if (hallazgos.length === 0) {
  console.log(
    `OK - ningun archivo versionado concentra ${UMBRAL}+ enlaces a notas de los ` +
      `${dominios.length} medios monitoreados.`,
  )
  if (DEUDA_CONOCIDA.length > 0) {
    console.log(`\nAviso: ${DEUDA_CONOCIDA.join(', ')} excluido como deuda conocida.`)
  }
  process.exit(0)
}

console.error('CONTENIDO DE PRENSA REAL EN ARCHIVOS VERSIONADOS:\n')
for (const h of hallazgos) {
  console.error(`  ${h.archivo} - ${h.cantidad} enlaces a notas`)
  for (const enlace of h.muestra) console.error(`      ${enlace.slice(0, 100)}`)
}
console.error(
  '\nPOR QUE IMPORTA: este repositorio esta pensado para publicarse. El contenido de los\n' +
    'medios que entre aqui queda en el historial de git de forma permanente: borrarlo del\n' +
    'arbol NO lo saca, hay que reescribir la historia y forzar el push en todas las ramas.\n\n' +
    'Los datos de noticias van en rutas ignoradas (frontend/public/data/, collector/datos/).\n' +
    'Si es una fixture, usa titulares inventados y rutas cortas.',
)
process.exit(1)
