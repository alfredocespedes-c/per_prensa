// Puerto: fuente de noticias (arquitectura hexagonal).
//
// Un adaptador de este puerto sabe obtener los ítems crudos publicados por un
// medio, sin importar la tecnología (RSS, sitemap, HTML, API, base de datos).
// La detección de menciones y toda regla de negocio quedan FUERA del adaptador.
//
// Contrato:
//
//   obtener(medio) -> Promise<ItemCrudo[]>
//
//   medio: { id: string, nombre: string, tipo: string, feedUrl: string }
//   ItemCrudo: {
//     titular: string,      // texto plano, sin HTML
//     url: string,          // link directo a la nota en el sitio del medio
//     fecha: string | null, // fecha declarada por el medio, o null
//     texto: string,        // cuerpo/descripción en texto plano, puede ser ''
//   }
//
// El adaptador debe lanzar (reject) ante fallas de la fuente; la orquestación
// aísla el error para no botar la corrida completa.
//
// Adaptadores existentes:
//   ../adaptadores/fuente-rss.js          — medio con feedUrl (RSS/Atom)
//   ../adaptadores/fuente-sitemap-news.js — medio con sitemapUrl (Google News
//     sitemap); variación del contrato ya precedida por fuente-google-news:
//     obtener(medio) devuelve { items, cache } porque mantiene una caché de URLs
//     procesadas (persistida en el estado como `sitemapVisto`).
// v2: un adaptador de base de datos u otra fuente implementa este mismo contrato.

export {}
