import { Link } from 'react-router-dom'

// Correo de contacto para solicitudes de retiro. Vive en el frontend porque es una
// dirección pública e institucional, no un secreto: ponerlo en el .env obligaría a
// reconstruir la imagen para corregir una errata y lo dejaría invisible en el código.
export const CORREO_RETIRO = 'uia@conaf.cl'

/**
 * Pie común a TODAS las rutas.
 *
 * Antes existía un único <footer> dentro de Portada, así que las otras nueve vistas se
 * mostraban sin ninguna atribución. La leyenda de propiedad y la vía de contacto para
 * pedir un retiro tienen que estar donde sea que el usuario esté mirando contenido de
 * terceros, no solo en la portada.
 */
export default function PieInstitucional() {
  return (
    <footer className="pie">
      <p className="pie-linea">
        <span className="pie-marca">CONAF</span>
        Monitor de prensa de la Corporación Nacional Forestal · Unidad de Información y
        Análisis.
      </p>
      {/* Esta leyenda es una declaración de cara al público: tiene que describir lo que
          el sistema hace de verdad. Decía que «las imágenes se cargan directamente desde
          el servidor de cada medio»; desde que el departamento legal resolvió eliminarlas,
          eso sería falso. El sistema no trata imágenes de prensa en ninguna forma. */}
      <p className="pie-linea pie-atribucion">
        Los contenidos pertenecen a sus respectivos medios. Este sistema no aloja ni
        reproduce las notas ni sus imágenes: muestra el titular y enlaza a la fuente
        original.
      </p>
      <p className="pie-linea">
        Para solicitar el retiro de una nota o de un medio completo:{' '}
        <Link to="/retiro">formulario de solicitud de retiro</Link> o escribir a{' '}
        <a href={`mailto:${CORREO_RETIRO}`}>{CORREO_RETIRO}</a>.
      </p>
    </footer>
  )
}
