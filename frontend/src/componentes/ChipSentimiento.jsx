import './ChipSentimiento.css'

// Chip de tono. Los colores salen de TOKENS, no de hex fijos.
//
// Antes eran cuatro pares color+fondo con los fondos claros escritos a mano (#E3F0E8,
// #E9EDEB, #F6E7E2, #F6EEDD). En modo oscuro quedaban como manchas casi blancas flotando
// sobre la tarjeta (#232b27): el peor punto de la migración a tema oscuro. Además el color
// de texto duplicaba la paleta --sent-* con valores DISTINTOS (#5B6B66 contra
// --sent-neutra #aab4ae), así que el mismo tono se pintaba de dos colores según el
// componente.
//
// El fondo se deriva del propio token con color-mix, así que hay UNA sola definición de la
// paleta y el chip acompaña al tema solo.
const SENTIMIENTOS = ['positiva', 'neutra', 'negativa', 'mixta']

export default function ChipSentimiento({ sentimiento }) {
  if (!sentimiento || !SENTIMIENTOS.includes(sentimiento)) return null

  const etiqueta = sentimiento.charAt(0).toUpperCase() + sentimiento.slice(1)

  return <span className={`chip-sentimiento chip-sentimiento-${sentimiento}`}>{etiqueta}</span>
}
