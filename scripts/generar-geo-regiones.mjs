#!/usr/bin/env node
// Genera la geometría de las regiones que consume el mapa coroplético del frontend.
//
//   INSUMO_GRAFICO/REGIONES_v1.json   (83 MB, 2,16 M de vértices, 36.955 anillos)
//        -> frontend/public/geo/regiones-chile.v1.json   (~300 KB)
//
// El insumo es la capa oficial de regiones (EPSG:4326) y NO se versiona: 83 MB no son
// un artefacto de repositorio. Lo que se commitea es la salida. Ver .gitignore.
//
//   node --max-old-space-size=6144 scripts/generar-geo-regiones.mjs
//
// El flag hace falta: el árbol parseado ronda 1,5-2 GB.
//
// Decisiones que NO son arbitrarias:
//  - MIN_AREA_KM2 = 20, no 50: Robinson Crusoe mide 47,6 km² y es Parque Nacional.
//  - Se conserva el territorio insular (Rapa Nui, Juan Fernández): cuesta ~1,3 % de
//    los puntos y son dos Parques Nacionales de CONAF. El ENCUADRE del mapa sí es
//    continental, pero eso lo decide el componente, no los datos.
//  - Se eliminan REGION y SUPERFICIE de las properties. El frontend nunca deriva
//    texto visible desde datos crudos (ver utilidades/etiquetas.js): la etiqueta sale
//    de etiquetaRegion(slug). Dejar REGION aquí sería una invitación a saltárselo.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRADA = join(RAIZ, 'INSUMO_GRAFICO', 'REGIONES_v1.json')
const SALIDA = join(RAIZ, 'frontend', 'public', 'geo', 'regiones-chile.v1.json')

// Anillos por debajo de esta superficie se descartan (islotes, rompeolas, rocas).
const MIN_AREA_KM2 = 20
// Tolerancia de Ramer-Douglas-Peucker en grados. 0,01° ≈ 1,1 km ≈ 0,25 px en el
// mapa nacional: por debajo del píxel, invisible.
const TOLERANCIA = 0.01
// 4 decimales ≈ 11 m. Más precisión solo engorda el archivo.
const DECIMALES = 4
const TAMANO_MIN_KB = 150
const TAMANO_MAX_KB = 400

// CUT_REG -> slug del collector. Debe coincidir 1:1 con REGIONES_CHILE en
// collector/src/dominio/geografia.js (y con ETIQUETAS_REGIONES del frontend).
const CUT_A_SLUG = {
  '15': 'arica-parinacota',
  '01': 'tarapaca',
  '02': 'antofagasta',
  '03': 'atacama',
  '04': 'coquimbo',
  '05': 'valparaiso',
  '06': 'ohiggins',
  '07': 'maule',
  '08': 'biobio',
  '09': 'araucania',
  '10': 'los-lagos',
  '11': 'aysen',
  '12': 'magallanes',
  '13': 'metropolitana',
  '14': 'los-rios',
  '16': 'nuble',
}

const GRADO_KM = 111.32

// ---------------------------------------------------------------- geometría

// Superficie del anillo en km². El shoelace da grados²; la longitud vale menos
// kilómetros a medida que se sube en latitud, así que hay que corregir por cos(lat):
// sin eso, Magallanes perdería islas del mismo tamaño que las que Arica conserva.
function areaKm2(anillo) {
  let doble = 0
  let sumaLat = 0
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    doble += anillo[j][0] * anillo[i][1] - anillo[i][0] * anillo[j][1]
    sumaLat += anillo[i][1]
  }
  const latMedia = (sumaLat / anillo.length) * (Math.PI / 180)
  return Math.abs(doble / 2) * GRADO_KM * GRADO_KM * Math.cos(latMedia)
}

// Distancia perpendicular punto-recta, al cuadrado (evita raíces en el bucle caliente).
function distancia2ARecta(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2
  const num = dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]
  return (num * num) / (dx * dx + dy * dy)
}

