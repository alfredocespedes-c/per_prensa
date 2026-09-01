import { useSesion } from '../contexto/ProveedorSesion.jsx'
import PantallaSesion from './PantallaSesion.jsx'

/**
 * Envuelve las vistas que SÍ exigen sesión.
 *
 * La portada es pública (decisión del mandante), así que la puerta dejó de
 * envolver la app entera: ahora protege ruta por ruta. Esto es solo la puerta
 * VISUAL — quien manda es el backend, que responde 401 en /api/historico y
 * /api/conceptos sin cookie válida. Saltarse este componente no da acceso a nada.
 *
 * No redirige sola al IAM: un fallo permanente del callback (cookie descartada
 * por Secure sobre HTTP, reloj desfasado) produciría un bucle app <-> IAM que el
 * navegador no detecta, porque son navegaciones completas. El usuario pulsa.
 */
export default function RutaProtegida({ children, titulo = 'Esta sección requiere iniciar sesión' }) {
  const { fase, iniciarSesion, reintentar } = useSesion()

  if (fase === 'verificando') return <PantallaSesion titulo="Verificando sesión…" />

  if (fase === 'autenticado') return children

  if (fase === 'noConfigurada') {
    return (
      <PantallaSesion
        titulo="Autenticación no configurada"
        detalle="Este servidor no tiene cargadas las credenciales de COIPO IAM. Es un problema de despliegue, no de tu cuenta. La portada sigue disponible."
        accion={{ texto: 'Reintentar', alHacerClic: reintentar }}
      />
    )
  }

  if (fase === 'error') {
    return (
      <PantallaSesion
        titulo="No se pudo verificar la sesión"
        detalle="El servidor no respondió. La portada sigue disponible; reintenta en unos segundos."
        accion={{ texto: 'Reintentar', alHacerClic: reintentar }}
      />
    )
  }

  // Anónimo
  return (
    <PantallaSesion
      titulo={titulo}
      detalle="Ingresa con tu cuenta de CONAF (COIPO IAM) para acceder a esta vista. La portada del boletín no requiere sesión."
      accion={{ texto: 'Iniciar sesión', alHacerClic: () => iniciarSesion() }}
    />
  )
}
