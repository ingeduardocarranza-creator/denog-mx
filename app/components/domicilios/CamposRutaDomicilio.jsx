'use client'
import { useEffect, useState } from 'react'
import BuscadorDireccion from './BuscadorDireccion'
import FechaHorario from './FechaHorario'

// Datos de entrega del domicilio, ordenados en grupos (compartido por admin y
// POS): buscador de dirección, calle y colonia, referencias, contacto, día y
// horario, hora exacta, notas y el aviso de cercanía/capacidad. `form` es el
// formNuevo de la pantalla; `onChange` recibe un parche { campo: valor }.
const lbl = { color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }
const inp = { width: '100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius: 10, padding: '9px 12px', color: 'var(--tinta)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const grupo = { color: 'var(--tinta)', fontSize: 12, fontWeight: 700, margin: '14px 0 8px', paddingBottom: 5, borderBottom: '1px solid var(--w06)' }
const par = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }

export default function CamposRutaDomicilio({ form, onChange, ocultarContacto = false, ocultarNotas = false }) {
  const [resultado, setResultado] = useState(null)   // { clave, datos }
  const [otroCel, setOtroCel] = useState(false)
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
    caja = <div style={{ background: color, border: `1px solid ${borde}`, borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--tinta)', marginBottom: 10 }}>{texto}</div>
  }

  const exige = !!form.exige_hora || !!form.hora_exacta
  const campo = (etiqueta, key, placeholder) => (
    <div>
      <label style={lbl}>{etiqueta}</label>
      <input type="text" value={form[key] || ''} placeholder={placeholder} onChange={(e) => onChange({ [key]: e.target.value })} style={inp} />
    </div>
  )

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...grupo, marginTop: 4 }}>📍 Dirección</div>
      <BuscadorDireccion onSelect={(l) => onChange({
        direccion: l.direccion || direccion, colonia: l.colonia || colonia, lat: l.lat, lng: l.lng,
        lat_ok: `${l.direccion || direccion}|${l.colonia || colonia}`,
      })} />
      <div style={par}>
        {campo('Calle y número *', 'direccion', 'Blvd. Morelos #432')}
        {campo('Colonia *', 'colonia', 'Villa del Real')}
        {campo('Entre calles', 'entre_calles', 'Pino y Cedro')}
        {campo('Referencias', 'referencias', 'Casa azul, portón negro')}
      </div>
      {campo('Instrucciones de acceso', 'instrucciones_acceso', 'Tocar timbre, dejar con el guardia…')}

      {!ocultarContacto && (<>
      <div style={grupo}>📞 Contacto</div>
      <div style={par}>
        {campo('Celular', 'celular_contacto', '662 000 0000')}
        {(otroCel || form.celular_contacto_adicional)
          ? campo('Celular adicional', 'celular_contacto_adicional', '662 000 0001')
          : <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={() => setOtroCel(true)} style={{ background: 'transparent', border: '1px dashed var(--w20)', borderRadius: 10, padding: '9px 12px', color: 'var(--w50)', fontSize: 12, cursor: 'pointer', width: '100%' }}>+ Otro celular</button>
            </div>}
      </div>

      </>)}

      <div style={grupo}>🗓️ Cuándo</div>
      <div style={{ marginBottom: 6 }}>
        <FechaHorario form={form} onChange={onChange} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--w60)', fontSize: 12, cursor: 'pointer', margin: '6px 0' }}>
        <input type="checkbox" checked={exige}
          onChange={(e) => onChange(e.target.checked ? { exige_hora: true } : { exige_hora: false, hora_exacta: '' })} />
        El cliente exige hora exacta
      </label>
      {exige && <input type="time" value={hora_exacta || ''} onChange={(e) => onChange({ hora_exacta: e.target.value })} style={{ ...inp, maxWidth: 180, marginBottom: 10 }} />}
      {caja}

      {!ocultarNotas && (<>
      <div style={grupo}>📝 Notas</div>
      <input type="text" value={form.notas || ''} placeholder="Algo más que se deba saber de esta entrega…" onChange={(e) => onChange({ notas: e.target.value })} style={inp} />
      </>)}
    </div>
  )
}
