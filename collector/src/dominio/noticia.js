// Entidad noticia: normalización de ítems crudos de cualquier fuente.

const PARAMETRO_DE_RASTREO = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$)/i

// URL canónica para deduplicar: sin fragmento, sin parámetros de rastreo,
// host en minúsculas, sin slash final. Ante una URL inválida se devuelve el
// texto tal cual (mejor conservar la noticia que perderla).
export function canonicalizarUrl(url) {
  const crudo = String(url ?? '').trim()
  let parseada
  try {
    parseada = new URL(crudo)
  } catch {
    return crudo
  }
  // Solo http/https: esquemas como javascript:/data: son válidos para `new URL` pero se
  // convertirían en XSS al pintarse como href en el frontend. Rechazarlos aquí (id vacío)
  // hace que crearNoticia descarte la noticia entera (SEC-04, CWE-79/84).
  if (parseada.protocol !== 'http:' && parseada.protocol !== 'https:') return ''
  parseada.hash = ''
  const aEliminar = [...parseada.searchParams.keys()].filter((clave) =>
    PARAMETRO_DE_RASTREO.test(clave),
  )
  for (const clave of aEliminar) parseada.searchParams.delete(clave)
  if (parseada.pathname.length > 1 && parseada.pathname.endsWith('/')) {
    parseada.pathname = parseada.pathname.slice(0, -1)
  }
  return parseada.toString()
}

// Fecha a ISO-8601, o null si no es interpretable.
export function parsearFecha(valor) {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString()
  }
  if (typeof valor !== 'string' || valor.trim() === '') return null
  const epoch = Date.parse(valor)
  return Number.isNaN(epoch) ? null : new Date(epoch).toISOString()
}

// Regla de fecha (REQUISITOS.md pregunta 10, supuesto fijado): la declarada
// por el medio; si falta o es inválida, la fecha de detección.
// Sin `imagen`: el sistema dejó de tratar imágenes de noticias por decisión del
// departamento legal. Ver el comentario de adaptadores/extractor-contenido.js.
export function crearNoticia({ medio, titular, url, fechaMedio, fechaDeteccion, extracto }) {
  const id = canonicalizarUrl(url)
  const titularLimpio = typeof titular === 'string' ? titular.trim() : ''
  if (id === '' || titularLimpio === '') return null
  const deteccionIso = parsearFecha(fechaDeteccion)
  return {
    id,
    url: String(url).trim(),
    medioId: medio.id,
    medioNombre: medio.nombre,
    seccionId: medio.tipo,
    titular: titularLimpio,
    fecha: parsearFecha(fechaMedio) ?? deteccionIso,
    fechaDeteccion: deteccionIso,
    extracto,
  }
}

// Campos que el sistema DEJÓ de producir y que no deben sobrevivir en el estado.
//
// El estado de trabajo del collector (datos/noticias.json) es un archivo que persiste
// entre corridas: las noticias PREVIAS se releen tal cual y `fusionar` las devuelve a la
// ventana sin que nadie les quite claves. Cortar la producción de un dato no lo borra de
// ahí — se reescribe cada hora, indefinidamente, y la purga de retención no lo toca
// porque solo vacía el extracto y el texto del análisis.
//
// Es el mismo tropiezo que ya obligó a `aplicarRetencionEnVentana`: en un sumidero que
// reescribe la ventana completa cada hora, dejar de escribir un dato NO es lo mismo que
// borrarlo. Hay que limpiar la ventana explícitamente.
//
// `imagen` es el caso vigente: el departamento legal resolvió que el sistema no trata
// imágenes de prensa, y un archivo en disco lleno de og:image antiguos contradice esa
// afirmación aunque ninguna vista los pinte.
export const CAMPOS_OBSOLETOS = ['imagen']

// Devuelve la noticia sin los campos obsoletos. Si no tiene ninguno —el caso normal en
// régimen— devuelve EL MISMO objeto, sin copiarlo: esto corre sobre la ventana completa
// en cada corrida.
export function sinCamposObsoletos(noticia) {
  if (!noticia || typeof noticia !== 'object') return noticia
  if (!CAMPOS_OBSOLETOS.some((campo) => campo in noticia)) return noticia
  const copia = { ...noticia }
  for (const campo of CAMPOS_OBSOLETOS) delete copia[campo]
  return copia
}

// Cuenta cuántas se limpiaron, para poder reportarlo en el resumen de la corrida: una
// limpieza silenciosa no permite saber si el arrastre existía ni cuándo terminó.
export function limpiarCamposObsoletos(noticias) {
  let limpiadas = 0
  const salida = (noticias ?? []).map((n) => {
    const limpia = sinCamposObsoletos(n)
    if (limpia !== n) limpiadas += 1
    return limpia
  })
  return { noticias: salida, limpiadas }
}
