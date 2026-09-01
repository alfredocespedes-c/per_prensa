import { useEffect } from 'react'
import { useSesion } from '../contexto/ProveedorSesion.jsx'
import PantallaSesion from './PantallaSesion.jsx'

// Motivos que devuelve el backend en /#/acceso?error=... (ver backend/app/routers/auth.py)
const MENSAJES = {
  estado_invalido:
    'La respuesta de autenticación no correspondía a este intento de ingreso. Suele pasar si la pestaña estuvo mucho rato abierta en la pantalla del IAM.',
  sin_codigo: 'El servidor de identidad no entregó un código de autorización.',
  codigo_invalido: 'El código de autorización era inválido o ya había expirado.',
  iam_inalcanzable:
    'No se pudo contactar al servidor de identidad (COIPO IAM). Puede estar en mantención.',
  token_invalido: 'El servidor de identidad rechazó la credencial entregada.',
  respuesta_invalida: 'El servidor de identidad respondió de una forma inesperada.',
  app_incorrecta:
    'La credencial fue emitida para otra aplicación de CONAF, no para el Monitor de Prensa.',
  sin_asignacion:
    'Tu cuenta existe en COIPO IAM pero no tiene acceso asignado al Monitor de Prensa. Solicítalo a la Unidad de Información y Análisis.',
}

function motivoDelHash() {
  const hash = window.location.hash.slice(1)
  const interrogacion = hash.indexOf('?')
  if (interrogacion === -1) return null
  return new URLSearchParams(hash.slice(interrogacion + 1)).get('error')
}

export default function Puerta({ children }) {
  const { fase, motivo, iniciarSesion, reintentar, yaSeIntento } = useSesion()
  const errorCallback = motivoDelHash()

  // El redirect va en un efecto, no en el cuerpo del render: navegar durante el
  // render es un efecto secundario y en StrictMode el cuerpo corre dos veces.
  useEffect(() => {
    if (fase !== 'anonimo') return
    // No auto-redirigir si venimos de un callback fallido o si ya se intentó una vez:
    // esas dos guardas son las que impiden el bucle infinito con el IAM.
    if (errorCallback || yaSeIntento()) return
    iniciarSesion()
  }, [fase, errorCallback, iniciarSesion, yaSeIntento])

  if (fase === 'verificando') {
    return <PantallaSesion titulo="Verificando sesión…" />
  }

  if (fase === 'anonimo') {
    if (errorCallback) {
      return (
        <PantallaSesion
          titulo="No se pudo iniciar sesión"
          detalle={MENSAJES[errorCallback] ?? `El ingreso falló (${errorCallback}).`}
          accion={{ texto: 'Volver a intentar', alHacerClic: () => iniciarSesion('/') }}
        />
      )
    }
    if (yaSeIntento()) {
      return (
        <PantallaSesion
          titulo="No se pudo completar el ingreso"
          detalle="El intento anterior no dejó una sesión activa. Si el problema persiste, avisa a la Unidad de Información y Análisis."
          accion={{ texto: 'Reintentar ingreso', alHacerClic: () => iniciarSesion('/') }}
        />
      )
    }
    return <PantallaSesion titulo="Redirigiendo a COIPO IAM…" />
  }

  if (fase === 'noConfigurada') {
    return (
      <PantallaSesion
        titulo="Autenticación no configurada"
        detalle={
          motivo
            ? `Faltan estas variables en el .env del servidor: ${motivo}. Es un problema de despliegue, no de tu cuenta.`
            : 'Este servidor no tiene cargadas las credenciales de COIPO IAM. Es un problema de despliegue: revisa el campo «configuracion» de /health.'
        }
        accion={{ texto: 'Reintentar', alHacerClic: reintentar }}
      />
    )
  }

  // 'error' NO redirige al login: si el backend está caído, redirigir produce un
  // bucle de navegaciones y una pantalla en blanco. Estado terminal con reintento.
  if (fase === 'error') {
    return (
      <PantallaSesion
        titulo="No se pudo verificar la sesión"
        detalle="El servidor no respondió. La página no está caída: reintenta en unos segundos."
        accion={{ texto: 'Reintentar', alHacerClic: reintentar }}
      />
    )
  }

  return children
}
