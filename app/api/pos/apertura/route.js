import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session';
import { supabaseConSesion } from '@/lib/auth/supabaseConSesion';

export async function POST(req) {
  const sesion = requerirStaff(req)
  if (!sesion) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const supabase = supabaseConSesion(sesion)
  try {
    const { efectivoInicial } = await req.json();
    await supabase.from('cortes_caja').insert([{ efectivo_inicial: efectivoInicial, estado: 'abierto' }]);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}