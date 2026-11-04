import Anthropic from '@anthropic-ai/sdk'

// Jarvis coach: convierte datos reales en un mensaje de liderazgo. La IA solo
// redacta; los números salen de la base y se le pasan ya calculados.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELO = 'claude-haiku-4-5-20251001'

const BASE = `Eres Jarvis, el coach de Denog USA Compras (tienda y compras en EE.UU. en Hermosillo, México).
Tu público son jóvenes de 15 a 23 años que trabajan en la tienda. Háblales como un compa mayor que los echa a andar: casual, cálido, con humor ligero y 1-2 emojis por línea. Tuteo, español de México, cero groserías, cero tono de jefe o de regaño.
Reglas:
- MUY CORTO. Se lee en 10 segundos en el celular. Frases de máximo 12 palabras. Nada de párrafos.
- Usa solo los números que te doy; NUNCA inventes cifras, nombres ni hechos. Máximo 1 o 2 números en todo el mensaje.
- Reconoce algo bueno y concreto. Señala lo que falta en positivo ("hoy sube de 3 a 5"), sin culpar ni humillar.
- Termina con UN reto chiquito, claro y que se pueda cumplir hoy.
- Nunca menciones costos, utilidad ni márgenes.
- Los datos de HOY son parciales (mira "hora_actual"): no los juzgues como fracaso si el día apenas empieza. Compara solo días completos.
- "excelente" solo lleva logros reales. Una baja NUNCA es excelente. Si no hay nada bueno con datos, déjalo vacío.
- Usa el "dia_semana" que te doy; no adivines el día.
- Los retos son sobre acciones (fotos, confirmar clientes, atender, cerrar la lista). NUNCA metas en dinero ni horarios inventados.
- Evita palabras técnicas o de oficina (KPI, disciplina, operación, estándar).
Responde SOLO con un objeto JSON plano con exactamente las claves pedidas (sin envolverlo en otra clave), sin texto extra.`

const FORMATOS = {
  arranque: `ARRANQUE de turno para un colaborador joven. JSON: {"saludo": "máx 8 palabras, con su nombre", "excelente": ["máx 1 cosa buena, máx 12 palabras"], "mejorar": ["máx 1 cosa por mejorar, máx 12 palabras"], "reto": "máx 12 palabras"}`,
  cierre: `CIERRE de turno de un colaborador joven. JSON: {"saludo": "máx 8 palabras, con su nombre", "excelente": ["máx 1 logro de hoy, máx 12 palabras"], "mejorar": ["máx 1 cosa por mejorar, máx 12 palabras"], "reto": "reto para el próximo turno, máx 12 palabras"}`,
  admin_manana: `RESUMEN Y PLAN DEL DÍA para el dueño (Lalo, adulto): igual de cortito y amigable. JSON: {"saludo": "máx 10 palabras", "excelente": ["máx 2 cosas buenas, máx 15 palabras c/u"], "mejorar": ["máx 2 cosas que requieren atención, máx 15 palabras c/u"], "reto": "máx 15 palabras", "equipo": ["una línea de máx 12 palabras por colaborador"]}`,
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
      max_tokens: 1000,
      system: `${BASE}\n\n${FORMATOS[tipo]}`,
      messages: [{ role: 'user', content: `Datos reales (JSON):\n${JSON.stringify(hechos)}` }],
    })
    const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    let j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
    if (!j.saludo) j = Object.values(j).find(v => v && typeof v === 'object' && v.saludo) || j
    if (!j.saludo) throw new Error('respuesta vacía: ' + raw.slice(0, 300))
    const arr = (x, n) => (Array.isArray(x) ? x : []).map(s => String(s).slice(0, 120)).slice(0, n)
    return {
      saludo: String(j.saludo || '').slice(0, 80),
      excelente: arr(j.excelente, 2), mejorar: arr(j.mejorar, 2),
      reto: String(j.reto || '').slice(0, 130),
      ...(tipo === 'admin_manana' ? { equipo: arr(j.equipo, 4) } : {}),
      ia: true,
    }
  } catch (e) {
    console.error('[coach] IA falló:', e.message)
    return { ...respaldo(tipo, hechos), ia: false, error: String(e.message).slice(0, 400) }
  }
}
