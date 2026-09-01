// GUARDA: la aplicación no ofrece ninguna descarga masiva.
//
// No prueba un componente: prueba una ausencia. Una descarga convierte "consulta puntual"
// en "distribución de un corpus", que es un acto legalmente distinto: el contenido sale
// del ámbito donde rigen la retención, los retiros y el control de acceso, y ya no vuelve.
//
// Existió: había un botón de CSV en la portada —que además era pública— y se eliminó por
// esa razón. Nada impedía que volviera. Esto lo impide.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

// Se persiguen PATRONES DE CÓDIGO, nunca la palabra "CSV" suelta: `Cabecera.jsx` conserva
// un comentario que explica por qué se quitó la descarga, y ese comentario es justamente
// lo que evita que alguien la reponga por creerla un olvido. Una regla /csv/i lo borraría.
const PATRONES = [
  {
    nombre: 'tipo MIME de descarga',
    regex: /["'`]\s*(text\/csv|application\/(vnd\.ms-excel|octet-stream|zip))/i,
  },
  { nombre: 'construcción de un blob descargable', regex: /new\s+Blob\s*\(/ },
  { nombre: 'URL de objeto para descarga', regex: /URL\.createObjectURL\s*\(/ },
  { nombre: 'atributo download en un enlace', regex: /\bdownload\s*=/ },
  { nombre: 'componente de exportación', regex: /\bBoton(CSV|Descarga|Exportar)\b/ },
  { nombre: 'guardado de archivo', regex: /\b(saveAs|FileSaver|writeFile)\s*\(/ },
]

async function archivosFuente(directorio) {
  const encontrados = []
  for (const entrada of await readdir(directorio, { withFileTypes: true })) {
    const completa = path.join(directorio, entrada.name)
    if (entrada.isDirectory()) encontrados.push(...(await archivosFuente(completa)))
    else if (/\.(jsx?|tsx?)$/.test(entrada.name)) encontrados.push(completa)
  }
  return encontrados
}

/** Quita comentarios de línea y de bloque: documentar la decisión no es implementarla. */
function sinComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

export async function rastrosDeExportacion(raiz = RAIZ) {
  const hallazgos = []
  for (const archivo of await archivosFuente(raiz)) {
    // El propio test contiene los patrones; excluirlo evita que se delate a sí mismo.
    if (archivo === fileURLToPath(import.meta.url)) continue

    const codigo = sinComentarios(await readFile(archivo, 'utf8'))
    codigo.split(/\r?\n/).forEach((linea, indice) => {
      for (const patron of PATRONES) {
        if (patron.regex.test(linea)) {
          hallazgos.push({
            archivo: path.relative(raiz, archivo).replace(/\\/g, '/'),
            linea: indice + 1,
            patron: patron.nombre,
            texto: linea.trim(),
          })
        }
      }
    })
  }
  return hallazgos
}

describe('sin exportación masiva', () => {
  it('no hay ningún mecanismo de descarga en el frontend', async () => {
    const hallazgos = await rastrosDeExportacion()

    const detalle = hallazgos
      .map((h) => `  ${h.archivo}:${h.linea}  [${h.patron}]  ${h.texto}`)
      .join('\n')

    expect(
      hallazgos,
      hallazgos.length === 0
        ? ''
        : `Se detectó un mecanismo de descarga:\n${detalle}\n\n` +
            'POR QUÉ IMPORTA: una descarga convierte "consulta puntual" en "distribución de\n' +
            'un corpus". El contenido de los medios sale del sistema y deja de estar sujeto a\n' +
            'la retención de 180/400 días, a los retiros solicitados por un medio y al control\n' +
            'de acceso. Eso ya no se puede deshacer: una copia distribuida no se purga.\n\n' +
            'La exportación CSV existió y se eliminó por esta razón. Si hace falta reponer\n' +
            'alguna forma de descarga, es una decisión de Fiscalía, no de implementación.',
    ).toEqual([])
  })

  it('el detector encuentra un patrón real (no es decorativo)', async () => {
    // Sin esto, un error en las expresiones regulares dejaría la guarda siempre en verde:
    // la trampa clásica de los tests que escanean código. Se comprueba contra un archivo
    // de mentira construido en memoria.
    const linea = "const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))"
    const encontrados = PATRONES.filter((p) => p.regex.test(linea)).map((p) => p.nombre)

    expect(encontrados).toContain('construcción de un blob descargable')
    expect(encontrados).toContain('tipo MIME de descarga')
    expect(encontrados).toContain('URL de objeto para descarga')
  })

  it('no marca un comentario que solo explica por qué se quitó la descarga', async () => {
    const codigo = sinComentarios('// alimentar la descarga CSV, eliminada por el rediseño')
    expect(PATRONES.some((p) => p.regex.test(codigo))).toBe(false)
  })
})