// Ramer-Douglas-Peucker sobre un ARCO ABIERTO, iterativo. Iterativo y no recursivo
// porque hay anillos de más de 100.000 puntos y la recursión desborda la pila.
function simplificarArco(puntos, tolerancia) {
  if (puntos.length < 3) return puntos.slice()
  const tol2 = tolerancia * tolerancia
  const conservar = new Uint8Array(puntos.length)
  conservar[0] = 1
  conservar[puntos.length - 1] = 1

  const pila = [[0, puntos.length - 1]]
  while (pila.length) {
    const [inicio, fin] = pila.pop()
    let maximo = -1
    let indice = -1
    for (let i = inicio + 1; i < fin; i++) {
      const d = distancia2ARecta(puntos[i], puntos[inicio], puntos[fin])
      if (d > maximo) {
        maximo = d
        indice = i
      }
    }
    if (maximo > tol2 && indice > 0) {
      conservar[indice] = 1
      pila.push([inicio, indice], [indice, fin])
    }
  }

  const salida = []
  for (let i = 0; i < puntos.length; i++) if (conservar[i]) salida.push(puntos[i])
  return salida
}

// RDP sobre un anillo CERRADO. Aplicarlo directo colapsaría el anillo contra su
// cuerda (el primer y último punto coinciden, así que la "recta" es un punto): hay
// que partirlo en dos arcos por el vértice más lejano al inicial.
function simplificarAnillo(anillo, tolerancia) {
  const cerrado =
    anillo.length > 1 &&
    anillo[0][0] === anillo[anillo.length - 1][0] &&
    anillo[0][1] === anillo[anillo.length - 1][1]
  const abierto = cerrado ? anillo.slice(0, -1) : anillo.slice()
  if (abierto.length < 4) return null

  let lejano = 0
  let maximo = -1
  for (let i = 1; i < abierto.length; i++) {
    const d = (abierto[i][0] - abierto[0][0]) ** 2 + (abierto[i][1] - abierto[0][1]) ** 2
    if (d > maximo) {
      maximo = d
      lejano = i
    }
  }

  const arcoA = simplificarArco(abierto.slice(0, lejano + 1), tolerancia)
  const arcoB = simplificarArco(abierto.slice(lejano), tolerancia)
  const unido = arcoA.concat(arcoB.slice(1))

  // Redondeo + descarte de puntos consecutivos repetidos: el propio redondeo genera
  // duplicados y dejarlos produce segmentos de largo cero.
  const f = 10 ** DECIMALES
  const limpio = []
  for (const [lon, lat] of unido) {
    const p = [Math.round(lon * f) / f, Math.round(lat * f) / f]
    const ultimo = limpio[limpio.length - 1]
    if (!ultimo || ultimo[0] !== p[0] || ultimo[1] !== p[1]) limpio.push(p)
  }
  if (limpio.length < 3) return null

  limpio.push([limpio[0][0], limpio[0][1]]) // recerrar
  return limpio
}

function dentroDelPoligono(punto, anillo) {
  const [x, y] = punto
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function distanciaASegmento(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const largo2 = dx * dx + dy * dy
  let t = largo2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function distanciaAlBorde(punto, anillo) {
  let minimo = Infinity
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const d = distanciaASegmento(punto, anillo[j], anillo[i])
    if (d < minimo) minimo = d
  }
  return minimo
}

// Polo de inaccesibilidad aproximado: el punto interior más lejano de cualquier borde.
// El centroide no sirve — en una región con forma de C cae fuera, y en Magallanes
// caería en el mar. Se usa como ancla del número que se dibuja sobre el mapa.
function puntoEtiqueta(anillo) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity
  for (const [lon, lat] of anillo) {
    if (lon < lonMin) lonMin = lon
    if (lon > lonMax) lonMax = lon
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
  }

  const buscar = (x0, x1, y0, y1, pasos) => {
    let mejor = null
    let mejorD = -1
    for (let i = 1; i < pasos; i++) {
      for (let j = 1; j < pasos; j++) {
        const p = [x0 + ((x1 - x0) * i) / pasos, y0 + ((y1 - y0) * j) / pasos]
        if (!dentroDelPoligono(p, anillo)) continue
        const d = distanciaAlBorde(p, anillo)
        if (d > mejorD) {
          mejorD = d
          mejor = p
        }
      }
    }
    return mejor
  }

  const grueso = buscar(lonMin, lonMax, latMin, latMax, 24)
  if (!grueso) return null

  // Refinamiento local: la grilla gruesa acierta la zona, no el punto.
  const pasoLon = (lonMax - lonMin) / 24
  const pasoLat = (latMax - latMin) / 24
  const fino = buscar(
    grueso[0] - pasoLon, grueso[0] + pasoLon,
    grueso[1] - pasoLat, grueso[1] + pasoLat,
    8,
  )
  const p = fino ?? grueso
  const f = 10 ** DECIMALES
  return [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f]
}

