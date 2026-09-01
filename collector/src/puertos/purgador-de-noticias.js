// Puerto: purgador de retención (arquitectura hexagonal).
//
// El complemento del archivador. archivador-de-noticias.js es un sumidero aditivo que
// NUNCA borra —y por eso la tabla `noticias` crecía sin techo—; este puerto es el único
// que tiene permitido borrar, y solo según la política de dominio/retencion.js.
//
// Vive aparte del archivador a propósito: se ejecuta en otro proceso (src/purga.js) y en
// otro horario (una vez al día, de madrugada). Fusionarlo con la corrida horaria haría
// que un fallo de la purga pudiera arrastrar al boletín, que es exactamente lo que no
// puede pasar a las 08:00.
//
// Contrato:
//
//   purgarExtractos(corte, opciones) -> Promise<number>
//       Vacía el extracto y los campos de texto de `analisis` en las noticias detectadas
//       antes de `corte`. Devuelve cuántas filas cambió. Idempotente: una fila ya
//       purgada no se vuelve a tocar (ver dominio/retencion.js, yaPurgada).
//
//   purgarNoticias(corte, opciones) -> Promise<number>
//       Borra las filas detectadas antes de `corte`. Devuelve cuántas borró.
//
//   purgarEjecuciones(corte, opciones) -> Promise<number>
//       Borra las filas de colecta_ejecuciones iniciadas antes de `corte`.
//
//   registrarPurga(resultado) -> Promise<void>
//       Una fila en purga_ejecuciones por corrida de la purga (el "log de ejecución").
//
//   cerrar() -> Promise<void>
//
//   corte: Date. opciones: { tamanoLote, simulacion }. Con `simulacion: true` el
//   adaptador CUENTA lo que borraría pero no escribe nada — es lo que sostiene el
//   --dry-run, que es el modo por defecto del script.
//
// Todas las operaciones van POR LOTES: un DELETE de una sola sentencia sobre cientos de
// miles de filas mantendría un lock largo sobre `noticias` justo mientras la portada la
// lee, y con statement_timeout=15s en el backend eso es un 500 en la portada.
//
// Adaptador existente: ../adaptadores/purgador-postgres.js

export {}
