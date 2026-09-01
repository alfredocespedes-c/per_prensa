// Puerto: archivador de noticias en base de datos (arquitectura hexagonal, v2).
//
// A diferencia de repositorio-de-noticias.js (que sí define cargar(), fuente de
// verdad del estado de trabajo del collector: dedup, cachés de Google/sitemap), este
// puerto es un sumidero de SOLO ESCRITURA, aditivo (upsert, nunca DELETE), que nunca
// se lee de vuelta — el collector jamás reconstruye su estado incremental desde la
// base de datos, solo desde el JSON. Postgres acumula así, sin esfuerzo extra, todo
// lo visto alguna vez (histórico real), desacoplado del tamaño de la ventana JSON.
//
// Contrato:
//
//   archivar(estado) -> Promise<void>          // upsert de secciones + noticias + metadatos
//   registrarEjecucion(ejecucion) -> Promise<void>  // 1 fila de auditoría por corrida
//   cerrar() -> Promise<void>                  // libera la conexión/pool
//
//   estado: el mismo objeto Estado que repositorio-de-noticias.guardar() recibe
//   (ver dominio/noticia.js y main.js).
//
//   ejecucion: { iniciadaEn, duracionMs, exito, noticiasPublicadas, noticiasNuevas,
//     noticiasPrevias, pasosOk, pasosFallidos, resumen } — metadatos de la corrida del
//     cron (ver tabla colecta_ejecuciones en db/schema.sql). Aditivo, nunca se lee de
//     vuelta; su fin es auditar que el collector se activó cada hora y qué recolectó.
//
// La orquestación (main.js) debe tratar los fallos de este puerto como fail-open:
// un error al archivar en Postgres se loguea y la corrida sigue: nunca debe impedir
// que se escriba noticias.json.
//
// Adaptador existente: ../adaptadores/archivador-postgres.js

export {}