// ---------------------------------------------------------------- pipeline

function partesDe(geometria) {
  // El insumo no tiene hoyos (verificado): cada parte es un único anillo exterior.
  return geometria.type === 'MultiPolygon' ? geometria.coordinates : [geometria.coordinates]
}

function procesarFeature(feature) {
  const cut = feature.properties.CUT_REG
  const slug = CUT_A_SLUG[cut]
  if (!slug) throw new Error(`CUT_REG desconocido: ${cut}`)

  const anillos = partesDe(feature.geometry)
    .map((parte) => parte[0])
    .map((anillo) => ({ anillo, area: areaKm2(anillo) }))
    .sort((a, b) => b.area - a.area)

  // Siempre el mayor, más todos los que superen el umbral: así ninguna región puede
  // quedar vacía por más agresivo que sea el filtro.
  const elegidos = anillos.filter((r, i) => i === 0 || r.area >= MIN_AREA_KM2)

  const simplificados = elegidos
    .map((r) => simplificarAnillo(r.anillo, TOLERANCIA))
    .filter((r) => r !== null && r.length >= 4)

  if (!simplificados.length) throw new Error(`${slug} quedó sin geometría`)

  return {
    type: 'Feature',
    properties: { slug, cut, label: puntoEtiqueta(simplificados[0]) },
    geometry: { type: 'MultiPolygon', coordinates: simplificados.map((a) => [a]) },
  }
}

function verificar(coleccion, bytes) {
  const errores = []
  const ok = (condicion, mensaje) => {
    console.log(`  [${condicion ? 'OK' : 'FALLA'}] ${mensaje}`)
    if (!condicion) errores.push(mensaje)
  }

  const slugs = coleccion.features.map((f) => f.properties.slug)
  const esperados = Object.values(CUT_A_SLUG)

  ok(coleccion.features.length === 16, `16 features (hay ${coleccion.features.length})`)
  ok(
    new Set(slugs).size === 16 && esperados.every((s) => slugs.includes(s)),
    'los 16 slugs canónicos, sin repetidos',
  )
  ok(
    coleccion.features.every((f) => f.geometry.coordinates.length > 0),
    'ninguna feature vacía',
  )

  const dentro = coleccion.features.filter((f) => {
    const label = f.properties.label
    return label && f.geometry.coordinates.some(([anillo]) => dentroDelPoligono(label, anillo))
  })
  ok(dentro.length === 16, `label dentro del polígono en ${dentro.length}/16`)

  const valpo = coleccion.features.find((f) => f.properties.slug === 'valparaiso')
  const lonMinValpo = Math.min(...valpo.geometry.coordinates.flat(2).map((p) => p[0]))
  ok(
    valpo.geometry.coordinates.length >= 3 && lonMinValpo < -100,
    `territorio insular presente (valparaíso: ${valpo.geometry.coordinates.length} anillos, lon mín ${lonMinValpo.toFixed(3)})`,
  )

  const kb = bytes / 1024
  ok(kb >= TAMANO_MIN_KB && kb <= TAMANO_MAX_KB, `tamaño ${kb.toFixed(1)} KB dentro de [${TAMANO_MIN_KB}, ${TAMANO_MAX_KB}] KB`)

  return errores
}

const origen = JSON.parse(await readFile(ENTRADA, 'utf8'))
const features = origen.features.map(procesarFeature)
const coleccion = { type: 'FeatureCollection', features }

const json = JSON.stringify(coleccion)
await mkdir(dirname(SALIDA), { recursive: true })
await writeFile(SALIDA, json)

const anillos = features.reduce((n, f) => n + f.geometry.coordinates.length, 0)
const puntos = features.reduce(
  (n, f) => n + f.geometry.coordinates.reduce((m, [a]) => m + a.length, 0),
  0,
)
const bytes = Buffer.byteLength(json)
console.log(
  `regiones-chile.v1.json  ${(bytes / 1024).toFixed(1)} KB  ${anillos} anillos  ${puntos} puntos`,
)

const errores = verificar(coleccion, bytes)
if (errores.length) {
  console.error(`\n${errores.length} verificación(es) fallaron.`)
  process.exit(1)
}
