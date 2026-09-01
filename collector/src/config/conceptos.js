// Conceptos de búsqueda — SEMILLA y RED DE SEGURIDAD.
//
// Desde la v3 la fuente OPERATIVA es la tabla `conceptos` de Postgres, que el rol
// admin edita desde la web (ver db/schema.sql y backend/app/routers/conceptos.py).
// Esta lista cumple dos funciones y ninguna es "la configuración del día a día":
//
//   1. SEMILLA: db/schema.sql la inserta cuando la tabla está vacía (una sola vez en
//      la vida de la base). Ambas listas deben coincidir; lo verifica
//      test/semilla-conceptos.test.js, que falla el build si divergen.
//   2. FALLBACK: si la base no responde o quedó sin conceptos de inclusión activos,
//      el collector usa esta lista y sigue publicando. Un problema de base de datos
//      nunca debe dejar sin boletín a las 8:00.
//
// Editar acá NO cambia lo que se busca en producción: hay que hacerlo en la web (o,
// si se cambia acá, actualizar también la semilla de db/schema.sql).
//
// La detección es insensible a mayúsculas y tildes y usa límites de palabra:
// "CONAF" matchea "Conaf" y "(CONAF)", pero NO "CONAFE".
// Se busca en el titular y en el texto que entrega el feed de cada medio.

export const CONCEPTOS = ['CONAF', 'Corporación Nacional Forestal','CMPC','forestal','Parque Nacional', 'forestin','sernafor']
