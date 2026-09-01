// Adaptador Postgres del puerto archivador-de-noticias (v2).
//
// Sumidero aditivo: solo INSERT ... ON CONFLICT DO UPDATE, nunca DELETE. El JSON
// (repositorio-json.js) sigue siendo la única fuente de verdad del estado de trabajo
// del collector; este adaptador nunca se lee de vuelta.

import pg from 'pg'
import { aplicarEsquema } from './esquema-postgres.js'

// El orden DEBE coincidir con valoresDeNoticia. `asignaciones` (ver archivarNoticias)
// se deriva de esta lista, así que toda columna agregada acá entra sola al
// ON CONFLICT DO UPDATE: por eso la reversión de una exclusión se propaga a las filas
// ya archivadas de la ventana sin tocar el SQL.
export const COLUMNAS_NOTICIA = [
  'id', 'url', 'medio_id', 'medio_nombre', 'seccion_id', 'titular', 'fecha',
  'fecha_deteccion', 'extracto', 'autor', 'fecha_real', 'event_id',
  'analisis', 'sentimiento', 'riesgo', 'prioridad', 'importancia', 'ambito',
  'categorias', 'regiones', 'excluida', 'excluida_por',
  'conceptos_detectados', 'concepto_principal',
]

const TAMANO_LOTE = 200

// Columnas de la tabla de auditoría de corridas (una fila por activación del cron, ver
// db/schema.sql). El orden DEBE coincidir con valoresDeEjecucion. `id` y `finalizada_en`
// los pone la base (BIGSERIAL / DEFAULT now()).
export const COLUMNAS_EJECUCION = [
  'iniciada_en', 'duracion_ms', 'exito', 'noticias_publicadas', 'noticias_nuevas',
  'noticias_previas', 'pasos_ok', 'pasos_fallidos', 'resumen',
]

// Mapea el objeto de ejecución (camelCase, ver main.js) a la fila de colecta_ejecuciones
// (mismo orden que COLUMNAS_EJECUCION). Puro y testeable, con defaults seguros.
export function valoresDeEjecucion(ejecucion) {
  return [
    ejecucion.iniciadaEn,
    Math.max(0, Math.round(Number(ejecucion.duracionMs) || 0)),
    Boolean(ejecucion.exito),
    ejecucion.noticiasPublicadas ?? 0,
    ejecucion.noticiasNuevas ?? 0,
    ejecucion.noticiasPrevias ?? 0,
    ejecucion.pasosOk ?? 0,
    ejecucion.pasosFallidos ?? 0,
    JSON.stringify(ejecucion.resumen ?? []),
  ]
}

// Exportada para poder testear el mapeo sin base de datos (mismo criterio que
// valoresDeEjecucion). Los defaults importan: las columnas son NOT NULL, así que una
// noticia de un estado viejo —sin los campos de exclusión— no puede producir NULL.
export function valoresDeNoticia(noticia) {
  const analisis = noticia.analisis ?? null
  return [
    noticia.id,
    noticia.url,
    noticia.medioId,
    noticia.medioNombre,
    noticia.seccionId,
    noticia.titular,
    noticia.fecha,
    noticia.fechaDeteccion,
    JSON.stringify(noticia.extracto ?? []),
    noticia.autor ?? null,
    noticia.fechaReal ?? null,
    noticia.eventId ?? null,
    analisis ? JSON.stringify(analisis) : null,
    analisis?.sentimiento ?? null,
    analisis?.riesgo ?? null,
    analisis?.prioridad ?? null,
    analisis?.importancia ?? null,
    analisis?.ambito ?? null,
    analisis?.categorias ?? [],
    analisis?.regiones ?? [],
    Boolean(noticia.excluida),
    Array.isArray(noticia.excluidaPor) ? noticia.excluidaPor : [],
    Array.isArray(noticia.conceptosDetectados) ? noticia.conceptosDetectados : [],
    noticia.conceptoPrincipal ?? null,
  ]
}

