// Limpieza de HTML previa a extraer texto. Nivel adaptador, no dominio: esto es
// normalización del insumo crudo, no una regla del boletín.
//
// POR QUÉ EXISTE, con el caso real que lo motivó:
//
// Una nota de Radio Polar sobre una detención de la PDI apareció en el boletín bajo el
// concepto «Forestin». El cuerpo no lo menciona en ninguna parte. Lo que pasó es que
// radiopolar.com NO tiene <article>, su único <main> envuelve casi toda la página —incluido
// un listado cronológico de titulares de OTRAS notas—, y al aplanar el HTML el texto de los
// <a> sobrevive: borrar la etiqueta <a> no borra lo que hay dentro. El titular enlazado
// «DAN INICIO A ACTIVIDADES … DEL CLUB FORESTÍN EN PUERTO WILLIAMS» quedó como texto plano
// indistinguible del cuerpo, dentro de los 5000 caracteres, y el extracto persistido acabó
// siendo 100 % titulares ajenos con cero texto de la nota.
//
// Eso es RUIDO, uno de los cuatro errores que SECOM declaró inaceptables.
//
// El defecto es intermitente: en notas largas el tope de 5000 corta antes de llegar al
// listado. Golpea justamente a las notas breves.
//
// SOBRE LAS EXPRESIONES REGULARES DE ESTE ARCHIVO:
// El extractor es regex, no un parser de DOM, y hay un ReDoS real en la historia del
// proyecto (ver el comentario del fallback de párrafos en extractor-contenido.js): un
// patrón con cuantificadores anidados congeló el hilo único del collector y abortó la
// corrida horaria. Por eso cada patrón de acá tiene UN solo cuantificador no codicioso y
// un tope de longitud. Los <a> y los bloques semánticos no anidan consigo mismos en HTML
// válido, así que `<a\b[^>]*>…</a>` no codicioso es lineal. No introducir anidamiento.

// Tope por bloque, mismo criterio que el fallback de párrafos del extractor.
const TOPE = 20_000

// Elementos cuyo contenido NUNCA es el cuerpo de la nota.
//
// Deliberadamente NO están <header> ni <figure>:
//   - <header> suele llevar el titular y la bajada del propio artículo;
//   - <figure>/<figcaption> llevan pies de foto, que son texto de la nota.
// Quitarlos habría sido más "limpio" y habría perdido contenido legítimo.
const BLOQUES_NO_CONTENIDO = ['nav', 'aside', 'footer', 'form']

// Etiquetas de bloque cuya presencia DENTRO de un <a> delata una tarjeta-teaser: un enlace
// a otra nota maquetado como bloque (imagen + titular + fecha), no un enlace dentro de una
// frase.
const ETIQUETAS_DE_BLOQUE = /<(?:p|h[1-6]|div|section|article|picture|img|figure|ul|ol|li|table)\b/i

/**
 * Elimina los elementos que jamás contienen el cuerpo de la nota (menús, barras laterales,
 * pies de página, formularios) junto con su contenido.
 */
export function quitarBloquesNoContenido(html) {
  if (!html || typeof html !== 'string') return ''
  let salida = html
  for (const etiqueta of BLOQUES_NO_CONTENIDO) {
    salida = salida.replace(
      new RegExp(`<${etiqueta}\\b[^>]*>[\\s\\S]{0,${TOPE}}?</${etiqueta}>`, 'gi'),
      ' ',
    )
  }
  return salida
}

/**
 * Elimina los <a> que envuelven contenido de BLOQUE —las tarjetas que enlazan a otras
 * notas— junto con su contenido.
 *
 * Un <a> INLINE (el que va dentro de una frase y solo contiene texto o énfasis) conserva su
 * texto: una mención legítima a CONAF puede venir enlazada dentro del cuerpo, y borrarla
 * sería perder la noticia. La diferencia entre uno y otro es exactamente si el enlace
 * contiene una etiqueta de bloque.
 */
export function quitarTarjetasEnlazadas(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(
    new RegExp(`<a\\b[^>]*>([\\s\\S]{0,${TOPE}}?)</a>`, 'gi'),
    (completo, interior) => (ETIQUETAS_DE_BLOQUE.test(interior) ? ' ' : completo),
  )
}

/**
 * Las dos pasadas, en el orden que corresponde. Se aplica ANTES de elegir el contenedor
 * (<article>/<main>/párrafos densos), no después: así el fallback de párrafos tampoco
 * recoge los <p> que vivían dentro de una tarjeta, sin necesidad de cálculos posicionales.
 */
export function limpiarHtmlDeNavegacion(html) {
  return quitarTarjetasEnlazadas(quitarBloquesNoContenido(html))
}
