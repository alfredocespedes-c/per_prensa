# Monitor de Prensa CONAF — Documento de Requisitos (v1)

**Proyecto:** COIPO_PRENSA · **Mandante:** SECOM (Gerencia de Comunicaciones, CONAF) ·
**Responsable:** Unidad de Información y Análisis (Luis Monsalve) ·
**Fecha del levantamiento:** 13 de julio de 2026

> Este documento es la referencia de alcance para el desarrollo. Fue contrastado contra
> el registro de la conversación de levantamiento mediante una revisión adversarial
> (completitud, consistencia y supuestos); las afirmaciones que son supuestos del
> consultor y no decisiones del cliente están marcadas como tales.

---

## 1. Resumen ejecutivo

Aplicación web estática (React, alojada en GitHub Pages) que reemplaza el boletín de
prensa diario que CONAF recibía del servicio pagado ConectaMedia, cancelado por falta de
presupuesto y ya cortado. La app muestra en todo momento las últimas ~100 noticias de una
lista curada de medios chilenos con presencia web donde se menciona "CONAF" o
"Corporación Nacional Forestal", agrupadas en secciones por tipo de medio como el boletín
original y actualizadas durante el día. La usa solo el equipo de SECOM, en modo lectura,
entrando a una URL pública, con descarga CSV de la lista visible. Sin backend, sin base
de datos y con presupuesto $0.

## 2. Usuarios y sus capacidades

| Tipo de usuario | Quiénes son | Qué pueden hacer |
|---|---|---|
| **Lector SECOM** | Equipo de la Gerencia de Comunicaciones (grupo chico; *supuesto no corregido: <20 personas*) | Entrar a la URL pública (sin login); ver las últimas ~100 noticias en secciones por tipo de medio, lo más reciente arriba; hacer clic en un titular para ir a la noticia original en el sitio del medio; descargar en CSV la lista visible. No pueden modificar nada. |
| **Administrador** | Luis Monsalve (Unidad de Información y Análisis) | Mantener y desplegar la aplicación; modificar en el código los conceptos de búsqueda; aplicar cambios a la lista de medios cuando SECOM los pida. La **definición inicial** de la lista de medios la propone el consultor (ver pregunta abierta 2). No hay interfaz de administración. |

No hay más tipos de usuario: sin cuentas, sin roles, sin login.

## 3. Funcionalidades en alcance (priorizadas)

### Crítico (condiciones para que SECOM acepte la v1)

1. **Recolección automática de noticias** desde una lista definida de medios chilenos con
   presencia web (prensa nacional, prensa regional y sitios web de radios — sus noticias
   escritas), detectando menciones de los conceptos configurados.
   *Regla de detección propuesta (validar, ver pregunta 7): insensible a mayúsculas
   ("Conaf"/"CONAF") y con límites de palabra (que "CONAFE" no dé falso positivo).*
2. **Conceptos de búsqueda configurables en código.** Lista inicial exacta:
   `["CONAF", "Corporación Nacional Forestal"]`.
3. **Ventana móvil de las últimas ~100 noticias.** El número es referencial (el cliente
   lo dijo con duda) y debe ser configurable en código. *Supuesto: 100 en total,
   repartidas entre las secciones según lleguen — no 100 por sección (ver pregunta 6).*
4. **Secciones por tipo de medio como el boletín antiguo**, y dentro de cada sección lo
   más reciente arriba. Línea base conocida del boletín de referencia: **Prensa Escrita,
   Prensa Regional y Radio** (queda pendiente cómo mapear medios solo-digitales y sitios
   de radios — ver pregunta 3).
5. **Cada noticia muestra:** nombre del medio (en texto: la pregunta 11 sobre logos quedó
   resuelta y **no se muestra ninguna imagen**), titular como link directo a la noticia
   original en el sitio del medio, fecha de publicación, y extracto corto con la mención
   destacada (resaltado amarillo, como el boletín antiguo). *Regla de fecha propuesta: la
   declarada por el medio; si falta o no trae hora, la fecha de detección (ver pregunta
   10).*
