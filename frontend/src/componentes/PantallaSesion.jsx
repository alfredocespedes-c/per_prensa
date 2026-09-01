// Pantalla de pantalla completa para los estados de la puerta de sesión.
//
// Reusa deliberadamente la MISMA marca visual que el esqueleto estático de
// index.html: cuando React reemplaza el DOM inicial no debe haber salto perceptible.
// Estilos en estilos.css (.pantalla-sesion), con soporte de tema oscuro.

export default function PantallaSesion({ titulo, detalle, accion }) {
  return (
    <div className="pantalla-sesion">
      <div className="pantalla-sesion-marca">COIPO · Monitor de Prensa</div>
      <h1 className="pantalla-sesion-titulo">{titulo}</h1>
      {detalle && <p className="pantalla-sesion-detalle">{detalle}</p>}
      {accion && (
        <button type="button" className="pantalla-sesion-boton" onClick={accion.alHacerClic}>
          {accion.texto}
        </button>
      )}
    </div>
  )
}
