'use client';

export default function DescuentoForm({ tipo, setTipo, draft, setDraft, onConfirmar, onCancelar }) {
  const prefijo = tipo === 'amount' ? '$' : '%';
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ appearance: 'none', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, padding: '13px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          <option value="percent" style={{ background: '#152036' }}>Porcentaje (%)</option>
          <option value="amount" style={{ background: '#152036' }}>Monto ($)</option>
        </select>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid #c1553a', borderRadius: 12, padding: '13px 16px' }}>
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>{prefijo}</span>
          <input type="number" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 17, fontWeight: 800 }} />
        </div>
      </div>
      {tipo === 'percent' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {[10, 15, 20].map((pct) => (
            <button key={pct} type="button" onClick={() => setDraft(String(pct))} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              {pct} %
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onConfirmar} style={{ flex: 1, background: '#34d399', color: '#0f172a', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirmar</button>
        <button type="button" onClick={onCancelar} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
      </div>
    </>
  );
}
