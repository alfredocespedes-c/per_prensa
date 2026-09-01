import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

/* ============================================================
   PANEL DE MONITOREO DE MENCIONES · CONAF
   Registro diario de menciones de prensa con clasificación
   temática, evaluación de tono y análisis asistido por IA.
   ============================================================ */

const T = {
  bg: "#F1F3EF",
  surface: "#FFFFFF",
  ink: "#1C2A24",
  inkSoft: "#55655E",
  line: "#D8DED9",
  lineSoft: "#E7ECE7",
  green: "#14603C",
  greenDeep: "#0E2E20",
  greenSoft: "#E3EFE7",
  red: "#B3402A",
  redSoft: "#F6E7E2",
  amber: "#C08A2D",
  amberSoft: "#F6EEDD",
  slate: "#5B6B66",
  slateSoft: "#E9EDEB",
};

const SENTIMIENTOS = {
  Positiva: { color: "#1E7A4A", bg: "#E3F0E8", label: "Positiva" },
  Neutra:   { color: "#5B6B66", bg: "#E9EDEB", label: "Neutra" },
  Negativa: { color: "#B3402A", bg: "#F6E7E2", label: "Negativa" },
  Mixta:    { color: "#C08A2D", bg: "#F6EEDD", label: "Mixta" },
};

/* Color fuerte y distintivo por tema, agrupado por macro-categoría:
   fuego (rojos/naranjos), normativa (azules), bosques/arbolado (verdes),
   parques (turquesa), institucional (violetas), comunidad (ocres), otros (gris) */
const TEMA_META = {
  "Incendios forestales":           { color: "#E0451B" },
  "Emergencias":                    { color: "#B71C1C" },
  "Prevención":                     { color: "#F07E14" },
  "Quemas controladas":             { color: "#D9560B" },
  "Normativa / Legislativo":        { color: "#2456C4" },
  "Fiscalización":                  { color: "#14539A" },
  "SBAP / Ley 21.600":              { color: "#3B4FD0" },
  "SERNAFOR / Transición":          { color: "#7B3FB0" },
  "Institucional / Vocerías":       { color: "#9227A8" },
  "Presupuesto / Recursos":         { color: "#5E35B1" },
  "Manejo de bosques / Bosque nativo": { color: "#166B34" },
  "Arbolado urbano / Restauración": { color: "#63A50E" },
  "Parques y ASP":                  { color: "#0C8B85" },
  "Educación ambiental":            { color: "#0277BD" },
  "Comunidades / Territorio":       { color: "#C25E00" },
  "Otro":                           { color: "#5B6B66" },
};
const TEMAS = Object.keys(TEMA_META);
const temaColor = (t) => (TEMA_META[t] ? TEMA_META[t].color : "#5B6B66");

const TIPOS_FUENTE = [
  "Institucional CONAF", "Prensa nacional", "Prensa regional", "Radio",
  "TV", "Agencia", "Redes sociales", "Gobierno / Otro servicio", "Otro",
];

const RELEVANCIAS = ["Alta", "Media", "Baja"];

const REGIONES = [
  "Nacional", "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama",
  "Coquimbo", "Valparaíso", "Metropolitana", "O'Higgins", "Maule", "Ñuble",
  "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén", "Magallanes",
];

const STORAGE_KEY = "conaf-menciones-v2";

const uid = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  hora: "",
  fuente: "",
  tipoFuente: "Prensa nacional",
  url: "",
  titular: "",
  resumen: "",
  temas: [],
  sentimiento: "Neutra",
  relevancia: "Media",
  region: "Nacional",
  voceria: "",
  notas: "",
};

