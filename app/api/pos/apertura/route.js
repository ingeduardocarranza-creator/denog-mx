import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  try {
    const { efectivoInicial } = await req.json();
    await supabase.from('cortes_caja').insert([{ efectivo_inicial: efectivoInicial, estado: 'abierto' }]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}