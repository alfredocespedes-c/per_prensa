// Política de retención: QUÉ se borra y CUÁNDO. Puro, sin I/O.
//
// El adaptador (adaptadores/purgador-postgres.js) decide CÓMO se ejecuta contra la base;
// acá vive la regla, que es la parte que hay que poder auditar y probar sin Postgres.
//
// Dos cortes, no uno, porque el texto del medio y los metadatos no tienen el mismo peso:
//
//   - A RETENCION_EXTRACTO_DIAS se vacía el CONTENIDO (extracto + los campos de
//     `analisis` derivados de texto libre). La fila sobrevive como referencia
//     bibliográfica: medio, titular, fecha, autor y enlace al original.
//   - A RETENCION_METADATOS_DIAS se borra la fila entera.
//
// Que el primer corte no borre la fila es deliberado: el titular con su enlace es
// justamente lo que el medio publica para ser enlazado, y conservarlo permite seguir
// respondiendo "¿esta nota se monitoreó?" sin guardar su contenido.

// Campos de `analisis` que se derivan del TEXTO del artículo. Se vacían en el primer
// corte: son una copia procesada del contenido del medio, y `organizaciones`/`lugares`
// pueden además contener nombres propios.
export const CAMPOS_ANALISIS_DE_TEXTO = [
  'keywords',
  'organizaciones',
  'lugares',
  // `personas` ya no se produce (ver dominio/enriquecimiento.js), pero las filas
  // archivadas antes del cambio todavía lo traen: se limpia igual.
  'personas',
]

// Campos de `analisis` que sobreviven al primer corte: son clasificaciones agregadas,
// no fragmentos del texto, y son lo que sostiene el mapa y las estadísticas históricas.
export const CAMPOS_ANALISIS_AGREGADOS = [
  'version',
  'sentimiento',
  'polaridad',
  'score',
  'categorias',
  'regiones',
  'comunas',
  'parques',
  'riesgo',
  'prioridad',
  'importancia',
  'tipo',
  'ambito',
  'cantidadPalabras',
  'cantidadParrafos',
  'tiempoLectura',
]

const MS_POR_DIA = 24 * 60 * 60 * 1000

/**
 * Valida la configuración de retención y devuelve las fechas de corte.
 *
 * Lanza en vez de corregir en silencio: una purga con parámetros incoherentes borra
 * datos que no debía, y eso no se deshace. Es la única función de este módulo que puede
 * fallar, y lo hace ANTES de tocar la base.
 *
 * @param {Date} ahora
 * @param {{retencionExtractoDias:number, retencionMetadatosDias:number, retencionEjecucionesDias:number}} config
 * @returns {{corteExtracto:Date, corteMetadatos:Date, corteEjecuciones:Date}}
 */
export function calcularCortes(ahora, config) {
  const instante = ahora instanceof Date ? ahora.getTime() : NaN
  if (!Number.isFinite(instante)) {
    throw new Error('calcularCortes requiere una fecha válida')
  }

  const dias = (nombre) => {
    const valor = config?.[nombre]
    if (!Number.isInteger(valor) || valor < 1) {
      throw new Error(`${nombre} debe ser un entero de días >= 1 (recibido: ${valor})`)
    }
    return valor
  }

  const extracto = dias('retencionExtractoDias')
  const metadatos = dias('retencionMetadatosDias')
  const ejecuciones = dias('retencionEjecucionesDias')

  // Si el texto durase MÁS que la fila, el primer corte no llegaría a aplicarse nunca:
  // la fila se borraría antes con su extracto intacto, y la retención de contenido
  // declarada sería una ficción.
  if (extracto > metadatos) {
    throw new Error(
      `La retención de extracto (${extracto} días) no puede superar la de metadatos ` +
        `(${metadatos} días): la fila se borraría antes de que el texto se purgue.`,
    )
  }

  return {
    corteExtracto: new Date(instante - extracto * MS_POR_DIA),
    corteMetadatos: new Date(instante - metadatos * MS_POR_DIA),
    corteEjecuciones: new Date(instante - ejecuciones * MS_POR_DIA),
  }
}