/* --- Datos semilla: investigación de menciones 25 mayo – 11 julio 2026 --- */
const SEED = [
  {
    id: uid(), fecha: "2026-07-09", hora: "", fuente: "CONAF (conaf.cl) — Valparaíso",
    tipoFuente: "Institucional CONAF", url: "https://www.conaf.cl/capacitan-a-carabineros-de-la-provincia-de-san-antonio-en-fiscalizacion-de-quemas-silvoagropecuarias/",
    titular: "Capacitan a carabineros de la provincia de San Antonio en fiscalización de quemas silvoagropecuarias",
    resumen: "Funcionarios de CONAF y el Departamento O.S.5 de Carabineros instruyeron a 32 efectivos para reforzar la prevención de incendios forestales y la fiscalización de quemas en la provincia de San Antonio.",
    temas: ["Fiscalización", "Prevención", "Quemas controladas"], sentimiento: "Positiva",
    relevancia: "Media", region: "Valparaíso", voceria: "", notas: "Coordinación interinstitucional CONAF–Carabineros.",
  },
  {
    id: uid(), fecha: "2026-07-09", hora: "", fuente: "Diálogo Sur (Punta Arenas)",
    tipoFuente: "Prensa regional", url: "https://dialogosur.cl/2026/07/conaf-realiza-charlas-sobre-prevencion-de-incendios-forestales/",
    titular: "CONAF realiza charlas de prevención de incendios a comunidad educativa de Cerro Guido",
    resumen: "Equipo provincial de Última Esperanza realizó jornada con profesores, estudiantes y apoderados de la escuela rural de Cerro Guido (Torres del Paine): educación ambiental, prevención y programa Escuela Preparada. Se donaron 6 ñirres por el Día Mundial del Árbol.",
    temas: ["Prevención", "Educación ambiental"], sentimiento: "Positiva",
    relevancia: "Baja", region: "Magallanes", voceria: "", notas: "Réplica de comunicado institucional del 8 de julio.",
  },
  {
    id: uid(), fecha: "2026-07-08", hora: "", fuente: "CONAF (conaf.cl) — Ñuble",
    tipoFuente: "Institucional CONAF", url: "https://www.conaf.cl/levantan-restriccion-para-uso-del-fuego-orientado-a-quemas-controladas-en-19-comunas-de-nuble/",
    titular: "Levantan restricción para uso del fuego orientado a quemas controladas en 19 comunas de Ñuble",
    resumen: "La medida rige desde el 6 de julio y hasta nuevo aviso, tras informes que confirman disminución de vientos. Se recuerda a usuarios del fuego revisar restricciones vigentes.",
    temas: ["Quemas controladas", "Prevención"], sentimiento: "Neutra",
    relevancia: "Media", region: "Ñuble", voceria: "", notas: "",
  },
  {
    id: uid(), fecha: "2026-07-08", hora: "", fuente: "CONAF (conaf.cl) — Los Ríos",
    tipoFuente: "Institucional CONAF", url: "https://www.conaf.cl/conaf-fao-y-fundacion-reforestemos-concretaran-restauracion-en-el-parque-nacional-alerce-costero-con-12-000-plantas-de-alerce/",
    titular: "CONAF, FAO y Fundación Reforestemos concretarán restauración en PN Alerce Costero con 12.000 plantas de alerce",
    resumen: "Alianza triple para restauración ecológica en el Parque Nacional Alerce Costero mediante la plantación de 12.000 alerces.",
    temas: ["Arbolado urbano / Restauración", "Parques y ASP"], sentimiento: "Positiva",
    relevancia: "Media", region: "Los Ríos", voceria: "", notas: "Cooperación internacional (FAO) + sociedad civil.",
  },
  {
    id: uid(), fecha: "2026-07-08", hora: "", fuente: "CONAF (conaf.cl) — Ñuble",
    tipoFuente: "Institucional CONAF", url: "https://www.conaf.cl/conaf-y-municipio-de-chillan-impulsan-adopcion-de-arboles-entre-vecinos-de-lomas-de-oriente/",
    titular: "Vecinos de Chillán fueron invitados a adoptar árboles nativos",
    resumen: "Actividad organizada por el Municipio de Chillán en colaboración con CONAF Ñuble, enmarcada en la conmemoración del Día del Árbol, en el sector Lomas de Oriente.",
    temas: ["Arbolado urbano / Restauración", "Comunidades / Territorio", "Educación ambiental"], sentimiento: "Positiva",
    relevancia: "Baja", region: "Ñuble", voceria: "", notas: "",
  },
  {
    id: uid(), fecha: "2026-07-07", hora: "", fuente: "CONAF (conaf.cl)",
    tipoFuente: "Institucional CONAF", url: "https://www.conaf.cl/actualizacion-situacion-uso-del-fuego-en-regiones/",
    titular: "Actualización: situación del uso del fuego como quema controlada en regiones",
    resumen: "Comunicado nacional que actualiza el estado del uso del fuego para quemas controladas en las distintas regiones, llamando a revisar restricciones vigentes antes de planificar.",
    temas: ["Quemas controladas", "Prevención"], sentimiento: "Neutra",
    relevancia: "Media", region: "Nacional", voceria: "", notas: "Actualización periódica.",
  },
  {
    id: uid(), fecha: "2026-07-03", hora: "", fuente: "Portal Agro Chile",
    tipoFuente: "Prensa nacional", url: "https://www.portalagrochile.cl/2026/07/03/incendios-forestales-conaf-llama-a-la-prevencion-frente-al-factor-critico-del-viento/",
    titular: "Incendios forestales: CONAF llama a la prevención frente al factor crítico del viento",
    resumen: "La directora ejecutiva Aída Baldini instó a la población de Ñuble, Biobío y La Araucanía a evitar el uso del fuego, advirtiendo que el viento es un detonante clave pese al frío invernal. Refuerzo de campañas de prevención, detección y respuesta.",
    temas: ["Prevención", "Incendios forestales", "Institucional / Vocerías"], sentimiento: "Neutra",
    relevancia: "Alta", region: "Nacional", voceria: "Aída Baldini (Directora Ejecutiva)", notas: "Vocería nacional en contexto de invierno anómalo.",
  },
  {
    id: uid(), fecha: "2026-07-01", hora: "", fuente: "La Fontana (Ñuble)",
    tipoFuente: "Prensa regional", url: "https://lafontana.cl/2026/07/01/fuertes-vientos-nuble-conaf-no-quemas/",
    titular: "Ante fuertes vientos pronosticados para Ñuble: CONAF llama a no realizar quemas ni trabajar con fuego",
    resumen: "Vocería de Aída Baldini advierte que las condiciones de la semana elevan el riesgo de incendios pese al frío; llamado a denunciar humos al 130 (CONAF) y 132 (Bomberos).",
    temas: ["Prevención", "Quemas controladas", "Institucional / Vocerías"], sentimiento: "Neutra",
    relevancia: "Media", region: "Ñuble", voceria: "Aída Baldini (Directora Ejecutiva)", notas: "",
  },
  {
    id: uid(), fecha: "2026-07-01", hora: "", fuente: "Mi Radio (Los Vilos)",
    tipoFuente: "Radio", url: "https://www.miradiols.cl/2026/07/01/incendio-forestal-los-vilos-activo/",
    titular: "Incendio en Los Vilos reduce su intensidad, pero continúa activo tras consumir cerca de 500 hectáreas",
    resumen: "Incendio Cerro Blanco (sector El Mollar): fuego contenido en gran parte del perímetro tras sobrevuelo conjunto Carabineros–CONAF–municipio. Sin viviendas afectadas; coordinación con Delegación Presidencial y Minera Los Pelambres.",
    temas: ["Emergencias", "Incendios forestales"], sentimiento: "Neutra",
    relevancia: "Alta", region: "Coquimbo", voceria: "", notas: "Alerta Amarilla desde el 30-06. Cobertura sostenida del medio regional (29-06 al 02-07).",
  },
  {
    id: uid(), fecha: "2026-06-30", hora: "", fuente: "Mi Radio (Los Vilos)",
    tipoFuente: "Radio", url: "https://www.miradiols.cl/2026/06/30/actualizacion-al-menos-550-hectareas-han-sido-consumidas-en-mega-incendio-forestal-en-los-vilos/",
    titular: "Al menos 550 hectáreas consumidas en incendio forestal Cerro Blanco en Los Vilos",
    resumen: "El director regional de CONAF Coquimbo, Rodrigo Valdés, actualizó la magnitud del siniestro bajo Alerta Amarilla y precisó que no puede atribuirse causa sin investigación. Combate con avión de CONAF y helicóptero de Minera Los Pelambres.",
    temas: ["Emergencias", "Incendios forestales", "Institucional / Vocerías"], sentimiento: "Neutra",
    relevancia: "Alta", region: "Coquimbo", voceria: "Rodrigo Valdés (Director Regional Coquimbo)", notas: "Vocería regional prudente sobre causas: correcto manejo comunicacional.",
  },
  {
    id: uid(), fecha: "2026-06-30", hora: "", fuente: "Radio Agricultura / Portal Agro / G5 Noticias",
    tipoFuente: "Prensa nacional", url: "https://www.conaf.cl/conaf-refuerza-llamado-a-la-prevencion-ante-un-invierno-con-inusuales-incendios-forestales/",
    titular: "CONAF alerta por inusual aumento de incendios forestales durante el invierno (135 vs 43)",
    resumen: "Balance mayo–junio: 135 incendios frente a 43 del período anterior, con superficie 8% menor (1.257 ha). Tres incendios de relevancia el fin de semana: Alhué, Pichilemu y Los Vilos. Replicado por al menos cuatro medios desde el comunicado institucional.",
    temas: ["Incendios forestales", "Prevención", "Institucional / Vocerías"], sentimiento: "Mixta",
    relevancia: "Alta", region: "Nacional", voceria: "", notas: "Aumento de ocurrencia (negativo) con respuesta operativa destacada y menor superficie (positivo). Ningún medio contextualizó contra la serie histórica: espacio para nota técnica UIA.",
  },
  {
    id: uid(), fecha: "2026-06-26", hora: "", fuente: "El Mostrador",
    tipoFuente: "Prensa nacional", url: "https://www.elmostrador.cl/noticias/pais/2026/06/26/el-rediseno-silencioso-de-la-politica-de-biodiversidad-el-sbap-sera-leon-o-gatito/",
    titular: "El rediseño silencioso de la política de biodiversidad: ¿El SBAP será león o gatito?",
    resumen: "Investigación que reconstruye la cadena de decisiones tras la postergación del traspaso CONAF→SBAP: salida no anunciada de seis altos cargos del SBAP el 25 de junio, cambio de calendario y debate interno sobre qué parte de la Ley 21.600 se implementará efectivamente.",
    temas: ["SBAP / Ley 21.600", "SERNAFOR / Transición", "Institucional / Vocerías"], sentimiento: "Negativa",
    relevancia: "Alta", region: "Nacional", voceria: "", notas: "Pieza de investigación con fuentes reservadas; instala la duda sobre el alcance real de la reforma. Seguimiento prioritario para UIA.",
  },
  {
    id: uid(), fecha: "2026-06-26", hora: "", fuente: "Diario El Día (Coquimbo)",
    tipoFuente: "Prensa regional", url: "https://www.diarioeldia.cl/noticias/2026/06/26/142690-irregularidades-frenan-traspaso-de-areas-protegidas-al-sbap",
    titular: "Irregularidades frenan traspaso de áreas protegidas al SBAP",
    resumen: "Cobertura regional de la postergación del traspaso a marzo de 2027. Guardaparques en estado de alerta piden mantener el RIOHS y condiciones laborales; la directora regional del SBAP explica el marco legal (ventana 9-03-2026 a 8-03-2027) y anuncia reactivación de la Mesa Nacional de Gestión del Cambio.",
    temas: ["SBAP / Ley 21.600", "SERNAFOR / Transición", "Comunidades / Territorio"], sentimiento: "Negativa",
    relevancia: "Media", region: "Coquimbo", voceria: "", notas: "Las áreas protegidas siguen operando con normalidad bajo CONAF durante la transición.",
  },
  {
    id: uid(), fecha: "2026-06-17", hora: "", fuente: "País Circular",
    tipoFuente: "Prensa nacional", url: "https://www.paiscircular.cl/biodiversidad/que-ocasiono-la-postergacion-en-el-sbap-el-exdirector-del-servicio-y-el-presidente-del-sindicato-de-guardaparque-de-conaf-exponen-sus-puntos-de-vista/",
    titular: "¿Qué ocasionó la postergación en el SBAP? Dos puntos de vista",
    resumen: "Contrapunto entre el exdirector del SBAP Aarón Cavieres (\"el traspaso al 1 de agosto era factible\"; sugiere que hay algo más) y el dirigente del Sindicato de Guardaparques César Bastías, quien atribuye la decisión a discrepancias sobre condiciones laborales; seis regiones del SBAP sin directores regionales.",
    temas: ["SBAP / Ley 21.600", "SERNAFOR / Transición", "Institucional / Vocerías"], sentimiento: "Mixta",
    relevancia: "Alta", region: "Nacional", voceria: "", notas: "Los sindicatos habían anunciado movilizaciones; el aplazamiento las desactivó.",
  },
  {
    id: uid(), fecha: "2026-06-16", hora: "14:59", fuente: "Diario Financiero",
    tipoFuente: "Prensa nacional", url: "https://www.df.cl/empresas/medio-ambiente/traspaso-de-areas-protegidas-y-trabajadores-desde-conaf-al-sbap-se-posterga",
    titular: "Traspaso de áreas protegidas y trabajadores desde CONAF al SBAP se posterga a marzo de 2027 y se instruye sumario",
    resumen: "El Gobierno oficializa la postergación por deficiencias en planificación y ejecución atribuidas a la administración anterior. Se instruye sumario administrativo y se informa a la Contraloría General de la República. El cronograma incluye operativos regionales y una dirección operativa de traspaso.",
    temas: ["SBAP / Ley 21.600", "SERNAFOR / Transición", "Normativa / Legislativo"], sentimiento: "Negativa",
    relevancia: "Alta", region: "Nacional", voceria: "", notas: "Hito clave del período: reconfigura el calendario de transición institucional que afecta a CONAF (505 funcionarios y más de 100 ASP involucradas).",
  },
  {
    id: uid(), fecha: "2026-06-16", hora: "", fuente: "La Tercera",
    tipoFuente: "Prensa nacional", url: "https://www.latercera.com/nacional/noticia/postergan-hasta-marzo-de-2027-el-traspaso-de-conaf-al-sbap-en-medio-de-presiones-levantadas-por-los-guardaparques/",
    titular: "Gobierno posterga hasta marzo de 2027 el traspaso de CONAF al SBAP en medio de presiones de guardaparques",
    resumen: "Además de las brechas operativas, presupuestarias e institucionales detectadas, la decisión descomprime el conflicto laboral: cerca de 500 funcionarios por transferir, ~380 sindicalizados, con amenaza de movilizaciones nacionales. La directora ejecutiva de CONAF participó de la reunión con dirigentes.",
    temas: ["SBAP / Ley 21.600", "SERNAFOR / Transición", "Institucional / Vocerías"], sentimiento: "Mixta",
    relevancia: "Alta", region: "Nacional", voceria: "Aída Baldini (Directora Ejecutiva, en reunión con sindicatos)", notas: "Para CONAF el tono es mixto: las falencias se atribuyen a la gestión anterior, pero la continuidad operativa de las ASP queda bajo su responsabilidad hasta marzo 2027.",
  },
  {
    id: uid(), fecha: "2026-05-26", hora: "", fuente: "La Prensa Austral (Punta Arenas)",
    tipoFuente: "Prensa regional", url: "https://laprensaaustral.cl/2026/05/26/conaf-cierra-circuito-w-del-paine-para-junio-y-julio-y-el-gremio-turistico-reclama-enterarse-por-la-prensa/",
    titular: "CONAF cierra circuito W del Paine para junio y julio y el gremio turístico reclama enterarse por la prensa",
    resumen: "La asociación HYST calificó de \"impresentable\" la falta de comunicación previa del cierre, cuestionó que el cierre de operaciones de la concesionaria Vértice Patagonia derive automáticamente en cierre de senderos y recordó que la administración de senderos corresponde a CONAF.",
    temas: ["Parques y ASP", "Institucional / Vocerías", "Comunidades / Territorio"], sentimiento: "Negativa",
    relevancia: "Alta", region: "Magallanes", voceria: "", notas: "Crítica directa a la gestión comunicacional de CONAF por actores gremiales del turismo. El cierre sigue vigente durante julio: tema latente.",
  },
  {
    id: uid(), fecha: "2026-05-25", hora: "", fuente: "The Clinic",
    tipoFuente: "Prensa nacional", url: "https://www.theclinic.cl/2026/05/25/conaf-anuncia-cierre-temporal-del-circuito-w-en-torres-del-paine-y-las-navegaciones-en-lagos-pehoe-y-grey-por-temporada-de-invierno/",
    titular: "CONAF anuncia cierre temporal del circuito W en Torres del Paine y navegaciones en lagos Pehoé y Grey",
    resumen: "Cierre por temporada invernal ante dificultades operacionales para garantizar seguridad; solo Sendero Base Torres habilitado con guías acreditados. El medio recuerda la tragedia de noviembre 2025 con cinco turistas fallecidos en el circuito.",
    temas: ["Parques y ASP", "Prevención", "Emergencias"], sentimiento: "Neutra",
    relevancia: "Media", region: "Magallanes", voceria: "", notas: "El vínculo editorial con la tragedia de 2025 mantiene sensibilidad reputacional sobre la seguridad en el parque. Cierre vigente durante todo julio.",
  },
];

