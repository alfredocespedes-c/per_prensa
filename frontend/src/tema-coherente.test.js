// Guarda del tema oscuro.
//
// El tema oscuro se declara DOS veces y no hay forma de evitarlo: CSS no permite compartir
// un bloque de declaraciones entre un selector de atributo (`[data-theme='oscuro']`, el
// que activa el control manual) y una media query (`prefers-color-scheme: dark`, la
// preferencia del sistema). Lo que sí se puede evitar es que las dos copias se separen sin
// que nadie se entere.
//
// Ya había pasado: la rampa del coroplético divergía en los SIETE tokens, y la copia de la
// media query conservaba `--mapa-1: #1f3b2c`, un valor que el comentario del otro bloque
// declara explícitamente malo por confundirse con el fondo. Es decir: quien tenía el
// sistema en oscuro veía el mapa mal, y quien pulsaba el botón lo veía bien.
//
// La segunda mitad del archivo persigue tokens FANTASMA: `var(--x)` de variables que no
// existen. No fallan ruidosamente —la declaración es inválida y la propiedad hereda—, así
// que el color simplemente no es el que alguien quiso. Había dos vivos.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath y no `new URL(...).pathname`: en Windows eso devuelve "/C:/…" y el
// join posterior produce una ruta inexistente.
const RAIZ = dirname(fileURLToPath(import.meta.url))
const ESTILOS = join(RAIZ, 'estilos.css')

function declaraciones(bloque) {
  return Object.fromEntries([...bloque.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

function archivos(dir, extensiones) {
  const salida = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones))
    else if (extensiones.some((e) => entrada.endsWith(e))) salida.push(ruta)
  }
  return salida
}

describe('tema oscuro: las dos declaraciones no pueden divergir', () => {
  const css = readFileSync(ESTILOS, 'utf8')

  const porAtributo = declaraciones(
    css.match(/\[data-theme='oscuro'\]\s*\{([\s\S]*?)\n\}/)[1],
  )
  const porSistema = declaraciones(
    css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='claro'\]\)\s*\{([\s\S]*?)\n {2}\}/)[1],
  )

  it('ambos bloques existen y declaran tokens', () => {
    expect(Object.keys(porAtributo).length).toBeGreaterThan(10)
    expect(Object.keys(porSistema).length).toBeGreaterThan(10)
  })

  it('declaran EXACTAMENTE los mismos tokens', () => {
    expect(Object.keys(porSistema).sort()).toEqual(Object.keys(porAtributo).sort())
  })

  it('con exactamente los mismos valores', () => {
    // Se comparan los objetos enteros y no token a token: así el mensaje de fallo muestra
    // cuál difiere, en vez de decir solo que algo no cuadra.
    expect(porSistema).toEqual(porAtributo)
  })
})

describe('no hay tokens fantasma', () => {
  // Un `var(--token)` inexistente es una declaración inválida: la propiedad hereda y el
  // color no es el que se quiso, en silencio. Había dos: --verde-institucional (el real es
  // --color-institucional) y --texto.
  const fuentes = archivos(RAIZ, ['.css', '.jsx', '.js']).filter((f) => !f.endsWith('.test.js') && !f.endsWith('.test.jsx'))
  const css = fuentes.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n')

  const definidos = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))

  // Los comentarios se quitan antes de buscar: si no, explicar POR QUÉ un token no debe
  // usarse hace fallar la guarda que lo prohíbe, y la única salida es dejar de explicarlo.
  // Mismo criterio que src/sin-exportacion.test.js.
  const sinComentarios = (texto) =>
    texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('todo var(--token) usado está definido en algún CSS del proyecto', () => {
    const huerfanos = []
    for (const archivo of fuentes) {
      const texto = sinComentarios(readFileSync(archivo, 'utf8'))
      for (const m of texto.matchAll(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g)) {
        // Con valor de respaldo —var(--x, 64px)— la ausencia es deliberada y no rompe.
        const tieneRespaldo = m[0].includes(',')
        if (!definidos.has(m[1]) && !tieneRespaldo) {
          huerfanos.push(`${archivo.split(/[\\/]/).slice(-2).join('/')}: ${m[1]}`)
        }
      }
    }
    expect(huerfanos).toEqual([])
  })
})
