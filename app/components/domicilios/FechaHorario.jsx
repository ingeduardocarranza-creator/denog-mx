'use client'
import { horariosDelDia } from '../../../lib/domicilios/horarios'

// Fecha y horario del domicilio con botones, para llenarlos de un toque:
// los próximos días (sin domingos, que no hay servicio) y los horarios del día
// elegido. Compartido por admin y POS. `form` es el formNuevo; `onChange`
// recibe un parche { campo: valor }.
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Hermosillo' }).format(new Date())
const sumar = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('sv-SE').format(d) }
const lbl = { color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }

function Boton({ activo, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ cursor: 'pointer', fontSize: 12, fontWeight: activo ? 700 : 500, padding: '8px 12px', borderRadius: 10, marginRight: 6, marginBottom: 6,
        border: `1.5px solid ${activo ? 'var(--marca)' : 'var(--w10)'}`, background: activo ? 'rgba(193,85,58,0.12)' : 'var(--w03)', color: activo ? 'var(--marca)' : 'var(--tinta)' }}>
      {children}
    </button>
  )
}

export default function FechaHorario({ form, onChange }) {
  const base = hoy()
  const dias = []
  for (let i = 0; dias.length < 6 && i < 14; i++) {
    const f = sumar(base, i)
    const dow = new Date(f + 'T12:00:00').getDay()
    if (dow === 0) continue
    dias.push({ f, texto: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${DIAS[dow]} ${Number(f.slice(8))}` })
  }
  const fecha = form.fecha_preferida
  const domingo = fecha && new Date(fecha + 'T12:00:00').getDay() === 0
  const horarios = horariosDelDia(fecha)
  const enChips = dias.some(d => d.f === fecha)

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={lbl}>Día de entrega *</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        {dias.map(d => <Boton key={d.f} activo={fecha === d.f} onClick={() => onChange({ fecha_preferida: d.f, horario: '' })}>{d.texto}</Boton>)}
        <input type="date" value={enChips ? '' : (fecha || '')} aria-label="Otra fecha"
          onChange={(e) => onChange({ fecha_preferida: e.target.value, horario: '' })}
          style={{ marginBottom: 6, background: 'var(--w05)', border: `1px solid ${!enChips && fecha ? 'var(--marca)' : 'var(--w10)'}`, borderRadius: 10, padding: '7px 10px', color: 'var(--tinta)', fontSize: 12, outline: 'none' }} />
      </div>
      {domingo && <div style={{ color: 'var(--rojo-t)', fontSize: 11, marginBottom: 6 }}>⚠️ No hay servicio de domicilio los domingos</div>}

      <label style={{ ...lbl, marginTop: 6 }}>Horario *</label>
      {fecha && !domingo ? (
        <div>{horarios.map(h => <Boton key={h} activo={form.horario === h} onClick={() => onChange({ horario: h })}>{h}</Boton>)}</div>
      ) : (
        <div style={{ color: 'var(--w30)', fontSize: 12 }}>Elige primero el día</div>
      )}
    </div>
  )
}
