import Anthropic from '@anthropic-ai/sdk'

// Jarvis coach: convierte datos reales en un mensaje de liderazgo. La IA solo
// redacta; los números salen de la base y se le pasan ya calculados.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = 'claude-haiku-4-5-20251001'

const BASE = `Eres Jarvis, el coach de ventas de Denog USA Compras (tienda y compras en EE.UU. para clientes de Hermosillo, México).
Tu estilo: coach EXIGENTE pero POSITIVO. Hablas en español de México, directo, cálido, sin groserías, tuteando.
Reglas:
- Reconoce lo bueno con datos concretos (usa solo los números que te doy; NUNCA inventes cifras, nombres ni hechos).
- Señala con claridad lo que falta o se puede mejorar, sin regañar ni humillar. Exigente = claro y con estándar alto.
- Termina con un reto concreto y alcanzable.
- Breve: frases cortas, pensado para leerse en 20 segundos desde el celular.
- Nunca menciones costos, utilidad ni márgenes.
- Los datos de HOY son parciales (mira "hora_actual"): no los juzgues como fracaso si el día apenas empieza. Compara solo días completos.
- "Lo excelente" solo lleva logros reales (subidas, metas cumplidas, buen trabajo). Una baja NUNCA es excelente: va en "a mejorar". Si no hay nada bueno que decir con datos, deja excelente vacío.
- Usa el "dia_semana" que te doy; no adivines el día.
- Los retos son sobre acciones y actividades (fotos, confirmaciones, atender clientes, cerrar la lista). NUNCA inventes metas en dinero ni horarios.
- Exigente no es duro: nada de frases como "no es aceptable"; di qué falta y cómo se arregla. Si alguien tuvo muy pocas actividades, pregunta qué lo frenó en vez de culparlo.
- Si no hay datos suficientes (por ejemplo, primer día), anima y fija el reto sin inventar comparaciones.
Responde SOLO con JSON válido, sin texto extra.`

const FORMATOS = {
  arranque: `Mensaje de ARRANQUE de turno para un colaborador. JSON: {"saludo": "una línea de energía con su nombre", "excelente": ["1-2 cosas buenas recientes con datos"], "mejorar": ["0-2 cosas por mejorar, claras"], "reto": "el reto concreto de este turno"}`,
  cierre: `RETROALIMENTACIÓN al cerrar el turno de un colaborador. JSON: {"saludo": "una línea de cierre con su nombre", "excelente": ["1-3 logros de hoy con datos"], "mejorar": ["0-2 pendientes o mejoras, claras y sin regaño"], "reto": "el reto para el próximo turno"}`,
  admin_manana: `RESUMEN Y PLAN DEL DÍA para el dueño del negocio (Lalo). JSON: {"saludo": "una línea de energía", "excelente": ["2-3 cosas buenas con datos (ventas, equipo)"], "mejorar": ["1-3 cosas que requieren atención o decisión hoy, con datos"], "reto": "la meta/plan concreto del día", "equipo": ["una línea breve por colaborador con su desempeño"]}`,
}

function respaldo(tipo, hechos) {
  const n = hechos.nombre || ''
  if (tipo === 'arranque') return { saludo: `¡Arrancamos, ${n}!`, excelente: [], mejorar: [], reto: 'Cumple tus actividades a tiempo y atiende a cada cliente con ganas.' }
  if (tipo === 'cierre') return { saludo: `Buen turno, ${n}.`, excelente: [], mejorar: [], reto: 'Mañana, un poquito mejor que hoy.' }
  return { saludo: `Buen día, ${n}.`, excelente: [], mejorar: [], reto: 'Revisa tus pendientes y cierra el día con orden.', equipo: [] }
}

export async function generarMensaje(tipo, hechos) {
  try {
    const msg = await client.messages.create({
      model: MODELO,
      max_tokens: 900,
      system: `${BASE}\n\n${FORMATOS[tipo]}`,
      messages: [{ role: 'user', content: `Datos reales (JSON):\n${JSON.stringify(hechos)}` }],
    })
    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
    const arr = (x, n) => (Array.isArray(x) ? x : []).map(s => String(s).slice(0, 220)).slice(0, n)
    return {
      saludo: String(j.saludo || '').slice(0, 200),
      excelente: arr(j.excelente, 3), mejorar: arr(j.mejorar, 3),
      reto: String(j.reto || '').slice(0, 260),
      ...(tipo === 'admin_manana' ? { equipo: arr(j.equipo, 4) } : {}),
      ia: true,
    }
  } catch (e) {
    console.error('[coach] IA falló:', e.message)
    return { ...respaldo(tipo, hechos), ia: false }
  }
}
