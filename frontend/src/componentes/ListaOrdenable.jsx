import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'

/**
 * Lista reordenable por arrastre Y por teclado.
 *
 * Usa el arrastre nativo de HTML5 en vez de una librería: son ~60 líneas, no suma una
 * dependencia al árbol que audita el CI y —lo que más importa— obliga a resolver la
 * accesibilidad de frente. El arrastre con puntero es, por sí solo, inoperable con
 * teclado y con lector de pantalla; esta es una aplicación de servicio público y el panel
 * es la ÚNICA forma de administrar el boletín, así que los botones subir/bajar no son un
 * extra: son la vía principal, y el arrastre es la comodidad.
 *
 * El reordenamiento se notifica como la lista completa ya reordenada; quien la use decide
 * cuándo persistirla.
 *
 * @param {{items: {id: string|number}[], onReordenar: (items) => void,
 *          etiquetaDe: (item) => string, children: (item, indice) => React.ReactNode,
 *          deshabilitado?: boolean}} props
 */
export default function ListaOrdenable({
  items,
  onReordenar,
  etiquetaDe,
  children,
  deshabilitado = false,
}) {
  const [arrastrando, setArrastrando] = useState(null)

  const mover = (desde, hasta) => {
    if (hasta < 0 || hasta >= items.length || desde === hasta) return
    const copia = [...items]
    const [sacado] = copia.splice(desde, 1)
    copia.splice(hasta, 0, sacado)
    onReordenar(copia)
  }

  return (
    <ul className="lista-ordenable">
      {items.map((item, indice) => (
        <li
          key={item.id}
          className={`ordenable-item ${arrastrando === indice ? 'ordenable-arrastrando' : ''}`}
          draggable={!deshabilitado}
          onDragStart={() => setArrastrando(indice)}
          onDragEnd={() => setArrastrando(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (arrastrando !== null) mover(arrastrando, indice)
            setArrastrando(null)
          }}
        >
          <span className="ordenable-asa" aria-hidden="true">
            <GripVertical size={14} />
          </span>

          <div className="ordenable-contenido">{children(item, indice)}</div>

          {/* Equivalente accesible del arrastre. Van con aria-label explícito porque el
              ícono no dice QUÉ se mueve, y sin eso un lector de pantalla anuncia siete
              botones "subir" idénticos. */}
          <span className="ordenable-flechas">
            <button
              type="button"
              aria-label={`Subir ${etiquetaDe(item)}`}
              disabled={deshabilitado || indice === 0}
              onClick={() => mover(indice, indice - 1)}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              aria-label={`Bajar ${etiquetaDe(item)}`}
              disabled={deshabilitado || indice === items.length - 1}
              onClick={() => mover(indice, indice + 1)}
            >
              <ChevronDown size={14} />
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