async function archivarSecciones(cliente, secciones) {
  if (!secciones?.length) return
  const filas = []
  const valores = []
  let indice = 1
  for (const seccion of secciones) {
    filas.push(`($${indice++}, $${indice++}, $${indice++})`)
    valores.push(seccion.id, seccion.nombre, seccion.orden)
  }
  // El ON CONFLICT actualiza el NOMBRE pero NO el orden, y esa omisión es la funcionalidad.
  //
  // `secciones.orden` pasó a ser el nivel 2 de la jerarquía del boletín, editable desde
  // /#/configuracion. Si el collector siguiera escribiéndolo desde la constante del
  // código, el orden que el admin acaba de arrastrar quedaría revertido en la corrida
  // horaria siguiente, sin ningún error y sin que nadie entendiera por qué.
  //
  // El INSERT sí lleva `orden`: una sección nueva necesita un valor inicial.
  await cliente.query(
    `INSERT INTO secciones (id, nombre, orden) VALUES ${filas.join(', ')}
     ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
    valores,
  )
}

async function archivarNoticias(cliente, noticias) {
  const asignaciones = COLUMNAS_NOTICIA.filter((columna) => columna !== 'id')
    .map((columna) => `${columna} = EXCLUDED.${columna}`)
    .concat('actualizada_en = now()')
    .join(', ')

  for (let inicio = 0; inicio < noticias.length; inicio += TAMANO_LOTE) {
    const lote = noticias.slice(inicio, inicio + TAMANO_LOTE)
    if (lote.length === 0) continue

    const filas = []
    const valores = []
    let indice = 1
    for (const noticia of lote) {
      const valoresFila = valoresDeNoticia(noticia)
      filas.push(`(${valoresFila.map(() => `$${indice++}`).join(', ')})`)
      valores.push(...valoresFila)
    }

    await cliente.query(
      `INSERT INTO noticias (${COLUMNAS_NOTICIA.join(', ')})
       VALUES ${filas.join(', ')}
       ON CONFLICT (id) DO UPDATE SET ${asignaciones}`,
      valores,
    )
  }
}

async function archivarMetadatos(cliente, estado) {
  await cliente.query(
    `INSERT INTO coleccion_metadatos (id, generado_en, tamano_ventana, actualizado_en)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET
       generado_en = EXCLUDED.generado_en,
       tamano_ventana = EXCLUDED.tamano_ventana,
       actualizado_en = now()`,
    [estado.generadoEn, estado.tamanoVentana],
  )
}

export function crearArchivadorPostgres(config) {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10_000,
    // sslmode=disable (ver fastapi-postgresql-conexion.md). `pg` no usa libpq, así
    // que el problema de negociación GSSAPI del documento de referencia no aplica aquí.
    ssl: false,
  })
  let esquemaListo = false
  async function asegurarEsquema(cliente) {
    if (esquemaListo) return
    await aplicarEsquema(cliente, config.rutaEsquema)
    esquemaListo = true
  }

  return {
    async archivar(estado) {
      const cliente = await pool.connect()
      try {
        await asegurarEsquema(cliente)
        await cliente.query('BEGIN')
        try {
          await archivarSecciones(cliente, estado.secciones)
          await archivarNoticias(cliente, estado.noticias)
          await archivarMetadatos(cliente, estado)
          await cliente.query('COMMIT')
        } catch (error) {
          await cliente.query('ROLLBACK')
          throw error
        }
      } finally {
        cliente.release()
      }
    },

    // Registra una corrida del collector (auditoría de activaciones del cron). INSERT
    // aislado y aditivo, fuera de la transacción de archivar(): se llama SIEMPRE, incluso
    // si archivar() falló, para dejar rastro de que la corrida ocurrió y qué recolectó.
    async registrarEjecucion(ejecucion) {
      const cliente = await pool.connect()
      try {
        await asegurarEsquema(cliente)
        const valores = valoresDeEjecucion(ejecucion)
        const marcadores = valores.map((_, indice) => `$${indice + 1}`).join(', ')
        await cliente.query(
          `INSERT INTO colecta_ejecuciones (${COLUMNAS_EJECUCION.join(', ')}) VALUES (${marcadores})`,
          valores,
        )
      } finally {
        cliente.release()
      }
    },

    async cerrar() {
      await pool.end()
    },
  }
}
