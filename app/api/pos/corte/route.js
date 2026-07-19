import { NextResponse } from 'next/server'
import { requerirStaff } from '@/lib/auth/session';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export async function GET(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  // 1. Obtener los datos del corte abierto
  const { data: corte } = await supabase
    .from('cortes_caja')
    .select('*')
    .eq('estado', 'abierto')
    .order('abierto_en', { ascending: false })
    .limit(1)
    .single();

  // 2. Jalar solo los pagos desde que abrió el turno actual
  const desdeApertura = corte?.abierto_en || new Date().toISOString()
  const { data: ventas } = await supabase
    .from('pagos')
    .select('id, cliente_id, monto, metodo, tipo, creado_en, clientes(nombre)')
    .eq('tipo', 'Venta Liquidación')
    .gte('creado_en', desdeApertura)
    .order('creado_en', { ascending: false });

  const pagosFormateados = (ventas || []).map(v => {
    let horaFormateada = '';
    if (v.creado_en) {
      const fechaObj = new Date(v.creado_en);
      
      // FORZAR EL RELOJ A LA HORA EXACTA DE HERMOSILLO
      horaFormateada = fechaObj.toLocaleTimeString('es-MX', { 
        timeZone: 'America/Hermosillo',
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
      });
    }
    return {
      ...v,
      creado_a_hora: horaFormateada
    };
  });

  // 3. Hacer las sumas para el arqueo
  const ef = (ventas || []).filter(v => v.metodo === 'Efectivo').reduce((acc, v) => acc + Number(v.monto), 0);
  const tr = (ventas || []).filter(v => v.metodo === 'Transferencia').reduce((acc, v) => acc + Number(v.monto), 0);
  const te = (ventas || []).filter(v => v.metodo === 'Terminal').reduce((acc, v) => acc + Number(v.monto), 0);

  const inicial = Number(corte?.efectivo_inicial) || 0;
  const esperado = inicial + ef;

  return NextResponse.json({
    totales: { inicial, efectivo: ef, transferencia: tr, terminal: te, esperado },
    ventas: pagosFormateados
  });
}

export async function POST(req) {
  if (!requerirStaff(req)) return NextResponse.json({ ok: false, mensaje: 'No autorizado' }, { status: 401 })
  const { efectivoContado, diferencia } = await req.json();
  const { data: corte } = await supabase
    .from('cortes_caja')
    .select('id')
    .eq('estado', 'abierto')
    .order('abierto_en', { ascending: false })
    .limit(1)
    .single();

  if (corte) {
    await supabase.from('cortes_caja').update({
      efectivo_contado: efectivoContado,
      diferencia: diferencia,
      cerrado_en: new Date().toISOString(),
      estado: 'cerrado'
    }).eq('id', corte.id);
  }
  return NextResponse.json({ success: true });
}