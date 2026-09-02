'use client';

export default function DescuentoForm({ tipo, setTipo, draft, setDraft, onConfirmar, onCancelar }) {
  const prefijo = tipo === 'amount' ? '$' : '%';
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          style={{ appearance: 'none', background: 'var(--w05)', color: 'var(--tinta)', border: '1px solid var(--w15)', borderRadius: 12, padding: '13px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          <option value="percent" style={{ background: 'var(--sup-2)' }}>Porcentaje (%)</option>
          <option value="amount" style={{ background: 'var(--sup-2)' }}>Monto ($)</option>
        </select>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--w05)', border: '1px solid var(--marca)', borderRadius: 12, padding: '13px 16px' }}>
          <span style={{ fontSize: 16, color: 'var(--w55)', fontWeight: 700 }}>{prefijo}</span>
          <input type="number" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tinta)', fontSize: 17, fontWeight: 800 }} />
        </div>
      </div>
      {tipo === 'percent' && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {[10, 15, 20].map((pct) => (
            <button key={pct} type="button" onClick={() => setDraft(String(pct))} style={{ flex: 1, background: 'var(--w05)', color: 'var(--tinta)', border: '1px solid var(--w14)', borderRadius: 12, padding: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              {pct} %
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onConfirmar} style={{ flex: 1, background: 'var(--verde-suave)', color: 'var(--tinta)', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Confirmar</button>
        <button type="button" onClick={onCancelar} style={{ flex: 1, background: 'var(--w06)', color: 'var(--w70)', border: '1px solid var(--w14)', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
      </div>
    </>
  );
}