/* --- Persistencia --- */
async function loadMentions() {
  try {
    const res = await window.storage.get(STORAGE_KEY);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* clave inexistente: primera ejecución */ }
  return null;
}
async function saveMentions(list) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error("Error al guardar", e);
    return false;
  }
}

/* --- Análisis asistido por IA --- */
async function analizarTexto(texto) {
  const prompt = `Eres un analista de medios de la Unidad de Información y Análisis de CONAF (Chile). Analiza el siguiente texto de una nota de prensa o comunicado que menciona a CONAF y devuelve SOLO un objeto JSON válido, sin backticks ni texto adicional, con esta estructura exacta:
{
  "fecha": "YYYY-MM-DD (fecha de publicación si se infiere del texto; si no, usa la fecha de hoy ${new Date().toISOString().slice(0, 10)})",
  "hora": "HH:MM o cadena vacía si no consta",
  "fuente": "nombre del medio o 'CONAF (conaf.cl)' si es comunicado institucional",
  "tipoFuente": "uno de: ${TIPOS_FUENTE.join(" | ")}",
  "titular": "titular de la nota (textual si aparece, o uno fiel al contenido)",
  "resumen": "resumen ejecutivo de 2 a 3 frases, en registro institucional, en tus propias palabras",
  "temas": ["subconjunto de: ${TEMAS.join(", ")}"],
  "sentimiento": "Positiva, Neutra, Negativa o Mixta — evaluado respecto de la imagen institucional de CONAF",
  "relevancia": "Alta, Media o Baja según impacto reputacional y alcance",
  "region": "una de: ${REGIONES.join(", ")}",
  "voceria": "nombre y cargo de la vocería CONAF citada, o cadena vacía",
  "notas": "1 frase justificando la evaluación de sentimiento"
}

TEXTO A ANALIZAR:
${texto}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const raw = (data.content || []).map((b) => b.text || "").join("\n");
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/* --- Utilidades --- */
function fmtFecha(f) {
  if (!f) return "—";
  const [y, m, d] = f.split("-");
  return `${d}·${m}·${y}`;
}
function csvEscape(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}
function exportCSV(list) {
  const cols = ["fecha", "hora", "fuente", "tipoFuente", "region", "titular", "resumen", "temas", "sentimiento", "relevancia", "voceria", "url", "notas"];
  const head = cols.join(";");
  const rows = list.map((m) =>
    cols.map((c) => csvEscape(c === "temas" ? (m.temas || []).join(" | ") : m[c])).join(";")
  );
  const blob = new Blob(["\uFEFF" + [head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `menciones_conaf_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============ Componentes de UI ============ */

function Chip({ children, color, bg, small }) {
  return (
    <span style={{
      display: "inline-block", padding: small ? "1px 8px" : "3px 10px",
      borderRadius: 999, fontSize: small ? 10.5 : 11.5, fontWeight: 600,
      letterSpacing: "0.02em", color, background: bg, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em",
      textTransform: "uppercase", color: T.inkSoft, marginBottom: 5,
      fontFamily: "'Archivo', system-ui, sans-serif",
    }}>{children}</div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: `1px solid ${T.line}`, background: T.surface,
  fontSize: 13.5, color: T.ink, outline: "none",
  fontFamily: "'Inter', system-ui, sans-serif", boxSizing: "border-box",
};

function KPI({ label, value, sub, accent }) {
  return (
    <div className="kpi-card" style={{
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
      padding: "14px 16px", flex: 1, minWidth: 130,
      borderTop: `3px solid ${accent || T.green}`,
    }}>
      <div className="kpi-value" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 600, color: T.ink, lineHeight: 1.1 }}>{value}</div>
      <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.inkSoft, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* --- Formulario de mención (alta y edición) --- */
function MentionForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [textoIA, setTextoIA] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [errorIA, setErrorIA] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTema = (t) =>
    setForm((f) => ({
      ...f,
      temas: f.temas.includes(t) ? f.temas.filter((x) => x !== t) : [...f.temas, t],
    }));

  const runIA = async () => {
    if (!textoIA.trim()) return;
    setAnalizando(true); setErrorIA("");
    try {
      const r = await analizarTexto(textoIA);
      setForm((f) => ({
        ...f,
        fecha: r.fecha || f.fecha,
        hora: r.hora || "",
        fuente: r.fuente || f.fuente,
        tipoFuente: TIPOS_FUENTE.includes(r.tipoFuente) ? r.tipoFuente : f.tipoFuente,
        titular: r.titular || f.titular,
        resumen: r.resumen || f.resumen,
        temas: Array.isArray(r.temas) ? r.temas.filter((t) => TEMAS.includes(t)) : f.temas,
        sentimiento: SENTIMIENTOS[r.sentimiento] ? r.sentimiento : f.sentimiento,
        relevancia: RELEVANCIAS.includes(r.relevancia) ? r.relevancia : f.relevancia,
        region: REGIONES.includes(r.region) ? r.region : f.region,
        voceria: r.voceria || "",
        notas: r.notas || f.notas,
      }));
    } catch (e) {
      setErrorIA("No fue posible completar el análisis. Revisa el texto e inténtalo nuevamente, o completa los campos manualmente.");
    }
    setAnalizando(false);
  };

  const valido = form.titular.trim() && form.fuente.trim() && form.fecha;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Asistente IA */}
      <div style={{
        background: T.greenDeep, borderRadius: 12, padding: "16px 18px",
        color: "#DCE8E0",
      }}>
        <div style={{
          fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 13,
          letterSpacing: "0.08em", textTransform: "uppercase", color: "#8FC7A8", marginBottom: 8,
        }}>Clasificación asistida</div>
        <div style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>
          Pega el texto de la nota (o su parte principal) y el asistente propondrá titular, resumen, temas, tono y demás campos. Podrás corregir todo antes de guardar.
        </div>
        <textarea
          value={textoIA}
          onChange={(e) => setTextoIA(e.target.value)}
          placeholder="Pega aquí el texto de la nota de prensa o comunicado…"
          rows={4}
          style={{
            width: "100%", boxSizing: "border-box", borderRadius: 8, border: "1px solid #2E5642",
            background: "#0B211700", backgroundColor: "#123527", color: "#E8F1EB",
            padding: "10px 12px", fontSize: 13, fontFamily: "'Inter', sans-serif",
            outline: "none", resize: "vertical",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          <button
            onClick={runIA}
            disabled={analizando || !textoIA.trim()}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: analizando || !textoIA.trim() ? "#3A5A49" : "#4CAF7D",
              color: "#0B2117", fontWeight: 700, fontSize: 13, cursor: analizando ? "wait" : "pointer",
              fontFamily: "'Archivo', sans-serif",
            }}
          >{analizando ? "Analizando…" : "Analizar y completar campos"}</button>
          {errorIA && <span style={{ fontSize: 12, color: "#F0B9A8" }}>{errorIA}</span>}
        </div>
      </div>

      {/* Campos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        <div><FieldLabel>Fecha</FieldLabel>
          <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} style={inputStyle} /></div>
        <div><FieldLabel>Hora (opcional)</FieldLabel>
          <input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} style={inputStyle} /></div>
        <div><FieldLabel>Tipo de fuente</FieldLabel>
          <select value={form.tipoFuente} onChange={(e) => set("tipoFuente", e.target.value)} style={inputStyle}>
            {TIPOS_FUENTE.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><FieldLabel>Región / Alcance</FieldLabel>
          <select value={form.region} onChange={(e) => set("region", e.target.value)} style={inputStyle}>
            {REGIONES.map((r) => <option key={r}>{r}</option>)}
          </select></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div><FieldLabel>Fuente (medio, programa o sitio)</FieldLabel>
          <input value={form.fuente} onChange={(e) => set("fuente", e.target.value)} placeholder="Ej: El Mercurio / Radio Bío-Bío / conaf.cl" style={inputStyle} /></div>
        <div><FieldLabel>URL</FieldLabel>
          <input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" style={inputStyle} /></div>
      </div>

      <div><FieldLabel>Titular</FieldLabel>
        <input value={form.titular} onChange={(e) => set("titular", e.target.value)} placeholder="Titular de la nota" style={inputStyle} /></div>

      <div><FieldLabel>Resumen del contenido</FieldLabel>
        <textarea value={form.resumen} onChange={(e) => set("resumen", e.target.value)} rows={3}
          placeholder="Síntesis ejecutiva de 2–3 frases" style={{ ...inputStyle, resize: "vertical" }} /></div>

      <div>
        <FieldLabel>Etiquetas temáticas</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {TEMAS.map((t) => {
            const on = form.temas.includes(t);
            const c = temaColor(t);
            return (
              <button key={t} onClick={() => toggleTema(t)} style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "'Inter', sans-serif",
                border: `1.5px solid ${c}`,
                background: on ? c : T.surface,
                color: on ? "#FFF" : c,
              }}>{t}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <div>
          <FieldLabel>Evaluación de tono</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(SENTIMIENTOS).map((s) => {
              const on = form.sentimiento === s;
              const c = SENTIMIENTOS[s];
              return (
                <button key={s} onClick={() => set("sentimiento", s)} style={{
                  padding: "6px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                  cursor: "pointer", border: `1.5px solid ${on ? c.color : T.line}`,
                  background: on ? c.bg : T.surface, color: on ? c.color : T.inkSoft,
                  fontFamily: "'Archivo', sans-serif",
                }}>{s}</button>
              );
            })}
          </div>
        </div>
        <div>
          <FieldLabel>Relevancia</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {RELEVANCIAS.map((r) => {
              const on = form.relevancia === r;
              return (
                <button key={r} onClick={() => set("relevancia", r)} style={{
                  padding: "6px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                  cursor: "pointer", border: `1.5px solid ${on ? T.ink : T.line}`,
                  background: on ? T.ink : T.surface, color: on ? "#FFF" : T.inkSoft,
                  fontFamily: "'Archivo', sans-serif",
                }}>{r}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><FieldLabel>Vocería citada (opcional)</FieldLabel>
          <input value={form.voceria} onChange={(e) => set("voceria", e.target.value)} placeholder="Nombre y cargo" style={inputStyle} /></div>
        <div><FieldLabel>Notas del analista (opcional)</FieldLabel>
          <input value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Justificación de tono, contexto, seguimiento…" style={inputStyle} /></div>
      </div>

      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
        <button onClick={() => valido && onSave(form)} disabled={!valido || saving} style={{
          padding: "10px 22px", borderRadius: 9, border: "none",
          background: valido ? T.green : T.line, color: "#FFF", fontWeight: 700,
          fontSize: 14, cursor: valido ? "pointer" : "not-allowed",
          fontFamily: "'Archivo', sans-serif",
        }}>{saving ? "Guardando…" : "Guardar mención"}</button>
        <button onClick={onCancel} style={{
          padding: "10px 18px", borderRadius: 9, border: `1px solid ${T.line}`,
          background: T.surface, color: T.inkSoft, fontWeight: 600, fontSize: 14, cursor: "pointer",
          fontFamily: "'Archivo', sans-serif",
        }}>Cancelar</button>
        {!valido && <span style={{ fontSize: 12, color: T.inkSoft, alignSelf: "center" }}>Se requiere al menos fecha, fuente y titular.</span>}
      </div>
    </div>
  );
}

/* --- Registro individual en la cinta de monitoreo --- */
function MentionRow({ m, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const s = SENTIMIENTOS[m.sentimiento] || SENTIMIENTOS.Neutra;
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10,
      overflow: "hidden", display: "flex",
    }}>
      <div style={{ width: 5, background: s.color, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "12px 16px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600,
            color: T.inkSoft, letterSpacing: "0.02em",
          }}>{fmtFecha(m.fecha)}{m.hora ? ` · ${m.hora}` : ""}</span>
          <Chip color={s.color} bg={s.bg} small>{m.sentimiento}</Chip>
          {m.relevancia === "Alta" && <Chip color="#FFF" bg={T.ink} small>Relevancia alta</Chip>}
          <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{m.fuente}</span>
          <span style={{ fontSize: 11.5, color: T.inkSoft }}>· {m.region}</span>
        </div>
        <div
          onClick={() => setOpen(!open)}
          style={{
            fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 15,
            color: T.ink, marginTop: 6, cursor: "pointer", lineHeight: 1.35,
          }}
        >{m.titular}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
          {(m.temas || []).map((t) => (
            <Chip key={t} color="#FFFFFF" bg={temaColor(t)} small>{t}</Chip>
          ))}
        </div>
        {open && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${T.lineSoft}`, paddingTop: 10 }}>
            <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>{m.resumen || "Sin resumen registrado."}</div>
            {m.voceria && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}><strong>Vocería:</strong> {m.voceria}</div>}
            {m.notas && <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 4 }}><strong>Notas:</strong> {m.notas}</div>}
            <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
              {m.url && (
                <a href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: T.green, fontWeight: 700 }}>
                  Abrir fuente ↗
                </a>
              )}
              <button onClick={() => onEdit(m)} style={{
                fontSize: 12.5, fontWeight: 700, color: T.inkSoft, background: "none",
                border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
              }}>Editar</button>
              <button onClick={() => onDelete(m.id)} style={{
                fontSize: 12.5, fontWeight: 700, color: T.red, background: "none",
                border: "none", cursor: "pointer", padding: 0, textDecoration: "underline",
              }}>Eliminar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- Carrusel infinito de menciones --- */
function Carrusel({ items }) {
  const [pausado, setPausado] = useState(false);   // cursor sobre las tarjetas
  const [detenido, setDetenido] = useState(false); // control manual (táctil)
  if (!items.length) {
    return (
      <div style={{
        marginTop: 18, background: T.surface, border: `1px dashed ${T.line}`,
        borderRadius: 14, padding: "40px 20px", textAlign: "center",
        color: T.inkSoft, fontSize: 13.5,
      }}>
        No hay menciones para mostrar en el carrusel. Registra una nueva mención con el botón superior.
      </div>
    );
  }
  const doble = [...items, ...items];
  const dur = Math.max(35, items.length * 8);
  const clamp = (n) => ({
    display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden",
  });
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkSoft,
        }}>Carrusel — {items.length} registro{items.length === 1 ? "" : "s"}<span className="car-hint-desktop"> · pasa el cursor para pausar</span></div>
        <button
          onClick={() => setDetenido((d) => !d)}
          aria-label={detenido ? "Reanudar carrusel" : "Pausar carrusel"}
          style={{
            width: 34, height: 34, borderRadius: 999, border: `1.5px solid ${T.line}`,
            background: detenido ? T.green : T.surface, color: detenido ? "#FFF" : T.inkSoft,
            fontSize: 13, fontWeight: 800, cursor: "pointer", flexShrink: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >{detenido ? "▶" : "❚❚"}</button>
      </div>
      <div className="car-viewport" style={{
        overflow: "hidden", borderRadius: 14, border: `1px solid ${T.line}`,
        background: T.surface, padding: "18px 0",
      }}>
        <div
          className="car-track"
          onMouseEnter={() => setPausado(true)}
          onMouseLeave={() => setPausado(false)}
          onTouchStart={() => setDetenido(true)}
          style={{
            display: "flex", gap: 14, width: "max-content",
            animation: `car-scroll ${dur}s linear infinite`,
            animationPlayState: pausado || detenido ? "paused" : "running",
            paddingLeft: 14,
          }}
        >
          {doble.map((m, i) => {
            const s = SENTIMIENTOS[m.sentimiento] || SENTIMIENTOS.Neutra;
            return (
              <article key={`${m.id}-${i}`} className="car-card" style={{
                width: 320, flexShrink: 0, background: s.bg,
                border: `1px solid ${s.color}55`, borderTop: `5px solid ${s.color}`,
                borderRadius: 12, padding: "13px 15px 14px",
                display: "flex", flexDirection: "column", gap: 8, minHeight: 235,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5,
                    fontWeight: 600, color: T.inkSoft,
                  }}>{fmtFecha(m.fecha)}{m.hora ? ` · ${m.hora}` : ""}</span>
                  <span style={{
                    padding: "2px 10px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                    letterSpacing: "0.05em", textTransform: "uppercase",
                    background: s.color, color: "#FFFFFF",
                    fontFamily: "'Archivo', sans-serif",
                  }}>{m.sentimiento}</span>
                </div>
                <div style={{
                  fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 14,
                  lineHeight: 1.3, color: T.ink, ...clamp(3),
                }}>{m.titular}</div>
                <div style={{
                  fontSize: 12.5, lineHeight: 1.5, color: T.ink, opacity: 0.85,
                  flex: 1, ...clamp(5),
                }}>{m.resumen || "Sin resumen registrado."}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(m.temas || []).slice(0, 3).map((t) => (
                    <span key={t} style={{
                      padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                      background: temaColor(t), color: "#FFFFFF",
                      letterSpacing: "0.02em",
                    }}>{t}</span>
                  ))}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: T.inkSoft,
                  borderTop: `1px solid ${s.color}33`, paddingTop: 7,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                }}>
                  <span style={{ ...clamp(1) }}>{m.fuente}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                    {m.region}
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Abrir noticia en ${m.fuente}`}
                        title="Abrir la noticia en su fuente original"
                        style={{
                          width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: s.color, color: "#FFFFFF",
                          fontSize: 12, fontWeight: 800, lineHeight: 1,
                        }}
                      >↗</a>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============ Aplicación principal ============ */
export default function PanelMencionesCONAF() {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState("panel"); // panel | nueva | editar
  const [editItem, setEditItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [modo, setModo] = useState("carrusel"); // carrusel | lista

  // Filtros
  const [q, setQ] = useState("");
  const [fTema, setFTema] = useState("Todos");
  const [fSent, setFSent] = useState("Todos");
  const [fTipo, setFTipo] = useState("Todos");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");

  useEffect(() => {
    (async () => {
      const stored = await loadMentions();
      if (stored && stored.length) {
        setMentions(stored);
      } else {
        setMentions(SEED);
        await saveMentions(SEED);
      }
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (list) => {
    setMentions(list);
    await saveMentions(list);
  }, []);

  const addMention = async (form) => {
    setSaving(true);
    const nueva = { ...form, id: uid() };
    await persist([nueva, ...mentions]);
    setSaving(false);
    setVista("panel");
  };

  const updateMention = async (form) => {
    setSaving(true);
    await persist(mentions.map((m) => (m.id === editItem.id ? { ...form, id: m.id } : m)));
    setSaving(false);
    setEditItem(null);
    setVista("panel");
  };

  const deleteMention = async (id) => {
    await persist(mentions.filter((m) => m.id !== id));
    setConfirmDelete(null);
  };

  const filtradas = useMemo(() => {
    return mentions
      .filter((m) => {
        if (fTema !== "Todos" && !(m.temas || []).includes(fTema)) return false;
        if (fSent !== "Todos" && m.sentimiento !== fSent) return false;
        if (fTipo !== "Todos" && m.tipoFuente !== fTipo) return false;
        if (fDesde && m.fecha < fDesde) return false;
        if (fHasta && m.fecha > fHasta) return false;
        if (q.trim()) {
          const hay = `${m.titular} ${m.resumen} ${m.fuente} ${m.voceria} ${m.notas}`.toLowerCase();
          if (!hay.includes(q.trim().toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")));
  }, [mentions, q, fTema, fSent, fTipo, fDesde, fHasta]);

  /* KPIs y datos de gráficos sobre el conjunto filtrado */
  const hoy = new Date().toISOString().slice(0, 10);
  const kpi = useMemo(() => {
    const total = filtradas.length;
    const deHoy = filtradas.filter((m) => m.fecha === hoy).length;
    const fuentes = new Set(filtradas.map((m) => m.fuente)).size;
    const porSent = {};
    Object.keys(SENTIMIENTOS).forEach((s) => (porSent[s] = 0));
    filtradas.forEach((m) => { porSent[m.sentimiento] = (porSent[m.sentimiento] || 0) + 1; });
    return { total, deHoy, fuentes, porSent };
  }, [filtradas, hoy]);

  const serieDiaria = useMemo(() => {
    const map = {};
    filtradas.forEach((m) => {
      if (!map[m.fecha]) {
        map[m.fecha] = { fecha: m.fecha, Positiva: 0, Neutra: 0, Negativa: 0, Mixta: 0 };
      }
      map[m.fecha][m.sentimiento] += 1;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((d) => ({ ...d, label: fmtFecha(d.fecha).slice(0, 5) }));
  }, [filtradas]);

  const serieTemas = useMemo(() => {
    const map = {};
    filtradas.forEach((m) => (m.temas || []).forEach((t) => { map[t] = (map[t] || 0) + 1; }));
    return Object.entries(map).map(([tema, n]) => ({ tema, n }))
      .sort((a, b) => b.n - a.n).slice(0, 8);
  }, [filtradas]);

  const dataSent = useMemo(
    () => Object.entries(kpi.porSent).filter(([, n]) => n > 0).map(([name, value]) => ({ name, value })),
    [kpi]
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: T.inkSoft }}>
        Cargando registro de menciones…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "'Inter', system-ui, sans-serif", color: T.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        a { text-decoration: none; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${T.green}; outline-offset: 1px;
        }
        @keyframes car-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .car-track:hover, .car-track:focus-within { animation-play-state: paused !important; }
        @media (prefers-reduced-motion: reduce) {
          .car-track { animation: none !important; flex-wrap: wrap; width: auto !important; }
        }
        .app-main { max-width: 1100px; margin: 0 auto; padding: 22px 22px 60px; }
        .header-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: flex-end;
          justify-content: space-between; flex-wrap: wrap; gap: 14px; }
        .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .filtros-grid { display: grid; gap: 10px; align-items: end;
          grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(130px, 1fr)) repeat(2, minmax(120px, 1fr)); }
        @media (max-width: 700px) {
          .app-main { padding: 12px 10px 44px; }
          .header-bar { padding: 14px 14px 13px !important; }
          .header-inner { align-items: flex-start; gap: 10px; }
          .header-title { font-size: 19px !important; }
          .header-eyebrow { font-size: 9.5px !important; }
          .hdr-btn { padding: 7px 12px !important; font-size: 12px !important; }
          .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
          .kpi-card { padding: 9px 9px !important; min-width: 0 !important; border-radius: 10px !important; }
          .kpi-value { font-size: 19px !important; }
          .kpi-label { font-size: 8.5px !important; letter-spacing: 0.03em !important; }
          .filtros-grid { grid-template-columns: 1fr 1fr; }
          .car-card { width: 80vw !important; max-width: 320px; }
          .car-viewport { border-radius: 12px !important; padding: 12px 0 !important; }
          .car-hint-desktop { display: none; }
        }
      `}</style>

      {/* Cabecera */}
      <header className="header-bar" style={{ background: T.greenDeep, padding: "22px 26px 20px" }}>
        <div className="header-inner">
          <div>
            <div className="header-eyebrow" style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.18em", color: "#7FB899", textTransform: "uppercase",
            }}>UIA · Monitoreo de medios · {fmtFecha(hoy)}</div>
            <h1 className="header-title" style={{
              fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 26,
              color: "#F2F6F3", margin: "6px 0 0", letterSpacing: "-0.01em",
            }}>Registro de menciones CONAF</h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="hdr-btn" onClick={() => exportCSV(filtradas)} style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid #35604B",
              background: "transparent", color: "#CFE3D6", fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "'Archivo', sans-serif",
            }}>Exportar CSV</button>
            <button className="hdr-btn" onClick={() => { setEditItem(null); setVista("nueva"); }} style={{
              padding: "9px 18px", borderRadius: 9, border: "none",
              background: "#4CAF7D", color: "#0B2117", fontWeight: 800, fontSize: 13,
              cursor: "pointer", fontFamily: "'Archivo', sans-serif",
            }}>+ Nueva mención</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {vista !== "panel" ? (
          <section style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: "22px 24px" }}>
            <h2 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 19, margin: "0 0 16px" }}>
              {vista === "editar" ? "Editar mención" : "Registrar nueva mención"}
            </h2>
            <MentionForm
              initial={vista === "editar" ? editItem : null}
              saving={saving}
              onSave={vista === "editar" ? updateMention : addMention}
              onCancel={() => { setVista("panel"); setEditItem(null); }}
            />
          </section>
        ) : (
          <>
            {/* KPIs */}
            <div className="kpi-row">
              <KPI label="Menciones (filtro)" value={kpi.total} accent={T.green} />
              <KPI label="Registradas hoy" value={kpi.deHoy} accent={T.ink} />
              <KPI label="Fuentes distintas" value={kpi.fuentes} accent={T.slate} />
              <KPI label="Positivas" value={kpi.porSent.Positiva} accent={SENTIMIENTOS.Positiva.color} />
              <KPI label="Negativas" value={kpi.porSent.Negativa} accent={SENTIMIENTOS.Negativa.color} />
              <KPI label="Mixtas" value={kpi.porSent.Mixta} accent={SENTIMIENTOS.Mixta.color} />
            </div>

            {/* Selector de vista */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {[["carrusel", "Carrusel"], ["lista", "Panel completo"]].map(([v, label]) => {
                const on = modo === v;
                return (
                  <button key={v} onClick={() => setModo(v)} style={{
                    padding: "7px 16px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", fontFamily: "'Archivo', sans-serif",
                    border: `1.5px solid ${on ? T.green : T.line}`,
                    background: on ? T.green : T.surface,
                    color: on ? "#FFF" : T.inkSoft,
                  }}>{label}</button>
                );
              })}
            </div>

            {modo === "carrusel" ? (
              <Carrusel items={filtradas} />
            ) : (
              <>
            {/* Gráficos */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginTop: 16 }}>
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Menciones por día y tono</div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={serieDiaria} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.lineSoft} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(SENTIMIENTOS).map((s) => (
                      <Bar key={s} dataKey={s} stackId="a" fill={SENTIMIENTOS[s].color} radius={s === "Mixta" ? [3, 3, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Temas más frecuentes</div>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={serieTemas} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="tema" width={150} tick={{ fontSize: 10.5 }} />
                    <Tooltip />
                    <Bar dataKey="n" radius={[0, 4, 4, 0]} name="Menciones">
                      {serieTemas.map((d) => (
                        <Cell key={d.tema} fill={temaColor(d.tema)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Distribución de tono</div>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={dataSent} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                      {dataSent.map((d) => (
                        <Cell key={d.name} fill={SENTIMIENTOS[d.name].color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Filtros */}
            <div className="filtros-grid" style={{
              background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12,
              padding: "13px 16px", marginTop: 16,
            }}>
              <div><FieldLabel>Buscar</FieldLabel>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titular, resumen, fuente, vocería…" style={inputStyle} /></div>
              <div><FieldLabel>Tema</FieldLabel>
                <select value={fTema} onChange={(e) => setFTema(e.target.value)} style={inputStyle}>
                  <option>Todos</option>{TEMAS.map((t) => <option key={t}>{t}</option>)}
                </select></div>
              <div><FieldLabel>Tono</FieldLabel>
                <select value={fSent} onChange={(e) => setFSent(e.target.value)} style={inputStyle}>
                  <option>Todos</option>{Object.keys(SENTIMIENTOS).map((s) => <option key={s}>{s}</option>)}
                </select></div>
              <div><FieldLabel>Tipo de fuente</FieldLabel>
                <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={inputStyle}>
                  <option>Todos</option>{TIPOS_FUENTE.map((t) => <option key={t}>{t}</option>)}
                </select></div>
              <div><FieldLabel>Desde</FieldLabel>
                <input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} style={inputStyle} /></div>
              <div><FieldLabel>Hasta</FieldLabel>
                <input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} style={inputStyle} /></div>
            </div>

            {/* Cinta de monitoreo */}
            <div style={{ marginTop: 18, display: "grid", gap: 9 }}>
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.14em", textTransform: "uppercase", color: T.inkSoft,
              }}>Cinta de monitoreo — {filtradas.length} registro{filtradas.length === 1 ? "" : "s"}</div>
              {filtradas.length === 0 ? (
                <div style={{
                  background: T.surface, border: `1px dashed ${T.line}`, borderRadius: 12,
                  padding: "34px 20px", textAlign: "center", color: T.inkSoft, fontSize: 13.5,
                }}>
                  No hay menciones que coincidan con los filtros. Ajusta los criterios o registra una nueva mención con el botón superior.
                </div>
              ) : (
                filtradas.map((m) => (
                  <MentionRow
                    key={m.id}
                    m={m}
                    onEdit={(item) => { setEditItem(item); setVista("editar"); }}
                    onDelete={(id) => setConfirmDelete(id)}
                  />
                ))
              )}
            </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Confirmación de eliminación */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(14,46,32,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
        }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: "22px 24px", maxWidth: 380 }}>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 16 }}>Eliminar mención</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, margin: "8px 0 16px", lineHeight: 1.5 }}>
              El registro se eliminará de forma permanente del panel. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => deleteMention(confirmDelete)} style={{
                padding: "8px 16px", borderRadius: 8, border: "none", background: T.red,
                color: "#FFF", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>Eliminar</button>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.line}`,
                background: T.surface, color: T.inkSoft, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