6. **Actualización automática, todos los días** (incluidos fines de semana — relevantes
   para CONAF, p. ej. incendios): objetivo de latencia **≤ 1 hora** entre publicación y
   aparición, y lista al día a las **8:00 hora de Chile**, que es cuando SECOM la revisa.
   Sin intervención manual diaria de nadie.
7. **Control de calidad de resultados:** sin noticias irrelevantes (falsos positivos) ni
   duplicados — el cliente declaró ambos como errores inaceptables (definición de
   "duplicado" pendiente — pregunta 4).
8. **Fidelidad visual al boletín antiguo:** mismas secciones, misma jerarquía de
   información y estilo similar. Referencia concreta: el HTML del boletín de ConectaMedia
   aportado por el cliente (encabezados verde `#05833f`, mención resaltada en amarillo).
9. ~~**Botón de descarga CSV**~~ — **RETIRADO** en el rediseño de exposición legal. No se
   sustituye por ningún otro formato de descarga masiva: una exportación completa de la
   ventana es precisamente la forma en que el contenido de los medios sale del sistema y
   deja de estar sujeto a su retención y a sus retiros. Cierra también la pregunta abierta
   n.º 5 (para qué se usaría el CSV). Texto original: (pedido explícito del cliente;
   columnas y propósito pendientes — pregunta 5).

### Importante (la v1 debiera incluirlo; no bloquea la aceptación de SECOM)

10. **Documentación y licencia open source** para que otras instituciones (p. ej.
    municipalidades) puedan reutilizar el proyecto — deseo explícito del cliente.

### Deseable (si no encarece la v1)

11. **Visualización correcta en celular** (no fue exigida; entra "en espíritu" de
    acercarse al uso real).

## 4. Funcionalidades fuera de alcance de la v1

| Qué queda fuera | Por qué |
|---|---|
| Transcripción de radio y TV (lo hablado al aire) | Requiere grabar y transcribir audio: es justamente el servicio caro que hacía ConectaMedia y no hay presupuesto. Criterio acordado: "si es alcanzable, entra; si no, no". |
| Prensa impresa sin versión web | Inaccesible sin servicios pagados de clipping. |
| Filtro temporal e histórico (más allá de las últimas ~100) | Pedido en el primer mensaje, pero el cliente lo descartó explícitamente después ("enfoquémonos en el día de hoy"). Requeriría almacenamiento persistente: candidato natural para la v2 con base de datos. |
| Gestión desde la interfaz (agregar/quitar medios o conceptos) | Decisión del cliente: se administra en el código, sin base de datos. |
| Cuentas de usuario, roles, login | La app es pública y de solo lectura. |
| Redes sociales (X, Facebook, Instagram), alertas por correo, estadísticas de menciones, análisis de tono | No pedidas. Acuerdo: cualquier extra se evalúa después de presentar la v1 a SECOM. |
| Base de datos e integraciones con otros sistemas | Definidas por el cliente como "versión 2". |

## 5. Integraciones requeridas

**Ninguna con sistemas de CONAF en la v1.** La app es independiente: no se incrusta en la
intranet, no usa login corporativo, no envía datos a otros sistemas. Sus únicas
dependencias externas son: (a) los sitios web / feeds públicos de los medios
monitoreados, y (b) la infraestructura gratuita de GitHub (Pages para publicar y un
mecanismo programado para actualizar — ver restricción 8). Para la **v2** el cliente
prevé base de datos e integraciones — razón de la exigencia de arquitectura hexagonal.

*Nota de diseño aportada por el cliente:* evaluar bibliotecas de Node para búsqueda de
noticias. Es una opción a explorar en la fase de diseño, no un requisito.

## 6. Restricciones técnicas confirmadas

