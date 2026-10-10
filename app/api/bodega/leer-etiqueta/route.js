import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requerirBodega } from '@/lib/auth/session'
import { analizarCodigo, limpiarGuia } from '@/lib/bodega/guias'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PATH_VALIDO = /^\d{4}-\d{2}-\d{2}\/[0-9a-z-]+\.(jpg|png|webp|heic|heif)$/

const INSTRUCCIONES = `Esta es la foto de una etiqueta de envío de un paquete en Estados Unidos.
Encuentra el NÚMERO DE GUÍA (tracking number) de la paquetería. Suele estar junto a "TRACKING #", "TRK#", "Tracking Number" o debajo del código de barras principal.
NO es el número de orden, ni el código postal, ni el número de cuenta, ni el peso, ni la referencia del remitente.
Copia el número exactamente como aparece, sin espacios.
Responde SOLO con JSON válido, sin texto adicional:
{"guia": "el número de guía o vacío si no se alcanza a leer", "paqueteria": "UPS, FedEx, USPS, Amazon, DHL, OnTrac u otra", "seguro": true o false}`

// Lee el número de guía de la FOTO de la etiqueta (para cuando el código de
// barras no se deja escanear). La foto ya está en el bucket privado; aquí se
// manda a la IA con una URL firmada de 5 minutos.
export async function POST(req) {
  if (!requerirBodega(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { path } = await req.json().catch(() => ({}))
  if (!PATH_VALIDO.test(path || '')) return NextResponse.json({ ok: false, mensaje: 'Foto no válida.' })

  const { data: firmada, error } = await supabase.storage.from('evidencia-paquetes').createSignedUrl(path, 300)
  if (error) return NextResponse.json({ ok: false, mensaje: error.message })

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: firmada.signedUrl } },
          { type: 'text', text: INSTRUCCIONES },
        ],
      }],
    })
    const raw = message.content[0]?.text?.trim() || ''
    const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())

    const leida = limpiarGuia(json.guia)
    if (leida.length < 8) {
      return NextResponse.json({ ok: false, mensaje: 'No se alcanzó a leer la guía. Toma la foto más de cerca y con buena luz.' })
    }

    // Si tiene forma de guía conocida, mejor: se guarda con su paquetería.
    const analisis = analizarCodigo(leida)
    return NextResponse.json({
      ok: true,
      guia: analisis.ok ? analisis.guia : leida,
      paqueteria: analisis.ok ? analisis.paqueteria : (json.paqueteria || 'Otra'),
      reconocida: analisis.ok,
      seguro: json.seguro !== false,
    })
  } catch (err) {
    console.error('[bodega/leer-etiqueta] error:', err?.message, err?.status)
    return NextResponse.json({ ok: false, mensaje: 'No se pudo leer la foto. Intenta otra vez.' })
  }
}
