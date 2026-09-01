import { cortesMapa, tramosLeyenda } from '../utilidades/mapa.js'

// Los rótulos salen de los cortes REALES, nunca escritos a mano: si algún día la
// ventana crece y la escalera se estira, la leyenda se estira con ella.
export default function LeyendaMapa({ maximo }) {
  const tramos = tramosLeyenda(cortesMapa(maximo))

  return (
    <>
      <p className="mapa-leyenda">
        <span className="mapa-leyenda-item" style={{ color: 'var(--gris-tenue)' }}>
          Noticias por región:
        </span>
        {tramos.map((tramo) => (
          <span key={tramo.clase} className="mapa-leyenda-item">
            <span className={`mapa-leyenda-muestra ${tramo.clase}`} aria-hidden="true" />
            {tramo.etiqueta}
          </span>
        ))}
      </p>
      {/* Este sesgo hoy se mostraba sin explicar y confundía al comparar totales. */}
      <p className="mapa-nota">
        Una noticia puede mencionar más de una región, por lo que la suma supera el total
        de la ventana.
      </p>
    </>
  )
}