/**
 * Deja `analisis` sin los campos derivados del texto, conservando los agregados.
 *
 * Devuelve `null` si no queda nada útil, para no dejar objetos huecos en la base. No
 * muta la entrada.
 *
 * @param {object|null} analisis
 * @returns {object|null}
 */
export function limpiarAnalisis(analisis) {
  if (!analisis || typeof analisis !== 'object' || Array.isArray(analisis)) return null

  const limpio = {}
  // Se recorre el objeto ORIGINAL y no la lista de agregados, para que un campo nuevo
  // que se agregue al enriquecimiento sobreviva por defecto en vez de desaparecer sin
  // que nadie se entere. Lo que se quita es una lista explícita y corta.
  for (const [clave, valor] of Object.entries(analisis)) {
    if (CAMPOS_ANALISIS_DE_TEXTO.includes(clave)) continue
    limpio[clave] = valor
  }

  // `version` sola no es información: si no queda ningún agregado real, es un objeto
  // vacío disfrazado.
  const utiles = Object.keys(limpio).filter((clave) => clave !== 'version')
  return utiles.length > 0 ? limpio : null
}

/**
 * ¿Esta fila ya tiene el texto purgado? Sirve para que la purga sea idempotente y no
 * reescriba filas que ya limpió (lo que inflaría `actualizada_en` y el WAL cada noche).
 */
export function yaPurgada(fila) {
  const sinExtracto = !Array.isArray(fila?.extracto) || fila.extracto.length === 0
  const analisis = fila?.analisis
  const sinTexto =
    !analisis ||
    typeof analisis !== 'object' ||
    !CAMPOS_ANALISIS_DE_TEXTO.some((campo) => campo in analisis)
  return sinExtracto && sinTexto
}

/**
 * Aplica el corte de texto a la ventana en memoria del collector. Muta en sitio, igual
 * que marcarExclusiones.
 *
 * Sin esto la retención sería una afirmación falsa. El purgador borra el texto en
 * Postgres de madrugada, pero el archivador hace upsert de la ventana COMPLETA cada
 * hora: si la ventana todavía contuviera una noticia de más de 180 días, la corrida
 * siguiente le devolvería su extracto y el texto sobreviviría indefinidamente. Aplicando
 * el corte acá, la ventana nunca puede resucitar lo que la purga borró.
 *
 * Además, datos/noticias.json es dato en reposo por derecho propio: la política de
 * retención vale para él igual que para la base.
 *
 * Idempotente (ver yaPurgada): una vez limpia, una segunda corrida no cambia nada, así
 * que `generadoEn` no se mueve sin motivo.
 *
 * @returns {number} cuántas noticias perdieron su texto en esta pasada
 */
export function aplicarRetencionEnVentana(noticias, corteExtracto) {
  const corte = corteExtracto instanceof Date ? corteExtracto.getTime() : NaN
  if (!Number.isFinite(corte)) {
    throw new Error('aplicarRetencionEnVentana requiere una fecha de corte válida')
  }

  let purgadas = 0
  for (const noticia of noticias ?? []) {
    // Por fecha_deteccion, igual que el purgador: es cuándo ESTE sistema empezó a
    // guardar el dato, no la fecha que declara el medio (que puede venir mal).
    const detectada = Date.parse(noticia?.fechaDeteccion ?? '')
    if (!Number.isFinite(detectada) || detectada >= corte) continue
    if (yaPurgada(noticia)) continue

    noticia.extracto = []
    noticia.analisis = limpiarAnalisis(noticia.analisis)
    purgadas += 1
  }
  return purgadas
}

/** Líneas [OK]/[FALLO] para el resumen de la corrida (mismo formato que el collector). */
export function resumenDePurga(resultado) {
  const lineas = [
    `[OK] Purga de texto (>${resultado.diasExtracto} días): ` +
      `${resultado.extractosPurgados} noticias sin extracto`,
    `[OK] Purga de metadatos (>${resultado.diasMetadatos} días): ` +
      `${resultado.noticiasBorradas} noticias borradas`,
    `[OK] Purga de auditoría (>${resultado.diasEjecuciones} días): ` +
      `${resultado.ejecucionesBorradas} corridas borradas`,
  ]
  if (resultado.simulacion) {
    lineas.unshift('[OK] SIMULACIÓN (--dry-run): no se escribió nada en la base')
  }
  return lineas
}
