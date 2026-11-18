'use client'
import { useEffect, useState } from 'react'

// Campos extra del formulario de agendar domicilio (compartidos por admin y POS):
// entre calles, quién recibe, instrucciones de acceso, hora exacta y el aviso
// de cercanía/capacidad. `form` es el formNuevo de la pantalla; `onChange`
// recibe un parche { campo: valor }.
const lbl = { color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }
const inp = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }

export default function CamposRutaDomicilio({ form, onChange }) {
  const [resultado, setResultado] = useState(null)   // { clave, datos }
  const { direccion, colonia, fecha_preferida, horario, hora_exacta } = form
  const completo = !!(direccion && colonia && fecha_preferida && horario)
  const pin = form.lat_ok === `${direccion}|${colonia}` && form.lat !== '' && form.lng !== '' ? { lat: Number(form.lat), lng: Number(form.lng) } : null
  const clave = [direccion, colonia, form.entre_calles, fecha_preferida, horario, hora_exacta, pin?.lat].join('|')

  useEffect(() => {
    if (!completo) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/domicilios/cercania', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direccion, colonia, entre_calles: form.entre_calles, fecha_preferida, horario, hora_exacta, lat: pin?.lat, lng: pin?.lng }),
        }).then((r) => r.json())
        if (res.ok) setResultado({ clave, datos: res })
      } catch {}
    }, 800)
    return () => clearTimeout(t)
  }, [clave, completo, direccion, colonia, form.entre_calles, fecha_preferida, horario, hora_exacta, pin?.lat, pin?.lng])

  // Solo se muestra el aviso si corresponde a lo que hay escrito ahora.
  const aviso = completo && resultado?.clave === clave ? resultado.datos : null

  let caja = null
  if (aviso) {
    let color = 'rgba(74,222,128,0.12)', borde = 'rgba(74,222,128,0.3)', texto = ''
    if (!aviso.ubicada) {
      color = 'rgba(251,191,36,0.12)'; borde = 'rgba(251,191,36,0.3)'
      texto = 'No pude ubicar la dirección en el mapa. Revisa calle, número y colonia; si no, el domicilio se guarda pero saldrá como "sin ubicar" en la ruta.'
    } else if (!aviso.preciso) {
      color = 'rgba(251,191,36,0.12)'; borde = 'rgba(251,191,36,0.3)'
      texto = 'Google solo ubicó la colonia, no la calle exacta. Revisa el número o llena "Entre calles" para que la ruta sea precisa.'
    } else if (!aviso.alcanza) {
      color = 'rgba(248,113,113,0.12)'; borde = 'rgba(248,113,113,0.3)'
      texto = aviso.tarde_nueva
        ? 'Con este domicilio no alcanzas a llegar a tiempo a esa ventana. Prueba otro horario o día.'
        : 'Ese día ya vas justo de tiempo: agregarlo hace que otra parada llegue fuera de su horario.'
    } else if (aviso.total_en_ventana === 0) {
      texto = 'Sería el primer domicilio en esa ventana. Sí cabe en el horario.'
    } else {
      texto = `Ese día en esa ventana ya llevas ${aviso.total_en_ventana} domicilio${aviso.total_en_ventana === 1 ? '' : 's'}` +
        (aviso.cercanos > 0 ? ` (${aviso.cercanos} a menos de 2 km)` : aviso.mas_cercano_km != null ? ` (el más cercano a ${aviso.mas_cercano_km} km)` : '') +
        '. Sí cabe en el horario.'
    }
    caja = <div style={{ gridColumn: '1 / -1', background: color, border: `1px solid ${borde}`, borderRadius: 10, padding: '8px 12px', fontSize: 11, color: 'var(--tinta)' }}>{texto}</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
      <div>
        <label style={lbl}>Entre calles</label>
        <input type="text" value={form.entre_calles || ''} onChange={(e) => onChange({ entre_calles: e.target.value })} placeholder="Pino y Cedro" style={inp} />
      </div>
      <div>
        <label style={lbl}>Quién recibe</label>
        <input type="text" value={form.recibe_nombre || ''} onChange={(e) => onChange({ recibe_nombre: e.target.value })} placeholder="Nombre de quien recibe" style={inp} />
      </div>
      <div>
        <label style={lbl}>Hora exacta (solo si el cliente la exige)</label>
        <input type="time" value={form.hora_exacta || ''} onChange={(e) => onChange({ hora_exacta: e.target.value })} style={inp} />
      </div>
      <div>
        <label style={lbl}>Instrucciones de acceso</label>
        <input type="text" value={form.instrucciones_acceso || ''} onChange={(e) => onChange({ instrucciones_acceso: e.target.value })} placeholder="Portón negro, tocar timbre" style={inp} />
      </div>
      {caja}
    </div>
  )
}