1. **React** obligatorio (ya existe scaffold Vite+React en `frontend/`).
2. **Alojamiento en GitHub Pages**: sitio estático; **sin backend ni base de datos
   propios**.
3. **Presupuesto $0** — sin servicios pagados (confirmado: la falta de presupuesto es la
   razón del proyecto). *El carácter "absoluto" (ni siquiera APIs de USD 10-20/mes) es un
   supuesto de trabajo no confirmado — ver pregunta 8.*
4. **Arquitectura hexagonal (puertos y adaptadores)**, exigida por el cliente para poder
   acoplar una base de datos en la v2 sin reescribir la lógica.
5. **Repositorio público y reutilizable**: código abierto, documentado, con licencia
   permisiva (deseo explícito del cliente). *La salvedad sobre logos de medios de terceros
   dejó de aplicar: no se usa ninguno (ver pregunta 11).*
6. **Uso de contenido de terceros acotado:** por cada noticia se muestra solo titular,
   extracto corto y enlace al original — la práctica del boletín antiguo. No se republica
   el texto completo de las noticias.
7. **Datos y normativa:** la app no procesa datos personales ni financieros; solo agrega
   noticias públicas. El cliente confirmó que no aplica normativa específica.
8. **Interpretación técnica pendiente de validación explícita:** el cliente pidió "sin
   backend, sin base de datos, sin nada", pero una página estática no busca noticias por
   sí sola. La lectura del consultor — señalada durante el levantamiento y no objetada —
   es que "sin backend" significa "sin servidores propios", y que la búsqueda la ejecuta
   un proceso programado externo gratuito (p. ej. GitHub Actions con cron) que regenera
   los datos estáticos. **Debe validarse con SECOM/Luis en la presentación de la v1**
   (ver pregunta 9). Limitaciones conocidas de esa infraestructura gratuita: los cron de
   GitHub Actions sufren retrasos habituales de 15-60 minutos en horas de carga y se
   desactivan tras 60 días sin actividad del repositorio — afecta la garantía de latencia
   (ver criterio 3).
9. **Plazo: "lo antes posible"**, sin fecha formal — refuerza que la v1 sea mínima y
   funcional.

## 7. Criterios de aceptación de la primera versión

