'use client';

import { useState, useEffect } from 'react';
import TiendaTienda from '../../components/pos/TiendaTienda';
import EncargosEntrega from '../../components/pos/EncargosEntrega';
import { calcularTotalesCarrito } from '../../../lib/pos/tiendaUtils';

async function cargarDatosIniciales() {
  const [clRes, prRes, enRes] = await Promise.all([
    fetch('/api/clientes/listar').then(r => r.json()),
    fetch('/api/productos?stock=true').then(r => r.json()),
    fetch('/api/entregas').then(r => r.json()),
  ])
  return {
    clientes: clRes.clientes || [],
    productos: prRes.productos || [],
    entregas: enRes.entregas || [],
  }
}


const formatearFecha = (fecha) => {
  if (!fecha) return ''
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d = new Date(fecha + 'T12:00:00')
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

const formatearFechaCorta = (fecha) => {
  if (!fecha) return ''
  const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const d = new Date(fecha)
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}
export default function PuntoDeVenta() {
  const [modo, setModo] = useState('modo1');
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [ticketListo, setTicketListo] = useState(null);

  const [todosClientes, setTodosClientes] = useState([]);
  const [todosProductos, setTodosProductos] = useState([]);
  const [todasEntregas, setTodasEntregas] = useState([]);

  const [busquedaCliente, setBusquedaCliente] = useState('');

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [bloquesEntregas, setBloquesEntregas] = useState([]);

  const [pedidosMercaditoCliente, setPedidosMercaditoCliente] = useState([]);
  const [mercaditoSeleccionado, setMercaditoSeleccionado] = useState({});

  const [listaAnticipos, setListaAnticipos] = useState([]);
  const [anticiposDisponibles, setAnticiposDisponibles] = useState(0);

  const [productosSeleccionados, setProductosSeleccionados] = useState({});
  const [carritoEncargoTienda, setCarritoEncargoTienda] = useState([]);
  const [carritoVentaTienda, setCarritoVentaTienda] = useState([]);
  const [descuentoVentaTienda, setDescuentoVentaTienda] = useState({ tipo: null, valor: 0 });
  const [clienteTienda, setClienteTienda] = useState(null);

  const [mostrarModalCobro, setMostrarModalCobro] = useState(false);
  const [modalMetodo1, setModalMetodo1] = useState('Efectivo');
  const [modalMonto1, setModalMonto1] = useState('');
  const [modalRecibido, setModalRecibido] = useState('');
  const [modalRecibidoSplit, setModalRecibidoSplit] = useState('');
  const [modalDosMetodos, setModalDosMetodos] = useState(false);
  const [modalMetodo2, setModalMetodo2] = useState('Transferencia');

  const [turnoEstado, setTurnoEstado] = useState('cargando');
  const [turnoOcupado, setTurnoOcupado] = useState(null);
  const [colaborador, setColaborador] = useState(null);

  useEffect(() => {
    cargarDatosIniciales().then(({ clientes, productos, entregas }) => {
      setTodosClientes(clientes)
      setTodosProductos(productos)
      setTodasEntregas(entregas)
    })
  }, []);

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) {
      const c = JSON.parse(datos)
      setColaborador(c)
      verificarTurno(c.id)
      const onVisible = () => { if (document.visibilityState === 'visible') verificarTurno(c.id) }
      document.addEventListener('visibilitychange', onVisible)
      return () => document.removeEventListener('visibilitychange', onVisible)
    } else {
      setTurnoEstado('sin_turno')
    }
  }, [])

  const verificarTurno = async (colaborador_id) => {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const res = await fetch(`/api/caja?fecha=${hoy}`)
    const data = await res.json()
    if (data.ok) {
      const porColaborador = (data.cortes || []).reduce((acc, c) => {
        if (!acc[c.colaborador_id]) acc[c.colaborador_id] = { nombre: c.clientes?.nombre || 'Colaborador', registros: [] }
        acc[c.colaborador_id].registros.push(c)
        return acc
      }, {})

      const turnoActivoSistema = Object.entries(porColaborador)
        .map(([id, info]) => {
          const masReciente = info.registros.sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en))[0]
          return { colaborador_id: id, nombre: info.nombre, masReciente }
        })
        .find(t => t.masReciente?.tipo === 'apertura')

      if (!turnoActivoSistema) {
        setTurnoEstado('sin_turno')
      } else if (turnoActivoSistema.colaborador_id === String(colaborador_id)) {
        setTurnoEstado('activo')
      } else {
        setTurnoEstado('caja_ocupada')
        setTurnoOcupado({ nombre: turnoActivoSistema.nombre, desde: turnoActivoSistema.masReciente.creado_en })
      }
    } else {
      setTurnoEstado('sin_turno')
    }
  }

  const getDiaSemana = () => {
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
    return dias[new Date().getDay()]
  }

  const getMesActual = () => {
    const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
    const d = new Date()
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }

  const cambiarDeModoLimpiandoTodo = (nuevoModo) => {
    setModo(nuevoModo);
    setClienteSeleccionado(null);
    setBloquesEntregas([]);
    setPedidosMercaditoCliente([]);
    setMercaditoSeleccionado({});
    setAnticiposDisponibles(0);
    setListaAnticipos([]);
    setProductosSeleccionados({});
    setCarritoEncargoTienda([]);
    setBusquedaCliente('');
    setModalMonto1('');
    setModalDosMetodos(false);
    setModalMetodo1('Efectivo');
    setModalMetodo2('Transferencia');
    setModalRecibido('');
    setModalRecibidoSplit('');
    setMensaje({ tipo: '', texto: '' });
    setTicketListo(null);
  };

  const limpiarClienteEncargo = () => {
    setClienteSeleccionado(null);
    setBloquesEntregas([]);
    setPedidosMercaditoCliente([]);
    setMercaditoSeleccionado({});
    setListaAnticipos([]);
    setAnticiposDisponibles(0);
    setProductosSeleccionados({});
    setCarritoEncargoTienda([]);
    setBusquedaCliente('');
  };

  const seleccionarClienteEncargo = async (cliente) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setCarritoEncargoTienda([]);
    setModalMonto1('');
    setModalDosMetodos(false);
    setTicketListo(null);

    const res = await fetch(`/api/punto-venta/cliente?cliente_id=${cliente.id}`).then(r => r.json())
    const historialPedidos = res.pedidos || []
    const pedidosMercaditoConSaldo = res.mercadito || []
    const pagos = res.anticipos || []

    setPedidosMercaditoCliente(pedidosMercaditoConSaldo);
    const seleccionMercaditoInicial = {};
    pedidosMercaditoConSaldo.forEach((pm) => { seleccionMercaditoInicial[pm.id] = true; });
    setMercaditoSeleccionado(seleccionMercaditoInicial);

    setListaAnticipos(pagos);

    const totalAnticipos = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    setAnticiposDisponibles(totalAnticipos);

    const bloques = [];
    const entregasIds = [...new Set(historialPedidos.map(p => p.entrega_id))];

    entregasIds.forEach(eId => {
      const datosEntrega = todasEntregas.find(e => e.id === eId);
      const pedidosDeEstaEntrega = historialPedidos.filter(p => p.entrega_id === eId);

      if (datosEntrega) {
        const hoy = new Date();
        const fechaE = new Date(datosEntrega.fecha_entrega);
        const diasDiferencia = (hoy - fechaE) / (1000 * 60 * 60 * 24);
        const atrasada = diasDiferencia > 7;

        bloques.push({
          entrega: datosEntrega,
          pedidos: pedidosDeEstaEntrega,
          atrasada,
        });
      }
    });

    bloques.sort((a, b) => new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega));

    setBloquesEntregas(bloques);

    const seleccionInicial = {};
    historialPedidos.forEach(p => { seleccionInicial[p.id] = true; });
    setProductosSeleccionados(seleccionInicial);
  };

  let desgloseTicketEncargos = [];
  let sumaEncargosTotalNeto = 0;

  bloquesEntregas.forEach((b, idx) => {
    let subtotalArticulos = 0;
    b.pedidos.forEach(p => {
      if (productosSeleccionados[p.id]) {
        subtotalArticulos += Number(p.precio_venta) || 0;
      }
    });

    const anticiposDeEsteBloque = listaAnticipos.filter(ant => ant.entrega_id === b.entrega.id);
    if (idx === 0) {
      const anticiposGenerales = listaAnticipos.filter(ant => !ant.entrega_id);
      anticiposDeEsteBloque.push(...anticiposGenerales);
    }

    const totalDescuentoAnticipos = anticiposDeEsteBloque.reduce((acc, a) => acc + Number(a.monto), 0);
    const subtotalNetoEntrega = Math.max(0, subtotalArticulos - totalDescuentoAnticipos);

    if (subtotalArticulos > 0 || totalDescuentoAnticipos > 0) {
      desgloseTicketEncargos.push({
        fecha: b.entrega.fecha_entrega,
        montoNeto: subtotalNetoEntrega
      });
      sumaEncargosTotalNeto += subtotalNetoEntrega;
    }
  });

  const sumaMercaditoSeleccionado = pedidosMercaditoCliente
    .filter((pm) => mercaditoSeleccionado[pm.id])
    .reduce((s, pm) => s + pm.saldo, 0);

  const totalesEncargoTienda = calcularTotalesCarrito(carritoEncargoTienda, { tipo: null, valor: 0 });
  const totalesVentaTienda = calcularTotalesCarrito(carritoVentaTienda, descuentoVentaTienda);
  const subtotalTienda = modo === 'modo1' ? totalesEncargoTienda.total : modo === 'modo2' ? totalesVentaTienda.total : 0;
  const totalGeneral = modo === 'modo1' ? (sumaEncargosTotalNeto + sumaMercaditoSeleccionado + subtotalTienda) : subtotalTienda;

  const procesarCobroFinal = async ({ metodo1: m1, monto1, metodo2: m2, monto2 }) => {
    setLoading(true);
    setMensaje({ tipo: '', texto: '' });

    let textoArticulos = '';
    if (modo === 'modo1') {
      bloquesEntregas.forEach(b => {
        b.pedidos.forEach(p => {
          if (productosSeleccionados[p.id]) textoArticulos += `• ${p.descripcion}\n`;
        });
      });
      carritoEncargoTienda.forEach(linea => {
        textoArticulos += `• ${linea.nombre} (x${linea.cantidad})\n`;
      });
    }
    if (modo === 'modo2') {
      carritoVentaTienda.forEach(linea => {
        textoArticulos += `• ${linea.nombre} (x${linea.cantidad})\n`;
      });
    }

    const infoTicket = {
      telefono: clienteSeleccionado?.telefono || '',
      mensajeWhatsapp: `¡Hola! Tu entrega de *Denog USA Compras* ha sido registrada con éxito. ✅\n\n*Artículos entregados:*\n${textoArticulos}\n*Total cobrado:* $${totalGeneral.toLocaleString('es-MX')} MXN\n\n¡Muchas gracias por tu preferencia! 📦✨`
    };

    try {
      const bloquesOrdenados = [...bloquesEntregas]
        .sort((a, b) => new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega))
        .map(bloque => ({
          entregaId: bloque.entrega.id,
          pedidoIds: bloque.pedidos.filter(p => productosSeleccionados[p.id]).map(p => p.id),
          totalPedidosBloque: bloque.pedidos
            .filter(p => productosSeleccionados[p.id])
            .reduce((s, p) => s + (Number(p.precio_venta) || 0), 0),
          anticiposDeEstaEntrega: listaAnticipos
            .filter(a => a.entrega_id === bloque.entrega.id)
            .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en)),
        }));

      const anticiposGenerales = listaAnticipos
        .filter(a => !a.entrega_id)
        .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

      const mercaditoPayload = pedidosMercaditoCliente
        .filter(pm => mercaditoSeleccionado[pm.id])
        .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en))
        .map(pm => ({ id: pm.id, saldo: pm.saldo }));

      const res = await fetch('/api/punto-venta/cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo,
          clienteId: clienteSeleccionado?.id ?? null,
          metodo1: m1 || 'Transferencia',
          monto1,
          metodo2: m2 || null,
          monto2,
          bloquesOrdenados,
          anticiposGenerales,
          mercadito: mercaditoPayload,
          carritoEncargoTienda,
          totalEncargoTienda: totalesEncargoTienda.total,
          carritoVentaTienda,
          descuentoVentaTienda,
          clienteTiendaId: clienteTienda?.id ?? null,
        }),
      });

      const resultado = await res.json();
      if (!resultado.ok) throw new Error(resultado.mensaje || 'Error al cobrar');

      setMensaje({ tipo: 'exito', texto: totalGeneral === 0 ? '¡Pedido entregado! Cubierto con anticipos' : '¡Cobro registrado con éxito en caja!' });
      setTicketListo(infoTicket);

      const prRes = await fetch('/api/productos?stock=true').then(r => r.json());
      setTodosProductos(prRes.productos || []);

      // Reset all customer and cart state
      setClienteSeleccionado(null);
      setBusquedaCliente('');
      setBloquesEntregas([]);
      setProductosSeleccionados({});
      setPedidosMercaditoCliente([]);
      setMercaditoSeleccionado({});
      setListaAnticipos([]);
      setAnticiposDisponibles(0);
      setCarritoEncargoTienda([]);
      setCarritoVentaTienda([]);
      setDescuentoVentaTienda({ tipo: null, valor: 0 });
      setClienteTienda(null);
      setMostrarModalCobro(false);
      setModalMonto1('');
      setModalRecibido('');
      setModalRecibidoSplit('');
      setModalDosMetodos(false);
      setModalMetodo1('Efectivo');
      setModalMetodo2('Transferencia');
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de conexión.' });
    } finally {
      setLoading(false);
    }
  };

  const enviarWhatsApp = () => {
    if (!ticketListo) return;
    const normalizarTelefono = (tel) => {
      const n = tel.replace(/\D/g, '')
      if (n.length === 12 && n.startsWith('52')) return n
      if (n.length === 10) return '52' + n
      if (n.length === 11 && n.startsWith('1')) return '52' + n.slice(1)
      if (n.length === 11 && !n.startsWith('52')) return '52' + n.slice(1)
      if (n.length === 13 && n.startsWith('521')) return '52' + n.slice(3)
      return n
    }
    const numFinal = normalizarTelefono(ticketListo.telefono);
    console.log('numero original:', ticketListo.telefono, 'numero final:', numFinal);
    const url = `https://api.whatsapp.com/send?phone=${numFinal || ''}&text=${encodeURIComponent(ticketListo.mensajeWhatsapp)}`;
    window.open(url, '_blank');
  };

  const clientesFiltrados = busquedaCliente ? todosClientes.filter(c => {
    const n = c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase());
    const t = c.telefono ? c.telefono.includes(busquedaCliente) : false;
    return n || t;
  }) : [];

  const renderModalCobroPOS = () => {
    if (!mostrarModalCobro) return null
    const tipoLabel = modo === 'modo1' ? 'Encargo' : 'Tienda'
    const nombreCliente = modo === 'modo1' ? clienteSeleccionado?.nombre : 'Tienda'
    const fmtP = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
    return (
      <div onClick={e => { if (e.target === e.currentTarget) setMostrarModalCobro(false) }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 70px rgba(0,0,0,0.7)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Cobro · {tipoLabel}</div>
              <div style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{nombreCliente}</div>
              <div style={{ color: 'white', fontSize: 44, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.1, marginTop: 6 }}>{fmtP(totalGeneral)}</div>
            </div>
            <button onClick={() => setMostrarModalCobro(false)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, width: 36, height: 36, color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
              ✕
            </button>
          </div>

          {/* Toggle un pago / dividido */}
          <div className="grid grid-cols-2 gap-1.5 bg-gray-950 p-1.5 rounded-2xl border border-gray-800 mb-5">
            <button type="button" onClick={() => setModalDosMetodos(false)}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${!modalDosMetodos ? 'bg-green-950 text-white border border-green-500' : 'text-gray-400'}`}>💳 Un solo pago</button>
            <button type="button" onClick={() => setModalDosMetodos(true)}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${modalDosMetodos ? 'bg-green-950 text-white border border-green-500' : 'text-gray-400'}`}>✂️ Pago dividido</button>
          </div>

          {/* ===== UN SOLO PAGO ===== */}
          {!modalDosMetodos && (
            <div className="flex flex-col gap-4">
              <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">¿Con qué paga?</span>
              <div className="grid grid-cols-3 gap-2.5">
                {['Efectivo','Transferencia','Terminal'].map((m) => (
                  <button key={m} type="button" onClick={() => setModalMetodo1(m)}
                    className={`flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all ${modalMetodo1 === m ? METODOS[m].ring : 'border-gray-700 bg-gray-900'}`}>
                    <span className="text-2xl">{METODOS[m].icon}</span>
                    <span className={`text-[13px] font-bold ${modalMetodo1 === m ? 'text-white' : 'text-gray-400'}`}>{m}</span>
                  </button>
                ))}
              </div>

              {modalMetodo1 === 'Efectivo' ? (
                <div className="flex flex-col gap-3">
                  <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">¿Con cuánto paga?</span>
                  <div className="flex items-center gap-3 h-15 px-4 rounded-2xl bg-gray-950 border-2 border-green-500 ring-4 ring-green-500/10">
                    <span className="text-xl font-bold text-green-500">$</span>
                    <input type="text" inputMode="numeric" value={modalRecibido}
                      onChange={(e) => setModalRecibido(e.target.value.replace(/[^0-9]/g,''))}
                      placeholder="0" className="flex-1 bg-transparent outline-none text-white text-2xl font-bold" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {chipsDe(total).map((v, i) => (
                      <button key={v} type="button" onClick={() => setModalRecibido(String(v))}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${Number(modalRecibido) === v ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-gray-700 bg-gray-950 text-gray-400'}`}>
                        {i === 0 ? 'Exacto' : money(v)}
                      </button>
                    ))}
                  </div>
                  <div className={`flex flex-col gap-0.5 px-5 py-4 rounded-2xl border ${recibido === 0 ? 'border-dashed border-gray-700 bg-gray-950' : cambio >= 0 ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
                    <span className={`text-[11px] font-bold tracking-widest uppercase ${cambio >= 0 ? 'text-green-400/80' : 'text-red-400/90'}`}>{recibido === 0 ? 'Cambio a entregar' : cambio >= 0 ? 'Cambio a entregar' : 'Falta dinero'}</span>
                    <span className={`text-3xl font-extrabold ${recibido === 0 ? 'text-gray-600' : cambio >= 0 ? 'text-green-400' : 'text-red-400'}`}>{recibido === 0 ? '—' : money(Math.abs(cambio))}</span>
                  </div>
                </div>
              ) : (
                <div className={`flex items-center gap-3 px-4 py-4 rounded-2xl border ${METODOS[modalMetodo1].ring}`}>
                  <span className="text-xl">{METODOS[modalMetodo1].icon}</span>
                  <span className="text-sm text-gray-200">Se cobra <b className="text-white">{money(total)}</b> por {modalMetodo1}. No hay cambio.</span>
                </div>
              )}
            </div>
          )}

          {/* ===== PAGO DIVIDIDO ===== */}
          {modalDosMetodos && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">1 · Primer método — escribe cuánto</span>
                <div className="grid grid-cols-3 gap-2">
                  {['Efectivo','Transferencia','Terminal'].map((m) => (
                    <button key={m} type="button" onClick={() => { setModalMetodo1(m); if (modalMetodo2 === m) setModalMetodo2(['Efectivo','Transferencia','Terminal'].find(x => x !== m)); }}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${modalMetodo1 === m ? METODOS[m].ring + ' text-white' : 'border-gray-700 bg-gray-900 text-gray-400'}`}>
                      <span className="text-base">{METODOS[m].icon}</span>{m}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2.5 h-13 px-4 rounded-xl bg-gray-950 border-2 border-gray-600">
                  <span className="text-lg font-bold text-gray-300">$</span>
                  <input type="text" inputMode="numeric" value={modalMonto1}
                    onChange={(e) => setModalMonto1(e.target.value.replace(/[^0-9]/g,''))}
                    placeholder="0" className="flex-1 bg-transparent outline-none text-white text-xl font-bold" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">2 · Segundo método — se completa solo</span>
                <div className="grid grid-cols-3 gap-2">
                  {['Efectivo','Transferencia','Terminal'].filter(m => m !== modalMetodo1).map((m) => (
                    <button key={m} type="button" onClick={() => setModalMetodo2(m)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${modalMetodo2 === m ? METODOS[m].ring + ' text-white' : 'border-gray-700 bg-gray-900 text-gray-400'}`}>
                      <span className="text-base">{METODOS[m].icon}</span>{m}
                    </button>
                  ))}
                </div>
                <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border ${METODOS[modalMetodo2]?.ring || 'border-gray-700'}`}>
                  <span className="text-sm text-gray-200">Va en {modalMetodo2}:</span>
                  <span className={`text-xl font-bold ${METODOS[modalMetodo2]?.text || 'text-gray-300'}`}>{money(resto)}</span>
                </div>
              </div>

              {/* Efectivo dentro del dividido → cambio de esa parte */}
              {efectivoEnSplit !== null && (
                <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-green-500/5 border border-green-500/30">
                  <span className="text-[11px] font-bold tracking-wider text-green-300 uppercase">💵 Efectivo · su parte es {money(efectivoEnSplit)}</span>
                  <div className="flex items-center gap-2.5 h-13 px-4 rounded-xl bg-gray-950 border-2 border-green-500">
                    <span className="text-lg font-bold text-green-500">$</span>
                    <input type="text" inputMode="numeric" value={modalRecibidoSplit}
                      onChange={(e) => setModalRecibidoSplit(e.target.value.replace(/[^0-9]/g,''))}
                      placeholder="¿con cuánto paga?" className="flex-1 bg-transparent outline-none text-white text-xl font-bold" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {chipsDe(efectivoEnSplit).map((v, i) => (
                      <button key={v} type="button" onClick={() => setModalRecibidoSplit(String(v))}
                        className={`py-2 rounded-lg text-xs font-bold border transition-all ${Number(modalRecibidoSplit) === v ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-gray-700 bg-gray-950 text-gray-400'}`}>
                        {i === 0 ? 'Exacto' : money(v)}
                      </button>
                    ))}
                  </div>
                  <div className={`flex flex-col px-4 py-3 rounded-xl border ${recSplit === 0 ? 'border-dashed border-gray-700 bg-gray-950' : cambioSplit >= 0 ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'}`}>
                    <span className={`text-[10px] font-bold tracking-wider uppercase ${cambioSplit >= 0 ? 'text-green-400/80' : 'text-red-400/90'}`}>{cambioSplit >= 0 ? 'Cambio a entregar' : 'Falta en efectivo'}</span>
                    <span className={`text-2xl font-extrabold ${recSplit === 0 ? 'text-gray-600' : cambioSplit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{recSplit === 0 ? '—' : money(Math.abs(cambioSplit))}</span>
                  </div>
                </div>
              )}

              {/* Barra de cuadre */}
              <div className="flex flex-col gap-2">
                <div className="h-3 rounded-full bg-gray-950 border border-gray-800 overflow-hidden flex">
                  <div style={{ width: `${Math.max(0, Math.min(100, (monto1/total)*100))}%` }} className="bg-green-500 transition-all" />
                  <div className="flex-1 bg-[#c1553a] transition-all" />
                </div>
                <span className={`text-xs font-bold ${puedeConfirmar ? 'text-green-400' : 'text-gray-400'}`}>{puedeConfirmar ? `✓ Suma exacta ${money(total)}` : `Escribe un monto menor a ${money(total)}`}</span>
              </div>
            </div>
          )}

          {/* Resumen + confirmar */}
          <div className="flex flex-col gap-2.5 mt-5">
            <div className={`px-4 py-2.5 rounded-xl text-center text-[13px] font-semibold border ${puedeConfirmar ? 'bg-green-500/10 text-green-300 border-green-500/30' : 'bg-red-500/5 text-red-300 border-red-500/30'}`}>
              {puedeConfirmar
                ? (!modalDosMetodos
                    ? (modalMetodo1 === 'Efectivo' ? `Recibes ${money(recibido)} · devuelves ${money(cambio)} de cambio.` : `Cobras ${money(total)} por ${modalMetodo1}.`)
                    : `${money(monto1)} ${modalMetodo1} + ${money(resto)} ${modalMetodo2}${efectivoEnSplit !== null && cambioSplit > 0 ? ` · cambio ${money(cambioSplit)}` : ''}.`)
                : (motivo || 'Completa los datos para cobrar.')}
            </div>
            <button type="button" disabled={!puedeConfirmar || loading}
              onClick={async () => {
                await procesarCobroFinal({
                  metodo1: modalMetodo1,
                  monto1: modalDosMetodos ? monto1 : total,
                  metodo2: modalDosMetodos ? modalMetodo2 : null,
                  monto2: modalDosMetodos ? resto : 0
                })
                setMostrarModalCobro(false)
              }}
              className={`h-15 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2.5 transition-all ${puedeConfirmar && !loading ? 'bg-gradient-to-b from-green-500 to-green-600 text-white shadow-lg shadow-green-500/30' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
              {loading ? 'Procesando...' : `✅ ${puedeConfirmar ? `Confirmar cobro · ${money(total)}` : 'Confirmar cobro'}`}
            </button>
          </div>

        </div>
      </div>
    )
  }

  const MODOS = {
    modo1: { nombre: 'Encargos',  icono: '📦', desc: 'Entrega de compras que llegaron de USA',
             activo: 'bg-[#c1553a] text-white shadow-lg shadow-[#c1553a]/40',  banner: 'bg-[#c1553a]',  borde: 'border-[#c1553a] ring-4 ring-[#c1553a]/15',  texto: 'text-[#dd8a6c]' },
    modo2: { nombre: 'Tienda',    icono: '🏬', desc: 'Venta directa en el mostrador de la tienda',
             activo: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40', banner: 'bg-emerald-600', borde: 'border-emerald-600 ring-4 ring-emerald-600/15', texto: 'text-emerald-400' },
    modo3: { nombre: 'Domicilio', icono: '🚚', desc: 'Pedido para enviar a domicilio del cliente',
             activo: 'bg-amber-500 text-white shadow-lg shadow-amber-500/40',    banner: 'bg-amber-500',   borde: 'border-amber-500 ring-4 ring-amber-500/15',   texto: 'text-amber-400' },
  };

  const METODOS = {
    Efectivo:      { icon:'💵', ring:'border-green-500 bg-green-500/10 shadow-lg shadow-green-500/30',    text:'text-green-400' },
    Transferencia: { icon:'🏦', ring:'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/30', text:'text-indigo-400' },
    Terminal:      { icon:'💳', ring:'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/30', text:'text-purple-400' },
  };
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  const chipsDe = (base) => { const c = Math.ceil(base/500)*500; return [...new Set([base, c, c+500, c+1000])].slice(0,4); };

  const total   = totalGeneral;
  const recibido = Number(modalRecibido) || 0;
  const cambio   = recibido - total;

  const monto1  = Math.min(Number(modalMonto1) || 0, total);
  const resto   = total - monto1;
  const efectivoEnSplit = modalMetodo1 === 'Efectivo' ? monto1 : (modalMetodo2 === 'Efectivo' ? resto : null);
  const recSplit = Number(modalRecibidoSplit) || 0;
  const cambioSplit = recSplit - (efectivoEnSplit || 0);

  let puedeConfirmar, motivo = '';
  if (!modalDosMetodos) {
    if (modalMetodo1 === 'Efectivo') { puedeConfirmar = recibido >= total; if (!puedeConfirmar) motivo = 'El efectivo no alcanza (mínimo ' + money(total) + ').'; }
    else puedeConfirmar = true;
  } else {
    puedeConfirmar = monto1 > 0 && monto1 < total && modalMetodo1 !== modalMetodo2;
    if (monto1 <= 0) motivo = 'Escribe el monto del primer método.';
    else if (monto1 >= total) motivo = 'El primer monto debe ser menor al total.';
    else if (efectivoEnSplit !== null && recSplit < efectivoEnSplit) { puedeConfirmar = false; motivo = 'El efectivo no alcanza para su parte.'; }
  }

  return (
    <>
      {turnoEstado === 'cargando' && (
        <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Cargando...</div>
        </div>
      )}
      {turnoEstado === 'sin_turno' && (
        <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>💰</div>
            <div style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No hay turno activo</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 24 }}>Abre un turno en caja antes de cobrar.</div>
            <a href="/pos/caja" style={{ display: 'inline-block', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '11px 24px', color: '#f59e0b', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Abrir turno →</a>
          </div>
        </div>
      )}
      {turnoEstado === 'caja_ocupada' && (
        <div style={{ minHeight: '100vh', background: '#030712', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>🔒</div>
            <div style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Caja ocupada</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 }}>
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>{turnoOcupado?.nombre}</span> tiene un turno activo.<br />
              Espera a que cierre su turno para poder cobrar.
            </div>
            <button onClick={() => verificarTurno(colaborador?.id)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '11px 24px', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
              Verificar de nuevo
            </button>
          </div>
        </div>
      )}
      {turnoEstado === 'activo' && (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans">

      {/* SECCIÓN DE CABECERA UNIFICADA */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        
        {/* POS header */}
        <div className="flex items-center gap-3.5">
          <div style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#9b3f28,#c1553a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🛍️</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.3em', backgroundImage: 'linear-gradient(90deg,#ffffff,#dd8a6c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              PUNTO DE VENTA
            </div>
            <div style={{ width: 36, height: 3, borderRadius: 2, background: 'linear-gradient(90deg,#9b3f28,#c1553a)', margin: '6px 0' }} />
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.4)' }}>ADMIN · {getDiaSemana()} {getMesActual()}</div>
          </div>
        </div>
        <button onClick={() => window.location.href = '/pos/caja'}
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 14px', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          💰 Caja
        </button>
        {/* ========================================================= */}

        {/* CONTROLES DE PESTAÑAS */}
        <div className="grid grid-cols-2 gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 w-full sm:w-80 h-fit">
          {['modo1', 'modo2'].map((m) => (
            <button key={m} type="button" onClick={() => cambiarDeModoLimpiandoTodo(m)}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-lg transition-all ${modo === m ? MODOS[m].activo : 'text-gray-400 hover:text-white'}`}>
              {MODOS[m].icono} {MODOS[m].nombre}
            </button>
          ))}
        </div>
      </div>

      {mensaje.texto && <div className="max-w-4xl mx-auto p-4 rounded-xl mb-6 text-sm font-semibold text-center bg-green-900/40 text-green-400 border border-green-800">{mensaje.texto}</div>}

      {ticketListo && (
        <div className="max-w-4xl mx-auto p-4 bg-[#4a1b0c]/40 border border-[#6d2a19] rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-[#dd8a6c] font-medium">El cobro cerró de forma exitosa. ¿Quieres enviarle el comprobante digital al cliente?</span>
          <button onClick={enviarWhatsApp} className="bg-green-700 hover:bg-green-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all">
            💬 Enviar Ticket por WhatsApp
          </button>
        </div>
      )}

      <div className={(modo === 'modo1' || modo === 'modo2') ? 'max-w-6xl mx-auto grid grid-cols-1 gap-6' : 'max-w-4xl mx-auto grid grid-cols-1 gap-6'}>
        {/* BANNER: EN QUÉ SECCIÓN ESTOY */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-6 ${MODOS[modo].banner}`}>
          <span className="text-2xl">{MODOS[modo].icono}</span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-bold tracking-widest text-white/80 uppercase">Estás en</span>
            <span className="text-lg font-extrabold text-white">{MODOS[modo].nombre}</span>
          </div>
          <span className="ml-auto text-xs font-medium text-white/90 text-right max-w-[240px]">{MODOS[modo].desc}</span>
        </div>

        {modo === 'modo1' && (
          <EncargosEntrega
            clienteSeleccionado={clienteSeleccionado}
            onCambiarCliente={limpiarClienteEncargo}
            busquedaCliente={busquedaCliente}
            setBusquedaCliente={setBusquedaCliente}
            clientesFiltrados={clientesFiltrados}
            onSeleccionarCliente={seleccionarClienteEncargo}
            bloquesEntregas={bloquesEntregas}
            productosSeleccionados={productosSeleccionados}
            setProductosSeleccionados={setProductosSeleccionados}
            listaAnticipos={listaAnticipos}
            productos={todosProductos}
            cart={carritoEncargoTienda}
            setCart={setCarritoEncargoTienda}
            sumaEncargosTotalNeto={sumaEncargosTotalNeto}
            desgloseTicketEncargos={desgloseTicketEncargos}
            pedidosMercadito={pedidosMercaditoCliente}
            mercaditoSeleccionado={mercaditoSeleccionado}
            setMercaditoSeleccionado={setMercaditoSeleccionado}
            sumaMercaditoSeleccionado={sumaMercaditoSeleccionado}
            loading={loading}
            onCobrar={() => {
              if (!clienteSeleccionado) return;
              if (totalGeneral === 0) {
                procesarCobroFinal({ metodo1: null, monto1: 0, metodo2: null, monto2: 0 });
                return;
              }
              setModalRecibido('');
              setModalMonto1('');
              setModalDosMetodos(false);
              setMostrarModalCobro(true);
            }}
          />
        )}

        {modo === 'modo2' && (
          <TiendaTienda
            productos={todosProductos}
            cart={carritoVentaTienda}
            setCart={setCarritoVentaTienda}
            descuentoVenta={descuentoVentaTienda}
            setDescuentoVenta={setDescuentoVentaTienda}
            vendedorTienda={colaborador}
            setVendedorTienda={() => {}}
            vendedores={[]}
            colaborador={colaborador}
            todosClientes={todosClientes}
            clienteTienda={clienteTienda}
            setClienteTienda={setClienteTienda}
            loading={loading}
            onCobrar={() => {
              if (carritoVentaTienda.length === 0) return;
              if (totalesVentaTienda.total === 0) {
                procesarCobroFinal({ metodo1: null, monto1: 0, metodo2: null, monto2: 0 });
                return;
              }
              setModalRecibido('');
              setModalMonto1('');
              setModalDosMetodos(false);
              setMostrarModalCobro(true);
            }}
          />
        )}

      </div>
    </div>
      )}
    {renderModalCobroPOS()}
    </>
  );
}
// rebuild viernes, 29 de mayo de 2026, 23:49:57 MST
