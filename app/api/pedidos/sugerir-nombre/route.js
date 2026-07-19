import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })

  const { imagen_url } = await req.json()
  if (!imagen_url) return NextResponse.json({ ok: false, mensaje: 'imagen_url requerida' })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imagen_url } },
            {
              type: 'text',
              text: `Eres un asistente para una tienda de importaciones de EE.UU. (Ross, TJ Maxx, Marshalls, etc.).
Analiza la foto de este producto y responde SOLO con JSON válido, sin texto adicional:
{
  "descripcion": "título descriptivo en español, máximo 60 caracteres, incluye marca si se ve, tipo de prenda/artículo, color, talla si aplica",
  "categoria": "una de estas opciones exactas: Ropa, Calzado, Comida / Snacks, Artículos de Hogar, Cuidado Personal, Electrónica, Juguetes, Otro"
}`,
            },
          ],
        },
      ],
    })

    const raw = message.content[0]?.text?.trim() || ''
    const texto = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const json = JSON.parse(texto)
    return NextResponse.json({ ok: true, descripcion: json.descripcion || '', categoria: json.categoria || '' })
  } catch (err) {
    console.error('[sugerir-nombre] error:', err?.message, err?.status, err?.error)
    return NextResponse.json({ ok: false, mensaje: err?.message || 'No se pudo analizar la imagen.' })
  }
}
