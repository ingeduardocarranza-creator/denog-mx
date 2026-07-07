'use client';

const money = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BILLETES = [
  { value: 1000, campo: 'b1000', colors: ['#7c3aed', '#a855f7'] },
  { value: 500, campo: 'b500', colors: ['#2563eb', '#3b82f6'] },
  { value: 200, campo: 'b200', colors: ['#15803d', '#22c55e'] },
  { value: 100, campo: 'b100', colors: ['#dc2626', '#f87171'] },
  { value: 50, campo: 'b50', colors: ['#db2777', '#f472b6'] },
  { value: 20, campo: 'b20', colors: ['#0d9488', '#2dd4bf'] },
];

const MONEDAS = [
  { value: 20, campo: 'm20', label: '20' },
  { value: 10, campo: 'm10', label: '10' },
  { value: 5, campo: 'm5', label: '5' },
  { value: 2, campo: 'm2', label: '2' },
  { value: 1, campo: 'm1', label: '1' },
  { value: 0.5, campo: 'm50c', label: '0.50' },
];

const stepperBtn = { width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1, flex: 'none' };
const stepperBtnSmall = { ...stepperBtn, width: 34, height: 34, borderRadius: 9, fontSize: 18 };
const inputStyle = { flex: 1, minWidth: 0, textAlign: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: 9, color: '#fff', fontSize: 16, fontWeight: 800, outline: 'none' };
const inputStyleSmall = { ...inputStyle, borderRadius: 9, padding: '8px 2px', fontSize: 15 };

export default function ConteoEfectivo({ denominaciones, onChange }) {
  return (
    <div>
      {/* BILLETES */}
      <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', color: '#facc15', marginBottom: 10 }}>
        💵 Billetes
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        {BILLETES.map((b) => {
          const count = denominaciones[b.campo] || 0;
          const subtotal = b.value * count;
          const tieneCount = count > 0;
          return (
            <div
              key={b.campo}
              style={{
                background: tieneCount ? 'rgba(255,255,255,0.05)' : '#111827',
                border: tieneCount ? '1px solid rgba(250,204,21,0.4)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div
                  style={{
                    flex: 'none', width: 96, height: 60, borderRadius: 9,
                    background: `linear-gradient(135deg,${b.colors[0]},${b.colors[1]})`,
                    border: '1px solid rgba(255,255,255,0.25)', boxShadow: `0 3px 12px ${b.colors[0]}55`,
                    color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                    padding: '7px 10px', overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.85, letterSpacing: '0.06em', alignSelf: 'flex-start' }}>MXN</span>
                  <span style={{ fontSize: b.value >= 1000 ? 21 : 26, fontWeight: 900, lineHeight: 1 }}>${b.value.toLocaleString('es-MX')}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.72, letterSpacing: '0.14em', alignSelf: 'flex-end' }}>PESOS</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>Piezas</div>
                  <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: tieneCount ? '#ffffff' : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => onChange(b.campo, Math.max(0, count - 1))} style={stepperBtn}>−</button>
                <input
                  type="number"
                  min="0"
                  value={count}
                  onChange={(e) => onChange(b.campo, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={inputStyle}
                />
                <button type="button" onClick={() => onChange(b.campo, count + 1)} style={stepperBtn}>＋</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Subtotal</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#facc15', fontVariantNumeric: 'tabular-nums' }}>{money(subtotal)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MONEDAS */}
      <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', marginBottom: 10 }}>
        🪙 Monedas
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 24 }}>
        {MONEDAS.map((m) => {
          const count = denominaciones[m.campo] || 0;
          const subtotal = m.value * count;
          const tieneCount = count > 0;
          return (
            <div
              key={m.campo}
              style={{
                background: tieneCount ? 'rgba(255,255,255,0.05)' : '#111827',
                border: tieneCount ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: '14px 10px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                <div
                  style={{
                    flex: 'none', width: 52, height: 52, borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 60%, #b45309)',
                    border: '2px solid #fcd34d', boxShadow: '0 3px 10px rgba(180,83,9,0.4), inset 0 0 0 3px rgba(255,255,255,0.15)',
                    color: '#3a2408', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1 }}>${m.label}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, color: tieneCount ? '#ffffff' : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>piezas</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
                <button type="button" onClick={() => onChange(m.campo, Math.max(0, count - 1))} style={stepperBtnSmall}>−</button>
                <input
                  type="number"
                  min="0"
                  value={count}
                  onChange={(e) => onChange(m.campo, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={inputStyleSmall}
                />
                <button type="button" onClick={() => onChange(m.campo, count + 1)} style={stepperBtnSmall}>＋</button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: 14, fontWeight: 800, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                {money(subtotal)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