1. **Parecido al boletín:** puesta lado a lado con un boletín antiguo de ConectaMedia, la
   app se reconoce como "lo mismo, en versión web": mismas secciones, mismo tipo de
   información por noticia, estilo visual similar. (Criterio textual de SECOM: "lo más
   similar posible al reporte".)
2. **Disponible todos los días a las 8:00** (incluidos fines de semana): la URL carga y
   muestra la lista al día. Una página caída o en blanco es falla grave.
3. **Cobertura:** toda noticia que mencione alguno de los conceptos configurados,
   publicada por cualquier medio de la lista, aparece en la app con un objetivo de
   máximo 1 hora. Perder noticias de los medios de la lista es falla grave.
   **Advertencias que SECOM debe conocer al aceptar:** (a) la cobertura se limita a
   medios técnicamente alcanzables con herramientas gratuitas — los grandes medios con
   paywall o bloqueo anti-bot pueden ser inalcanzables sin pagar, y eso choca con esta
   expectativa (ver preguntas 8 y 12); (b) en infraestructura gratuita la latencia de
   1 hora es un objetivo de mejor esfuerzo, no una garantía dura (ver restricción 8 y
   pregunta 9).
4. **Limpieza:** la lista no muestra noticias irrelevantes ni duplicados; es falla grave.
   *Definiciones operativas pendientes de validar: "irrelevante" = no menciona los
   conceptos (interpretación del consultor); "duplicado" — ver pregunta 4.*
5. **Links sanos:** cada titular lleva a la noticia original correcta; links rotos son
   falla grave.
6. **CSV:** el botón descarga un CSV con las noticias visibles.
7. Los cuatro tipos de error (criterios 2-5) fueron declarados **todos inaceptables** por
   el cliente: son condiciones de aceptación, no deseables.

## 8. Preguntas sin respuesta (requieren definición)

1. **Cuenta GitHub:** ¿el repositorio y la URL saldrán de una cuenta institucional de
   CONAF o de una personal? (Preguntado, no respondido.)
2. **Lista inicial de medios:** la propone el consultor tomando como base los medios del
   boletín antiguo que sean técnicamente alcanzables; falta validarla con SECOM tras la
   presentación.
3. **Mapeo de secciones:** la línea base es Prensa Escrita / Prensa Regional / Radio (las
   del boletín). Pendiente: ¿dónde caen los medios solo-digitales (BioBioChile, Emol) y
   las noticias escritas de sitios de radios? ¿Se renombra "Radio" si ya no hay
   transcripciones de audio?
4. **Definición de "duplicado":** el boletín antiguo SÍ repetía la misma noticia cuando
   dos medios distintos la publicaban (ej. El Día y El Ovallino con la misma nota).
   ¿Duplicado inaceptable = la misma noticia repetida del mismo medio, o también la misma
   historia en medios distintos? Afecta directamente el criterio de aceptación 4.
5. **CSV:** el cliente no explicó para qué lo usarán (¿archivo, Excel, reenvío?), y eso
   determina separador, codificación (Excel en español necesita consideraciones) y
   columnas. Asumido mientras tanto: columnas sección, medio, fecha, titular, extracto,
   URL; alcance = las ~100 visibles.
6. **Ventana de noticias:** número exacto (el "100" fue dicho con duda) y si es un total
   global o por sección (asumido: global).
7. **Reglas de detección de menciones:** ¿insensible a mayúsculas? ¿límites de palabra
   (evitar "CONAFE")? ¿se busca en titular, extracto o cuerpo completo? ¿"relevante"
   puede exigir más que la mera mención (p. ej. excluir avisos o listados)?
8. **Presupuesto:** ¿$0 absoluto, o una API de bajo costo sería admisible si resulta
   necesaria para cubrir medios grandes que bloquean el acceso? (Preguntado, no
   respondido.)
9. **Mecanismo de actualización:** validar con el cliente que "sin backend" admite un
   proceso programado gratuito (GitHub Actions) y que la latencia de 1 hora se acepta
   como mejor esfuerzo; prever keep-alive para la desactivación de crons tras 60 días de
   inactividad.
10. **Regla de fecha:** ¿ordena la fecha declarada por el medio o la de detección?
    Propuesta: la del medio, con la de detección como respaldo cuando falte.
11. ~~**Logos de los medios:** enlazarlos desde los sitios de los medios es frágil (se
    rompen) y copiarlos al repo redistribuye marcas de terceros en un proyecto open
    source. Alternativa aceptable a validar: mostrar el nombre del medio en texto.~~
    **RESUELTA (agosto de 2026), por la vía amplia.** El departamento legal resolvió que
    el sistema no muestre **ninguna imagen de prensa** —ni logo del medio, ni foto de la
    nota, ni miniatura de previsualización—, en la portada pública ni en la vista interna.
    Se adoptó la alternativa que estaba a validar: el medio se identifica **en texto**. No
    quedó nada en el lugar de la imagen; la tarjeta es de solo texto. La decisión no fue
    solo dejar de mostrarlas: se cortó la cadena completa (el collector dejó de extraer
    el `og:image` y la columna se eliminó de la base), de modo que el sistema pueda
    sostener ante Fiscalía que **no trata imágenes**, en vez de "las guarda pero no las
    usa".
12. **Política ante bloqueos:** "si un medio bloquea el acceso, sale de la lista" choca
    con "es inaceptable perder noticias de un medio grande" cuando el bloqueado es
    grande. SECOM debe decidir: aceptar cobertura parcial formal o revisar el presupuesto
    (pregunta 8).
13. **Zona horaria:** se asume hora de Chile continental para "las 8:00" y las fechas
    mostradas.
