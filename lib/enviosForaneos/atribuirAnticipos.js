// Cuando se aprueba un envío foráneo, su costo tiene que salir de algún lado.
// Casi siempre ya está: el cliente mandó de más en su anticipo, justo lo que
// originó este módulo (ver claude/envios-foraneos-plan.md). En vez de
// inventar un pago nuevo, se toma de los anticipos GENERALES (sin entrega)
// que ese cliente ya tiene sueltos -- mismo principio que la atribución de
// anticipos a una entrega en /api/punto-venta/cobrar: nunca se borra una
// fila de `pagos`, se reclasifica o se parte en dos.
//
// Si no alcanza, el resto se queda sin cubrir: el costo del envío foráneo ya
// aparece como cargo en Anticipos/estado de cuenta (ver
// app/api/anticipos/entrega/route.js), así que el cliente simplemente sigue
// debiendo esa diferencia -- no se inventa dinero que no ha entrado.
//
// Devuelve { cubierto, pendiente } en pesos.
export async function atribuirAnticiposAEnvioForaneo(supabase, { clienteId, entregaId, envioForaneoId, costo, vendedorId }) {
  const costoNum = Math.round(Number(costo || 0) * 100) / 100
  if (costoNum <= 0) return { cubierto: 0, pendiente: 0 }

  const { data: anticiposGenerales } = await supabase
    .from('pagos')
    .select('id, monto, metodo')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'Anticipo')
    .is('entrega_id', null)
    .order('creado_en', { ascending: true })

  let restante = costoNum
  for (const a of (anticiposGenerales || [])) {
    if (restante <= 0) break
    const monto = Number(a.monto || 0)
    if (monto <= 0) continue
    const usar = Math.min(monto, restante)

    if (usar >= monto) {
      // Se consume completo: la misma fila se reclasifica, nunca se borra.
      await supabase.from('pagos').update({
        tipo: 'Envío Foráneo',
        envio_foraneo_id: envioForaneoId,
        entrega_id: entregaId || null,
      }).eq('id', a.id)
    } else {
      // Se usa una parte: el resto se queda como anticipo general, y lo
      // usado se convierte en una fila nueva de Envío Foráneo. La suma de
      // `pagos` de ese cliente nunca cambia.
      await supabase.from('pagos').update({ monto: Math.round((monto - usar) * 100) / 100 }).eq('id', a.id)
      await supabase.from('pagos').insert({
        cliente_id: clienteId,
        entrega_id: entregaId || null,
        monto: usar,
        metodo: a.metodo,
        tipo: 'Envío Foráneo',
        envio_foraneo_id: envioForaneoId,
        vendedor_id: vendedorId || null,
      })
    }
    restante = Math.round((restante - usar) * 100) / 100
  }

  return { cubierto: Math.round((costoNum - restante) * 100) / 100, pendiente: Math.max(0, restante) }
}

// Revertir la atribución cuando un envío foráneo YA APROBADO se cancela: los
// pagos que se habían reclasificado a 'Envío Foráneo' regresan a ser
// anticipos generales del cliente. Sigue el mismo principio de "atribuir,
// nunca borrar" -- aquí solo se reclasifica de vuelta, no se borra ni se
// resta nada, así que la suma de `pagos` del cliente tampoco cambia.
export async function revertirAtribucionEnvioForaneo(supabase, envioForaneoId) {
  const { error } = await supabase
    .from('pagos')
    .update({ tipo: 'Anticipo', envio_foraneo_id: null, entrega_id: null })
    .eq('envio_foraneo_id', envioForaneoId)
  if (error) throw new Error(error.message)
}
