'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);


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
  const [busquedaProducto, setBusquedaProducto] = useState('');

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [bloquesEntregas, setBloquesEntregas] = useState([]);
  
  const [listaAnticipos, setListaAnticipos] = useState([]);
  const [anticiposDisponibles, setAnticiposDisponibles] = useState(0);

  const [productosSeleccionados, setProductosSeleccionados] = useState({});
  const [carritoTienda, setCarritoTienda] = useState([]);

  const [mostrarModalCobro, setMostrarModalCobro] = useState(false);
  const [modalMetodo1, setModalMetodo1] = useState('Efectivo');
  const [modalMonto1, setModalMonto1] = useState('');
  const [modalRecibido, setModalRecibido] = useState('');
  const [modalDosMetodos, setModalDosMetodos] = useState(false);
  const [modalMetodo2, setModalMetodo2] = useState('Transferencia');

  const [turnoEstado, setTurnoEstado] = useState('cargando');
  const [turnoOcupado, setTurnoOcupado] = useState(null);
  const [colaborador, setColaborador] = useState(null);

  useEffect(() => {
    async function cargarDatosPOS() {
      const { data: cl } = await supabase.from('clientes').select('*');
      
      const { data: pr } = await supabase
        .from('productos_tienda')
        .select('*')
        .eq('activo', true)
        .gt('stock', 0);

      const { data: en } = await supabase.from('entregas').select('*');
      setTodosClientes(cl || []);
      setTodosProductos(pr || []);
      setTodasEntregas(en || []);
    }
    cargarDatosPOS();
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

  const cambiarDeModoLimpiandoTodo = (nuevoModo) => {
    setModo(nuevoModo);
    setClienteSeleccionado(null);
    setBloquesEntregas([]);
    setAnticiposDisponibles(0);
    setListaAnticipos([]);
    setProductosSeleccionados({});
    setCarritoTienda([]);
    setBusquedaCliente('');
    setBusquedaProducto('');
    setModalMonto1('');
    setModalDosMetodos(false);
    setModalMetodo1('Efectivo');
    setModalMetodo2('Transferencia');
    setModalRecibido('');
    setMensaje({ tipo: '', texto: '' });
    setTicketListo(null);
  };

  const seleccionarClienteEncargo = async (cliente) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setCarritoTienda([]);
    setModalMonto1('');
    setModalDosMetodos(false);
    setTicketListo(null);

    const { data: pedidosDb } = await supabase
      .from('pedidos')
      .select('*')
      .eq('cliente_id', cliente.id)
      .not('estado', 'in', '("Pagado","Entregado")');

    const { data: pagosDb } = await supabase
      .from('pagos')
      .select('id, monto, creado_en, entrega_id')
      .eq('cliente_id', cliente.id)
      .eq('tipo', 'Anticipo')
      .order('creado_en', { ascending: true });
    
    const pagos = pagosDb || [];
    setListaAnticipos(pagos);
    
    const totalAnticipos = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    setAnticiposDisponibles(totalAnticipos);

    const bloques = [];
    const historialPedidos = pedidosDb || [];
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
          atrasada
        });
      }
    });

    setBloquesEntregas(bloques);

    const seleccionInicial = {};
    historialPedidos.forEach(p => {
      seleccionInicial[p.id] = true;
    });
    setProductosSeleccionados(seleccionInicial);
  };

  const agregarProductoAlCarrito = (producto) => {
    setCarritoTienda(prev => {
      const existe = prev.find(item => item.producto.id === producto.id);
      if (existe) {
        return prev.map(item => item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { producto, cantidad: 1 }];
    });
    setBusquedaProducto('');
  };

  const ajustarCantidadCarrito = (productoId, delta) => {
    setCarritoTienda(prev => prev.map(item => {
      if (item.producto.id === productoId) {
        const nuevaCant = item.cantidad + delta;
        if (delta > 0 && nuevaCant > item.producto.stock) {
          return item; 
        }
        return nuevaCant > 0 ? { ...item, cantidad: nuevaCant } : null;
      }
      return item;
    }).filter(Boolean));
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

  const subtotalTienda = carritoTienda.reduce((acc, item) => acc + (Number(item.producto.precio_venta) * item.cantidad), 0);
  const totalGeneral = modo === 'modo1' ? (sumaEncargosTotalNeto + subtotalTienda) : subtotalTienda;

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
    }
    carritoTienda.forEach(item => {
      textoArticulos += `• ${item.producto.nombre} (x${item.cantidad})\n`;
    });

    const infoTicket = {
      telefono: clienteSeleccionado?.telefono || '',
      mensajeWhatsapp: `¡Hola! Tu entrega de *Denog USA Compras* ha sido registrada con éxito. ✅\n\n*Artículos entregados:*\n${textoArticulos}\n*Total cobrado:* $${totalGeneral.toLocaleString('es-MX')} MXN\n\n¡Muchas gracias por tu preferencia! 📦✨`
    };

    try {
      const clienteIdFinal = modo === 'modo1' ? clienteSeleccionado?.id : null;

      // Distribuir el pago entre entregas en orden cronológico (más vieja primero)
      // Si sobra dinero al final, queda como anticipo para la próxima entrega
      if (modo === 'modo1' && clienteSeleccionado) {
        // Total recibido en efectivo/transferencia en esta transacción
        let montoRecibido = (monto1 > 0 ? monto1 : 0) + (monto2 > 0 && m2 ? monto2 : 0);
        const metodoFinal = m1 || 'Transferencia';

        // Ordenar bloques por fecha de entrega, más viejo primero
        const bloquesOrdenados = [...bloquesEntregas].sort((a, b) =>
          new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega)
        );

        for (const bloque of bloquesOrdenados) {
          const entregaId = bloque.entrega.id;

          // Calcular neto de esta entrega: pedidos seleccionados - anticipos aplicados
          const totalPedidosBloque = bloque.pedidos
            .filter(p => productosSeleccionados[p.id])
            .reduce((s, p) => s + (Number(p.precio_venta) || 0), 0);

          if (totalPedidosBloque === 0) continue;

          // Consumir anticipos de esta entrega primero
          const anticiposDeEstaEntrega = listaAnticipos
            .filter(a => a.entrega_id === entregaId)
            .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

          let netoBloque = totalPedidosBloque;
          for (const anticipo of anticiposDeEstaEntrega) {
            if (netoBloque <= 0) break;
            const montoAnticipo = Number(anticipo.monto);
            if (montoAnticipo <= netoBloque) {
              await supabase.from('pagos').delete().eq('id', anticipo.id);
              netoBloque -= montoAnticipo;
            } else {
              await supabase.from('pagos').update({ monto: montoAnticipo - netoBloque }).eq('id', anticipo.id);
              netoBloque = 0;
            }
          }

          // Aplicar anticipos generales (sin entrega_id) si aún queda saldo
          if (netoBloque > 0) {
            const anticiposGenerales = listaAnticipos
              .filter(a => !a.entrega_id)
              .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
            for (const anticipo of anticiposGenerales) {
              if (netoBloque <= 0) break;
              const montoAnticipo = Number(anticipo.monto);
              if (montoAnticipo <= netoBloque) {
                await supabase.from('pagos').delete().eq('id', anticipo.id);
                netoBloque -= montoAnticipo;
              } else {
                await supabase.from('pagos').update({ monto: montoAnticipo - netoBloque }).eq('id', anticipo.id);
                netoBloque = 0;
              }
            }
          }

          // Aplicar el monto recibido en esta transacción a esta entrega
          if (netoBloque > 0 && montoRecibido > 0) {
            const montoAplicar = Math.min(montoRecibido, netoBloque);
            await supabase.from('pagos').insert({
              cliente_id: clienteIdFinal,
              entrega_id: entregaId,
              monto: montoAplicar,
              metodo: metodoFinal,
              tipo: 'Venta Liquidación'
            });
            montoRecibido -= montoAplicar;
          }
        }

        // Si sobró dinero después de cubrir todas las entregas → anticipo para la próxima
        if (montoRecibido > 0.5) {
          await supabase.from('pagos').insert({
            cliente_id: clienteIdFinal,
            entrega_id: null,
            monto: montoRecibido,
            metodo: metodoFinal,
            tipo: 'Anticipo'
          });
        }
      } else {
        // Modo tienda sin cliente: registrar pago simple
        if (monto1 > 0) {
          await supabase.from('pagos').insert({
            cliente_id: null,
            entrega_id: null,
            monto: monto1,
            metodo: m1,
            tipo: 'Venta Liquidación'
          });
        }
        if (monto2 > 0 && m2) {
          await supabase.from('pagos').insert({
            cliente_id: null,
            entrega_id: null,
            monto: monto2,
            metodo: m2,
            tipo: 'Venta Liquidación'
          });
        }
      }

      // 3) Marcar pedidos como Entregado
      if (modo === 'modo1' && clienteSeleccionado) {
        for (const b of bloquesEntregas) {
          for (const p of b.pedidos) {
            if (productosSeleccionados[p.id]) {
              await supabase.from('pedidos').update({ estado: 'Entregado' }).eq('id', p.id);
            }
          }
        }
      }

      // 4) Actualizar stock de productos tienda
      for (const item of carritoTienda) {
        const nuevoStock = Math.max(0, item.producto.stock - item.cantidad);
        await supabase.from('productos_tienda').update({ stock: nuevoStock }).eq('id', item.producto.id);
      }

      setMensaje({ tipo: 'exito', texto: totalGeneral === 0 ? '¡Pedido entregado! Cubierto con anticipos' : '¡Cobro registrado con éxito en caja!' });
      setTicketListo(infoTicket);

      const { data: pr } = await supabase.from('productos_tienda').select('*').eq('activo', true).gt('stock', 0);
      setTodosProductos(pr || []);

      setBloquesEntregas([]);
      setCarritoTienda([]);
      setModalMonto1('');
      setModalDosMetodos(false);
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

  const productosFiltrados = busquedaProducto ? todosProductos.filter(p => 
    p.nombre?.toLowerCase().includes(busquedaProducto.toLowerCase()) || p.codigo_barras?.includes(busquedaProducto)
  ) : [];

  const renderModalCobroPOS = () => {
    if (!mostrarModalCobro) return null
    const tipoLabel = modo === 'modo1' ? 'Encargo' : 'Tienda'
    const nombreCliente = modo === 'modo1' ? clienteSeleccionado?.nombre : 'Tienda'
    const fmtP = (n) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
    const montoM1 = parseFloat(modalMonto1) || (modalDosMetodos ? 0 : totalGeneral)
    const restoM2 = Math.max(0, totalGeneral - montoM1)
    const recibido = parseFloat(modalRecibido) || 0
    const cambio = modalMetodo1 === 'Efectivo' ? recibido - (modalDosMetodos ? montoM1 : totalGeneral) : 0
    const confirmarDeshabilitado = loading || (modalDosMetodos && (montoM1 <= 0 || montoM1 > totalGeneral))
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

          {/* Modo simple */}
          {!modalDosMetodos ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {['Efectivo', 'Transferencia', 'Terminal'].map(m => (
                  <button key={m} onClick={() => { setModalMetodo1(m); setModalRecibido('') }}
                    style={{ flex: 1, padding: '14px 8px', borderRadius: 14, border: `2px solid ${modalMetodo1 === m ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.08)'}`, background: modalMetodo1 === m ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)', color: modalMetodo1 === m ? '#4ade80' : 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: modalMetodo1 === m ? 700 : 400, cursor: 'pointer' }}>
                    {m}
                  </button>
                ))}
              </div>
              {modalMetodo1 === 'Efectivo' && (
                <input type="number" value={modalRecibido} onChange={e => setModalRecibido(e.target.value)}
                  placeholder="Con cuánto pagó"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px', color: 'white', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', marginBottom: 10 }} />
              )}
              {modalMetodo1 === 'Efectivo' && modalRecibido && cambio !== 0 && (
                <div style={{ background: cambio > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${cambio > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 16, marginBottom: 14, textAlign: 'center' }}>
                  {cambio > 0
                    ? <><div style={{ color: 'rgba(74,222,128,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Dar de cambio al cliente</div><div style={{ color: '#4ade80', fontSize: 40, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmtP(cambio)}</div></>
                    : <><div style={{ color: 'rgba(248,113,113,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta cobrar</div><div style={{ color: '#f87171', fontSize: 36, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmtP(Math.abs(cambio))}</div></>
                  }
                </div>
              )}
            </div>
          ) : (
            /* Modo dos métodos */
            <div style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Primer método</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {['Efectivo', 'Transferencia', 'Terminal'].map(m => (
                    <button key={m} onClick={() => { setModalMetodo1(m); setModalRecibido('') }}
                      style={{ flex: 1, padding: '10px 6px', borderRadius: 12, border: `2px solid ${modalMetodo1 === m ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.08)'}`, background: modalMetodo1 === m ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)', color: modalMetodo1 === m ? '#4ade80' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: modalMetodo1 === m ? 700 : 400, cursor: 'pointer' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <input type="number" value={modalMonto1} onChange={e => setModalMonto1(e.target.value)}
                  placeholder="Monto del primer método"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px', color: 'white', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                {modalMetodo1 === 'Efectivo' && (
                  <input type="number" value={modalRecibido} onChange={e => setModalRecibido(e.target.value)}
                    placeholder="Con cuánto pagó"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 16px', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginTop: 8, fontFamily: 'monospace' }} />
                )}
                {modalMetodo1 === 'Efectivo' && modalRecibido && cambio !== 0 && (
                  <div style={{ background: cambio > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${cambio > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 14, marginTop: 8, textAlign: 'center' }}>
                    {cambio > 0
                      ? <><div style={{ color: 'rgba(74,222,128,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Cambio parcial</div><div style={{ color: '#4ade80', fontSize: 36, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmtP(cambio)}</div></>
                      : <><div style={{ color: 'rgba(248,113,113,0.8)', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta</div><div style={{ color: '#f87171', fontSize: 32, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{fmtP(Math.abs(cambio))}</div></>
                    }
                  </div>
                )}
              </div>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Segundo método</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {['Transferencia', 'Terminal'].map(m => (
                    <button key={m} onClick={() => setModalMetodo2(m)}
                      style={{ flex: 1, padding: '10px 6px', borderRadius: 12, border: `2px solid ${modalMetodo2 === m ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`, background: modalMetodo2 === m ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', color: modalMetodo2 === m ? '#818cf8' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: modalMetodo2 === m ? 700 : 400, cursor: 'pointer' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '12px 16px', color: restoM2 > 0 ? '#818cf8' : 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                  {fmtP(restoM2)} en {modalMetodo2}
                </div>
              </div>
            </div>
          )}

          {/* Botón dividir */}
          <button onClick={() => { setModalDosMetodos(!modalDosMetodos); setModalMonto1(''); setModalRecibido('') }}
            style={{ width: '100%', background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>
            {modalDosMetodos ? '− Un solo método' : '+ Dividir en dos métodos'}
          </button>

          {/* Botón confirmar */}
          <button
            onClick={async () => {
              await procesarCobroFinal({
                metodo1: modalMetodo1,
                monto1: modalDosMetodos ? montoM1 : totalGeneral,
                metodo2: modalDosMetodos ? modalMetodo2 : null,
                monto2: modalDosMetodos ? restoM2 : 0
              })
              setMostrarModalCobro(false)
            }}
            disabled={confirmarDeshabilitado}
            style={{ width: '100%', background: confirmarDeshabilitado ? 'rgba(255,255,255,0.05)' : '#14532d', border: `1px solid ${confirmarDeshabilitado ? 'rgba(255,255,255,0.1)' : 'rgba(74,222,128,0.35)'}`, borderRadius: 14, padding: '14px', color: confirmarDeshabilitado ? 'rgba(255,255,255,0.3)' : '#4ade80', fontSize: 15, fontWeight: 800, cursor: confirmarDeshabilitado ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Procesando...' : '✅ Confirmar cobro'}
          </button>

        </div>
      </div>
    )
  }

  const totalApartadosFragil = bloquesEntregas.reduce((sum, b) =>
    sum + b.pedidos.filter(p => p.apartado_fragil && productosSeleccionados[p.id]).length, 0
  );

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
        
       {/* ========================================================= */}
        {/* BLOQUE DE LOGO MINIMALISTA */}
        <div className="flex items-center gap-3 bg-gray-900/40 p-3 rounded-2xl border border-gray-800/40 w-fit h-[70px]">
          
          {/* AQUÍ INSERTA TU CÓDIGO BASE64 O IMAGEN DEL LOGO */}
          <img 
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAEuGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTEyLTMwPC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPjUzYWM5ZmE2LWY2MDctNGJlNS1hYzEwLTMzNjY1NzI0MzQ1ZjwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5AZGVub2cubXggLSA3PC9yZGY6bGk+CiAgIDwvcmRmOkFsdD4KICA8L2RjOnRpdGxlPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpwZGY9J2h0dHA6Ly9ucy5hZG9iZS5jb20vcGRmLzEuMy8nPgogIDxwZGY6QXV0aG9yPkFuZHJlYSBQw6lyZXo8L3BkZjpBdXRob3I+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnhtcD0naHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyc+CiAgPHhtcDpDcmVhdG9yVG9vbD5DYW52YSAoUmVuZGVyZXIpIGRvYz1EQUdVZFFtd0trQSB1c2VyPVVBREZseEVfRF9rIGJyYW5kPURJU0XDkU9TIFRFQU0gdGVtcGxhdGU9PC94bXA6Q3JlYXRvclRvb2w+CiA8L3JkZjpEZXNjcmlwdGlvbj4KPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KPD94cGFja2V0IGVuZD0ncic/Pm7SCRIAAPR0SURBVHic7N13eFzllfjx77n3TlMvliVZcm9gQrHpGBsDsQ2Elg0CksAmJIQ0mxTSNmwWsSmbutkllZK2IbsJZpcOP0ggQKihhoQaU4wtV8m2ZLVp9/z+mKKxsbFGGlnS+HyehweNrLn3HV3NnPu+73nPKxhjjDFm3JPRboAxxhhjhs8CujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHGGFMELKAbY4wxRcACujHDtGLFCnlJDp0vsFCUMtB1ovz+7tVTNnH3KTra7TPG7B8soBszZMryT103W32uBRa/5R+VXzvCvxxT2/Zma2vrKLTPGLM/sYBuzBC0trbyaHvTXBVeBAVkN+8lVVTWu44uuuuqj7xubzdjzEhyRrsBxoxHz26sDyrcknokokDA8WkI9xNykmS+jzApqfLnZSt+tmsP3hhjCsq6DMbkafHKnwbDuDcCpwMCyhHV2zmqphNXlITv8NeuMp7YWkXUd0n34Nc5qu86ZsL652z43RgzEqyHbkweWlpuICTuEaDZYP7Oie0cXdOJI6AIrqMcWtXFyRPbkVQwB2jyhRsf3DC1IhXgjTGmsCygG5OHrQ3dlaLcmpkzrwgkmFXW+5YZdEGYXtqXE9QRkFleMP7Lfd5oY8x+wQK6MYOmuJr8JFAD4IrPOU0b8Zzd97hFYG55D7PLezJ9ckE5e9mK6y6wXroxptBsDt2YQVHOOfcGt6u+ay3QCMpBFTtYUrd1t/ntOz9TuWHtJLZEg4CoQgdQt7C2DZtPN8YUivXQjRmkrvquDwENkOpfH1y5Y6/BHAAVTqjrwFeBVMe9FvQ3I9hUY8x+yAK6MYNw0ievCQNfyjyeVtJHXSg+qOeKQH04xlE120kPtYuonPlQR+NBI9JYY8x+yQK6MYMQ8Jy5oM2k5sE5rnZbfrPgCvOruihx02vUhVIH5+rW1lab9jLGFIQFdGP2oqXlBtEkZ4IEAcoDcSoDibyOIQJBx2dJXQd+6k5AgGMf7Wg6teANNsbslyygG7MXWyd3liD6lczjw6tTBWTyJQLTy3qZWtpLZuhd4SOg1ks3xgybBXRj9sJLyPmouABBJ8khVYNMhtsdFY6o7sw8EuD0Uz7286m2jM0YM1wW0I15W62iqouR1BLPA8p7SPr5RnPFV9jUH+LN3jARx2d6aV/mH13f8/+w5MO/DhW02caY/Y432g0wZixrWVnjdsJy0mVe60LRvJ6vCh2xIHdunMj2WAAh1RcPuz7ZXdqEqcFIdCHofVYawhgzVNZDN+ZtdCXDU4GJAKrCzN2Ued0TVdgSC3Djuka64h6OpObRHYGY75ATvF2Eb2LR3BgzDBbQjdmDlpYbRF35ZuZxTTBGyPHzOsZ9m+pIaCp4B1yYUeMQeeu4mACHL1tx3QnDbbMxZv9lAd2YPdjesDWgyCLSw+3H1G7PVHsblHV9YdqjQSDVK//KiRE+vyjCt04p5bgpHt7O7z5R9CNWCtYYM1QW0I3ZA1GnWdAwpLrQE0PRvIbbX95RmlqYBiye5jGhJPVkz4UL5of40glhyoPZA4qInKFq2e7GmKGxgG7MnggzgDKAUjdJYA+7qu1JT8IjMy3eXOkg6bsBSf83qdzh0wtDJAdG8cse2dr8bayXbowZAgvoxuzGFVdcgfraDDigRLxkfvPnound1VLBe0rlW99qIkJjucPsWmfgW7DyxPWVZcNtvzFm/2MB3ZjduP32M0Qc572ku9g1wXhexWQE6Em6ACR8pXk3AR1SQf3DR4bJGWoPBkJlS4bccGPMfssCujG7UbHwmQBwYubxIZVdeT1/SzSUfXOVhwTX2fPdQFkQGisGeunAxS0tLbaEzRiTFwvoxuyGR7JGVQOZx02R/rye/5ftFdke/eFNAZJvM/0ecFLz6WkCnNEx8aQyy3g3xuTDAroxuyHqLBURH6A6ECfh5/FWUXi1pyT7cOFU9+3PJcL5h+yUHCeu430jzyYbY/ZzFtCN2R2VhaTfH5NL+vPaOsUHosmBt1Z9qbPXEnBlIWFWNjlOBfSoh9bMstLMxphBs4BuzG6oaAWgoFQF8kuI60+6eOn15wGXtx1uHzihcvxUL50cJ4hyuFPWF9jr84wxJs0CujG7OOWUuxyBaaQz3FMbqQxeV2JgiL0yLLxNPlyWiDCjxs1s6gYijsI18AdLjjPGDIoFdGN2scnxBeQdmce1wVhez+9LumRuASqCQujtp9CzGsqFwMAguziq55+yYnUkr5MbY/ZbFtCN2UVl87oq0hXiVIXqYHzQz1WFhC9ouuZ7wH37JWs7E1YeE8rO16vg+I53ah5NN8bsxyygG5OjtbWVQEgOJT3cHnD87Hz4YHUmAtk59/IQeSXUzaz1cnr0Iqr+IbYm3RgzGBbQjcnx1FMLROAS0nG4MRzFz3Ob8vV94ezXM2oGOd6eJmjuc0Rg5apVq2zHFmPMXllANybHlpmvOiDvIt1Dn1vRnVcP2xFlQ18ISN0RHFSfX0AHaKoYWOYmSOXyT11zuBWZMcbsjQV0Y3JUxQNBIJua1hTpz6t/rqSS4gBUlYay/Hr3IsIpcwLE/ezxRJPyZQvoxpi9sYBuTA6fSB3p3rmghPPZYY3UGnTJrEF3BDefBexpZUGhqWJgn3QVZi3+wE8t290Y87YsoBuTw3F1Gun3RdDxyS+cw+ZoEDcd0CeUSrannQ9V5ZTZwexjgQPDlW5F/kcyxuxPLKCPOuWIM2+R0y+5OvCxj/1EUoO2lgM1Wnzfb1BNDbmXuMk80+FSCXGZ58yodvE1/2spItSV7lSQxkPlnHPOOcey3Y0xe2S1okfRyZf8stINXns+IpfFcKa8hvPm0hXX/Q7H+Z8Q175x+1VLemH2aDdz/+JIeWaVWtjNb8maAtvigeztWHPl3mu478m0aid9M5Ae/Rf9Xtvk434MNw7xiMaYYmc99FGy9JO/nOiF4o8j8mNgFhACZolwuWjy6Zjy6LIV95/zqW/dlH+atBmS1tZWUZ+ZgIDiOZrfGyRdVCbzoCQ49A616wjzJuZcesUri1fMHfIBjTFFzwL6qFBEYudqqvvtKDmrlEBAQsDBCL99cV377UtXXrOYIQzdmvxEo8cjwqLM44iTJN8udkLTlxAh4KSGz4fqogUh/IHL7gh60pAPZowpehbQR8FnLv+6g8jFgAPKpHA/86s6qfASOJLNohLABZYL/HH5pdf927JP/azMli+NnEedxxzQIzKP863hnrtkDaAsuOefHYyykEN5KOeGQJhXVtZq71ljzG7Zh8M+p/xte30VkN38Y3Kkj4W123j/1HWc27yBueXd5CTHCYij8AV8/7GHOyYdR979RjMYga01JenREQAmRaJ5H6M7MZCWMqF0eG8vVWVOdo90BLjwsst0CHnzxpj9gQX0fe2Dv0Q8JpDzu5f0KK0rUBuMs7R+C+c0b2RqSR8ykPHuAPMEuWvZymsvXfbZn5eOQuuLmCKBUDXpmyVVoS6UXw8dIJpM3WslVakKD/++q6F8p7do2aNbmua2tNww7OMaY4qPBfR97YZz0bi/0+qChA588Es6qbkhHOX0xs28q3EzAfEZ6K1TgfJ9jSdvWPqJH5R+6orv78PGF6+WllWAfzCklp6LQCjPfdATKtm676JC0BteQBcRTpzh4acn0lURXPnuqlXnDuu4xpjiZAF9X1vwNI4b7Mz9Vszf/WUQgaklfVwwdR2HVO4Y6K0LInCquOGnX9patqC1tdWG4Idp9epZoBydeRx2knnnIXZEg9m149UlUpA8xoqQQ2k6W15SVQqaj3vfKltuaox5Cwvo+9pDi+hJ9HUA6QlaIeY7e/zwF4FSz2fRhK0srW+n3EuQ01ufrfDkI+2TLllyyfcC+6T9RarmlEdQdA7pIfeqYJx8y8q83lOSfcYBdS7JAsx2+6qcOid7aUXQqeU12ycN/8jGmGJjAX0UnDxxUxT05czjmL/3wCECs8t6eO+UNioDOwV1QfhxMFR5w/su++Ew86r3Xy/c+HNxRLL10ieEYnkX7Hu1pyT79YJJXsFSF6dX71SKoEoFq+tujHkLC+ij4MorWxXkMdIhI5YcXO0YEQiIcsHUdRxbuy09BK+AOKBnbomFH1i68uq5WBZ83g5e/hHUJ0Smh+7F8z7G1liqJ60Ks2qHXiUul4gwoVQIZ+fjBZTLbJrFGLMrC+ijRJGnSQePuEpuAZG3JZLqkh9e3cmZkzYRGdgNzBH1jxGc3y9fcc3i879ys13bPNQ5votQnXkc9vIbL/cVkulcCJHUjmmFUhURnIEStAJcdD8nFOz4xpjiYB/6o0IQ/NVAHFJD7n7e/TmhOdLPB6atpSaYHh5Opcg3q8hdHds2nXXFFVdYL26QunrKXZD61CPFRbPboA5GNOkQSN9cBRxIFrKwnwrHT/WyfyEKEt7y0pwCnsEYUwQsoI8Wddozk7RR30kNnqeDQH/SoS/psLdJXBHwHHh300YOqNhBzrx6WMS58dGtzV8fuRdQXLpLekXRiZnHASe7Mcrgnp/wsr3o8pCQKGREFzjjwCCJ9DCOgPiOd3rhTmCMKQYW0EeLaBeaigAx38FX2Bb3uGldPVe/NoVrXpvC9W82saYnTHIvSXMR1+ekiR0cVNGNMxDUHeBLS1dc89uTPv6jyhF/PeNcwEuUCIQzj0vcZF7P35FTIa4yLAVPYvAcoTqSfrsKgtLY0tJiIzDGmCwL6KPEd51ekVQRk6Q6dMSC/N+6Rtr6I7jpqnHbY0Fu31DPvZtr2Vtv3RFYMrGdRXVbc5fAiYi0eF7wvpM++uOKEX1B45zGI2XZr4FSb/ABXRWi/kBNv9Kg4Bb4naWqHFSfTZ4URc+8/PLLC3sSY8y4ZgF9lPi9Tq/mROnbN9TT76c+sB0hGxAU4eUdZdyxoX6vy9sE4eDKLk5p2Iw3sMmLA8z3goG7z/jUL+ttc5fdUcTx68mMsasQybOHntSBt5I3Qu+q6pxSsiIy89M33WQ9dGNMlgX0UeKUBfqAnszjeDpDOuDAFxdH+MbSEmbWpJY+icDr3SU83lE1iGx4YXZ5D2dO2kTISZIzr3501I899+jWSbMtqO/s85//joAcSfaXpbh5JMQB9Ccz26ZCZJglX3dHRDhs0k7LGyW4dfKZ3/ve9wp+LmPM+GQBfZQc5mzwgdfYZSx9WrVDc4VQHoJPHxfhyOb0h7jAXzoreGZ7BbrXiidCYzjKmU2bMl3O9BGkTlUefLS9+dBCv57xTERR1ew6sJCb/5qDbfGBmj51ZTKsfdD3ZGqVS2ynZDv9ymc/+9mCn8cYMz5ZQB8lZWU9oPwt93uqcOKMQGqtuQiuo3xwQYj5jZmemfD0tko6Y3uv8ioCE4Mxzp+8Pr1WPdtTr1fRW5atuGaB9dRTHn/8aCSnjnt1MJ73MsLN0VRAF2Ba1eAKBeUrqXBkczb5ThSqF3/gJ1Yd0BgDWEAfNa2tVyj4fyVnbVTQhUMb3WzvLvP/9x8WoiQdw6O+yw3rJhHLScLaExGoCcZ5z+QNhHYO6lMQefyxjklHWFCH8EFPO6BTSV+LxnA0r6qvjijb0zdZviqTq0bmbSXA0lmBbNKjQE1plTdtRE5mjBl3LKCPIhVeImfIfWKZg+fs3DMUEUqDwhcWRwinO2cxX/jL9opB1RoXgUovwdlNmzJnhVRscH3kjkc6mo+54oorCvFyxi3VZCC3ikxTpD+/5zOQA6FQkH3Q9yQSkNykuwpfxZYkGmMAC+ij54ILcXx3de63GssdknvIeqsrFRZPD6Tnz4UntlaxoT80qC06RWBCMMZ5k9cTHigVK0Ad6KrHtzYd0tJyw36bMe0Fa9zcm6MJoVheA+79STd7PxBwRvbXWB0WykM7neOYhQsf2m+vnTFmgAX00XL99UTr3LWky78CVEf2PIzuiPDueQGmVqbmZ33ggS21gx4aTgX1OKc2bibnLAI0+SpPdzdsP3B/HX6PJd1SzZn6KPMSeT1/WyyQfSNVR6Qg26buSSQAOfcMguqXH374+EIWmjXGjFMW0EfREtbEgG2Zx+HA2xcbVYX3HhrE11QvvSMW4IEttYPe5lMkNZy8rGHLTsVnEJykyi2PtDdP3h+DukusNlPkR1DyTVDf2B/Kln2dWuWQHMywyRApwsLcuu4iE1tab7D3sTHGAvpoWrNmigAdmcd9e9mCW0SYVuXw7nnB9Ae68LfOct7sCw9q6D19FGaX9bCorgNXcobfhZmI3vHQxql1Q3gp45oidaQGPfBE8fPsYW+JBrPXbXKVO6J712YS43LqurNj2/YTR/CUxphxwgL6KPrFLy7yQdszj7f2DSKSiLB8doAZNZmtOpV7N09ILWIaNOHQqi4OKO+BnYff3yGBxFMnfvTXZXt+bvFRpJr04EjA8fNestadU8e9rqSgTdutoCdEAtk2iu87p478WY0xY50F9NElgmzPPNjap7iDSKoSES44LETAARC64x73bKwb9J7qqWcJiydsZW55T+6wgAg0B4L9/w3/t98kWomjVaTfC2E3mcdoR4qvA7+qgDsyRWV2Op+vHNaYu9ZdS0H3m+tljNk9C+ijTGE76ZDa2a8MNkm6vkx47yHpYiYCr3aXsrY3wqAn1AHXUY6fsJWqYDz32wKcvmxFx3WnXfqT0KAPNp75ZOcswq4/6GuQcVBlFxVegsmVDpMq9s1bamJp9jyicExLyyoL6Mbs5yygjypRlPWZRz0xHXQvW0Q4ekqA+rLU57iPcNv6ejrjgbx6mBHX531T2wgP1H2HVAf+org6H2xtbS32QCEiEsxkwgUdzXsO/MCKHr5wbJIvLg5TExn5X5eIUFfmZNspcPCqVeeOYG69MWY8sIA+2oTXSUfSWBK6o4P/XBbgS4sj1JakP9pFeXBLTW6NlMEdR+Hkie3ozqO2As4PH25vOpe3T74f71Txg6Rfo5vHCIeIUFdXx5w5c6itqcV1Rna4XUlto6qqHFzvEB+4+3PeueJHk6B1xM5tjBn7LKCPNuV10sHEV9jSk09AgXBAOOOAgaz3N3pKeHJrVV69dBGYXtbLcRO2stOEOrgi/GTpymvnDf5o440CTknma1f23kMXEcrKypgxYwZ1dXV4nreXZwyN7ys7oj7rOpO8sDnJU20JHl6T4P7X4/x5bXKn2RUh2Lr0k5PqTvjAKi8aVfKZejHGFIdi7nmNC8tWXHMgIs8Dogr/OD/IcVP3vvlKLlXl5hfi3LM6DiieKO+b0kZ5IJnXBU4q3LB2Eh2xADl/Ggq0uY5/5F3/+dGNeTVsHLj88q/JE131/wmsBOWgim5OnNix259VVYLBINOnT88G8UL3yFWVhA8Pr0lwx8tx+hOpkjfJ5EAPfQ/nTKLai0g78O+i8puP/uDD2/+BISysN8aMS9ZDH2Xi6wYyBdYFNuzIfypURFg2K0B1OLUnd0IdblnfQH8yv8vrAOc0b6A28JYkuaZk0rlm8ceuDufduDHuldI5AtRnHkfc5G5/zvM8mpqamDVrFp7nIVK44XXVVI/6b5sSXP1ElMvu7OW3z8XojqWCeyKnM+44kt6Nj13jtItIOTANuEpFN/z00uvuWXbpdZed/MkfW713Y/YDIzNWaAbt2IkbOh/paGoHJgK092qqJFyewaIkCJ89PszX/thHNAmdMY/HOqpYUrd10IcSAQ/lhIkd3LK+geTAnLognB4OyNdAP1dMAzv+G3EI6qTML6l8l7KvrutSVVVFQ0PDyJxflY07fP7nuRivbElmt87NXLOA51JRGqKqPEJZJERJOEAo6KGqROMJ+vrjdPVE6ezup6u3n0TCz1ycEHAycJLreFcsvfTaT5OUm0uWTth6y9lnj8hrMcaMruL5ZB6nWltb5ZGOpj8CJwDMqHb43KLwkHt//++VOLe8GANSZUyX1m9hdllvXvcHqvB6Twl3bpi4619ITHw949i69feM6xKxqnLGmbfRO+XNWscJnSvwbaAUlLMmbWJyST+qSmVlJY2NjbiuOyLJboJy0wtx/vhanFjOwICvSkNNGRedcRSHzGogHPIIeR6elykmJOmXkeq3xxM+0ViC/licZ/++nv+642k2bd2xa5t9lHYRPn9sbduvW1tbbZLdmCJjAX3UKctWXvdT4KMADWXCl5dECLhDuzQJX7n2z1Ge25SKECHH57zJ6ykPJPKbT/fh/vZaXugs3/VmYJv6/tG//9FH/z6kBo6GJ1U+/7vv8GxPxURxnRNQWazCEQJHpX8i/QqVC6e20VQdpq6ujpKSkSn7pqp0ReHnT0V5eUsiG3hd1+HEBTN451FzOGxOIyB5T39ngvzqdR088twb3P7Qi3T1RHf6EeAWdfRz9/zHR14d6SI4xph9x97No23uS7Js2Z8+C3wXUrt1/fOJYUoCQ09v6Oz3+fr9/exIZzvXhWK8p2kjnpNnp0zhxrYGNvaH2CVJ7uFYn7fs/usu6htyI0fQRRddxPrEiY6Wx0ocT5uTyhGCfgLkGNJp7bs+xxGoL4XPHJmgrLwCKHzCG6QC7sZunyvv7dvp+E0TK/nsexdx4PR6HBn+uTW9gQ8oP7vtCe5+9OXcwJ7Kr3PkjN/f8eE7+Tt5T/EYY8Yed+8/YkZUzd0yc9bCSUALIJ4jLJ4WIOQN/QM25Aozax0eWZMAEXoTHj5Cc6Q/v6F3YHJJP3/ZXpl76yfAZNfzA6/++bZ7h9zIglNpaXlBJrZ8LtibaF5GJHEVDl9R+IzAuSDNpNoupPeUV4XaEuXU2R7vPSzESTMDRMKRgia87dRCVTb3KN98sD83P4GWkw/hSx84kUkTKtJJb8M/d2YeXkSYP6eJk4+czaZtO1izYTsiqaspqv8wY9Yzs5qe3XTHm/f9xgrTGDPO2W35GLD80msXqvJHIBDyhCtPjlAZHu6lUW5+Icbdf08lebni867GzUwp6SOfy64KbX0hbt9QT0J36th2i7Ds2Jq2R0dnPl1paTlXOusXl4qED/XhJIH5wKmkEsIycjL7lOoIzJvoMqXS5cA6h7oyL12db4/LwQrTWlU27PD51oP92flyz3W47P2LOemIWSN23tzzg/CnZ1/nRzc+wrauvszNnQ/8dzyW+MQfr/74jhFviDFmxFhAHwOWr7z2YFUeRSh1Ba48OUJNyfB7aklfufK+vmyxGk983j+1jTI3mWdPXXloSw1/6axglz+ZnqQv0+/90cVbhtXQQbbigi//B+s2xYPB0tpq348f4Ij3QdS/QEQcHWjYTgE86AmVIZhX57B8ToDaEo+4nyoes6/mj1VhR1T53F092c13wgGPqz53FlMaqvZZO1JtUTq7+/n8VXfw5qbsvkAK3NK7vey8h359fsw+FowZn+ydOwYsW3FtM/A3hEqALywOM63KKcg86vZ+5Rv399MdS82nN4b7+YfmjUiel14V7tk0gVd2lOXeDCjwi7uvuvhiybfe7CCle//Ow+0N7xBxPwIcDzQBE9I/stMLUYWSgLKg0WHh1CAVEYeqsOCmIvhINHEQlH97oJ83t6dGtT3X4YefP5tpjdX7NJjn6u2P86MbH+EPf87kNqqqykPxRGj5/T/9xzGZG2GMeXsW0MeAkz/2i2ovkHhFYYICH5wf5OjJXsE+7P+8NsGvnolmN35ZUN3JcbVbyffydydcblzbSHfSzX2uL8j5B8+bsuq7H1827LZedNFFsr5yiZeIx6a5DiegLFDhLKBR9pDQFvGUmTUO06pdDpjgMHOCl65LP7LD6IOR9JXfPBvjkTfj2bZcftFJLDps+qi3zVflqt89zN2Pvoyv6XkH+K/OUOTix797QWIvTzfGjDFWWGYMSEbbexyvKiGSCpNru3yOKeCH/ZHNLm07Atz9SgwR4Zmtlcwr30FlIJFXp7XMS3LulPX81xvNJFK17SC1Zdy31q7bfAdob743CV9p/VfuqVrgVry4JeyEEw1tSVo0GfuC61AFaHrlVs5wuuIKhFyYViWcfkCAORODRBM7D6On/jf696svtfs8ujaRTVK75OxjxkQwB3BE+NR5C9nW1ctjf3sTUr+wC6uifTuWtLauvH881xowZj80+p8qhu/eeiv33LPpAYRFgMypdblsUXjQW6kORl9c+daDfWzqTg29B0Q5b8p6qgL5dcRU4aUdZfxh04Rdht715u7w9vc88p0vDKLVKitW/JCXCU9yRP9BkbNUmSrCDLKZ6AOHVgXPgZk1wuLpQerLHOpKhFBglx8dY/riyuW/76UvXUl3VnMt3//smQS9sbW4xPeV7//Pg9zz+Cuk7pm0V1w5/djqtj+O6wJCxuxnrIc+Brxw8xYo5QlgEcDmnsKvIIoEhM8uDPPV+/vpjkJc4cEttZzWuIl8VsiJwIEVO9gcDfLXznIyvXSQs8r6q04Hbnvrs/6F0y+c5ESrnAkicgR67eGvED5T4HBFlFRnMUtRgg40lDtMq3KZXetwaKNHyHPSQ8P5F1zZ11SV3z4XzQbz6ooI3770XQTc1IxBZoBbVemNxumPxuntjxFL+DgilEYClIaDlISDOM7IvljHET767mP4+9oOXl+/FUQimuSeh7c1HwS8MqInN8YUzBj/WNxPqLL00mvPFeR3kCpyctXpJdmM6MKdRnlmQ4JrnoilL7wyr2IHJ07syCtJTjW11um616cQ93N6ycpaHKYdV9Pm//z/WmT+iQ86PX2BEgnpUtCvC87c1LN3nQdPBWkHmFCinDLbY9GMMImkZjclGQtD1PlI+sonbunFSb/SFS3HccaieagqSV9p397D3Y+9wm1/eoHN27oJeC6uIzhOan18MukTSySZPLGKC05bwAnzZxAOuiO2Rh6guzfKRV+9ga6eKJq6KA+WHVx+8k0fOS+/ZRHGmFFh79Kx4D3KsobrDsbhL4D4Ct9cHqE6MjKb4d30fCy91WpqffppDVuYUtKX32e2Qp/v8Lu1k+hOZAd6VISr1ecOhPOBWcAhQGaXtmzkJ30LMaFEWTjVY3q1R32ZUBlx0nvTjN8/TVXlK3/oo6M3dTvSOKGca/7pHPqicX5x+xP87dWNrNm4fedhibc9HgQ8hzlT6jht4QEsWTATzy18YFdVnnqpjX/60Z04qTsRBWl1ddK/3vXD0wp6LmNM4Y3fT80ic+qKn5Ymxd0GBHyFLy4OM6NmZOZa+xPKd//UR1unZqqD8r6pbVQH4nl2xJRXu0v5/aY6EgOVz5RMxE7JWRcO1RGYXOkwrVo4ZrJHTYlHMp0sMJ6DeK6XtyT4z0ej6UDs8rN/PocnX1jHD1c9kskmHwblgGkTufIjy6gqjxSkvbl8VX5y46Pc+qcXMqdb7/ruvLt+/KHOgp/MGFNQth/6GHFk3aY+lE2QGnLf1j9ym2GFPeFLJ0SojKQDqCh3bagj/6XkwoyyHk5p2IxkB8cRUn9XAiqqEPaUk6YJ/35amK8uLeWSo8Isnx2iKpKq0jaSw8j7mqpyz+pEamJBlakNVaz87i384IaHCxDMAYQt23upLBuZrekFuPiso0gkkplvNCTc5APwL8VxgYwpYmMr3XY/Fgr+E0zoPA9oEmBWrVuQ4jJ7IsCkcoc/r0sCQp/vUOYmmRiO5XkcoTKYoDYY5/WeCIpQGlCObnZZPjvIu+Z6nPOOEPPqAwRcJ2e/7+KMD+u6fG78W3qkQ4Tu3hi9/fGCHb8kHOAHl51FWSQ4Mlu6iuC6DgvmNnH3Y68gIiJK/axjKh989fHb3ij4CY0xBWNZ7mPEPXcv06Urr1sv6eopqZ3SRo6IcFC9y7nvCPK/z8cIOEp9OJ4Nto7j7PR1ek41+/3M/13XxXVdJk3yOHKOizpBplR7xJPFNYw+GKrK7S/Fyc1ljCWSe35C/mdg4aHTaKgtL+Ax30qAeTPqmT+3iWdfWZ9eycbHpn76+w+s+Y/P2CYuxoxRFtDHijqE92oHqWVcsr1Pd5qIHhnCCdM9Fk71UIGgU5bdTxtSASo3IO/p610l/MEH8sz5HAFfhVhS6U8o/YlUMljQTS25C3mCK5pdmz8WbxR84PVtIxfvaipK+cz5i0bs+LkcET7+nmO55Bs3IiIC2jInXv6va1pbn8fWphszJllAHyvaRYVr12UedvT6g86CHg7HEYI5mRT7IlBm7hnWdSV5Yl2S9h6fzT3Klm6fvsTubmOUoCtUlwgNZQ61EeGAiS4H1rmEPMZMVvwb23w6+5WRWjb+yXOOHfE16RkiwtSGKpYcPpMHnn4NEMTRHxz78vylj0Ihhx2MMQViAX1M0TcyPfStfakSp8mRHXnfp1SVnhis7khy4/MxNvcoXnqKIWP3a++FpEJ7j9Lek4olD7yRSjw7YbrHcVM8JlU4eM7oBXZV5UeP9Y9YMJ/VXMvxh00fmYPvgYjwroUH8OAzr6Oqougx4YqN9cD6fdoQY8ygWEAfU5zViooAO6Kj3ZbCUlXufS3BnS/H6IkpjqR2QNOcf4fUTmThUIBQ0MURIRZP0heNE0/4+Ko7jVqIwINvJHhoTYKKkPC+w0IcPNHJFoDfl7b1K72xkdkMpiwS5GsfW/6WKZB94eCZjXiOEE8qgoS8oHyupaXlslWrVhXRraYxxcEC+hji+9LmOKnaptFkauvT8tDoDyUPh6ry6lafW1+M8feO1PxyJiiHAh4LDmziHTPqmVJfxcymWqorSrLBOBO8VJXu3iivb9jGG+u3sWbjNh55bg1bu3oB8BW29ys/fqyfuRNcls32mDfRRXXfBHZVeLUjOWLB9qzFB1FVHhmV0QcR+NbKd/GZ79+KiDgCn+6YcNoVsGrHPm+MMeZtWUAfQ/zE9o1OsCIJOKrw5vYkB9WP30uU8JUn1yX45dMxcrcyrSwLc8KCGXz4zKMIeqkM+rfrfYoI5aVhDpnVyCGzGlFVVrQs5C+r1/Or25/k1XUdROOpofiX25O8uCXBsVM8zj04SElgX5RaUDZ2j0yHtaG2nAtPWzBqUwkiwrzpE6mrLqN9ew+Ael7iHOAXo9IgY8we2Tr0MeQDZxyXXNtXcR4wEYEJEWFu3fgL6JouBP7zp6L8v78PLIVDlfOXzedzFyxm8WHTCXhuznangw9Yma1IG2rLWXr0bE48Yhb90TivrmsntXGL0NalPL42wZQql5rIyK57FxF+9XSU/gLvIC4Cl557PFMbq3fKM9jXwV1EWL22ndfatmbO3XbhaYffdf/99+/Tdhhj3p4F9DFkyZIlsra34liEQwQIesLRk8dfQE8qXP3nfv6yMVW0BmByfSVXXrKMpUfNpiRcuKIojghlkSDHHTKNo+ZNob2zhw3tXQBEE/BkW4JIQJhS6YzYqoFEUvndX2MjspnOA8+8zh0Pv8jTL7fxwmubeeH1zbRt6SIaS6RviMB1UoX5RirOqyol4SD3PrkaUhf0gNUbJ3x7zV9utnl0Y8aQ8Rctilgr6DL0WZALILV0bddEsLEullS+/WA/bV2p+XJV5ah5k/nqx5YDI9O7zBxzzpQJXHnJcm66/6/8+s6n6Y8lSPjwu+eidEWVd80N4I1AGvqrW30C7ghVbRPo7O7nmZfX80w6uTwz2pEpWjOloYpj3jGVQ2c3UlddSlVZhFDQIxz0cFwHd5i/cxFhwQFN5JToLw+Uxw9palr3TFtb87CObYwpnPETKfYHhz0jyxc/cYaq3AxIRUi44qQwJcHxUXJfVfnZUzGeaouT+dM656SDueDUBYSD3j4bKlbg9fVb+dIP76Szuz/btiObA3z4iCCF/rP/zbNRHl6TYLS7q5mVAuGQR2VphHDQw/McpjXW8MV/XDKsY/uq/OzWJ7jx3ucg9Su+b+K28Duvv/7C4TbbGFMg4yNS7C+ena8i7logDhBLQnSclPBQVe54Oc6T6waC+WnHHcAHTz+CSCiwT+d9BZjeWM2vrzyf+XMnpb4nwhPr4lz7RIxoorChd1O3P+rBHAZq5EdjSTZv6+bNTdt5rW0r9z65Ol0cZhjHBo48cKfeeH1nTW9wWAc1xhSUBfQxJh5nC2gXoElfiSfZqRzrWLWpO1XHPBO4Tzx8Jpeet5CANzppGiJC0HP5xsdP5ch5zdnvPdUW59YXY/h+YX6nvioJf6D63Zikyo33PUfSH3pZWhGhuiLV6ye9t08S6gvVRGPM8FlAH2Niya4tINshVRO9OzaWI0VKR6/Ptx7syyZlTaqr4BPnHDu6jWIgG/6fP/ROFh02Lfu9e1+Nc/fqREFulHwfkr7u80I2+UhlqXfQlZ5+GKqmugo8L/uRUZ3wncphN84YUzAW0MeYrsbOqMJqSE1UZpLLxipVuO2lGH3xVHCsKo9w1WVnUV4SGhP11UWEUMDlyx88mSPnTc5+77aXYry4Jclwx8qTSsGXq40EX5VV9/51WCMJruNQFgllH6sytdU2ajFmzLAs9zHm3cAjykMIyyFV93zRtMAot2r3VJVnNyZ5bG0iG7wvPGU+5SWhnX8u9cOp9emqKANbqzr7YG/01PGVf7n4nZz7T7+mL5qqA3/1n6NcvsShrnTobUiqEhsneQ7/defTfOTsoxhOUuCJh8/kf+55FgDH5UPPz5t3J3u5LWptbeXxjhpefSriHHSQ64XKu2mXUNCJJTXpB2LNJZWs3vhq4qUHb9ZTF83m+uuvH3L7jNmfjX4XyuxCWbbi2pMQ+QMgdaXC15aWUKAp34LyVfnqfX3ZKmknHTGTL1y4JPvv0XiSl97YzJ+efZ22LZ0kEj7ReIJYPIkIhIIeIc+jtqqUExbM4LA5kwgF3BEL8KpKe2cvK79zM9t29AEwo8bhC4vDqA7tnL1xn9Z7+0d8//pCEBH+9aPLOCo9UjEUmzp2cGHrbzPXqLdyY2XZqlXn7vnFq7Ls0mvnA5eBNAGTgUYgnF4E10tqs5c1qL4G/Kj82NLn//f97x/bQ1PGjEHWQx+DFP4qqe213Y5eJZrQEVnnPFyPvJlk/Y7UNq+OCOe+81CSSeX5Nzby0LNvcPufXkjPL++57ZmSr/c+sRpQzjn5EBYfNp05UybgOIWdERIRJlSW8IlzjuWbv/ojSV95bavP7S/GOW3uEDPxx34cz1JVXm3rGFZAr68tx/cVN/X3WNJTt8UF3jLpcNonfhKIO4ETufS6y0GOZ6DzkP0lp78oA+YAs9OJCJfseKz3wWWXXvNNPxa/7w8//WRsyI01Zj9jc+hjjvCTL57djrIBIJGELT1jr7PSHVN+9Ux/tujN+06ZT3V5hE9+5ya+9MM7ueWBF/AHsU/5QOnX1Nf/e99f+fT3b+Xj37yJrp5owTP8RYRFh02n5eRDsse+e3Wc4FBvmATG4L3WHq3b2Ik/jGx3ANcd+NhQN7mbZQwqcde9WsS/U2Axqc8Z4e1HBCX7n7IYlVudQPC2Ja1/tE6HMYNkAX0Muv5nPwZ4BUAcaOvSMbUsSoEn1iWywzt11WWICBd//Ube2LAN32dYWd+q8MbGbXzoqzdw0wPPF6LJOxERzl7yDsKhVG5CPAlfv79vSDcPrgiBcVRA+ZG/voHI8N72JaGBnA5fQ9W5/7Z85bWRZSuuvV+Qi0CG9psRBAgAy4Idq19avvJnR4ypN4AxY5QF9DGodeEViMhrgDrA5m5/TC2LSvrK7/8ez0btrp5+rr/rKXb0FnYTd1+Vdx45q6DHzKgqC/MfnzkzW3/9jW0+L21J5h3UXYGwN4Yuzl5s6+ob1vNVldKSdD0ZxXccqc3826kXf8NT+G9EFg3rJLnnQ2co/gNLV/78kOknfbhQhzWmKFlAH4uWooquUVK94fZexR9DPZQn1iXZ1j/QnmgsMSIdqPcvf2vGfKGICFMbqpk9uS6deQ//+3w877r5jgOeM8YLy+QIeC7dvUNfj66qRNI9dBV8XzSzFl2Skbr3AWdSwGTb9JYzERH/dzMWvCNSqOMaU4z+PwAAAP//7J13nBXV2fi/z8zcsr0Cu/QOIiCKomLDhiUaTYEkxiQaRVNETTPF5M2SvHmTqL/YUBM1PTGJJCYxiQWJYkXFgiIiAtJZYJft5baZ5/fH3Ht3gaVvucue7+eDyZ29M/fM3HPPc55uBHpGIoCukmTIla+hZ4YW6HrKc+vjXf45JfnZnHfS2C69b8sSvnJZmzK5pd7jtS0HV3DGEiHsdF2ns87GtoXVm3Ye1Dmqmv7nKWmrhoClrsyaef0DP50594H7gLlJo1JnI6DjrGju78/73M/MmmUw7AUTcJKheKorraQ0q25RHAvcHo6NU6AlrlR2cbGbgGNz240XkZPVtaXCRWDogEIuPn0C/35+JQg8ty7OsQPtg1IxJ/S3/SI1vQJh47baZPe0PfFUicddmlqjNDZHqW1spaE5yrqtO3nz/UpWb6wm7ropS4Ygcr16KpJ63WWZsCICl2p+/nTghS76EIOhV2MEeoaidmwjnp+q2xhVWmJKqId9tQK8VekScbuygIFy7NiBlJfkdYtVQgTOmzaWf7+wEhTW7PTwFA6my+r0oQ5/WR7tktasXUFzazypcfv3X9cYYd3WGp5+bQ1vr6mkNZpAgNZYnKjfTGCX76KdW0IA6T7rkVrAxysqKl6sqKjoJU4Og6H7MAI9QzmtaGfjS9UD30bkGE+R96pcjinv2a/L9ZRH3o11aTWigtwsvnrZaXRXzSMRYdTgEkaUF7Fuay0ecPdLEb56atYBp5hnB4XCsNDUKzKmlTff30JVfROV1Y28v7GK+qYIjm1hWbJHLIC0+28KSyDkCEVhoX+uUJottCaUFzd0tZVCBJizqGrQt4DDK0xvMByBGIGeoVRUVOi5c3/xuCBTROD1LQmmlDs9WsdkR7NHc1SxukoTVeXaS0+iMC+rW33Stm3xv184n8u+9xAiwqpql52tHsVZB+auVVVOHR7gife7PrbgcFGF5Wu38faayrTWneqIlxLmAgRsyA4IYQeyAsLAfIvxpRbj+tkUZ1kokHB9nzoClY1eNwh0AM3KUcYPG7Z+2YYNw7vh8wyG3oMR6BnLm1gsfU7hW4B8UOvh6b6rrnUlqsrqaq/rhDlQmJ/FqccO75F7LMzLYuzQfqzeVI0Aa6o9Thh84DXeB+f3rlgt2e3/l+ZYHFNmManMoSjLTwQPO771wUq6x5Oym3gqhEIk7Zooz7PwVA86S+AQRq7YXDht2qvLNmzo4o8yGHoZRqBnLMei3L8KpRUhuynqV2fLC/WQn1a6tvNbOBjgzq9eQrCH+qfbljB2WD/WbKpGRViyMcG0wQc2FhHhqP42CRd6aPgHhC2+4B5RZFGSLRRnC6OKbcpy/Y1LwtOUU7zD8/c184K2ELSFRDcEbiqUH330uyxY0PWfZTD0JoxAz2DcmFNvBdwageyEKo1RyOuatOz9YgGrq7tutZ4+eRj9CnO67Pr7Q0T49HlTePTZFdi2xcpqN62RHghZDkwZaPPO9syIdrctv+BNlgOjS2zOHhVgRLFF3FU8j10sLYpvbt+Xdu2psnyby85W5ZShzh4BmjFXmVLu8NqWbuklW71i3YTu+ByDoVdhBHoGk0g4zcGAWwsM9jx6tKNXJAFbG7umYp2q8tbqrXzxlr9TkBPmqBH9mDZhKIP6F5CbHcRp16SlK83xhXlZjBpcwvrKWgR4YnWc88ccWNMWEeGqqSG+8lhLl41vX6hCliNMGWQzfYhNdtAiPwT5IUGT5vK4CyAcSs+bVzYl+O0bMUTA8+DsUc4uz0WAsaUWr23ppBvaO4KnT7zTOLHLP8hg6G0YgZ7BBLLqYyLhVcBEBfmg1mVsqdUjPubKJg9Fk2W2OxcRYWd9CzvrfWG4fO02/vzU2yQSLuGgw/DyYsYN60dJQTYFuWHKSvIYOqCQ/NwwwYCT9vEe7mOxxOKC6eO5968v+cFxVS7njznwXvRBB8aUWKze2fV2Z0ugLNdiZLHFgFyLYwfa9MuxcL22XvPQ1gzucL+17EDb87U72BCICFPKbP647PDq+B8A0URAlq98xGjoBsPuGIGewSyaP1fPnfvAYwIfA1i+3eVDY4P0RH2ZVVUutki3RNmr+r7cgGPjen7Lz7Vb2qqbWSK4nkck5lKQE2LqUYM5a+ooxg3vT/+inMPY8CjDygqxbQvPU6pblEgCsg5QpgtwxgiH1Ts7P39NBAIWFIaFi8YHOWmInfZXp2q6HEh3u0NlUpnNN08Ls6nB44wRAbwOJkJuSDhxiM2rm7vM7aAKD5xWsLn16a76BIOhF2MEekbzH5Ati1FRQDbXecQ9TZfe7E7W1WZOC9dUtH9WyCGWcHl5+QaWLN/AiIFFzP/6R3AOsQCPiDB6cAmalFa1LXpQ2qaIcNxAh+GFCdbXHf7zUpSyHIuzRwUYWGAxIEfID1u4Hrja+Zqwn7bWcSaFJcKwYpthRXaHwhz8+//EpBBvbG3pquA4T9RbMG/ePFNUxmDogN6Va9Pn+BD67oj1wGaAqAsbOkFQHCyeQk2L9mgO/L5IjWt9ZR1VtU2Hda3srCChoL/P9fAj+w+m8YqIcOmEQLtRHeTnB4Qp5TYfHh/gZxdk84Nzszl1uMPIIovckJXUwg/p0vvFU3j6gzjPrYt3aKL3I+D3fY1QAEYUdUmov6rqP2s1/mJXXNxgOBIwAj3DWbToHBRZAr7f9P2d3R9F7akSczNVnLehqlT8ctEh9TVPYYlw4fTxaYG2aE3ioAXo+H4OWQdpJRiYZ/G9s7K440PZXHNCiPPHBsgOWmkzelfHTSjw6uY4f3snzkNvx9jRfGAbR1WlNa60xDxUFQs4f0ynG/4U9P2iwODLlt5zXeaYigyGDMOY3DMfFXQF/porW+u1mwp4tBuAslcza6axfutOdta3UHqIKXAiwgXTx/PXp5djWcLKHQksCR3Q/WvSFRBzlXNGB3h0ZWyvgtix4JRhDpMGOAwtFPJCgqokTek9UGtAoSTbwsP/vrMDBzaG17e43L80CsBnjg1y2vAAEwbYDC+yWN95bppWRK7YUfBqtLMuaDAciRiBnvEI8MBbJAV6ZZN3UI1DOgNNNWbvFQgr1m3n9CkjDlkwlhbloMks9NaEX8N+f9dKeMqGWo8VO1yeWO2XgN39nOyAMKrYYkq5zWkjAiTcXSPSe7IFqwiMKrb4+NFBckOQfQCBgKpKfUTTUe81rW0x9ReODXDvy5HOuCkFblh415yXD/dCBsORjhHovQAXd7mN75fc0eThWN1Tkau3smFrLUwZccjnZ4UC5GWHaInEsQTqIkpRVseCSVV5r8rXUuPeri1uNVmZJmTD1ceHmDjA/w4F/32Z0uM+hW0J54w+8DQ9EeHs0QFWVLl4nvLh8W3tbo8p9/PUO2cfqIcXGGEw9BGMD70X4EZyNitUgR8Yt6rKPahArcNG6K7mZ53C4jc/OKzzPc+jX1Fu+nV1894f9t/fjXPnkiiRxK7CPCsgfPToIN84LczdF+cwcYDd5gvPMEF+uFx/cpgbT9m1oY7rwY9mZuEc5gqjqgnBXnN4VzEY+gZGoPcCZgxamxD094AK8NTaeLfKBIteJc+prGo4LJ+/AIV5Yf+FQmNs7xdbV+Omn03AgjElNldNDXLXRdmcO9qPTu/K/PBMRcTPmT9tmHNQQYoBG8aX7loZ0FXv3a4Yo8FwpGEEei+gouL7iqvpVhQrdyTSFcG6A0ukw+pgmYrnKesraw75fBEhK5g0PQtE91Ge/EsnhZjQ3+LCsQFuvSCbG6eHmDrIIeF1T3R6JiMifHxSiPK8A5g8qgQd+PYZWYwoTr9fBdZXvnNMa1eO02A4UuhFy3RfRrAd3leoBoi5wo6m7hPoYkF+qPdMFRVYtmrrwZ2jmv6XcHcNUPD2sXnKCljMPTmLi48KEnIEy+p5Id7+XlL/egoBbpgeJje492dSnCVcfmyI287PpixPWLi6ra+8C5+bNeOEXhOSaTD0JCYorpcQizstluNtAEoFpLrFoyyve4SHACOKLFZVZ0Ynsf0hwIZtdft8j6riuh71zVFq6luoaWxhzaadPL/sA1ZvrEYswU52MekN0kTVj7Svblaa4kpdi9IYU6yk6Ts/LGQHoDjbImB1nwtABArCwh0fyua2FyOs3J5If3ZOQDhzpMNF44OkEilW7UjganJsSoNdMnFpRUXftXIYDAeDEei9hO3rxsQHjnl/JehUBVZVu+mo6e7gmHKbx96Pd3vK3KHS2BLZ5bWvqUI84bJmczV/fuotVm2oQoDG1hiJhJsWNE4mNzXvANdTHl0Z55VNcVoSEEsA0hb3kNqQhG0IOcKIYosrjgsRSt5mVwv3VG7+seU2q3b4bWldT/nm6VmU5rSLhFdlbVvuuiIsOllOSjzZpaMzGI4cjEDvJYzPvUsb9LyHES4HWFbpMnuidFujlkH5No7VewrMxBN+5bKm1hivvbuJ9zZUsXbzTt5eUwn4/cDbW6LbhFqyxK22dRfL1E2M6ynPrY+zcHWC+khbad7d5XPqZdSFqKu8Veky99Fmjh/scMowh6P7210u1C1LeGF9Ij3GE4c49Mvd1Y1jifDftb65Xf1v4FGjnRsMB44R6L2Ev/71r5z9pQsW27YXBcLVzcq2Zo/+Od3j2w7aypgSi1XVvSMBfkdtE1++5R+8t2EHwUBbpHW6rWhSsgQdi/wsh3DIZkhxNmdMKGXaqGK+/dByVlX66c8BO/OESiSh/OXtGEs27lqaNtcRCgIWxUGL/kEbV2Fb1KUx7tGQUJoSHgo4trCs0mVZpcuJgx0+enSQvFDXaOuqynPrEmyqb5s7544OpCvrpd7z+Oo4rUn3uUBTwkv8pdMHYzAcwRiB3ovY+szJzUPOeXEhcLEIsnRzggvHBrrFH+qpn5LVWwT6hspawG/BumtQmJIVdDh3cn/OnTyAcMAiPytAXthp5ytXttW3mexzgmQYyr0vR3i/us1NYAt8a3wh43MD9Av6iYaSdkX7ArM65lET9/j52gZWNsTTqvsrmxMs357gk5NDnDDY2UXQHvZIVdnW6PHw8raWspceFWRIgbXLZ0QT8MqmXdIJvnF6v2ujT/OFThmHwdAXMAK9F7Fy5VE65OwXnkHkYoC1NV6yQGnXIyKMLrVhVXz/b84wBhSEOGFUEQOLs5g+toQBhWG8dpHs6dKryddxhLrmePp4SXbmRPgnXOXXb0RZvdNLj296SYjvjS9MdkPbczakjvcP2fQLWtw+uZh3GuL8bWsLL1W3IiK0xOHXb0R5v9pl9qQggU4KI7AEHl8dJ5Esn1uUJcwY6ewyTlXYWO+xPZm5oWiTwFPG3G4wHBxGoPcqBEseeNVLNWpp8PwcrW5a90YW2Z2qvXUVQcciL8vhhFFFfP6s4eSFHLx29dh1P7XZ65pieOprvapKaXbm3O+aGpfXtiT85jyqfGxQLteMzDvg7yX1non5ASYVFLKhJYevv11LfdwFhBc2JNjS4HHD9DChQ+wrn0JVeXWLy2ub2ywJHxoXILjbZkEE7nopbRFRgVeOy9m5fuFhfbrB0PcwAr2XEXWddwK2b5psiCjVLR79cq1ukekBGz42McjfVnTcL7snUVVGl+Vy5YzhlOQHGVyUhSW+ANODqNSmwKJl27CTkXBBWwg6gpsBnoZYQpm/JJrutDcuP8gVw/0StQe7yUq9f2iWwz3HlvDr9Y08XeUL1Q9qXH78bCtzTwpTchgxGiLCIytiaVfGtME2pwx19ojae2F9mwYPtFoRLv3J3d9S+PYhf7bB0BcxAr2XMbRZGrflyx8VvVxB/rkyxpwTwt32+ScPdXhsVYJIoufD3R1bmDK8gNFleVx8XDlFuQHU850Qh2NE+Ofrlen/P76fnRHCXFV5/P04qbb0pUGLO6eUHHbaQcoUf9O4QrKcBp7c1kICYVujx32vRplzQogBuQcv1D1VHlgapT6iydcwc0ywgzr2yqK1afeGgv7qiQfmNPeuYsMGQ2aQOc5BwwHx2998TgXr1pTa8+bWBLFuFK7ZjsWgfOmx6mO2CLlhhytmDOOfN51Cxccm8JlTh1CUEwBNlVs99OtHYi71LW3BWeePDWRMYZnl2/3CPqrK+eXZSCfWiBfg+lH5fHpoHnbSsrG53uXnr0YPaX69vtmPoE9x/clhBubtOlZV5U9vx9K+c8BTtW8GyZRHbjD0KoxA722IMGhA7koVXQ/gIayv87pNwFoWfGRCsNvz0XPDNtecM5xbPzuZh66fxqwTByGqnV5qde32JpxkmpolUJ7XPe6MA2FjnW8qSChcUp7dJZ9x2ZAcrh+Vnw6kq2xw+clzrUTiB1ZCVlVpinr8ZXk0fWxkscWEDnLd6yLKq7tGtt/41PyrGjrnTgyGvocxufdCXlw41B06uf4dhOECsnany5iS7tubjSqxmFTm8O6Ori0FmxuymTKikNPGl3LaUaVJc3rXVTZTYMPO1nTjm345h6ftdybPrUvgWP4YR+YEyDvcvqT74PyybFo85Vfrm4h7sLXB449vRbnq+NB+z/VUuPOlCM3JZIicAFxzQhh2z8dQ5R/vxom0yfMtliMm79xgOAyMht4L+cSZTyjCI6minks2JXC6sZyZKpw72ukyzdWxha98aAwPf+1kvnXJOE4dV9LOnN5196kKj72xLf2iNNsinAFVYAV4bkNblbXPDMvtcovMRwfmMHNAVlpTf32ry/1LY/s8R1V59L0Ymxvagg4+e2yIgrDslqamLNmUYOlmX5qr73L/1In5V1V1yc0YDH0EI9B7IfPmfR+ER1GJAuxoUtbXdl/jFBFhbInNuH6dN31sS7h4ahk/+tTRPPK1kzlnYj/wFKsbW5BWNUZYs82vDocIM8cEOgji6gEEalt9IakKw3LsbnEDzB2Vz0cGZafr4L+zLcHanW6HmwlVv6TsE++3Cf0zRjhMLNtzR+RYwuPvx0llnQv845TSLS/Mm5cBz9pg6MUYgd4rEUbF47UICwAVgWfWJbo1UM2yhC+cGCY7cOjXEGB4v2w+Om0gC756EteePZIpQwtweqAFqary5xc3p9PVCkLChP4ZoJ7jPycvqfQqYEn3/GwF+OzQXEbk+F9y3IP/e7aVna3K7lOtslF54LW2lLqhBRafnBxKv07hecqDr0Woak5fIG4J/1tRUWEC4QyGw8QI9F7Kffd9UT2Vv5O0u6/d6RHr5u6mQQtOH3Fopvf+BSF+ce1U7vjcMVx15nDCjtWjvcRd4N3NbfFYF44PEHczQ8YoEEj+UkUg3o15dFm2xfzjSsh12vLy//RWjPZNZZuiHncviaQDJROe8vXTwh1uMDfWeSzdnJyoCiAfXfr385Z17V0YDH0DI9B7LYLAa0AcYGeLR2NUuzXFSkS4aFyQo/rvXi+9Y2xLmHXSYG67fBK//uJUBheFCTpWjwnxFKrK8o0NbKxu9V8DY0u6vgPZgaIKgwv8n6oAL1RH931CJ+Mo3DSuMP0dv7Pd5dH3/Ki35pjH/Jcj1CXzzR2Bb52RhbNbz3VVpSXu8fOlkdQcVWCFrcFndm4amhk7J4Ohl2MEei9m4d1XbQJ9CVBX4dGVcaSb88MtgVkTgwT30ZFsYFGYi6eW88g3pnPFGUM5alCevx3JECIJj28/tDztLh9TYlGen1k/jfPGtPk2Ht7c1K2+fRFhWmGQSwblAP53/uy6ONsaPX7/Zoz1yR7mtsClEwKMKt5zMyQi/O7NGHWt6flZD9aMx+d/trnbbsRgOMLJrFXLcFAMHAgqzvWp10u3JGiKda9AFxEG5ArfPGNPE2tu2OHuz09h/uen8MVzRxKQro9UP1gUeHZlddrXa4ly4ynhPXzEPc3EAU66Yl1C4b3GWLcX97lqeG7a9N4ah58+18qyyoT/nQIzRjqcPXrP1nSqymtbEry9LVXTXVWVn0wv/Xy1qQhnMHQeRqD3YiorhVOKN65QeDt17J3tHUchdyUiwsA8i3PHtI+QU86a1J+hJVmEujBn+nBQVZqjCX7/7Ib0scllDplTSqaNuKdMKW8L0nt8W2u3fr6IELIsfjSxOP10Iok2s/pZowLMmthxn9nKRuVXr0VTmyQF/ukU2P/PdFMzGDqXzAjjNRwyixcvltEnfvho4ARAEh5MG+J0u0lbRJjQ32FDnZeMYBZWbW3AsS3GDczr1jz5A0WBiodXsr66BQDHhhunZxG0u654zeEQSfgbNoBVjXHOKs+moBs3SwIELWFVY5zt0bYIzKP723zuuI7qtEM0odz2fITWVMq5stVNxM5bePu1Ld01boOhr5CZqpPhYFAP+UUq0ujdKpeGSM/Yi1WVOceH6J+bWtiFPzy/gXueXJvMZc4cO7aq8vaGOt7eVJ9+/clJQfKCmSnMRYRThzsUhP2xOZbwnbdrqIt3X8T7tqjL9ct2sqyuLSjv9OEBvnRSqMNn5qnyh2VRdrakxyionF+zakJd94zYYOhbGA39COCDV/+5Y9SJr58EMgqQhihMKe/+KG0RwRKYMSLABzUu1S2+pr52exPvbW3iuFFFhDMkqv2tTQ3c9Iflad/5gFyL2ZNC6TrumcqUcoeXNiRwFZoSHptaEkwrDhHsQguIp8rzNVH+Z0UtNTEv3QDn7FEBPjE5sNfv86k1Cf67NpH6uwd6c8HpBX//760XddlYDYa+jNHQjwhEVORuwAN4r8qlOd4z2nBqcb/+5CxGl1iA3+f6jXV1XDF/KVtqIz0yrhSqytaGGN/78woc25/+2QH48cxswoHMFuYiQr8ci9NHBJBkgOHLNVEqVtZRG3c7PZBPVWl1lT9vbuYH79bSlOy6FrDgrJEpn3nHz2xZZYJ/vBtLWeEVWGkT+emC2bMzx0xjMBxhGA39CGHk1I/UiKVzgOyoC6NKbAbkWD1SuVREUOCEIQFiLnxQ40c3ewqLlm+nqiHG1JFFe1QR62pUlfU1rdz467eIJ7z0sRumZ5Efzqzo+30xob9Nc0zZUOuBCNsiCZ6rijCuIEBpMJmvfpj34qmyvCHON9+pYcnOtgpwrqfMPTnMGSM6LhGoqjRElbuXRGjnDVhml9gnPX7LF+KHNSiDwbBPjEA/Qlj76j9a//D4G7nA6YCs2elx5kin24VmChE/L3lCf4uSbIvl210USLjK6m1NrNhUT2FOkPLCcJcLUlUFEf7z5ja++6cVaU3WErj6+DBH93d6jTBPMXGATVNM2VTvoQgtrvKfyhZq4h7Dcxxy7EPboHgoKxvi/GVzM/d80EhLu2p5I4osvndWNuV59l43iq4HP342Qn3Kza5ai1izT87+/MbFi+cdwp0aDIYDpXetYoZ9ctzVDzilWVQDBapw9fEhpg7q+YpnfpUw+Omzrexo9tLj8VQZXZbL9z9+FMU5wXQd9c7EU6W6McZNf1zOjvq2YC7HUr50YhZHZUi99kPl2XVx/rYiRny3sr8zSsNcOTKPIlsI7qekrqdKi6tUxZV5K2rY2prY5f0BCy4cF0gXt+noWqrgKdz0RAst8XR+mmuJXPrkXVf/uxNu1WAw7Acj0I8ozpSZcy/7JXAFIEf3t7nu5HAPj6mNSFx5dl2cR96N7WI5CNoWo8tzuOyUIUwZUZSudneoG5GURl7dEOXOJ9awYlMD0Xb234AF3zw9zMD8ng/QO1xUlZpW5cGlUdbX7R7xrozICZBtC8cVhji5OES/kI1tQSShrGmO82J1hA9aXOrjLpWt7h6bqvH9bD52dCBZenbvz0pV+fXrUZZuSe8s1FPvI/1z3Ucf+smXjN/cYOgGevdqZtiDmdc9eALoy/gB53z3zDDleZkjuBSoa/VY8E6MN7fu2U0mJ2TzoePKGVySxVED8ygrCmMnffJ7QwAXpa4xxsotjWxviLF4xQ5WVzZh7SagThziMHtSkCwnM9PTDhVV5cWNCV7emGDNTm8Pk3iyPhuu+t+BCDjtItZ2ea/AMWU2pw13OHqAg+fpPp+V6yn/fi/GE6sTycGgCHcUnFbw9QWzZ3dfXp3B0Mc5clY0AwDf/eEP5dUdZX8BPg7IoHyLm2d0vZ/6YFFV6iPKD56JEE1oulPXbm+iNeZSlBdi6vBCJg3Np7wwTDhoEYkrW2taWb6pnjfX17OzMUo4aGNb0kG0txKwhK+fFmZwvrWHkD9SUFVEIJqAHy1upa5VOdA0dUv8f+P72XzxxBDgt//Z37TxPOXdKpe7l0RSVhcF/rvw7jnnHs69GAyGg+fIXNn6Mqqcd8MDx6nKc0COY8HNM7IYkJuZUdwisL7WZcV2l0dXxvY6xtTRPbTJDo6l8FSZUu5w9qgAo0tshH1rmkcSAtS0emxvUmpaPN7e5rK+zqMp2ZHPtqA0Wxjfz2ZcqU1OUBhaaBG0U2fvH1Xllc0Jfv1aNLlJUlWVSmwmP3XnnJ1dd3cGg6Ej+sbq1seY8a2HQsHm5qeAU0n60r+8l2pemYKqErSFFzbEWb7NZVuTsrXBxdP9a4npawDFWcKwQouhBX5teb8yaubed1eTqs6n+NXlLAHED2JzPX/TIxy8+0HV18zveinqXxNVkJU2rcc8fvf1iU6+DYPBcAD03ZXuCEY8j7Ov/+04SxLvApancN1JISYO6PmI9/3hCyBBVQk5Qk2r8swHcV7fkqCqWYm5mtbKRYSCEIwttTlndIBx/WxiiTZ9PdPvtTdT2ejxw6db2/c2dxOam/v0/E91b7N2g8GQxunpARg6H7UsdNGi9/nnuoeBT1oC/12bYFJZ5n/dKSEsIsQ9yAsJF48PcslRwZQmmDaxC36wnJcM9Iq7Roh3B8sqEzywNNpemFepWsefXroq+nSPjsxg6NuY0q9HKP895xwFvUvVLwe7qtplVVVi7w7nDEYkqQIquCp4yX9uMvcZjKmpe1A+qHF58LVo6rkr6GZsa2rh6XmbKioqenZ4BkMfxwj0I5jB2Q2vAD8nKcbvfzVGSyKzup4Zeg8b6jxufzGCm6yai6oInFcwPW/zgtmze3h0BoOhd5fJMuyTN19cqCNP+OgysbzLgZyEh+SFhBFFmZOXbugdvLElwT0vR2lXCbZaVGdES8Yuf+w60z3NYMgEjIZ+hLPoniu2qsfvU77nR1bEqG3VTu/MZTgyUVXW1/pmdrctYH6besyM9qt8bfG8M81MMhgyBCPQ+wB5gdjNCm8C6in8ZXmsXWiZwdAxfmqax0+fi7QPgEPEOTfeb8uyxcZnbjBkFEagH/EIj9z+pRgq6VZX72x3ebtyz7KrBkMKz1Ne2JDgzpfa+tcruhHRsdHi4SuMMDcYMg8j0PsEwlMvXv0o8B+SWvr9S6PUtnomQM6wB3FXeX2ryx/ejGK3lXvfEPecKbHirWsWVxgzu8GQiRiB3ld4AwKWdwWwAb+sF39+O9Zj/dINmYeqb2b/6zsxfvlaxC/n6vtmEg7u8f125NYZzdxgyFzMat6XUOXcuQ9+TuBXCJYCn5gUZMYIx0S9G/AU7n05woodbvtD78Rdnbb43jlRs1wYDJmN0dD7EiIsvPvq34nFfeAvz/9cGac51sPjMvQoqkokrlz3aNMuwhx486mSLVMW33uNEeYGQy/ACPQ+hogotv0DIAFoNKHMe7qVxqjxp/dV6iPK/yxqxa+Sn4xkV+5X1RlUVJhJYTD0EoxA74M8efvnd6DuJKAGoCnqsWB5nCO0TbhhLwjw8sa4v6GLKUlZrihfyd9e8OWn5l/T1LMjNBgMB4OpFNdHWfvqv6pHTXsjiDADEdna6FEXVSb3ggYuhsNHVfn3qjh/XREnkSrlisQV79zC7YUPL1gw2+vhIRoMhoPEaOh9mNq6fj8GuTdlU12yMcGSjfEeHZOh64kklPteifKv92LtKwZWIsw4paRysRHmBkPvxBhZ+zgf+sovChMJ6zGFk/BbqfPlk0JMKnfM5DjCUFU21Xv85vUoWxu9VGaDovJfbL608M6rV/f0GA0Gw6FjNPQ+zn9uv7bu5JItp6KsArAsuPeVCFVNJkjuSEFV8RQ2Nyg/fDpCZZOmhLkLLOtXGz7fCHODofdjlDADAGd/+f6jbEteBAoBCTvw9dPCDMwzndl6P8pdL0V5ryqRjGRXBUHgxifvnnNXT4/OYDB0DkZDNwDw3/lzVqpYZwPNgEYS8MOnW3m/2jWd2XotysodLt//bysrq9x0Wpoi28SyxkdLttzd0yM0GAydh1G9DGnyNu1k2k//XWoTr0Q8G0RUleunh5nQ3/H1OjNjMp6Uq+S/axM8siK2S189hUWKnndsuM679dabemaABoOhSzDLs2FXKirk3J2Dp6P6lAhhQGyBc0cHuHRCEE/VmOAznJ0tHve9EmVzvdv+u2oFvhoOxn756P/7skllMBiOQMzKbNgTVWbOfWA0IouAYanD0wY7XHZMkJBjpk0m0hxTnl0X59GVsfaC3ENZbqle/sQ917zTk+MzGAxdi/GhG/ZEhIXzf7lGPe9olLdSh1/dnODmp1qoM21XMwZVRRVaYn751nbCPNk7jR8C0yL9thphbjAc4RhVy7BPZn7p3gHYgf8BvkByAxh24CMTgpw2PGB86j2KUteq/OntGG9sTeBY7bRyeBl0Xqx4y6LF8+aZQjEGQx/ALMeG/TLpjLvt8snhW4HPA/mAqMLEARafOy5EblCMX70bUVWaY/DuDpffvhnFazOWKFAnwrPR4i0fW1xRYQS5wdCHMKuw4QDwJca5cx+YAvJGctII+Nr6p6eEmDrQNkK9G1BVXt2U4M/LY7TGdwlQVGAFnpy98J6rd/TgEA0GQw9hVmDDQaCcN+c3+RpO3Al8LnlQAE4e6nDh2AAl2UZb72xUwbFgyaYEz6+Ps2ZnSvFWQDzgfdB7du4su+/1hz7s7uNSBoPhCMasvIaDZtasWVZ92XmzUL0DYQDJeeR5ypVTw0wdZBOwxMyuTiDhKVvqldtfbCW6i6hWQBpRHoqVbvniYtO33GDo85gl13BoqHLedfcNVCvwAHBB8qgIUJQtfGZKiHGlVvKgmWYHj7KuxuPXb0Spat6lNIyCKPA7QeadXLJ5fUVFRQ+N0WAwZBJmpTUcOsnUtfOuf/AjCj8DHZaqJeep31v93NEBxpXaGPVx/6gqtsAz6xK8vCnB+to9YtoU9I8ectuiu69+y/x8DQZDe8yKYOgUWlpa5NJv/fEOVT4rUEBybgkwttTiquND5AYtwFSaa4+qYolQH1WWbU3w69ejhAOw+09TQQXmFWwr+KHpV24wGDrCrKyGzkOV86+/f4SH/Ajkk7SbX4IyMN/m8ilBhhZaCMYUbwFra13++GaM6laPSGLPH6RAe+tGRFTOipZuXrLYmNkNBsNu9O0V1dAlzJo1y6ofcN5pCF8E/RhgkwqcUxhZZHHKMIcTBjsEbLD6iGBPRauvq3V5v9pj0do4da1Ke6uFAI4NJw12OHdMgP45Fj9+tpUNdb5SrugGlClPzb+mrufuxGAwZCJ9YyU19AgTJkyQAafeUBAIWc8DY4Ag7eac58E5owN8aFyAoA22deRp7aqKAjEX1td63LUkgiaLsu5+r2EHThzi8KnJoXQTHFVlS4PHLc9HiPtR7h7waG5L4GOP/PIKY3o3GAxpjqzV05CBKGde+wM7GBp8vKp7DciVyT+k554lMKTAYnCBxexJQT/lrRf72lN+8aaY8o93Y1Q2emyq94i6e/7gXA/GlFpcPD7IsEKLsNPBpkaV5dtd5i+JYKXLu+qVC+++5jfdcDsGg6GX0DtXTEOvZNasWVJXPnOgePIDRE8DRrPbHEx4yogimzOGO5TkWIwtsbAsUJWMrhsvKFUtyvoaj6oWZdGaOI1RD9uS3d4HrsKIIoshhRYfGhegIJQ0t+/jBlWV+5dGWVbpgu9Wr4q7Oqa0qrBhwYLZXXZfBoOh95DBS6ThyEUB5Lwv3T9RHesllABokN1EtgjEXKUsx+JzU0OM72cTiSu21XN+91SXuYRC0BZqWjweestvjhKyZa/peZb4qXyTyhyuPSGUPnagVghV/3lc/UgTATutpa8S5Kgn755jsgINBoMR6IaeY9ash1n8+olMvWjhWBemiscNoNMQUfy5uUuhcvWUfrkW/XMtghYMK7SYMtBmSIENQMLzhWb7SX3gAnNXmaiALULAhmhCWV/rsazSZXuTR9xTdjRpuuBLRx8hyfEUhuGSo4KU5gijSmxsOTxLw7s7XO55OYKnoEpCkUuLtuc/tmDBbCPUDYY+jhHohozhe9+LyetNv8pOJKwbQaYCx4EObZfSnqZ9UFncVRwLyvIsRhbbDC6wyA/5wrj9rsBqJ0w1eY12ncrwFFrjys4WZUOdx/pal9qIv0FwLNk9hWwPXA/K8oSyXIv+ucIFY4PkBgVP/f1JZxkV7n05wtvbEqn7TwiMf/LuOWs75+oGg6G3YgS6IeO46NprQabieYGA4obcEFeB/hDIQ3ERvy87BzB/U6bqjt58uCqtCLTGlLI84bJjQhw70CGS8Ku9daYAh2S0vELQESKucuO/WnAV1I8u+NXJxZuvmWf6nhsMfRoj0A0Zz6xZDwtA3cDmkOUlpnkwQiAbOB84U9E8QfCFvcpuRvBDnuMivpk/7vkpdYMLbCYOsCnLtQg6MChPKM+zAMHTjk3vnYGnypOr/S5rq6pcEt7un6UuWJ8p2Jb/Z2N6Nxj6LkagG3olFRUVrF070ho16gNd7IkltQOKAzinCJyuqmMUDSZN0pOAcoDcoKQjyhE/KM0Sv9hLyqifKuxSkmUxvMhibKlN/xzBtoS42yYruyOlTlXZ2ugxf0mUush+5XSdp9aYRfOvqu7ygRkMhozECHTDEYJy8ZwHeGrBLCIf+SoflkvZGqyi2OFnKnqjgJTnWnzzjHD6DCv5HwtfsENKsPf8z0JVWVbp8uDSCF7yZ5qKG2iJuUwZVkBRTpBX1tSkTwH5Saxk83cXV1QY07vB0Afp+ZXLYOhCzv3yz4eKZa8nOdfnnZ1F/1xr3yf1MKrKqiqPO5e0kvqJxuIel50+lFPHFjNmYB6oEol5zHngDWoaY/554Ily0cL5cx7vweEbDIYeIrNXNoPhMJleeu0mEf5MMgbu98ui6bavmUprHH72YpswL84N8vdvTefK04cypiwXURCEcMDip586Op2XLv7hr1VUVJjftcHQB7F7egAGw4FQUVEhRUM+b4877sPWqmX/UJh3QOeNGTPYqg+yDeVKQOIenDTEIeRkrnHqt29G2dboR75ZAr+eewK5joWI7OK7FxHyswLEgeUb6hD/j8M2teRuHHLh8W+tX7y4p27BYDD0AJm7qhn6FBV+O1CpqKjQC67/g+Np6wRVTgIG42888xAGA8NQLUOkCAgkK9DsWfwcSQB1wDaUKoTTgLAIfHRCkOMG2vTPtXBTxWgywG8O4HnKzU+1poPgvvnhsZx+VOk+x9cac7nq569T1xJPHYoBRy28e84HXT7gjEHlpptu4ZZbblKzrBn6KmbmG7qdkpJq5s6dzzMbRts5eYmyhMYLFQaI8mWEmYpmC6IoguxaMa4zibnKgFyLc0YFmFxmU5q9e8Zb9xNLKNf9qwXbAtf1eOzbp2Bb+7eg18c8Lr9jCa7n56ZbYn0nGte7F993dfOR8jOvqKigouL7fORr91otreH+anmFCI5gW67tljiuZCfEqxVPG0VELQk2RhqcrTOGr4mnzjcYjmSOjF+6oVfw4Q8/aD366NXe2XN/ebSt3i2IDgX6KVIqHFixGEmWa1PAVcXz/H6i6b+TjFq3SJdZVd1/ERnbgv85s2cD5lThmXVxFiz3g9xG9M9m/pVTDsh6oAo/+Nu7vLqmNnWvCqz0Apy+6GdzdnbhsLucWbMethYsmO2dM/fBcRZ6GzAMKFG0VJAAHVtoFKgHKlVZJfD56aVX11dUSGYHUBgMh4ER6IYuY+pU5bXXYOYND04RZSbKVISLgCz/HcoeJVLwS6iGHRhcYDEwT8gOWNgW5ASForBQki0UhIVwQAhatGsp6l/AVSWSUBqjSm2rUt2sNMSUuAuRuJ/bvbHOoyWu7QPKqMiACPhbn2tlXa2HAtdfMIrzJpcdsNHAVeWq+15nR0M0dSglvP6gyq+nl2xePG/evF4h0GbNeliayhrCLvppVaaI8BlFc5P19w523VL8fd8fUbl14fyr3+n8ERsMPY8R6IZOpaJCeeTtR+yBg3eWucgZ4nEPQn6ykNpu9dhJCmoAYVihcP6YIGNK7aRgb2u00hk+7lQDFoV0W9M3tiR4bn2Cjx8dYGC+1eO+9O882UJt0n9+x+eO8aPaD2JIi1dVc8vfV+35ByWhsNgWveKJu6/Z0knD7WSUYy94XPqN3lqmqp8V4QeqOLKb20WBgAVZAVBPEAuyA/5ciif8LAGxlFgCIold4iNUVVXEuilHSuYfU3xptKLCLIGGIwczmw2dhMrUa+6XkpD9NcX7mCgTEcmmgzkWc5UTBjmcMSJATlAoyfa1bzMd4eaFLdS0+gL9lssmcvSQgoMS6K7rcfk9S6lvSXT0Zw+lBWFJQvWKp+fP2Zo5z1zl/G88VOhFWh4CpgN5JAenqlgiRBLKWaMCnDzUIWRDcZaQFRDfQpN0q/geGSXhQnWLb6H5/ZtRalq1/XNUlGeASxbOn9PUAzdrMHQJmfJrNvQAF1xwlzz++PUKcOrVD4Szg14/S6xCzyIgSnMAr/qD0sqadysqdNash+Xhh2dpew121qxZfPDBB1Iy/YszUD0T0RtBcmDPQLaxpRbleRbHljsc1d/2tW+RXbqm9XVU4b5XIizf7gJw5YxhfPzEwQcdpxdzPT515yu0xvzogpCDNsdUnKRVIin4POAJ4C/i6cP5OwqjPVUH/ty5Dx5riX5aPb0BEZu0IIeQA8cNdDimzOa4QQ6ul2pZe+APRYFlWxM8tSbOulqv3WFtRq3zCk7PX7JgtqmBb+j9mJW0T/Ej4Dtc8MU7clwnN4zIJah+W2GIQCD5Jq9dhzIHcFFtUfiHqPwQkSon6jQkrOqAEyoZkNDEM/hBSn6XkiSO5ZtAPzQ2wLljguk+5UZ47x1VeGVTnN++6QfFDS3N5udXH3tI1/rRP97jhZXViAhxT/UnM7Plf59pJe6xS8tY3wQtMYQvg/6tONja4G4o9xYsmN0Zt7RXZs16mKbSpvyE4z4gMCuZ0rDL/Jk9KcjpwwN+0ONhbvz8jSPc8WKE1Tu91DNQQAW5KFiY/eS/fniZKZlr6NWY1bWPUFFRIS9WDR0rlvu/oMeAjGQ3IbwfFFCERjyWIhQBxyX/1rYQC8yeHGJ4kTA4A3zSvY3WuHLjf5qxRIgnPBb9z+mod/DKY3PM5eP/7+WkiFROGOzoVVPDsmany+Pvx1mx3d39m/eARtCXRbgjv7LwCUC6Smufed39X0XkBvw6A+lIxEF5wqyJIUaWWH7TnE6ePwK8vS3B/JcjWKmHA1Hg5uklV99uouANvRmz2h7RKOd88eeOZdsXInIj6Bl0ECWc8CBo+93IsgJgiRBz/SjxSNIVa+05U1IuSyyBiQNsjhvocPLQpFk0GcnU02jyP5LsrCYoCc8XnPURpTGmtMb9Z6AK/XMshhRKj21EVJW5yV7noPz6i8czoCC8v9M6vM6i5Tu4/bE1gB809oNzsskJ+m6Oygbl8dUx3t7mEnP3ON0DWkEqQJfVbil/erjdop0h3Gfe8OA0XP0NwvjkIfEURhRZnD0qwAmDncP9iP2iqmxvVu54IUJ9NKmqKyoicwtOy7/XmN8NvZVMWHMNnY6/Hs380s+LsQPLQAcn/5BuJuZ6SnmexScmBZlY5qDqH2tf5ty2BNuC6mZlwfIor21NELCEVBdRW2Bsqc11J4dIJX/1lEKeimD38AVzIDn2qiaP5TsSvLHFZX2dR2NUscQfu2XJHmXdswLCbRdkd7SB6RY8V7ntxUja1/u1i8dy1oR9V4rbGwnX49LblqRN7BP621x3UsiPXYC0GXvRmhgL3ol3cM+qIB6Ii+gvIgU5Xw9Et0pxU1aUqn4AHKhp/pKf/T7Qui5yC8p1CO385MoVx4WYNsTpVpeMqhKwhO881UJVc3oSqJuQycsem/bOzg2Tu2UcBkNnYgT6EciJt/zVKtxYe7MKXwb6k/yePVVmjAhwTLnNmBKbgC1tavYB4HrK+lovLWwmDLAYmGt1e3W1lPAO2kJDVHl7m8vqapfmuBKJQ1WLR13EzzvfI1duPzgWzL84Z7+FaLoKVeX+pVGWVfpq80enDeLzZw5LmYcPmjfW1fKdP63AsgTPg2+dEWZ40a6uEFVIeMp7VR7v7kjw9No4tr3HZsfP5VbeV9HlFvJyIit032nZH0RXrJggCxbM7tD/PGvWw1JXVj9J4BfAiYCoKp7CheOCnDMqQE4IesKeo6rUReD2FyNUNfueeqBaPZ361D3XbGr/vlmz/mr99a8f98ySachkzOw8wrjoq7/JjcXi3wO+jvi+SUGZMtDh8ilBsp3DK2+aikpPCdWu1qgUsJJm8i0NvoZd3aIs3ZxgbY0f3GRb+22glvprerC2+C6G3JDvZghYvqthXD+bc0Y5Per7X7E9wfyX/eIwjiX865vTD7lBnIdy3S+Xsb6qBVVlxsgAn5gU7PD+0nn6CovWxnmvymV9ndIS092njCqq4ldj2ySqv/CQlQiVbnP28qd/9enWWbMeZgPLpKhs5OUe+ktBndTEG15k8dEJQUaX+CEcPRlmIcCqape7lkSSZXNBIKaQKj7soVSKyGOKPg/sjEZ45dkHrm5qu4LBkBmY2XgEoapy3vUPPgR8MnUsYAvfOzNEaXbvClBzPSXsCCt2uPz+zSg7WzwsaTP374XUX11QOylAYsASVBaIMEnRawA5bbjDrIlBv1Rsco/jb1R6vJw7lsCcvzeltfIbLhjNzMn9D+n7U1UWvLyF3z63wdfEXeVXH8vd33NMn+up73K5c0mEqiYPx97rGBQlruCJ0AK8iOhklCEgVup6Z4wIMHtSMF3Yp6dQVUKOcNvzEVZVuxxE3KELxEFXITJrevGWtRUVFSY63pAR9J4V3rBPZlzzh3Aw2PogwqdIRg1PKbf5zJQgWUEr479oxfdpLt2c4J3tLlsaPDbWe3vRTNO1uv06IugK4D/ABsFqVtG1oqxyA+H6IXlx9/k/LuDYY6+kvqz+VuCrgJw/JsCHjwpk5CZHVXlqTZxHVsQQEcYPyufWT088ZCGoqnzmnqXUNPnd2Mb3s7nh5NBB7lyUlhi8V+VS3eKxZFOCTXUewaTbpsMT2q0vIVu4fnqIEcVWt5jXdR8mDRHh9S0Jfv9mlOieAYH++eyyOKYsEu0DSjX5bxPoQpA7C7YtXLlgwQIj3A09RteHlBq6AZVg6MEvgS/MReCYMptrp4V80dfTw9sHkbjHlgbl1S0JFn8Q35uvOLU61ym8J0gjqovVlt8VegU7/vmLSxKTJi3n9deP3+sqfvnlj8lLOx88nuTjGJDbc5Hs+0NEGF1iY1uCp7C6spGmaIKCrMD+T94L37h4HN/+03JA2FDnUh9V8kMH4zIRsoNw7EAbcJg5JoAqvLE1wUsbXVrjSl2rUtOqvptE2uI2pg5ymHN8OHmVrsbPWqhs9HA9aIgqzXHFArKDQk5AWFvj8uh78V3GIviZHkkB7wnyM4KB7yW0JeDEg5MF9zJgHH6a3djkaRYwDORq4Mr6spkLZ1537v+F496S48q3eaa7m6G7ycwVzXBQzJx7/wUgjwIOKKNLbL4yPZw2I2cSmsojAx54LcZ7VQla43uE5mk7FSkC+hNcfudqoD4Wz2kq0obEsYNrFL7BvHkHdn+XXP+rvFbPrUWwFeWOC3MIBzLr2eyK8qV/NpOqZn/x1HKuPWfEIQfHxRMel939Cs1RX4HMCwk/OS/rkK+3y0jVz46Iuv732xjzeGWTL+g/MSnIMWX2rg10ugBfIxceWBphZZWfincw6fup4En/HPVA5hVsW/ijBQsWuF/+8nzu/813OfPKuyQgkt0iTUUBz74JkesQFE3n0SsQBzapyIcLK598z2jshu4kk1c0wwFw1lUPOk62voOvPTCq2OKG6eEuKcpxuNgCSzbFeXOry1vb3I7M6QrUK/xOYBWe/XikwdlY3Jjn/eMfHznkwPPPfOZ3bC+M3gDcDkhZrlBxdhaa4dN/Y53LjxZHsJJphv/+1ikEDkMw/vuNSu598oP0r74oSzh7VIAzRzqdIth7ClXlne0uv3kjRkt8z2mS9MscLC7wKsi/QjH92b9+MSfW/jJXXXUVmwLH5eEEZyH6YZBLUsNJ/q8n8KSq/mx66danKyoqTG67ocvpvb9iAxd9834n2iIPCHwOEFvgptPDDC20e3poaRSIu8rGOo8HlkZpiOrufwbYDKy2Pbm5KVb82tmDPuJ2ZsWumV+4PYtA7jvASIAvTAsxudzpFZP/pidaaIz6UebfuXQcp4wrPeRriSXMvv1lGlt3bdwycYDNpyYHKcrKXDfE3lBVNtV7/HhxZJfVrDjLb6+bFYD8oB9M2ZJMa/RUiSagplXx2OcimGr5Uocw28J69aTiTQ17mtK/Kuddd/RwFe9B4AQgl7Z9hItyPza3FWxduH7BggVGsBu6DOND78VEm62TBO/y1Cp87YkhhhT0bD/v9qj6/syfPt/KjqY9BLmiutZCZ1sS2NQYjdc8ecc1mp0tPN/Z43ByjxYYAn6f9UH5mR8kCP7zG1dqs3RzHBAq6yKH1cxGPeX0Cf34z+uVuxx/Z7vLD55uZcpAh88d23FKW6bSHFPueyWalspxV/naqVkMLRSyA6mUuN1q3HpKa0KJubC+zuP3b0Rp7bA5HakqBoV4LPTE27iketBlwBJ2Ufp/pieXVqx7rqr0HIfQMLW4E7hIfB+7g/BFPC6rL5/5yysqLrzpNxVXGjO8oUvoPb9cwy7M/MzvHAqjzwCnADKy2OIrp2ThZI48Z1uTy4+fiRBrW75UISKqv1D4ayIkLz/z/+bsJc64c7jwwjutxKjsfwAXA4wutvjqqeFeI7SeXB3jn+/GUWDC4Dxu/fTkw0qr21oX4cp7XsPeNf0sHbEwIFc4d3SAM4YHiHs9n8K3b3zt/P8WRwC/M9t3Z2RRkn3gloZUxbzVNR5LNsR5cUNib9kEyWekUeAe4McL776muqM3fv6mN6zNLa+dg8j1wIXJw4LgorykcMvReTv/c8f/feuwtfWKigpZUlUW8sT6kIisX1iy5XVUYd68w720oReS0T9XQ8ccdfwGhkxfeCXKL/EtqXx3RhZleZllMn2/2uX2FyOpl4ryCjHvooX3X1OTTDvrcs6b++B0VX0R8fO7f3JeFnmhDNr17IemqMfXHmtJVnpTFv7P6XiJQ1fwFOXmP61g2YZ6/7VqRGCLioxMF9VTxbaEr50aZnBB1zRJ6QxUlcXrEjy83O9ON7rY5qunhg45Xx8Ralo8fvZChJ0tXvI6qkAdEADJTb0dZZ1YMrPI2/7Bn+ff3OFcPuWUF6ycY5efiTi/Ah2aqnaLn6v/04Rt33Zawcbag42G//73v89b9WV2U4zhluVcgvBDlFDSyP8awtXNBQUrX/zfWXt04DEc2fSela0HmTXrYevEE+9qn4Paoxxzyr8cVK9PvT57VIDyDBPmAEMKLHKD6ZeK8PSkvMZuE+aXXHKJparfJZkqfcJgm9xQZj2j/ZEftkiLb4GG5tjhXVDhyrOGt70WSViWfBJhbjoFIVnA59bnI/zfsxHW1rjsNdu8B1Gg7v+zd95hVlVXG/+tc/v0Rht679KUIsUGg9g1ojFq7B00MZaoSRh7YiwIdkiixhC/EBMVC8UCKoggKBZAeu/Ty63nrO+Pc++doTONGci8z8MD93DvPvvss/dee7V3+Sv6FYgof1sa4s3vgizcHCYQUZyG7TM/VF462AcWATISDO47xUvv5o5Y5LyAOCxkJLDAjoBHENqrWksKjGZnjh079oCTav78YVb3xKKPHeIagPIASMwa5VDlPkfEXLIgr9UpoEc0KXNzc8WVmCYLC1qeW2Y6FhoO5zJEnwQSovz4DoRBCl8nFhbNGjPub6mNqXP/W2g40VMNEKrKlwXZA4JJoce9LV33dBh0XpsOg84vXHdW/53MnVsvfbr3XmV98Luzo6UnDYBf9vOQ6Gl4fmGnAYlu4dvtZqz4Wr/dEe9raxfNKDka92876u6rEO4EDAV+0cdDhu/YOsNaCst3mRQFFMMQstN9dGqWdPgfHgQiQoLHwcff78IfMhHUpcj8tB2pfwmlhiZhYSAMQHEgSGlI+XKTyY+7bFkUi9Go78OjqrKzVFm0JcKuaHGV4qCyrdhiY6HFsu0mM1eFmbMmwu4ypcivpHrtILlDncsFcDuFLplOFm8zCdq+dbdAN9PpGGVYagLD7a+KR+HyYEJHY+3iGXMP1N5X8z9izVdvl/e/68ovIhuD76rQG2htC3FJAy7rOHCpt+uwC5eu/vKdwL6/nzBhAss2FsqIKx7uu7k85Yb2/XPeBLlWkJaA+0BOEbH99u1V9I5N/pS0roPPW3vFmAGFc+tpz2rE0UNDkwENCqPGvZwiYuzBDh6MsZJZIE8WusMTFj11S/BoD+FZt07zRBxl+UACwCntXfy8t6vhOjtVmfCxP7bpKqq5J2dte6iuNYcxd7ycbVrGj0AawLC2Tn7R59gK+AJbcL2/Msz7q2yWtxHdMvntBd0O86vDtzl55lpmLtsZuxTZtqaH+4cPhyrAqeOnprptbbQd4KOSKd5SuLyvh/4tnSRFS7Ee7TFVVfwR+O3McsJV8D6oQucsg6v7e0j3ymFz44sDFr+dVR5Lbww7HdI9ceusdXuanp3lMkI/gmRh+9UtkHcCJYU//+zVuw9tQsnNlZy8lnegPIKQQEU0/EpRY2Q4Nbh9uHOnvvLeEvoPOzclbBmdFN4UaA97V6mL4ZDjb1PchcSQG02P860rumvZNddccwSj1YhjEceWunLUYbS1OcHjUltAHMBdaSHXvNPHTc0+2j0yXaUnAl6wa1z/rFcDFubYO9Wg1vFkCkG46Gjc17SMV4BUgHSvcGHPY0+Yx9AipWKZ7iwO1fgMKSLcdlYnu269DSO74/KRsQ9zJ19XlJCX2AtLBir6Z2JZCSJqGMI/vwvxhzl+nvzcz4ZC66hvIoUBZcJH/rgwF8DjgKFtnfysl5vRnV20SzeIWLqXo0AE1uRZTPjIzzMLApRESXYOZo73uYRWqTEjpjoiEe07ffp0/eS5q3ZbKoOBb6ItG8B53uS0WQMve9V9wMZiyM1VKd/8rCEMARYrscw57aZiLXcWO29YmN+6Sa8h508LW8ZiYJFAZ6JKRayv5eUl5OfvwtLDnGjsQH8PlvU3wx9a9M+l4atzc3OPzYXQiMOiUaAfAiLEpWWzJKF9erykpAMY5BQ+GDn+lf4cNT/VraKmDCG6pbdLc3DwWhkNAyLC4NZOrLjwkB5f5Ge3Hzt2bJ3dM2f8lBuwo4sFhQt6uEho0Kxwh0aCq8KDHQhb1WJJ2RdiKad0j+e0C8L5lYvSvT3tMp39/PU/zvm2228jzkg68Cyqm7EFEP6Isjbf4k/zAtw/p5xP14XZXGTikMNWvqsRVJWVu824MPY44NoT3Uw8J4HL+7g5o4OT83u4uGe4lykXJvLbEV5GtHPSNs2IH2BMtQX7XR+W898fQ5h6YKHuNGxGveiYiIgkRf/BR8/dsM6yHKNBZ2Bb7hzAiLSsyJtn//Kvh+TonfWXh3Tm5Bu+x18+HHhe0VB0n0lB5SVFt4pdYKkLUbeoqhIMBigrK2bXrq2UlhXjcrsw5Ei3cDEE6Q4ydf6e7Jk5t08ZgmrdvqxGHHU0CvRDQNFgbMY3STS4a7iPIW2cVLLUnWAgH47c2aZVreyyh0F6+vMAvWK36pDR8PzmB0K6z6Bns3i4hkuU56ZPn17r90lLS+OMu6ZmAM/Frp3SwcWJrY5tuoXKhgWldlKYBeiSnVz54+jc3Af33w8+H6GfPHNL0ezJN/zaE5BOhnAVUIgSBlQE8sqV//suyGNzA4yfUcaqPJOwqdFgtFrpro1o9P27K8Jxa8vozi4GZNseMZHoH2IBokK7dAc/P8HNvSO8/HF0Aolu4uvXEGH2mjATPvJTGtq/o5ZCeaXrFlaQSgv9o+ev3ZO6Y86FKNOjgZ4G6PmhVPOzoZc9fkihnpubS1aqmGqGJojK69HLEq1c44pVsFFVQqEAu3dvo7BoD2XlJSi2myMpKa2qVicBHCIyCmV+zvgpb557x4upPUeMPha2kUYcARoF+qGgkh/bTneWKk4RftnPwy/6uImuawGaGE5zyahxU4fUdXceeeQFENogiCq0Tjs2SqKKwNld3ZX0P+l3zq9fqX5k10Ew+PLHmjiCuhRwAeIy4JxurmOa1hT2VaLiyWU1gogwuk8zImbsgKAdv9rWIvVQB9MZU28IJ29P/YeprmwVRgMvE0/DsjMXgiZMnB/gnpl+Ji0I8O6KEIGIRp/j8NHm+0JViZjKeytDvPBVkEkLAhQG7DbCljKmy+EL1sQEfUaCwVNjErlrmJfWKUZ8YPP9yp/mBdhUWEGJYKC89WOITUXxA1RELOObfduePn26aUjkelRjYyGgJyZmZT1/sP6cmvupLMxrddWekO8Dw+HejHBd5eet/O/SsmIKCveg+7wXl8tdk6p19mlH5JKgun5q2efi+8jN5ehZGhtRV2iMcj8Eug88N2iJ/ArwlIeVga2cJHqE1qkG2SkOVuw2iVgIkCCiozoMPu/TdWMG1FkE/EUXXSQ/7OSqaIAMJ7Vy0izp2DiTOR2wcFOEkAmKuqwIb61dPGPn4X95ZBhz4ySn5XRPROQ0QLxO+MNpPlK9DS+dr6rYVqJ8vTVinx5TPIzp17xW2vW4DBauyqew3GaiU6f0GNFz2f99++07B/3N8uXTWb/o7ci6RTM29L/ryg9D6wMTQUKKhkSkFagBIhHL1tzX5FvMXBVi0eYIilAaUjJ8Eq1Bf+j3YlrK4q0mT30RYOVui52lFrvLKwSbIcJHa8K4nXY2RaLryKLv030GQ9o6KQ/B1mLL1sTDypo8ix5NHazNN5m2LMTXW82YGFXQ9/AWvrh2wZz9TiRrFr0f6tz/vHlq0AOhm9hxNv06Djov0r+t94vly5fv9f0uvYd9qPBroBPgJnpEM80IoXAQw3DEDyFulyd6qAnv1UZKcgZOZ40tTwIkAqd19Kf8vGN5yubuAy9cu2rRO41Mdscoju2dro7hdIY54+ZXn1XhdoBOmQZ3DfPZEUKqLN9lMelLf0wDVGBnxLD6ffLsjTvqZmhVcsZP/StR7vYxXVyc2+3gNb1VFbdTCEe03gPnIpby8Cd2tLuAqWqOmv3cTZ/Wxjidc/8fCZdkTVb0VqJWpzM7Ozm/h6fGbdc39iVP6d8+jUcu7Vlr7W/N93P9y0tj02NPuNzR/NO/XFtl9r7c3Fzj07Jsj9vPzSI8ioormhu93wsOR+ClCxNwHiLKXFVZsDHCG98G43P3UBH1qnBqeyeXnOCukkVm4eYIry0N7nfvivsoKF+mjkgbPv2SSw45Lqoqo2+fOhMYRTR63TKsYXdfNmrB6MEdmDBhAl8VtT7dMnUO0Xkau1dBwW5C4SCqisvlITOj6V79CIUC5BfsRkRwuTxkpDc54mc8cqgFfO4xrJGtE4ojLzx+N40i4tjCsaHe1RN+97tHEYc+C5QDrM2z2FVmH15FhB5NDW4b7MURTc0FmjlMmTPy1qmt66hLCiyJ/s0PO80DGkhjZrtXlwa58T+l/P4jP3nl9XvodhhCmi+6MYNDxdHrxhtfqfFuMXbsWImUZI1U9GrAQJUR7Zyc3+PQwcbHElZEc8BFoHvL5MN8u2rwuB0keeOGuhSnzzypOu3k5uZa8/58oz9jd5OJXrcjVUROBrkBWECsSEkULid8sjZ8UPO7KmwrsZj2XSguzNO8wpX9PFw3wMPV/d2c0dG5F82xCMzbEOGRTwMs3RbBOkLT/uDWTq4b4Imt4WhborE+C/KkwyHnHk6Yx35noNegrI7+HsMy5jz1xscDAQac9jMxTes6UFFVAkE/BYW72blrC6FwMNYGkUiI3Xu2Y5oVY2QL+WYAJCbUurcq9gQGyIig5di1uiT9+bPHT02ooxs1oo7QePw6DM645W8ewxmZL9AfkIt7uTm9gzN+clZVFm6O8OZ3IUKmfQVkTjjouvDT7A3lte2XGn371B6q+j3Rw9hNAz30bVGhCKkqBX7l6fkB8qLmSQVuOslDv+z6DQ57e3mI2WvCtutSeePkrK2/rGlZydG3T+2jqkuJjkfzJOHuEV58zmPf1A52ANet75YRc3W/dH0/2mTV3j5rWcq4V79lw67y2KVLTs7cOr02eAJir/ar/KnpYVMuE0Mvk2jtAbcDcs9IIN134Hf0/MIAP+y0ZWiLZOGBU33spdBHs7c/3xDhsw0RthSZldYknNvNxRmdXHgcR2aG//s3QRZsildoUeAdQ/T2/IU3bFm0qGrMhmfeMbWFZeliINtuTDeAnOwv3p3nS2myWaCZqlJUlEcwtB+XTByqSlpqJl5vQvxz7G/DqHNdzALWi+pt4rA+nTnxplB9W/kacXg0auiHwaVDRwcFpsU+v7dyb94IOy3LxTndXFGRKgKMcnsiMzsvPrHWYxTaewtXoEyJRfS8vCjI5iIrmoGi5Pk1qpFXLP72aQb9WtR/pHd2slE5wKttTYX5OXe+5LNU5xE9zSS7hftP85HgOjaCBY8EpgX+aI3vsGnRrkXtamci0C4rsfJefc+f/nRPrQxebq6Qmyt8OOn6grSdqS8YcApoOUAwojwz3x9/tsoIhLXCEgZc0MMT97nvG8k+vJ2T+07xcnlfTzw1UgRmrAzxyKd+DDl4nnllXN3fQ2Isvk5RgQ9mTrpxc1WFOUCv5O3bxWIE0RxzgfYG8nxiStavBZrYfZRDCvPYd4qK8ykuzt/r2lEQ5mDLhg4KH1qW47tzxk/NOBo3bUTN0CjQD4MbLm+Bmr5XgE0A/jC8/9Pe5kIRGNnRzdlxoY4oOrhdh2251DKJw0tP3KXqcdwJsiZ2bfKXQd5ZEWJDgcWz8wPEUr5F4LI+Hn4z3NcgbDHOyscboUY28Qvvfs0XCjs+EUghqoTdNNCDswE8Z21BFZZui+COkg20SPdiVYUa7QggIlx/RjsiZnw+Dzjzppm1vC8I//73WIZkbrXAOB8IiAi7Su1CKFuLrH2/TlGUo12AtmkHt7aICA5DGN7OxaM5CXTIqKCmzStXcj/xx2NeDoWIpQxt64rFqYvCwOo+7ZOP/J6UXbPXYwe+WTYdgp6vyINE99yiSkL6cPAHyiks3MPRSI3dB7GB7xISVueMe+Xp0eOnpDbmrjdcNAr0w0BEmPPC5WUKk4nm3S7cHMG0ZJ/v2TmxPZsZsWXnEuSBnPxW19X2QhyafE25IONBCwAtCSqzVod44rMAe6KaudOAa/p7GNHe2WBKqub7tbImWFDVFKYYxtw6yVcWCD0PDAYEVW48yWPn5R8nmrkNjZudAYZ3y6py2teRIDPZg88dP21pqbnnwlq/CXbu9ezJ130cXUsBEWFzkclT8/2sLzD30rBjBeUiqniP8JSWmSDcM9zHGR2dcR/6jhLlzg/KKQsfnkMlKyGeEihAWk3W7fTp03VXset54D/YmrqDKMOjaZoEg/4qtRcMBSgtOyolEA4EATKAXyv8NOr2KaPd7iCNhV8aHhrIVt/QIapi/R/RFZ5XrsxeE9pvh3Aaws0DvXTLqjSsqhNPH/9yx9r0pefmCimZW2YpjEaJ2P0SjWnhhii/HurlxJaOmuSq1ipUlZ92m/EhU/jmscceq0bnVCyH7w7g6tiVs7u5OaGZ4zgT5vb02llaob02S/XWyX3MiMVpPeNR04YgZ9fJjQAQ0nak3iPofYApIvjD8OfP/ExcEIjmqhMPUnMIhMwjE6wiNqPeRT3c3DbYGz/8BCPw+tIgchjr+T7c7rH6DdXGt69dZTmDpdeArIRY6XWNR7NXBapKYmLtBkRWGfb6airIjFNuen3FV3mtmh1ppbhGHB00CvQjRMKG5lsVvYvownxvZTju56sMwxCu7OshzStgbwgJThwLRu1q2bY2+zM9N5fZk25YrOrNAiYSL9oAZ3Z20y69YWmrYWsv4WShfPHAA/dXaVfrPexyyRk35VcKDxN93v7ZTs7p5j5soY1jESqwLt8eM0uVk7tk1Mk7FYE2TfYKtGsxcuScOtsbpk+/hFmTb5yowoWo5keTt1idZ9d+f+vHivgrEWFHSdWEn2EIvZo5+FkvT1xwfrcjwqzVkUPo3MKWorg1RIGCmvuphA9e+VUpqh9WvlpaWlTllpKTUqtA81qnEMAl0M1EV+aMm/KHnHFTHI2kNA0DDWKGHAt4993ztWh70mRgFVHd/JN1Jvua5QTITDT4zTAfHmf8UhMx+Psp416s1SO2iDDn+SuLURJjHWmXbnB+j6rl4tY51C5ruaci6j4oBhursmHm5ubSvM9pgxF5CFt7olWKwQ0nuevEDF3vUOWlhYF4ZHeLNC9ZKXWTVy8iNE32VHaHDN206dk6H9ShGdfPsPC1Q+VLovPXH4HP14djZUsxLWV7qVVl47chwsiOTtsvjv2MH68JE4polCYtpnAqhX6LeRvCzF0fJ29RgfnUxOYexbnjJ/sQRoJdWKW8vATLqlqav4jEI90bGFIRmaCieWfmtzxl8Nh7HPXg529EJTQK9Cpg+0//iShMin3+bH2Y9fnWAQVKZoLtw465BRGGecT5DLm5tTrma9asERX6xT6f2sGFVUdrymGAq4q9V1VCJjy7IBg3twssNwMFK6vSzoI92T3EsGYBSQBeJ9xxssdOEmxIh5dagCoUBZSVu21BZlnKw7/ozeEKa9UEfdqmYlrxGyR2yhl9eE7VGiI3V/jouStLvJJ8OqqnA7upRCML9rv974+haurKwthe7riMKQkpj8z18+cv/Ez60s8f5/n5w0d+Hpkb4P++CxENXlOUby130t9r+nxjx46VgHrHAL3sZ7ED3KoKj8eHYTRIUs/ouUhSLGVWSvPOM0aOn+prDJqrPzTIWdJQUbxrOR27XPKN+CKnA20ANhdZdsGWfUy+IkKzJPva6jwL7Mnfq6M/ZdvaRSd9A5/WSp8yMjJkiz/lUSDRVNt/mOSpfQG3scDksXkBPvgpRMsUgyZJR1YYJhCBFxcF2FkaX+QlIubIoU0L8uYeIUXuOfe+lmxGrP+CtAMk1WsHP6UnNCy3Qm1iybYI3+6wNbmWGT4uHpiNy1F352+P28FrczfiiM5jUxylI/ues2DJkvfq7J4x/LTo36a5q3hjSrsTJjtcrAaKsCuNuQEipi0MO2dW7X2LgNMhdM508NVmW+UvD0OBX9ldphQGlPIwhCsUZgW+NXBdMPvZKwtq+lxtzvh1NmLMBBJUIRAoI1BFgS5ikJHepKHPc8G2mnUSGN/xw2/8a/v2X8SSU4G59dqx/zU0auhVxJw3rowo3CcQBthUZLF0e+Sg3z+7q5s2afHF6FZ4eeT45iNryzQ1YcIEJRo9K0DCESSDqSpFAYtg5MiLZXy6PkxxQCkLw3NfBtlYYB6c6QsIm8q6fJP7Z/tZtSdeAMQCHp016ea1Rxohe9r1ExNC5aEFwImAGAJje7lpeoxw2FcHqjBtWQXfQd+2aXjqOFVBLaV3m5TYRxHk/g+WnXXUVK0NG+bpp6/cEJg96Ya/d0woux74Iv6fAh/8FGZXWYzArWrolGnQLPmg46dAQGE96CPhzG0nzXrums3VeIT9YKJXgqapKpZlUlxSWKXfqypeb0JDF+aVIUAK6NM5npbfj7q1Vc+TzvrD8btQGyAaB7saSPQ5FyJMJ7q7vLY0xLbi/e2hNgkE/OpkL00S7VrqAoaB/P2McX/pAhNq3Jenn37aAPLAXk07Sw8tpFXhm20mj84N8Ng8P/7IkW2QZ3d1VxTuFJvJa+VuCyFWJtP+2xBYtdvkz5/7efLzQLzSFqqmIPc6I/lPH+mz5ebmijMh8UmgOyCCcu0AD/2zj2/D0r9+CMZrdzsN4ZbRHep8U1eFiwe1qnzJ12vwD/WyP+wIuJ2gKZWvWQqPfupn9Z6q+9MdhtA6VSpnpUxT5Sq1rPOA0x3CiaJGr6070ibMzc2tMo/9vsjNzeX08S81E+R3RANFAsGyarWVVN+R7VWHYMuVHuLQr9I6tJrUWMnt6OH43hnrCCvnv2MlDx/xXqLpvQzIUGyf50kHqbvtNKBzloNlO0xCJgIkGcKprYamvLZx4btheLDafZk9e5Z2GLg0R4ROIjalZu/mB2eFKwpavPBVgNIQlAahSZJBm7TDT4MEFzRJEL7ZbiICIRO+2hJh0ZYIu8uUdQUm8zdGmLYsxGcbIhRX1LtQYAdiTEiR8mffef43Bzdn7AXF1Xv1zYJMIMrRfmoHF6d3dB2XEe0xmKq88W2QkGk/400jO9C1RVKdC3QRSElyM33BFjv9S4kYFL+xZtGMqqmVtYAOfS92m4beKEKLytcttV0RzRINmiVXjdp3a7EVc30BfNbXV/Cnv0+8/ae1iwZsWPPVjN1rF70b3r18eq30P6n3pV7F+R9st4GYlklRUV6V20lOSsPjqZtUxaMAAdwiclJHf8ovOwZStq0dM2B5XVWibISNRg29mvj2ybtDqPl41IzMtztM5q4PH1B7EBFapTi4qp+78oD38kRYMmrc1BquWEGEf8XUj3nrI2wtPrA53FJ4fWmI0qg1N8EFgw5yCDnQMwxq7eTnJ7j3esZdZXY1sA9XRfh6q0lpKP6/ihBAWOJyOLrPnnz9xH9PuuOItJ8uA06VnHFTewkSD0Ds1dzJJb3dcR/v8QhLlcc+DVASPQwZAmP6NjtqJleHw4gflkRwWkrXo3LjfWEdnD0hZMKUr4N8tDZC2Dxyl5HHKZWs9ZKUmFiudVQRkbC4+mHT3IqqUlxcUOVMDBGjoUa2VxUCtMfi/3LyWv7z7PEvZV5z9xP13afjFo0CvQbYbQRfB3nDll3w7ooQxQE9YJCnCHRv6uTaE+OpRwJ0FeH1mtLDpvgS3wQ+J7plPbsgQHFw/82uwG+xOs+M3/yKfh5cjqoEGQkDWznwVZwBFLCIlVtBLRTLvsaTqjrU6Usa/P7Ea6qUeNtm0BUdEeYSJfdIcAtX9fccS77EauH7nSZbi+33Y1nKM9f2w1mHgXD7IWKR7I29XDUQUo/ezSvg8QUsFWI5ZAeUhP/9McRjcwOsyTtwlsm+2FVqxZpSYIvWUa7j6NundlbVDwCHKoTDIcLhYJXmrqqSlJiCw3HcGFAFwQAuDeP4bqs/7Ur42/G9mOsJjQK9Bvhm0h0RNeX3IHvAjqB9ZVHwoMxWhthEKKM6uSrS2eDiUXktpw6/48Vqc5v/+4lfBC2RcaqUA1oShD/M8bN4i50nr2prf699E4pTajZLEk5oXvUNw+UQktzxtWgCv1PkcZTJgjwg6HCP25Hk29Tk3jmTb1z6wZ8uM6uiCeXc9EKyOPQVIBOQBBf87lRvReGM4xSFfos3vgnFN/4hXTLpkOk7qn1wOIT0pNhAC4r66iOveN32TmGB0kqXKgeoxDu0o9TimfkB/rY0xPc7KkqmVu6xqhIx1T7IihAlVdz04IPVd3MdFDerqPIg2AchyzIpKNxT5WZcLjc+X2Jt964hQIAWiLyaMy78n1G3vty1MW+9dtF4SqopJkxg1J6Wo8SQD4gSnpzV1cU5XV2HPJVPWxbk8w0RIFo7Ap4IpKf87vOHLq1eUI4qZ46fOtwSPgJcRN+tzwnXneQh1WPw8KflGCIYAk+OScDnqvrrD0Yscj8OUBhQUEIOp9Hvw4nXLa9Wn/dBUvNOMnTsva8pXEF0+71lkIdexyGta2VYqjz5eYB1+bESoMq79w3HeZTzeSOWxb3/+IEVW23OcEGeSNqdeN9bb15WhxnwB0bO+FfeBjkPex6/j3ImEo35Uf4MjEfYy10lKH1aOBnd2UV2NKp9xW6TlxcHK1vNTExXm9kvXL2tNvs79OLfSEKLbvegPCaCoaqUlhZS7q96MFxKcvqxFt1eHSi2F/CKYFHyW5+9fmm4URzVHPVfU/NYx4MPMgedM3r81CkKNwMyZ02YLlkOumYdWANW4KKebgrKlR92mTHSqnt8+cUW6O+g6iUbEWEm+nnOuKljEN4hSsDij9hpZgJx9rhOmQ681dR4S0NQFLAAARHL9EutbIxjx46VohY516tyKdGVPaaL65ABfscLpi0Lsb7AsrMiBO67sDsOy4pRmR01OKKVy2JQdGhat5+Oah8qsNe82qnC1xKrgCZ6osCpCveCXECM9hjh2+0m324/6JlYEa7etDVte+32VUnJntrZtHggalrG7y+rljB3u73/C8Ic7HfmEHjDm1py/Vk3Tr30g1c0r1Go1wyNJvdagWAiDwDLAQ2bMGVxkEL/gf17AngccNsQDz2aGhWXRe8dNX7KwyPGT6mm+V2YPfn6T8SiM8rrQD4VFoA4ujcxqlW0xVLlX9+FohEDKOji2S9fWytR0EUtRvVHeR5wg9KtiYOzu7mOT1rXKBT4YkOY+RvtwH9V5ZSeTRjaJbNeNnQxZN9SG73+MmHCUdfOz3zmQ4B/UOH0vlTQB7BdPAIywlLpYC7f8zPgJOBNYFv0+/smq9txHqq7USZs/vGzaSvfuaBWJ1XO7X/tYKp+gpCkqphmhLKy4iq3IyKkJKf9LwjzynAAp0c8bM0ZP/WmYZf92dVohq8+/qdmTl1j1B0vdRHLsRhIBqR1qvDAqT70EMOsqvzxswCbCi2IbUYiTyxLyntg52P31mAzVbnwrpcSSoPOX4ryBKJJ0UqjPDzSR5MqErOowsJNEV7/Np6PZorDajVr4o07ajKNDMPg9BumuQ13yTbsEo2SmSD87lQf3mq4BI4VqCo7Si1yP/JjGIKqMqBDOg9d0qP+ePgF7p32A99vrIhhTN2R6pg+/ZKjLtQBcsZNKUXsOgUqZl9Rx/8BXe2eopYV7vbR87esAmHs2KedRU197cRw3qlwqaqmiYgqFBjwkDPi+Ov7L15bTi1Ki9zcXObvaSEixlxguKp9HNqTtx3LqvqQ+bwJJCen/68J9AooFsLiBEfkjBVpaWU/5V5W3z065tCoodciCryFq0X1VvuTsrlI+df34UNqmSLC7UM8dEg3IEbKoHpPn5KMl2oW/S763ydvKfvh32e/KGK106gZ3+WArMSqNauqzFsf5s3v48JcUX131sSbaiTMAf70+seG4S6ZCppBlAnuxpM8dprRcQpVZU+58sRngXiaWPM0L786q1P9FtVR9mOkCyduq5c9YuzYfwnwLlEBLOq4x5OY2A9YHTv3GoZr2qib/+EFmD79zsjJTXauGZI55rZdmWYTA783HCzwWQFtNiTz+ufef/HaMmpZ9Vu4MyNJRN4BHQaIiFBcUlANYa44na7/bWEORN0VA8tN56o2eWWX5dYw++d/EY0DVttQlZzbpz4N3EGc3czLgJaHDuxSVSZ/GWDF7pimroDxNvDL2ZOvK63+q1JG3fZqhhiRPYA4DJh0dsIRkbOo2lzXX2wI887KMJWCiNc4xRzxwaSbd1SzUwD0u+YaaZJ48qWIvgHiQJXL+3oY2tZ53G5sGq0899AnAYyoqPS6DCZe3Zc2Rzmq/UB49L8rmf9TJRKUSNg9+8Vbwwf/Rd0h5/apl6D6JvbkX53szjyhJLjnIoRXQVzYw7k4EvGf8elLt5ceurXaxZibX/aZLnkM5A4qVVIrLSuiOms1LTUTt9t71Oe91+3AtJRwpF6MMAeDnQKLTDVN570fv7CxCHLru0/HBBo19NqGiJoJjt8C3wKqCK9+E2Bz0aFJMESE24Z46dHUAdGIM9DzgYWn31L9lDYQVnw6vAA0H+xCF6uOIHdXUbYUK3/4qJy3V4QqC/MyB5qTuP3jGglzgCZJg3uBvA7iAGiV6mBYu0NnBxzLUFVKQ/D4vAphLsBrtw+idUbDYATzuR0V4kiVEm9Wvb0MM8IcKrTqTsWhvJMW/+vCfwrGVdipbCLCiS6n7/1TTplw1PaysWPHOkyXMaWyMA+Hg5SUVk+Y+3xJR12Ye1wORvTM5jcX9uXRKwZx85k9aJWVhNfdIHLfJbon3OBwRFafeUfLtvXdoWMFjQK9DvDxn64NmiJnApsBNS3h+YV+thZbh6wsaGCbm4e3dcTy1A3QHk6na3HOrX/tVl2LYa82qwF533bPw39+DBKxbAFT+Y+ghCLKnDUhnv4iwONz/ZSHAYQoYcxsQ8yuAzO2bpg+vWY0mUPufNkNxouIOgGaJgr3jPAet5UXFVi+y+T3c8qJ0RQo8NjlvUlyVo3GtC7h3svkLrh0d70xAAxvel2BqL6IPVQiMPPES95LNsyy/wIvRr9mIAzznNBqxsl3PVvnfR15x9SmRc1z3gIuIyrMg0E/+QV7qvUOHQ4HyUkpNXr/TodBpxapnNm/DRcMbs/pJ7TkxE5NSE08sB4gwAntMrn7or4M7tKM7q3TOevEdrx4ywguPrkjp53QEk9V6yTXDQwgy7JYMHr8lCsbg+UOj4axixyPyM0lJ69lH5TZCE0BWiQb3DXcS8Ihgr1UFRHh7eUhZq2OWzoVKFHh8jmTrn+vOq8t57ZXRmLILKKHOAGGtXPSvYkDQdlarCzZFmF7yX6LRoFCYFIw4nt03otX1Nj8euo1bxrupOLHQe4C2/p/00keejc/PvPNBZi7Psy0ZSFing6vy8ETvzyBjlm+BvXML85Zy3tLd0S5/5QSV2nyl8/ceVTN2ZVx5i3Puixnwg4gA1ELS399ctb2ST/++KNR1DznNWzOAoiemZyGcUbitpk7a3rg3BcXXXylFDcd3skwZDpCH7DXajgcrBZ5TAzpaU1wudzVngMt0hPI6deaET2zyUj24HAYWJYSNi027Cxmd1GAZ95dtpdJXQT+cvtpNEnxsW5HEa2ykvc6yAXDJj9uyufjZVtZunY3gVCEiFXPwlQJKty0Qfyvr558e6NkPwgahH3luMTcuaxd9O7OjgOX/iRi51aXhpSFmyMMa+s4KOVqbGF3yTJol2awZJtJlHTaI+jPOg76xr120YB5MLdKkzrtwps3JJaVbAHOid1qU6HFkm0mS7aZrMqz4hzvUaiqiojx94jF+WZR0gdz/3J5jStRAXQadlZ7MfRVwI0qP+vlYXDr489vbls9YPLCIPPWV9Sk8boMXrnlRFqmNjw626/XFbBqe1R+ixAyQo9vWTgrdOhf1R169OytEU9GL5DeIAYiQ7cHmk5652+PhHqefNaHETWaA/0AUJpY6NXBpE4fr130bu3lml+t0joz73wx5AOENsQ18wAFhXnVpgtISkzB50us9hzIzkjkgsHtOW9we8IRi+825DNr6WZ2FpZTWBakS3Ya7Zolc9GQDqzaWkggbBEIm7idBsN7ZpOR7GXWN1sIRUxaZlYw0zkdBi0yEunfMYvzB7UnrySIAkVlwYN3pq4hOEU4Ox33O2sXvbuz/jrSsNEo0OsUD9Jl0KjVFu5NQA7gCkZgS5HSL9uBIRx0MYsITRMN2qYbrMmzCEQAxAkM6zQ4tVfHgecuXPPVu8VHSmG5/eNp2qTrwO/cnqR1iHYVJIuD2bCUrxGeF4ybW2Q6Xn37z9eVbvjurWo8//4491d/ybDU+hxoAkiaz+DyPh7cx1tUuyo7S5W/LQ2yfJcVJQNQOjRN5MGxPchugMIc4MtV+azdUUGIYon74U0LZxxhhbzax2UX5rA9kLLAgpsAN+AxiXQ6aeiot/8zcVyoS/8zPlaHywKGRwc0Ebi006DzpGO/0YvWLvmg2ofQ+++/X3x9r+zb0bN0ssIEQXz2IVcoLSumpKSgWu9QVXG7PSTXIOfc63ZwcvcWXDaiMwJs3FWCCDgNg/cWb+C79XksXr2bzXtKOalzU04/oRVOQ/AHTXYXBUhL8tCzTQa922aQmezbq2aAKhT7QyR5XbicBoO7NqNbq3Q6Nk9h9fYiguFaOddXHXYU/NtrF81YWz8daPhoeDvKcYgzb3tG1Eh6VJW7EFyg9Gzq4JZB3kMKdbAXf55feXZ+gD3llSqZwW5LIxcUt8hc+NX9Y7UqG8PZd77iDoe1h2DcqKq91KaZ2YAww2GG5rW1jD0vvXRLrYe9du7cWdqfec/DwH2A4XHCE6MTcDkOPQbHGkwLthdbPDU/gD9sRcuRKn3apvGHi7uT0DACjw6IP77zE5+tqDAhh8sM96d/va5eotwrQXLGvXIxIm9iu4wiio6eM/nGTwByc3NlQX7L21D5E2isRJmCzlFx3DT72Ws3VGV+5ebm8sWu1mkY1oWGyHOV2sQ0TQqL9hCJVH9IDMNBVmbzGs35fh2y+O3F/UnwOAlFLAKhCIkeJ2LYlFErthQyf8V2Plm2lcwUL3/4+Yk0TfXx/cY8/r1gHWu2FfHM9UNpmrp/ZkWJP8TU2SvwuR3cdGYvO0QNe9PZuLOE59//ng27SggcfcFuodJ39nPXf3+0b3ys4PjZRRs4ut3+tKONJv9B4Hdq12mhbZrtUz+cUAclFBH+sSzIV5vDFd9V/AjvZjs8V7468ZdV2mHc7iSGDCmhaY/pst4qpHfIqUlJpUye/BhQ4wD2A2LMrS9lmw5jDYgPYFQnFxf1rEEAfwOEIfDclwF+2BmJEwqJwMVDWnPF0Fa4jmb1tGrgwbdW8NXq/Pjn5D07XG/98/f1pqHHMGbcVK8pug60eTQDpEzU7DvruVvWAJx80d1GUnbXPggfgDajQgYVAi+nmlt+N/2FBw8rge655x7jm/JOI0XkRaAd2LzsAIFAOSWlRahW/6yrqmRmNMPprH42R98OWdyQ04M2TZJYvGoX7y/ZSHF5CJ/bSVaKl3MHtiM1wU1qoofvN+bx6scr2Z5Xzm/H9qN320zm/bCN59//gQGdmjD+3N6kJ3r2av+jb7fwyqzlhCImCR4nf75mCNmZSXFhEQybTHz3O5au3U158KhOjbyIprT45LlL6/uA2WDRKNCPIk759cteT8R4Cpvz3QDon+3gmgEeHIcV6vZmsHBzhDe+DVEpRkVRlqjwUNm29u8teGtkgwwYOe2qx52ulKz/YPvwJTtZuP9U33FT39xSZf7GCLNWhcnzV7yCVJ+TW0Z3ZHjX+qFzrRIE7vvnjyzbUMHm66Cl48PJZzWAJGVlzI2T002P73ugpa2Ay8ehUudZc1+9JgQwduxYCprnZBrKcwg/JxodH2Ug+xLViQ4x3vpw8nX71ULPzc2VBXuyeyJyJ3A5tnkfgHA4TFl5McGgv2ZPoEpqagZeT/W52pum+rjlrF7075CFGMK8H7YyecYPhCL2WcUQwVKlX8csRvZpxbDuLfhhUz6/e+MrBOGU3tnMX76DUMTE6TC447wTGNi5KQkeu2bCqm1FvDzzR1ZtLYy35TSEhy4fSO92mXv15am3lzH3+601GpMjh1qK3Dhn8g1/OUo3PCbRwHeY4w8t7nvC0bsk/a+IXgFigNIpw8FtQ7x4j8CPrKqETXhqvp9NhXuZ4C2FvznQ+3cvuGH31183LDP26PGvtFOMb0DTRJS7hvnokNFwTc9HAlVbVyz0W0z9OsiafCu+oCxL6d4yhccu74XX0XDS0g4FRbln2o/8uClO/eqfPen6RKQaxYLqCKPGTfmVCE8CDlBF5ZNAadFZn716V6XAvTskZ1yvHJuAhsraOijLES4p37nupy/+9ZgJv+HsOzqnhC3njcDDgIdo0JuqUu4voayspFb6nuBLJCmpZlztYwa04eYxPVm1tYgW6QkEIyZ3/3UB+aX7B6wl+9wM7NKUb9fvIb8kuBf3xK1n9aRD81Te+Wo9rbOSMC27zPIPm/LYmlfOyd3sdLYEj5PJM76ne5t0bj6zJ5nJFXwJu4r85E5bzOY9RyUJYrNGnP3nvHhN9VMK/gdwbO+oxyBKzzhZm4cTP3Srwwc6GETy/cqy7SYDWjpxO+SQUbN2RS5hYCsnaT7hux0Rm3PStvb2U5VfJLRZkjR1zZb5Gz98s0FsxHfeeafsMpvcgnAWIGleg4t6uuuX5rSGiJHEPP9VgLd/DLOn3Dawqypet4PfX9KTK4e1xus0jglhDoDCR9/vYldxTDjI0v5/W/vX5cunN4h5BJDU9LZFSelFAZAzQAShtdPjSVi7aMacim99xdhf/GLdjvzANLt8gQyOuoEFoSmq17qSMka1G7Tkq06DmpxuqfFP4BLAHQt6C4YCFBXnEwwGaqXfXm8CKSkZNZoLhiEM6daMrtnp/PfLdViW0qVlGmu2F7NlT9l+Ea6hiMn6ncUEghEUOOfEtqQmehjcrRlnn9iOFukJDO3egrySILO/2cyXK3ciAuec1Jarz+hG+2YptMpM4uyT2jL9i7W4nQbdWqXH20/0uthRWM7KLbVSn+lQUJBb1ibtXlww/6O6vtcxjYbt0Dse8eCDzJ94c9BvhH6PGM8CYYAdpRaTvgywtdjicAQKIuBxCiPaOXnwDB/dm8SJaAShFZDrXb17yajxU8buX3zq6OOHSMdEhN8TtQj9/AQ3x6qlXYFAWHl3ZZj7Z5ezerdJKGqQNi2LU3o24ZUb+jOwfdo+JC0NH6almJXzjVXn5udnNBhhDvDde2daoqEXQWIsci6Qu3LGT7m3Mvf3H391mc567qZteUG9x7DLrs7AZpcDER8w3IAfBKYBXQCHqhKJhCksyqOoKA/TrB3/sMfjIyU5vcaVA1WhdWYyLqdBaTDMzKWbEBHuurDPfubwvX4HdG+dzs9HdOaei/px4aD2cRM7wCm9sjmlZzYCdM5O5YLB7SmopPF7XA5aN0liydo9+/nM2zZJ3itCvg6gqH6Yled7c92fftug5mJDxLG14xxH+PzZWwOzM7bcpaqPCYQAthRZPPWFn23Fh6aJjUFEaJbkYPzJHm4a6CEhzpMlBnCCwJs546euyxk3pc/pN73mZVf9CHfBdRK2KZNkj9A/+9jNOd9QYHLnh+XMXBUmYpOPYghkp3uZ9qsh3HteV7KS3cekLytkKiWBShu28N3HHze8mIxZz40rnj35+tHA0mhlYAEeX5CffcfP7nl9L6vjkldu0lmTb1jiWPOfC1VlKErMfi5irxMH2JaVYChAQeHuGvvKK8PpdJKakhG9Yc1mhaqyZkchEdOic4tU1u0s4T9frkMVfnFKZ3q2ydjvN7FbbthZwootBUQsi7QkOwguEDIpD0YQoEfrdERgeI9sNuwsJmLuzWrZvVU6OwvK9xL0AOlJnro+nIfVcEyYNu3yBjcPGyIaBXp9IjfXEjPykKpcDwRBCUTgj5/5+XRdmCM50IvYann/bCe5p/s4q4srpmUJ9vttj7DY6Q59PurhqeOGjH3UeZSrGIllyanR/tCjqVH/rFPVgKoy/YcgE+cH4u9FFTKT3Tx0SQ9euK4fmQlO2657jB5WLFXySuKuaFW0QUcTWxq5EGQz8eA3eaKkPPjwvt8bO3Ysu3btUsEairCXtI4dnEUEr8dHVmYL0tOa4PMl1lij9nh8ZKQ3Q6T2YijeX7yJgtIgPVpnkJbo5v2vN/LT1kI6tUjlnBPb0rZJMmDvC62zkjhrQFsuGNweVeXx6UuZv3w7VvS5Xp75I5NnfEdReYhEr5PURDd7igN0bJFKSoI7fhhQhcKyIBlJHhK9e7PrJnmdRMw6W88q8JuS7T2W1NUNjjc0+tDrGWu/fl/7n3XF9yF/YCnIcCDFUmT5LosCv9Ily8BpHJmQcDuELlkGQ9q4KAspu8o0aooXB9BC4ExPUtI1m8uTpdOgc8vP6HvOrnPPPVHmzp1bZ8+nqrwxc+nVQB9ABrZy0inTeZhfNSxETOXtFWE+XhuJ87CneJ388tS23H9+N7LTvDgaeDrakSAI/OOzTfZGroQNkafXLpqxrb77dTCsW/R+cafB572F6tmIZGLvZ0M7DjqvddsOQz5c/8NH1jm3ZjnLk7tekNDmxNcQuQqbeCZeUCUSCWMY9jYYE7yG4cDj9pKUmIzD4bRrJuqRWc1i8EV95rF2awth06JXm0x6t8vA43Iw9/ttfLRsC73bZtK/UxZOp8HStbvp0DyVp64bysAuTTmhXSbDe2Yzf8UOvl67i/4dmuBzO3l38Qa+WZdH/w5NaJ2VzMZdJazbWcyIXtm4nRWiYeWWAqZ/sZbszERG9mm1V3+27inj4+/qItJdFWQxyq/nvXp+vTEVHmv4fwAAAP//7J13nBXl9YefM3Pr9ga7sIAUkaqoIIixK2CLJYqmW7EhliSWmBiuMTGJNYomUVFj8jMaicaoqIDYEEQQ7IBI77Dssv3WmfP7Y+5eFmm7sJ15Pp8Vb5mZ9977znve97znfE/7H4U6AFNCF+q0SVe+bif0WKA86UZkzpoEt08P1xeU2SOSTH3rlG5wydAAd49Ko2eugSmgqnUr9h6I3KcqC1b55IvZpV1GnnjFA2k/+sWfjVBI6dy5aWfbF110kQEMAEQVumW3ry5nq/LsZ1He+iY5pqiSl+HjsSuP4LxhXR3j105X5N+mpjqG1G3JCBL12Z+1bov2zrSHx62tzVgxCFgE1KmJXe7p1OnzMROezIuZgVliMAU4Cqf/i6pSWbmNbeVbqagsY0vJBqprKnYw2o5xNwgE0sjJzqcgv4iC/CIC/uAeDbuqkp6elQqAa2pvjSo88MpnLF1fznGDunDBd/oAcMezH/HGgjW8PHcl2ek+brvgCHzJgEyPaVCcn84t3zscQ4SKWqcvF2Y7n2Xh8hICPpNjB3Zh9ZZqqsNxbFUSls3akmr+PnMJNdEEN5592E7tefOTtc3U/SVu4zl/+iNX1Oz9vS51uCv0NsSKs4ZW9q5KmyyG2R0YDJCwkblrLCqjNv071bl0934uAXwe4ZgeHoZ0NUnzGizdatVFlguCgUhnQS4xvf5xtZbv2LXhBQf1GDT/s6XzTo5PnDhS3nvvvf3+TPGxYyUnnPUHIE1Qzh/kw99OZF5tVZ5aEGP+Oiv1pY/sX8AffzCYjIC3o9hxwDEUz7y3mmWba8BxYVes+qrnH7et+Gcrt2zvrPngA+09/NyXROgD9E8+XQD8DOhBPXGYquoKqiq3EU9sX/SJQDweozZcTSwWxbYtvF5v8jVJ/WsYBn5/kIz0TPyBNHzeAB6PB9u2sG1HETA3txPBwL7nmTeEhGWTk+6nX3EuxfnplFSEKakIM++bLdREEowbM5BDe+an4jje+nQdtdE4ijBv6RaG9e3MQZ0zSQt4eOfz9c7e+aAudCvIoLggg9/8az75mQHmLyvhwf99xubyWn56cj8O6Zqzg26EAtMWrmHTtqaLOUhiAzfPmHTZdDezunG4Br0t8e67rPh4avgnZ7zy3zW1C6pE5GggkLBhZZnFohKLrlkGecGGr3JFhEyf0L+Th9F9HSMUt2BbWOsMkgFkAP1ATrHEuLnPCP+F68JZ+b2OOivv4BFnZx564gWVS2a/HAO46KLnJT39Ztavn9yg6x8x+HyfiOcuwBADzh2475WlWpoZy+K8vWJ7kNjwvnncfm7/ZGph+/gMDcUw4M7/LN7+hOj4Xufx2aImrlrWXKyY90p1n6PPeRv0fCAPxxKYyX+JxSKUV5QSi0bQPQSG2rZFPB6lpraKeCKeSkU0DCO14hYRTMPEND34vH7Sghmkp2eSkZ65XwpwjWHR2m2AMLxvZ4b17czKzZWUVEbIzfBzxtAedMpyJF3jCZuVmyvJDHpZv7WGOV9von9xDn275pAZ9JKXGWDhiq2cMLiYzKCXzICXaQvX8u4X6/lqdRkJy+b8Y3pzwuCuO5VjnbZwLdM/WbtjZsR+owrG+1U1xg3rPjmylUTj2y8da1TqUCinXftEsW0aH4F2IbU9ovTvZHLd0UEM0UYPHnUrlWgCnlkYZf76BD5TdjnECckteGcE3KTClwbysghvzHz8htVWPCqm168nXfGgI9xl1FPwUGHmX5+QM2+6Oi0ataoBTAMe/W56m69qrKos3GAx+eNo6nGfogweunhIA2R62yfhWIJz75ubXIGpxvI2+N69M9Tqkq974+yzz+aII440PtxafBqGvgjiJzmuqSq2bVNathnbtvbzdxPS0zLIyMjC2b3a7ppvTb4zoIgbzz6MdaU13Pncx1i2zY1nH8bwQwpT76msjTFnySZen7+GWy84gg8WbaRHpwxG9i+iOhzn+ic+YPQR3bAVlm+sYG1JNV7TICfDyVk/YVBXstJ2NOZxy+b595fxwgfLmvYDKesSsdrBbz9+Q8Xe3+zybTreyNShUE6+8R/ZnkTsRoSJyScFIDsgjOzu4ZwBPpTGG3bn9EptApaXWazeZvPh2gRbqm08u89DqW+L46AxkAQQQ4mqqOWUhsCD4kfUl6wQlwaIIfCXs9u2QVd1XO23T6+lMkqyqEo2d44diM9rdsgbRlV5b8lW7v3fUpL5EfN71HL05Mnj2oDk6+4555xzJNzjzNFg/NoRacJTN2FVVaqqy4lEapv8uoZh4vF4SU/LwOcL7P2AZqY4P52CrCBL1m0jnrAZ1rcTV4waSFFukHjC5ncvLGDR2m3c8f1hDOmZj6ry/KxlbCkP07soi3nfbCE7zceRfTrRuzCLgqwAAZ+JrbpDcFx9NpXXcvWj72PZTdpFbIXvJjZnvf7OCxc15XkPGNpXuPEBh/D2n6kAvfPU8U9MMQx5FDgeMCoiyptL48xcEeeiQ30cWmiS6Tcat68rQpoXBnf2cGghnNnfS2VE+WhtgsUlFjUxpbTWUURL7t3XP7sPZPu0PZk+V//xt+eLtirRhLbpUqlxW/ndO2HqxNICXpOrRvV2Aoxat2nNysbyaEqCSJRP2rIxnzhxInO2FXcOq/wNONvxDW3/eWLxKJWV21JFVFT3ccK7G0zTbDPG3Gsa9OuWywXH9CKeUGYt2sjyTRXc9e+PGX/mYHoXZTGoRx5+j0lGUkxGRMgMevnP7BWUVUcZ2b+IMUd0b1Rdhd/9ewH2fhSp2QUK3D0jf/0bTBrXlOc9oHANertAWDxz8aKDfvzVqIzN5acBr4AqghG34P8+jeH3wNkDfJzS24OtjXMF1r1VELIDwui+PkYd7KS8JWyIJJQNFconmxJ8udmipMbGsh2tWdNwCkLscDl1BlFLnVKiHtN5j6pQFrYpymyboRuqjgTvlmo7+f0pD152OAflBlrdtdqciAjTP3Uq7AmoYfBoKzdpj4gIojIF9Lhvh4iKCD6vn/y8Qqcmmyq2KlYiTiweIxaLkEjEk0FsINLweBSPx0tOdr6TytZG+NWFQxnYPZdg0lj3Lspic3ktqzZX8dvnHaN++rAehKMJCnOcKrDRuCMoM6B7LleOGUhxfnqjrjnj03Vsq442SCejgSjoyqBavycUassOvDZPxx2lOiwhTh7fLctr6MU2eqtAl6QyHAAFacLw7h5GH+zF75EmX52A4xdLWErUgmhCiVlKrF74iingNSHgEfwe4ekFUb7Y7Lzh4iP8jOhutjkDqapURpWJM8PUqVsec0gevzy3H6bRvlLtGktJdYyfPDwPw1mhreuUX3zQs6G2UGFtdyijJky+TuAh9iH11onxUFRtbNvGsixstVHbwlbFti0syyIaDaf6qaqSnZVHIJDeZrIbrhwzkFMP707Qt/MEWdWpa377Pz7ilCHFHN2vkMLcNKJxiyXrynnolc94fPyJ+LyNm1xXh+M8/NoXfLikKUss6+q4zYh3Hh232TVJ+4f77bVbVEZP+GsmeH8PnKNo9/oub0PgjH5ehhWbFGa03opYVfnPl7FktLgypq+Pcwa0TCRwY1Dgbx9F+HyTM/HICnr454TheNur6HwDUVV+88IiFqwsdx7a8pMZj17+bFsfGsaOHWtUFI2+D7iRJmxs/Rxzy0qwrbwEu94+cUZ6FunpWU11uX3m0J55XH/WYRTlpu3xfapw9wsLSNhKRsBDdSTO56tK+f7xfTnv6F6N1mF/c+EaHp365f40/dtEEH487aErXmxrY0J7pGMvPTo0otMnXVMZzd0wIZ6QwwXjOiBWJ0pjK7y2JM7v343wp/fCbKl2tJn3V86y0a0UoUtm3f6zsLrcbpNBcfGE8sWm7UHdl57Uq8Mbc4DKcILVpU7gmCq1YuqXbd2YA0yZMsX2xMp+qcoj0HTlXXdITTM95OUWYtTz0FTXVFJe7lTwbOl7aXsbITc9sJMxV9gphUwEbjn/CHIz/Lz31QYWLC8hbim9C7MabcyXrNvG49MW7W/z66PAr1bPeecl15g3Da5Bb9cI7/12Iu/89Yqylcu7/AU1ixX5ObCYZJm1uAWrym3ufDvM/bPCzFwepyamTbn/tVcGdDaJJweaFWVWm6u0Zqty76wwmjRkGX6TEwbsvnpVR0FVWbalhpKKuoIbuqV87YovWrVRjeD1x26NmnbsdlX99x6Ty/eROjGZvNzOeDze7SmfsUirGnURoUtu2k4f+PWPV/OH/yxkzuId3eFej8FZww/i8F4FqIJpCIFduOn3RE0kTui5+cQTTbYTo8A0C574+uN/tcU5frukbUYnuTSasm/+xfJ5/6tdMe/Vud0G/OBxTyC+EugHmgNiKMi2iLK4xGbmijilNTYF6QZeQ/EaNKt8adADn2ywqY4pieSt2ze/bdQJV1VWlNlM/8ZZnYsIj1x2OLkZ7bNiWmOwgSsfX0hd2rbY+p33/xkugXdbtV2NYdn812PLP3rlpf97c+ERQD+a2L1QZ9SDgXQSiTiJRBwRwbISRGMR/P7gDiv4lkAV1pRU8Z0BXcgMOop20bjFa/NXMXfJZnxekyN6F+ywAs/N8JPm9/DpylIicYsTBnfdq7u+Prf+fS4lFZGmmjUpsCg7P/vE1+75aZPLzB3IuCv0Dsh7z/wwPsS/9O+RRO0wgRGg03HGbwUn8vzDtRZ/eDfM796J8NTCKFURTaliNfV0WUS48DCvU24BeHdlgkii9VyW3+bj9YnUZ+7fNYMuOYEOb8wBpn66CbtOOghmF5RnLIVQ6zZqHxARxebHqH5IM9UHFhFysvNJT89MPZdIxCkt20wi0fL6O9WRBHc9/zErN1cCTs3yq04bREF2gGUbKyj7VplTgBH9Cvn5uUMAZcWmygZ56RS497+fsmpLVapK236jKrbqT6aELmzT1fzaI+4KvYMyZ84cVn/8Znz5vFc3DSo659lENlMQalDyEfJJbjyGE7ChUnlreZxPN1pUxZS4peSnCUayVEdTLKTTvDBvrUXUgoQFvfNMCjNbP7c7nIDH528f/MYe3Y3+xZl7OKKDYMCfX/2GinACQAW5++UnL/m4tZu1ryyf/2rsoMPPetHwyClAV5ohEKAuJQ4c7XcHJRYL4/F4WzydrbI2RlbQR79uOXhMA5/XZNTh3dlWHeXYAUW79IClB7x8ubqMeUs3c8KhXUnze3dx5u08++5SZnyyloTVZK72GKI/mVGw8S2ascrjgYpr0A8Avv76FZbPe7Vk+by5MwtPmPBXX6L0HdChKCZCkOTgVxlVlm61mbfOYtqyGKu22eSnCR7DMeweA1Rlnwy814CNVcq6Smdg+GZrglP6+Fo1BUhVefHLGKvLnTYFfSa/uXBgM63x2g6qypNvr2busrK6Z7Yek7/+B81ZRrclWLngtejgk877eyKuF+AUZ2kWo+71+hHDIB7fLg0cidTi9/kxjJZNyVy8dht5mX76ds1BcPbLh/Qu2G0b/F6TI3p34o2Fa+hekMFBnbN2eQ9WR+K8+8UG/v72102p1W6h/D2S6//T6t/e2MHvstbBNegHFLWsnfOU9smJrPZm9n8s7uE5A2OWKgeJ0I2UUxxRFbbUKHPWJHh/VZz56xJJ0RUlOyDkBBzD/m033O4GEhGhfyeT91bGSdgQtRSD1t1Lt5KZAJVR5zNcdmJP+hVltIm9/eZkQ2WUh6Z+UzdQW2obZ/VIr1zV3g06wNez/2f3Hn7e/wT7MkQCNONK3ePxEYlul5YNR2oxTLPFCrSAM/dctrESv9fkkK45Tvv2cozHFNZtrebjZSUc1jOfzOCOOu1bKsLM+HQtT0xf3MTiMbxZ6tGfzr3nMgvubLITu2ynY49cLg1B7rjjDj7cWtzd8HjGKjpM4CSgkKQSaP03193gXhNygkL3LJMuWUKWX/Cbgs+TFJQxHRU5AeK2I0ATTsCHaxIs2uLkemf4hIknB0n3S6t0xIqIo9nuKOvBfT85jAFdO7a7PWHZ3PbclyxaVwWggr4dL8g87e2JP2jzhVgaw8lX/bWz6TU/EOHg5oz4jMWiVFSWYdvblZUy0rNIS8ts0YnhoB55/OLcIRRkBxv0/pKKML94ag5nHtWT80b2wpsMoKuJJrj7hQV8vqq0KZunwCIbTn9r0ri1TXlilx1xDbrLTpwx7nFvPE0GY+svBeMERAMoGSQl3fd2/O5m9bsa37L8cPfotFapYvbuijj//sLZC/Wawn9/MbKuXnyH5W8zV/LK/PUoogLhjPV5mS+9dH4bVoXbV5RRVz+TL97YIkU6STONdZpUlist27KDdnx6WiYZGdkt1qcFGHpwJyb+4KgGvd+2lRufnM3KTZWcPrQHV40ZhGEIP3tqNqs2V5KwmmpprqhKuSE6ctqkK5c00UlddoMb5e6yE68/cWV8xkN/++TwQPmFiUSsp6nWkShnoPwMeAuI4typNmhd9HxqBHA0snf+q0fq/ZVRmPp1ywe7qsJ/voqlHp9+eFGHN+ZzlpbyxsKNJMvo2Ag3vvTS9zqgMQcQZvzt4lLTNE8QNEYzRr8bhkl+XiEez/biJzW1VVRUtFyuugJfrC7j7ikLqInu3dliGEJRThoi8MaCNfz86Tnc+syHrNzUlMYcQBICF1Vuyvm6CU/qshvaTpUBlzbGAu69dwFAGFju/N0w/eZQ7kMLyjoHDMss9Bgy2FaGIvRSJU1E01DJQcgAggh+FEWJAtWKVojINoUqgWzgXEDeWBqna5YwtKunxVY05RGbeELr9Mu55OSeLXLd1kBVWbW1lnteWUrcUhwhc3lleviKyR3bSSeMyAktmV3SebAY3ndpxuh3R4CmkIqKUqKxCCJCNBaltGwTuTmdgOaPFYnGLT5bWcrH32zh2IFd9lo9rXdRNvOWbsFSm+Ubm6P8uCrIb6YXrJ/BI+PcILgWoCPfzS4tRrKKNqLz58+X1157TQAWLVokAAMHDtS0tDRefPEWnTcPBZETQyHDW1r8pqCnguAx4E+nBQl6pEWM+vy1cZ5eGEOBnHQvz10/vEXV81oKVaU2ZnHBA3O3f6/Kl5npgREv/uknTV8svA0yduxYKrqcehRqfAB4aUb3u4hQUVlGOFyT+r5FhIL8IkRaJgDUEOEPFx/NwO65e3zfGwvW8Nc3vmyufm8LPDcyf/1PQm4FtRbDNegurcao657sKWIvBvyA+Dzws2MC9Mhp3oFPVZn+TZz/LoohIgzvk8tvLhjQ4VzuqkrCVq54bCElToF3BdaK6ElZx+asmHLhha3cwpZj7NgXpKKofAzIqzSzZ1JVqa2tpqq6PNWPDcMgN6cAj8e3l6Obhk7ZQa4cM5Cj+xXu8nVblbc+Xcek15pF6VeB+RozR8147LLK5riAy65x99BdWo0ZBWtX2eggoATQWAIemRtlbYU2+75jeXR7Wdm8TH+Hm9mqKqu31nLBA3OTxlwViKhyybSHrzygjDnAlCkXavamGdNUuQgob85riQjp6ZlkZ+WlnrNtm9KyLUQiLaN0WlIRZsoHy5i/dMsuX6+NJnh8epMWWkmiAMssMc+c8dilrjFvYVyD7tJ6hEJ8svyMFYqclXxGq2PK/R+EqY41r1FfX7E9Fqwgw9fhcs+/XFfJNZM/Se6ZowoxUxIDZ95/yTut3bbWYsqUKTrjkSteQvgFjhRysxIIpJGfV7hD36qoLKU2XNXclwZg6YYKXp2/iqXrd56/THx2XlMWWqmH2KhcODNvzVbXAdzyuAbdpVUpfb0b0x++fL6IjALigMYsuH16LR+tdTTWm9qwiwibqurOqfQuTG/S87cmqsqT765i4guLHEOiCkqlwFnLvzd8tb0Xqc+OjzD94XFPAtcAsb29e7+ulCzBmptTgGEYqX5cVVVBVXV5i0S/f7JiK5NnLGbNlioSllNC+Z6XPmHl5qo6Hf+mpAqVM48pWPcpoVBTn9ulAbhTKJc2gaoy5rrJw1SYKkInkn3ztL5ezuzvxWziPPXxr9RgKyjK5KuGUpzbMEGOtoqqsqUyxj/eX807X5XUf2UVqt+fPunKeUjT1Q1v7xx0/I+NfkNO+D1wE04MR7OSSMQpr9hKIpFI9eNgMJ2M9OwWqdaWnxlgZP9CaiIJ3v9qQ1PKuSbRhGLcYfmjf3r7vvFuP2slXIPu0oZQRt3w1MFi218AAXA6aEG68MsTggS9O3dXJ/AL3lwaZ9TBXvyehhh+5cr/1mAagqoy5aajyQi0zwzOusjqFSU13PLPL6iNpRTLFPjUSFSe9OZff94cOUntnk49j5Ijv3vlnxR+Tgt4K21b2Va+hXjcCcZUVXw+P7k5ndr1lo8zL9b7lqZV/nL1Pb+w9n6ES3Phutxd2hDCjNy1y7GkP/AeyUiukhrlrnfCfLAqntKO12Q69cINFjdOreH1pXEenB3h2wuPhrg1fZ72eRuoKhsrovz+v0u47slP6xlztVEet2z7xKMLq1xjvhtKVs3XSCT2K+AeoNkNkWEIuTkFBAPOFo+IEI/H2FZegmW1W+VdFfhvAuN3rjFvfdrvtNClQzMwFPJ0Ky1+GBhHKs1IGdrVy/cGeckOGLz5TYxXF8dSq5uumQa3nxhIrryhpNZmQ6VNcZZBQdqO+e3X/q8mtT//wo0jyAy2n71lRamoiTNnaRl/m7GCxPZZjAJbEJ0w/aFx/3Fd7A3juMvv8waD2U8jfJ9mLlhVN8GsqCwjGg2nnvN4vMm99pat1rafKDA32xs9ccoD1zVrPIJLw2ifSxOXDs+iUChR4Ytfb6NnAdWAgrBgQ4K73g7z+3drmboknhr8vAZcM8JPnThWNKHcPyvMY/OiPDwnQm28nm1TJd1XJ/oBJVXtYyxSdWT3npu9lque+IRHpi2vZ8zFUviPjffQY/I2THGNecOZ9eTP43275V2i8BTNXDxXxJlY5mTnk56WmdoysawEpWWbsW2rRYLlmgAF1mHpeSVZ6e3jBjoAaDdTQZcDky5nnSWDep3X28B+APS731aFV1V65ZpcNsyfWoWrKotKbB79MOIowQWEX50UIMNXN39V/jw7ytdbHQ/hdWP6cPrhhW1yZaTqlILbVhPjjU82Mf3zzZRU7jB+KrBI4Q8+rz1l6gNXuYPrPjJmwuM5ijwPjGmpa4bD1VRWbU8rE4SsrFz8/mCb7I/b0aiqHDPjkXELW7slLttpn5FALgcMG197TTfoq8tH3zT5MknIEwjn1b0mAkcVe7l8mA9bJWXqbYUpX8RSS62DcgwyfUbqsSoclCN87dTOYPmWmpb7QA1EVYkllC1VUV76aD3TP9v87aWjgmwAfbSmxrp/9lNXu4Z8P5k26cry7/78qR9GY9aHQF9aYMETDGZgmh7Ky0uTZQ+U8opScrLz8QfS2uaKS6my1T7lrU6bPmntprjsiGvQXdo8p094aoAIU4CBdc+JwGVD/RzRxUTZbswVeHtFnE3VdqrW6yVD/Tv5UfOC23ebVpc4KWxmGxg9bVtJqPLcB2t5f/FWSqqi365+5Yz6cKtp2P+gNlAy+6mftgsfbXvg1fsvKxsz/rExahifAZm0gFH3ev3k5nambNtmwHHLV1SUkZ6Ik5GRnXLLtwmcxlz7VsGm+W6uedvDNegubRTltOse72KLcYOt9g2A36n6CT1zDX40xEdxlrlTjXXbVt5bmUiNwif38eA32WFQFBEGdDaxbTAMWLK+ivJInLygb5c125sbFfhmQxVfrK1kwYpyvlpbQcyy6z7utynDNI7JOSbjmxcuusg15M3AtEevWjVmwhNjFZ0KYtLMRl1E8Hg85OcXUV6+1Yl4F6iprcSyrR0kZFuZBMjt2Zuyn2XSuNZui8sucA26S5ti4sSJfLC1u99nPHGkhfGyQidJWjaPASf29vK9gU5E+s7GHP48O0JpbV1qm/LZRos+eRZ98k3SPIrHcA7slC4UZxtsrLKxFW546lP+fu1ReJrbogvEEzY1UYvqSII3Pt3EtM82UxNJYIikPAn1jXmaV+oH9eVh27dtfj1+JdBuc53aOiPz18+YXdrlB4I8CzR7RRURwTRMCvILKS3bnqseidSSSMRTueqtuFK3UJ4NBHhgypQL3YlkG6WN+HFcXCAUChmzS7scLZj3gR6Fk0IkAMXZwqVH+umSaeyyKpomc9Inz4/sbOmBgMcx4gfnG5zSx0vndINN1TahmeFU7vplJ/fk/KO6AvuvSlc/UtnwGNRGEsz9pow5S0vZUBZha2WUmmhip7z5umMFQQz48RAfgwpNPl5nMeXLaLJdqqhcO/2RcX/br0a67JHvXve4GRH5g7SQ8AzUKfXaVFZuIxKpTfVDj8eTNOotU4L1W9goz1VXbrhkzj8mupPINoxr0F1alVAoxDvvvCP+w340HJWrES7CUYkTgKAXTu7tZXRfL749bHKvKLN4cHaEZL0JBUpB85LWfacDcwJCv04mS0osKiLbrerYkd346XE9MET26n6vs9kigCGoZbO1Osb6sjAl1THKKmMs3VjF0g3VbKuJYdl73wsVlMGFHo7oajK8myeVUy+i/OWjKF9sSml3VCkyasakyz9yb+PmZfR1jz+tIhdLC37RtirV1eXU1lan+oxpesjJycdjtqhmggJvRQy54P2HrnCrp7Vx3JHApVWYPn06j7y+3FNj+PPMuDUZOJPkwhScALX+nQyuHh7ANPa8Yo4mlN+9E2ZrraLOlvRmzGAvrOqDwPwTcDxoBoiHBvR5n2lw01l9OfLgXDzJvXfBcemrgC1JGc/KKIs3VvPZqnKWbqympDJKLG4jwg7u872gQITkJEZQHjk73Qnoq/eZVZ1B/obXaqkXI7fOsMND3nz0+rKGXcplXzh1wl98Bp5PQPrTgtodqlBbW0l1TWW955T8vEK83hapq67A0qjJyPf+PG5bS1zQZf9wDbpLixIKheT5t5bKQUec/F1Fr1PVkSKSRrIvqsLB+QbnD/LRI8fANHbfRVWVmphyzwcRtlRp3YpaEU6Y/vAVs1D46cX/kA3pdp5pJvrboscJcglwiDNWpc69y4v4vQZZQQ9+r4kAcUsJxyxicYuYpVi2NjYCWev9qwjvYvMvG11uGPIySg6qXH9MgAGddw5vUVXWVdrcPytC1Eqd57XpD19xdqtE8x1AnHLlP9JMf/RN4FhacNxUVaKxMJWV21LbOCJCZkYOwWCzVglU0IVqWWfO+MvVm11T0T5wfyWXZueCCy6QFXqJdO62aaBt2ScgMh70EBCDZB8UoG++wUl9vAwp8gB7N5S1MZunF0b5cpNVt29eCzphZN76p+68886dD7hT5cfVDxibI9ndBD0Z9CRVKRKhL3DQt969P/eGfuuRBboMYRnIWpQ3DEPm9spbt/WvoZCeMf5pSRiJKcD3AOmTZ/CL41K7DjvxxtIY/1sUr7PhNnDDyLx1j955551usFIzEQqF+Ki0uNCC14ChtOjYqUQiYSqrylF19pREhIyMHIKBtObYU1dgNcrZ0x8Z90VTn9yl+XANuksTo8AfgNv50Y1/8awtz/UEMqpOQuReoL/jtJaU21IEcgPCNSP8dMtO2fe9ErOU+2aFWVth1x1jg056/4Wzb4psLmqgYesksIXLLntK1ngSmUbA7C9qH6fIaageieM5cE6vqYZ9W98l+bwoNoqgKlQJzEX0TVuND02Jfz0yb3M0FJpokzrhjpx01aP5Xp+vpO7FW44L0DN31wFQqsr/fRpj9uqU9G1MlMxpk66IuSv15mXM9X/robb5FUI6LTx+xuPxVK56HRnpWaSlZTahUVdUpdQ2rOEzH756RROd1KWFcO9+lyZAueOOu+Suu1ZzwsVDvP7M4PGKni4iQ4FBQB6kdF5SHN/Tw4huHnrkGnj24Frf8Uqwrdbmb/MiOxhzhXsSPfN//c7PzrP2yaj5fBCNctzxszjllLdl9oaePk9aIldtu7Ntk4FgCBIRNFEvp0xBYrYtERFqrbgnZseIpHmikaFdNujcuSN12rR7gJnf/ug7c9z7Mvrwrx8DrgDksCKTq4b7dxnRD1AZUW6fntpPV2CZYUdGvPnoBHevsxmZOHEiH20r7mOrvAEcTAuPoZaVoLx8K4lkdTZVJRhMJysztwmMugJSYsO5m5bN//DLNx53PT7tDNegu+yViRMnIiISCoWUTp1gyxZOm/D3bEsTXREKEc0XlSMQPTUZOFRfYSvVx0yB7jkG/QpMTu3jIcNvNGoPWlVZV6E8uSDKpiqr7rg48I+anNxrZt91QbyJP3qLMnrC5NNAXwfEZ8IDZ6TtNoZAFTZX29z9bpi4nXr219M3jbubKW5hluZmzIQnhiv8G+jZktdVVVRtystLiSdiqecCgWDSqO9zWpsCNaAXTp905Zs0c5Eal+bBNeguOxEKhQSQUChkg8optz6ZboTt74gySmG4qPRBKFAVEUMNVAUwdtWdNCmpekY/Lyf38RJIxnrty6Czptzm3vfDJLZXC7VA7v/oprNuq+hVpO3d3fy9Xz9nVldUp/J8R/Xxct4g726/K1XlyQUxFq5P1I2+FsqZ0x8ZN61FGnwAEwqF+KisuJ+lfAxktOS164LjyrZtIZGIp57zeLwU5Bcm0xwbdS8oSsTAOHreS3/6omzDUteYt1Pa9wjosl+EQiEJhSbqCb/5reEv6zoMGClCT4XuKN0QugJZOANW/XSdnfqNs80Mlq3kBA0OKzLplWvQM8egc4aBdx+F0lUVQ+CFL+K8syJWt5WtQAy4Jiz9npn18PH2ns/SPhg7diyVRaNGKUwDEVX481lpBDx7jvR/aE6EJSUpj8XiwvL3B/3zn/90B+VmRlU57fonDlWMF0Fb1P1e59mqrConHK5KXdo0PeTm5GMYnoYadQViKvyopKTwpU+fO9vtN+0Y16AfQIRCIVFVnbutazfb9vQSsUfgRFYfCtTPgdltv3CUrJz64+k+IcNfp8JmMLCTwSEFJtlBZ5N5H1YKO7GuwuLphVE2VG5flgNrVbn4OwXr3w11sAIRQ05/2Fd4cHAZ0B3g8qF+hhabe1ylr9pmc8+sSOopQZ4pyo9d/kzo2g4x0WnrnHb944fbKv8BetMKY2p1TSXV1RU79JG83E54PL693X+K49X56fT8dc/jZkm0e1wt9wOGP8ucrenHi3C3wqEiVmBPQiuSFE9J2I6GemGGY6wPKTDpliVkBgx8hlPcxACMXez17qstd1Yf8MbXcaZ+Ha8vpKKgS2yRE7+Tt25LKLSL1LR2TnXYjhXCx0A3QBZuSHBk152L0NQhIvTMNbhmRIBH54YxRAT0JxtKzecB1/XeAhydt+HTudu6HG/bxkdAMS1s1NPTMvF6vGwr35oy4DW11Xsr6qJAQixOW51R865rzDsG7gq9YyMnX/fEQR7hWuBcxy24s2mwbCU3aNArz6BLhkFOUMgLCvnpQrZfCHhkjwIvTYXjXhcWb0nw8uI4q8vrFpgKSBThd5ow/zzj0Uur2/t++e4YO3YsFYWjjgBZgCCq8PBZafj24HYH5zf80/t1kf8ALKlINwd/9MdLLfc2b35CoRDzSjsXJdT7LMJJtPCXrqrEYlEqKkuxbZuM9CzS07N2t0JXIIpw+eL08ufW/uFm15h3ENw7vQNy6OW/kS5p3Q8CHQ9yI6hZ35CbArlpQn5QGFrsYUiRSWag6dzk+4KtytYa5bWv48xbm6hvr21gqcL4GZPGvd3iDWsFin/2MxkUH7AEOASc9L7vH7Zn96mqUhFR7ngrnNSzVwX5h7d2xaVTn/yDO2C3EKdPeKzYwngX6EMrGHVFsS0L09zjHno1Ij+cnrfuNUIht290IFyXe8dDioLdbwZuBckFpG5csVUZ09fHsQd5yA4KXoOd8pxb2parKgmFf34S49MNCeJ2qg1JeVT5vQj35GzMrG7ZlrUex6xdqxWFA36nwjMCsqrcJmGD19z9MSJCTlD43kAfL3wZI/ktXhQPHnQNEG6hph/wjMjfuH5eaddTEiofJoNKWwyn5oBgeHYrN6/ANtvQ48vXrF3Ew791jXkHw12hdyDGXP/EEFUeAE6kXlR6r1yDY3p4GFrsIeiF1v7Z6/bIS6qV91clmLMmTu32DHInUAdeRrlvkLdq3oMP3qSt3eaWZvT4x/pjGJ8CfkPg3tPTSPPu/TuIJJRfz6ilJpmiDCz3en2Dpz5wcbR5W+xShxP9Pnm4wks4e+ptAVXlc5TxMx4dN7u1G+PSPBxYo2QH5aiJz5k5ZZVnCMa/SVbtUnXSx84d6GV4N89O1btaC1WlPKK8vTzBzOVxJ6dWUqloCnxjCD9f/9XAN76Y+Z0DNkr7+98PGaWdijcKdALkrP5ezjjE1yAPSiyh3PR6DbajSqsKV+dsyn58ypQLm7nVLvWQ0ddNPh3RlwB/K7fFEphjxWPnvfW38WW4ojEdlhYrBejSPKiq5JZVhwRjChAkaR6/29/Hb04KMKKbJ1nbu/VX5XFL+fvCGHe9HeGt5XFnVBFRnH3y1YKcEbc9R/XVz6ceyMYcYMGCZ21R67w6EZFXF8cwGigA5/UIhxamdtNEHHH9dkOnTiqTJk2SJ598UhytfOfvjjt+a4wfP95Q1dafme4dXXdE9zcEzsdRM2yRa+LcS3a9/68GHq4tLDjlraKSUlxj3qFpDzeGy24468a/pkUTnjtFuAHwAnRKE84f7OOwot3nLrcoqmyqVuasSTBrZZyItcOrFjBfkcnqt//91m9/XENamjvgJDltwsOmrcEShFyA6472M6hw72EvqhBO2PxqephIou4Zmbzyg6FXffPJkW3o+1VuvvleuffeW/S0G54usKzEUJyqd50FuiHaSZEsAY86ZeirQUtANqqwSZT1Al+Vbu68/KyBn9htUZNg+PkPe3K6BkPAzSTvURo37tb/vaTe4wiwGXQDyAagDNiG6jqEldiyysYosT2+srcfKrXgxjb0u7s0F21gxHdpPMp5P/uLtybuvVPgVk1WL8sNCrceHyA70PqOF1WlKqq8vjTO+ysT33at28B6RW6bUbD+3/zmN3ZHTUPbT2T0hCeeBf0+iJw7wMvovruXgq2PAp9uTPDYR5G691dbXvOQt+6/dGNrTvRUlS5dunDURXcEauPBAtPUM8G+BuFQ1e2ldNnl2FRnk5yCPMn/sQU2qep/LdFJPmSr4bHKhmVtYpcldFsFldE3TO6NrRNARgMZKCaCoDh+F0FFURVsFEXEErQGWI/qcgz5BluW2qLrEd1cY1ZvHZNdaakqd955pw0bBbq4RvsAxx1F2yG9hp0ufUd+7x7gJsAEp5b4tSMCjlZ6axpHVWIW/OuzGF9stqiN76DwpsBS0JvjfnPWOwOo4PLLW6+t7YDRE564GfgjYOSnCb8fldZgn2ncUq5/rbbuoYLOqpw/7oS5c1unf6gqJ138R68/K+9qFeMnoP1BMtiVlHC9tah+67k9fP44sAH40DQ8E/tY1d888siENmLkLiEU6snbqwxTvD39hlHu9fqDgjo3q622GnjsmF9sKfdZMXtNQgLZ1qmFW2xV5YwzzmDEiOHgA84eC//5Tyt/Hpe2iGvQ2xk9r71HDjFyr0CYRDLY5rAik3FH+TGlFQPfVNlYZTN3ncU7K+LEE9TvXTbKPEQnWz59fuZ9V9Ym985d9sLJ103O8oiWA2Ir3H96kAx/wzwwqsr6Spvfv5uShbVBT5w+6cpZzdXeXTFx4kTeFzG8pcVX4Lie+yRfSkXtGQJFmQad04WsgJCd/EvzCh7DqY8bjkNV1KY8rFRGlbKIsqHSJhx3jq9HMlNCXwMee/excW9Go20jKNTFpTlxe3g7IhQKMXtr8YkivEVyZZ4XFCaeEsRrtM6ApaqE48pLX8WZs2Zn17pAmcI107uV/ZdbbnFd643k5ptD8lmkeDYwEuDILiZXHOVv8G9tq/LYvCifb7IAFJWnMje+ceWLL77Y7EGHoVCIv/zfj2TIme8dKpY9E5F86o05XgPSvMKZ/Z1MjIAXbBtA9tpNbFVMcQz9mgqb15bEWVJiYakzQUhS5xVaqLZ1foala4cUbda2uNfu4tIUuKNru0E5dfzkTobBXKAXIF0yhZuPCxLwtLwxV1ViCXj+C8e1XhOr71pXBflSkFAi4J05c1igkosuatH2dRxCjL6+27movgRIl0yD208M4GmEFO+yMov73g/X9ZGEIING5q9b2tyGbcz1T4mt1m8Frsep2gc4g845A7wc3sWkIN1oMlnh2pjN2grl3ZVxPl6f+JbHSksReVRE7pz20BUHdAaFS8fFNejthNFX/MlHMO9F4ExAgl7hhmP89Mg2WmVlvqLM4v4PIs6KageZVv1YlccTfu9z79x3Sa27It9/Ro+fPBjD/ggkzWdC6JQgOQGjwV+tAA/ODvP11pQm7LygUXvsKw/dkNjLofvMqddNLjBE/wz8ANQAIeiBEd09nD3AR7ABIjn7jCobqmymLonz2WYLy673AkxH7WumTbpqpeuCd+lotH44tMteySjsLpKWeypwBknz+dPDffTIbp3UNFXli80WtgKCgtoI1SJy9vS+kZEzJo178p37L3WNeRMRrTEXgVQCRC2oiNR5khuGrcrZA3yp6HGBI2ols1fzpCQrh/3sYY8h+oIqPwQM1PnPb04OcuGh/uY15gAidM1ytiZ+dWIQIyV+LAIyWjHnnTb+b51v+OUfm7cdLi4tjGvQ2wHHXnhHX1V5nuS4NKTIZHDh7ktqNjciwsfrU4s7Bbkj4fN0nXZGt6lcf727T97EGCoK8jJOTALPLIzupMG/J0SEg3IMMnz1tq9t65dc9ViT/1Dfu+l/vqJ48F/AiSKOYuHRPbw8eFYG2YG97403JSJCl0zhwTPSGN3XS1KkR0TIV9PzyeKaTv1DoZDbWV06DK5Bb+NcoCo23AJkAJKfJlw93I/HbL1xaGuNzebqlB+z1lIefPu+S6s47bRWa1NH5p1nLlHD0FtJTujWVdpEE41bXZuGcN3IQF3AmKBccprP3GPB7MYyceJEqU5suRw4P6nuxil9vFx8pA+f2VpR5oLPI5w70MsVwwKYRvJJ6IJaCz8s6za4FRrl4tIsuAa9jVN94xPDUbkUnNrYpx/ia1XtRgU+WJ1IBWWJ8NHMR66I7OKdoqpyzz33GBMnTjQmTpxofP7550kZT5fGclTu+mpgDYDXEOavT9StOBtMt2yhOMu55Z28Lr26Kdv4wdZuJwGPAAYIB+eZjD3UT9sI1RGGFpvcPToNT8qoS0BVXz//+ntaW2vdxaVJaAt3mstuOOeWf6SFw9FZwBGAHFpkcvVwf6PcrU2NZSv3fxBh5TYnwAq4QUW+QLUfSmcRsgXJsNEMwA/qIVWmV6IC1aiWIbJZYXHMsua+95ertmy/gtsld01IRk8o/itwJSBj+no5Z0DDVOPqUFX+uyjOjGWOtLjC6zMmGWfB5fs9RwyFQjKntPgD4BiAHtkGt50QbJSLXZNScaYhWLZiiKACtq1NtrpXVb7eavHwnGg93Rp9I0D0/FcmTdjFxNTFpf3g1kNvsyjh8OSTgMMA8Rhw7vbAplYjYUNZODX+C/CQ1K0Uk41TdHsR9l212BBFFVHBbxo6esLkpQovo/K6ZT25pPKyw0rOmjoVN1+4PiGFycuSkdry1RaLcwZ493pUfUSE7xzkYfo3cSc8DE4/9vpYcNZDWrs/BjMUUuaUTr4J9Oi6HPKLDvPhzPcadt5oQlm1zWbOmjhLSmzCCcVjQFGGwfE9PfTrZJIT2P8iQyJCvwKTy4b5eXpBBFtFQMZE1f9dGP0fmO4KHrm0W1yXexvlhGufSQf+QXLSNaizSZfM1q+aVhZ2lLrqIbv52+nFFI69FwTB0aHvL3CbiM40PdbXef/8dPKs0q6B5v4s7Q1b9EmS9+zqbTZ+T+P7QmGGkBPcflyaeh4pKNi/ds2q/HshyC0goqpcMMhHr9yGpVOqKqu2Wfx6RpiH5kSYt86iMqrELUcZbuU2m2c+ifHbt8N8U9o06eMiwtBiD33yUusZ0xb55ynjx+Y2yQVcXFoJd4XeJlH85hM/BskFyPAJlw5tuDpYc7Jym52yzrY6btGcgNApXcgNChl+Ic0j+D2CzwSvCaY4a7WEDdEEVMeV8lpHBGRdpc12cTm8guSiXGaKXDR6whOv28oT6zce9PbiF0cf8GIgg4/0li9aEN8CdDYNmLksznG9GrdKB+GSI/38eU7E8aIopxx10VMZb/6F6n1p03XXKUtjk+9A6AyIzyMc1c3ToL5qqzJzeZzXlsSJWXt+byQBD3wQ5vuH+TmhV8POvycEuH6kn9DbYUprFQGvaXAT6B3uto9Le8U16G2QEd+b4gG5rO7x0d09+MzWbNF2Di300DUzjiqMPTRA71yDoNcxyHZKdlOo53PfCWci4LweTcDiEotZq+JsqFK2hetqT5EBjDVEz+/edfXLPW988pdvjL/sG/omz38Asn7qVLRo9F0CDwMyfXmc43t5Gx0k2TldSPeKUzjHoNhGB4PO3ZfvdanxxDBUriZ58I8P95Pha8iRysfrEvz3qxjawOuKCM99FqU4y+Dg/P0XVDINOLGXlxe/ioHj+bjshDv/fdd7E4nt14ldXFoJ1+Xe5lhJTteKM4FhgIBycu/9X5E0FZl+4bYTgvzyxCADOhkEvIIi2Oo41kWkbn92tzhBfc5xPo8wpIuHa48O8JuTAtxwTICijFS3FBAT+F7CsheMfnjywydf/HyDzEVHZMqUKWrAvLrHCQtqYo13XOSlOYVPAJwynvZd3PqnfehgKmpzL2CoKv07GRxV3DCxo883WTzzScONeR2GITz3eYz4Xlb0e0JVUVVMQxh9sBfv9lGwi7ek4ofceuu+n9zFpRVpI+s+lzpOvWGwX+D/gCJATurtZVg3D21pVWoagmk07X6+iOAxhYJ0JwiqT75BNAEbq2xERMSpLHeU4Y+N6T3i7EUrTj9yHe+912TXby/0HvZdWwz5CZARs2B4Ny+Z/sb+DsLgQpO3lifqtjp69Ymnvbp83qsbG3qGUCiE79Blt4rI5SRTKn96ZICC9L2vEUTgyY+jScW7xlMVVQYWmuSnNX49osCqcpvp38T5z1dx/rcoVt/dLyIy4GDNfWz53FcP+C0el/aHu0JvUygeWw8GDgbEm3QJtiVj3hIYhjCgk8nVI/zcenyQTulG3TdgAMMF3hq9rdsFJ45/urEbyO2e/M6Zm4ByULUUKiN2o/PRAXKDwqDOyfm8ioDe0PCsAuWD0q7fQbmDZOccdbCPvvl7H05U4eN1CdZW7Lu9FIG/L4g2+nPHLeW1xTHunRXh3ZUJNlXZhBM7CeAWxMNatM+Nc3FpRVyD3rYQG7kQSAfolC7kpx1YxrwOSbrle+WZ3H5igPMHeeuKbAgQRHnWZybu4wCT7uzP1wryPogK8MqSOPsy4RPg2J4eJJWCIN+fW9p1yMSJE/d67Jjxk4cayMuI00/TfXBW/4blxCvKlC+jjW7vt9lcbRNthNvdQPnLRxFeXxpnL/OAXI/X6LWfzXNxaRVcg96GGHPVU+nAtYAocHo/X5OVlmyvCBDwCKf08XL7iQE6p6e+Dw/KhNGlXR8/kIx6KASGZd1J0gx/U2phSuNX6CLC0K4e+ualhgCfjbw3b1uPHrtb+V5/zxwZNeGJc9TgJaAAIMMHPz82gL+B4bUbq2xqmiDkzGcKJTUNW+Xbqjy5IMaSkga93xDouT9tc3FpLVyD3oawffZxCvkAWX5heDc3CSGFCAflmEw8JVjn2k2uLeXy0aXFTx0/4fEDxP0eYm7n2o2gEXBkYJfuY362ApcP8xPY3s2yLOzZY26a3J2oAhcAyi/um+o59dq/Fi5Z+9XjAi8CPZxrww+G+OmS2bBAOFUlHHfSF/cXERq0B6/AijKbeesaXinWhmNuu+0PB8wk0aXj4Br0NoOKoGfUjSKDO5tYtitaVZ+66PlrRvgZ1tWs2/sU4CcBuOJAWalnPpkFyH8BrStlu8/n8gtXDPNjby/aUkyCL0b/YvIbo68fc+/oCZMf/WzVhg8M07MIuJxkIK3fhAkj/RzZtXGTzvWVTRdr1pAfuyJs89CcRiu6Dnv55XP3oUUuLq2La9DbCGed9RogR5Acp/oWtE6t87aOiBDwCBcP9XNoYV2ShpogD44q6Xp8qzauhVi79nIbWAoqiFAZsbH3ITAOnO9zYGeTi49IZQMKQjYwBuXnwDUiDAfyALFtpV+Bo9PeN79xSTKK43JvCmyFrMCe7w8FPtloNdojINB1yff/7c6mXdodrkFvC6hS1m2jD6cIC7bSoIjhAxURwRRnpe7sqQuATwx5+Ds/funAcL0ri1GxAL4usTH2IxNCRBjZw8Pdo9PICTjfraruIOXrMSDTD784LsiN3wlSmCEpeb/GYDXRAj2WUDrtJUXOY8BrS/Zpw75t5Ym6uDQQd5O2jZDp5ViFIEBeUBqUz3sgI+LoyV5xlJ+73o5gGgjo4PTcsttQvWtfjE17wsB+3cIwBCgNKz4Pe5VP3RMiQm4QQqcEWV9ps7bCZlvYKZBSmCF0yTIoTDfwmpJ6f6OvAXTOaJp+nZfmeGr2xMfrEtTG9+n0WwlNVAjt08EuLq2FazXaAKNGz8BGvlv3+LCiXbsyBcW2FcturL5Wx0QEumUZnDeoblEuBuivRt34VNdWbVgLMPYIT42IloMTlj1vbaLRErC7wu8ReueZHN/TKc96Zj8vw4o9dMsyU8Z8f+ievf9DjgI/OnzPJcxVYW4jAuG+dYFPLr30afcWc2l3uAa9DZCZWyKinFr3+LAiT0qe0lYlElemLolxx4wwN0yt5fpXa7htWi2vLI7V008/MBERxvT1Upj0aKjiE9s+paOXXn3zzUxQ/QNJXZQXv4ohTWLSHURIyvg2rSJgmtcp1rM/ZPuFQ/ayJZWw9dtVARuMCjOffvqyA/iucmmvuAa9DVCRE05D6ASIIU7xDBH4crPFg7Mj3PJmLa9+HaekVknYYCOUR5TXl8a5aWoN//osSuIAjogXhMFFTlcWQRSubuUmNTtTplyoqDG17nF1TGnrXUBEKM4ySPPtn0UfVmwS9O75HPtu0NUWWLFvLXNxaV1cg94GEK8ESaYDeQ2oiilPfhzlkblRlpXaxO1dR+gIzr7pB6sT3DsrQlX0wJSfFoFRB3tTaX4CR35Y2jnY0fdAVexqcMqe2gpbqtu4RcfZHvjhEN8+bxkVZRqcP9i3V6+BiOxjTIGUGdjL9qlxLi6tjGvQ2wCGaftUnQDFmAX3zQrz8foEjRGJW1Nu89u3w8QtPSBd8Nl+oShzu+oZ+M7+9a9bs0XNT7Q6c7MiKwGNJpTqWNv/4UWEw4pMhnQx2UlFfS8kLOXKoxo2GVDdpyB8gDLv/7d351FylWUex7/Prerq7iSdhSSQkCgjKurIcpQ4BlmdgLgwMw4KzMxxHIEB0TEM6uhx8EgqCLOgo6zxkDMqHh3lDCcSHSSGNSELISwhBmIIKJ2E0OkknbWT6tRdnvnjVneabHR3Kunq27/PHzmnujtVt6ruvb/7vvd537ch3+NFakRqiQK9BniUqzPzANJTXFc7s5fay3Dv78pZL/A+MIPTxnUN2jDHz7vppmK/bc7RsGZk6x7DS6SrhNG22/u0UMvRFphx2SkFJgzveaiPbDBumNLIuGE9WwfdoIfrsr+Bm/s1pw9ddxjjBUT6jwK9Bji+zxmq74m8eG3E71qiAXFiryb3dDGbvY99VD9uzlFx+cjtYDwEJABPNId9bpYebSMbA75yVj3vHps/ZJGcGbx7bMC/ntvAxOE9C3OA+jx9WV51aV3z+PlZL6iU7FKg1wDLxSEEVbsBfu+KMqU+jtgZyOq63aMwGBQTzHjo36dyBbhqU0yhd5O39ashdQFfmtzAN85t4KTRAYk7YeKEcXoxevqEHDdd0MjUyQ0Mb+h5mEOla/+4XG869RPMb3/ggYsGZyGKZIImlqkFcX4Pubhq3XxbS86C5ogL3zm4JryK3tArYX2bUmQAKRaLnHnm17cNff87I6CuLjA27Ez60jLtN7kAJo7I8ZWzGilFTilM51gYWrD9xr27O2awZXf6d00NxsiGIJ2X4QBhf96JeeY3h7T2oFjQ4dc0DLlvMB0vkj0K9BoQRnGpkKOqAfSrlWU+ODHHyMbBcYIy0hN9tx/s6LeNOYreds0ptnFpx3zg/MDg6dciPnpS728eHwn77nmHilUnXSb3YLO/7So7K1oj/m9VyOb2BEiHdp4wKuDSUwqcMDIgf4Aq0ktPKXDHk4dcf90NWnO5aOqcWz6T+YtAybYB1EGXXQ2j/zYaMSa8FDieKjYRGuuMd47uXVflQDbrxZAdexzAwe96/wkNz69cubK/N+uIuvi003xdafjxwBR3t5GNAaeN65+FfTrrNsIEnns95pE/hDzxasST6yKeb4lYtz2hHDlN9UZjPp0Gp3NRmX23t/O5coGxZF3ED5buYelrMaWwc8KbvUuoLlkXsaPDOfW43BtqCMyM0Y3GiEZjRWuEHfzQ+su1jaUVmxf9ttofichRpRZ6DfibD632xW0TZgGTqvm8T66N+MS7BsWtZDpiWLs9JkhP6HEc++z77vvT/t6sI65YLPKRL83cSWVmt91lxzn6HcfuzpJ1MUvWRfxxS0wYH6g+LybxdCz6sIJx3DBj3LCA0UONkQ3G0IKRDyCM06Bu2ZmwcmPMxl2H7jJPHBY0R0RJOsa9e1d9EBhnn5AnjGD278v7rrzmwHUP3fHafJg+uKpIJZMU6DWgWJzGBdf+8D5zv5kq9pps3pW2Xia/Jduh7sDT6yJyVpn81Flz9rEt2x5lej9v2VESBMvxJAFya7YlR7XQ3d3ZtMv5wdIOWnbuXWPgYNvQ2SveXnbatzh/2JImrFEp1a9cjfT2LZjBkrUhJ40JmPyW/H4t/tMnpvfTN+29OCi7c+uWcnKnwlyyYuBUz2Sa8dJz73oVWEFvZ9s41LMazF0dZn5aWHfn2dfTxUnccTfu7u9tOpoKYfS0Vy4Et3Y4Q95kFbJqSTy9YPz3+SU27Dy8BYM6exWsD2HexYyfPV9m/Y6kshYC4OlFw82P7+4e5g58J0z8m8/O/Lyq2iUzFOg1Yu3CsxznkWo/75aSs7U0MCYc6av2MntbeuaY+6LBNJb49GNbyoaVID2g12xLqrhMy4HFifPwyyE/XVamo4aGSCYOD6wKMYMwcWb/PuS7CzpoT5dFTyPe/cvl0etvmDfj6hracpHDp0CvGYYn/hOgqrNUlWNYuTG7E18liXProo5u90bt5YfuvOrJ/tymo+/LBvwP4Gbw61XlI3oPPXFn8dqI2SvLR/zCoS+WtcRsane+/ViJuS9XZk50cHybwTkP33nVbfOKRbXMJXMU6DVkfesxKzFmVvssOXd12Kt54QcKd+fFjTGv7+i6YCkDH+vHTeoXZrd6EHA7ld7q59bHh71E6cG4O4vWRPx8+Z6anZUuMJj+eInNu9OOfAd3YzHG5GcaWxZprLlklQK9hqyc9enEo+QWjDaqeC99S4ezui17DZLdoafrgKfB4u7+SMtLpTWD7YS9ceOnzBObQmWfmTjCiI9A09mBzbud+18MqfXPON67u+/Aud3j8scfvv3q1W233FCLnQoiVaFArzEP33zpGsenUyn6rQYDVmzI1vzuceLcvbRM686uj6kU5+quXjF3anbvLxzEjBknewKf7nx8/tsLVV9xz92JE+c/5pcoRQNhP3IHNpjblIfv/McvPzLjn7b39xaJHGkK9FozahQ7t62cAfyCKob6C60xuRrtIu2NtHrZuXdFmT9s6RrsnOB89ZxRa9bXajfwkeQO5l7f+Tg4Qkf18y3pxC41znG2G3adx/n3zL3zymfABsIViMhhU6DXoCU/vTVOLPkq7suq9ZwbdjprtycDfq10d5i9MmRhc0RlNF7iMDtubPjRYKps7+6KK35sZvZo5+MFr4ZV7xCPEvjJs3tqsgiuwoE9wCwz/+Dc0evveHjG5dtq/daASDVpb69hn/z6T0bsKpWfNTiRbt+Ve9/qkSaOCPjmuQ1HtJjJvXOmMsPpHJtsh/2S7mk3+11P7WHVpq5edQdbeMYx686bPn169ooEeuHCr8x8q4c0g1mcOHd/cmjVpn91T4d/PfRyrTbPPXHshSSXu+jRWy9/TS1yGaw0U1wNO63xj9sXlyacC/ZD8AvAAuh7Hm/YmbCh3RnXVN1A7wzxhc0RL7TGbC05YQKFHIxqNE4+NseHTsgT2P5zdvfkuQGatyb8fHmZ13Z05bYDjwUknx3sYQ5gyZAdTqkVGJcPjN9tiDm1SnO6O/DHtposTXCHp8z9pqjc8NjjMz9bgiv6e5tE+o1a6APAlH++oymXNNwBXAo0dv68+1C0nk4Gd96JeS49pXCohSp6zD2dtGZZS8wDq8qVhTMO9HcwrB4+fXKB943PU9+Lmcx2dCQsXBPx4Eth98rt2J3f1gXxPzx4+zVth/1GMuDcL95Ffa7wM/C/A7OGPEybMoQR9YffO5I3uGp2O7VzuvAQWO5wW/6DQ34+55VXEgbp7RaR7rTa2gDw6lNzynX5kb8ePu6tT5vZXwEFKv2KTrqm9NCCEfagEfXq1oT3HptjVGPfyyc6W+RzVof89zN7eKE1JkoO3nNgli64sbwlZtXmmHP+pI7ED7yGdefz5wJj7ishdy3Zw0ubu2Y+S9+y8x3Dr5o8umX3vHnz+vw+suTyT/wZ28P6BzqS/DfNIXJs1aaYc95WB4f4rN+MOzy5NmT5hproBEkc1hh+2cb6jmltGzYtW3LjtY72ARGgdi65pSeKRZvSOn5CLm9fAPsSeFP3GM0HTmBGYOk43PAg5+C3jgi4/rzGPhU4uTvPvR7zm5dCXt+Z9GkHGjPEmHpGA2OHWlfQdIb4y20xS9ZWuu47uuYH79zUlwy/bu4x6+cyfZAsvNIbxaJd2Hb8xY7dR+XYPr7JuGJSPcc3pRdwvQ32wOBrc3ax45BLih9Rnd/9g4bfHdX5449+7+p2nbpE9qejYkBy+8i1P3q7eXKj41PAxrJP0VwugLogHfcWJZ33oq3r96eOz3Hl6QXq8z1rqbs7HRHMfTnkoVfCw66Wb6qHr53dSCEHW0uwenPME80hm3f5vi19B9Yb/HTu6PXXA6h79eAuueQS2zHuIzc6fI1KT04+gMtOLfD+43MMqTN6c9gbcM2v+qW73YFWsGcMm/b5D1+x7OKLcZ2yRA5OR8dA5c55l/8iGDm2PGJ3R/g5YBrQBB7s97V2lsW/oTzeOeW4PF+c3EA+SFv07k5ykAp6M+P7izpYvbl3xVFJZdUrA+pyRlB5rcShLpdWw0eJ71sD4DgJRtnh5sb6uhmvPr1g24r5P1T1cg985qu32cby0GvBv1f5Os2AQt742El5LnxHXVez981a7LvKCd/4bYmjNJeMV0ZGtLvbv1jk97Ulvu3ZmVcryEV6QEdJFlzpTGm4Z1g+F52VJPw5xkcNfw9Yjjf5jgs5GFJnDC0YQ+uMhjoo5IxCLv1dIW8UAmgrOS9siAhjCJ2ukDaDnKWTmQSkAWHWbbgaaVMrdghjJ4wPOqetV/7dDTxmgc1yC+b829+funHSpEnV+qQGjWKxaIs2TzjfjLuAd1R+bA405uGkMTlOGpPjPccGjG8K0mGGlW6X7iHf2p5w07wS0ZErcvd09KFtwJll+APsys9b875d5VVTp+oCTqQXFOhZ486P5zXbL+5/9EScT4F/DJgIHAOMoJK77F2Cug8vsX8zvo87koOXgE1ga4Bf5iz42ZzFP9jCRRe5utYPl/Otb307eGrr+P9y4zJgXOV76vq6Eofh9fDe43KcfGyO44blaCxAXWDUBc6m3c53F3Rfza5qysBGd34PPnPY+jG/vP/+v3aNIRfpOwV6ZjnF4nQebBsbDImiYU2NTcM6OuJR5PwDBmeATQLexd5hcAFpwHbv3ty37956uMt45z+2t0GeXkS4J5i9gvG4wSNxFDxrxvbylmHtS2d/LiqVdu//snJYpk2bxuK2iWMC4y8cisBbuv36DR92YGntRS6wrmGR7eWqZGxSea3N5v5jsHvDOFhLfWHrmDMbkv+95JJqvIbIoKYz56BS6dV2mDbtRlu4fkKexuCYnMVjDEYbHOPGcJxh7t4INJnZEJwGjAagAahz94KZ5dL8txxG7O5JYBa60+FGyWAX+HaDLW7W5gmtFrA+H+Vf/81dn9sJYHYPcHl/fRiDkPPhK28rFIYMmRS7nR8YZwIfAEbu84d9PS/sk/y+A+wF0jHjy8CfSZLhL549dlVYLE47jJcRkQPRESVv4gaD6XDdrcbI7VAsdg5/PxCjWDRmfMHZ+J/A99R9WtOm29W3nJprfm3zGZ7wcYOz3Xw8WKOlF295hwJO3qzbrZq0YDHECTGPINiDJx2Y7cR9lWMLMXti/t1fXH799ddTbBkHd39ehW0iR5iOMJFBzXnqKZgzZzoLtk4giC1vgedxy0OSc7eAtPfd3vCfILH0FnxsELt5lHTUR8tmfcKnTr2T5uZp3HOPTi8iR5OOOBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBijQRUREMkCBLiIikgEKdBERkQxQoIuIiGSAAl1ERCQDFOgiIiIZoEAXERHJAAW6iIhIBvw/tAh6yAkcwcsAAAAASUVORK5CYII=" 
            alt="Logo" 
            className="w-35 h-35 object-contain rounded-xl" 
          />

          <div>
            {/* TÍTULO NETO CON LA MISMA TIPOGRAFÍA QUE TE GUSTÓ */}
            <h1 className="text-xs font-black uppercase tracking-widest text-white font-mono flex items-center gap-1">
              PUNTO DE VENTA
            </h1>
          </div>
        </div>
        <button onClick={() => window.location.href = '/pos/caja'}
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 14px', color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          💰 Caja
        </button>
        {/* ========================================================= */}

        {/* CONTROLES DE PESTAÑAS */}
        <div className="grid grid-cols-2 bg-gray-900 p-1 rounded-xl border border-gray-800 w-full sm:w-80 h-fit">
          <button type="button" onClick={() => cambiarDeModoLimpiandoTodo('modo1')} className={`py-2 text-xs font-bold rounded-lg transition-all ${modo === 'modo1' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>📦 Encargos</button>
          <button type="button" onClick={() => cambiarDeModoLimpiandoTodo('modo2')} className={`py-2 text-xs font-bold rounded-lg transition-all ${modo === 'modo2' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>⚡ Tienda</button>
        </div>
      </div>

      {mensaje.texto && <div className="max-w-4xl mx-auto p-4 rounded-xl mb-6 text-sm font-semibold text-center bg-green-900/40 text-green-400 border border-green-800">{mensaje.texto}</div>}

      {ticketListo && (
        <div className="max-w-4xl mx-auto p-4 bg-blue-950/40 border border-blue-900 rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-blue-300 font-medium">El cobro cerró de forma exitosa. ¿Quieres enviarle el comprobante digital al cliente?</span>
          <button onClick={enviarWhatsApp} className="bg-green-700 hover:bg-green-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all">
            💬 Enviar Ticket por WhatsApp
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6">
        {modo === 'modo1' && (
          <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4">
            {!clienteSeleccionado ? (
              <div className="relative">
                <input type="text" placeholder="Buscar por nombre de cliente o teléfono..." value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:outline-none" />
                {clientesFiltrados.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-2 z-20 divide-y divide-gray-700">
                    {clientesFiltrados.map(c => <div key={c.id} onClick={() => seleccionarClienteEncargo(c)} className="p-3 text-sm text-slate-200 hover:bg-blue-600 cursor-pointer flex justify-between"><span>{c.nombre}</span><span className="text-gray-400 font-mono text-xs">{c.telefono}</span></div>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-between items-center bg-gray-800 border border-gray-700 p-4 rounded-xl">
                <div><p className="font-bold text-white text-sm">{clienteSeleccionado.nombre}</p><p className="text-xs text-gray-400 font-mono">{clienteSeleccionado.telefono}</p></div>
                <button type="button" onClick={() => setClienteSeleccionado(null)} className="text-xs text-red-400 underline">Cambiar</button>
              </div>
            )}

            {totalApartadosFragil > 0 && (
              <div className="bg-yellow-400 text-black rounded-xl p-4 mb-4 font-bold text-center">
                ⚠️ ATENCIÓN: Este cliente tiene {totalApartadosFragil} artículo{totalApartadosFragil > 1 ? 's' : ''} APARTADOS / FRÁGIL — agrégalos al pedido antes de continuar
              </div>
            )}

            {clienteSeleccionado && bloquesEntregas.map((bloque, idx) => {
              const anticiposDeEsteBloque = listaAnticipos.filter(ant => ant.entrega_id === bloque.entrega.id);
              if (idx === 0) {
                const anticiposGenerales = listaAnticipos.filter(ant => !ant.entrega_id);
                anticiposDeEsteBloque.push(...anticiposGenerales);
              }

              const subtotalArticulos = bloque.pedidos.reduce((acc, p) => acc + (productosSeleccionados[p.id] ? Number(p.precio_venta) : 0), 0);
              const totalDescuentoAnticipos = anticiposDeEsteBloque.reduce((acc, a) => acc + Number(a.monto), 0);
              const subtotalFinalEntrega = Math.max(0, subtotalArticulos - totalDescuentoAnticipos);

              return (
                <div key={idx} className={`border rounded-xl overflow-hidden ${bloque.atrasada ? 'border-red-900 bg-red-950/10' : 'border-gray-800'}`}>
                  <div className={`p-3 font-bold text-xs flex justify-between items-center ${bloque.atrasada ? 'bg-red-900/40 text-red-400' : 'bg-gray-800'}`}>
                    <span>ENTREGA: {formatearFecha(bloque.entrega.fecha_entrega)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {bloque.pedidos.filter(p => productosSeleccionados[p.id]).length} artículo(s)
                      </span>
                      {bloque.atrasada && <span className="bg-red-700 text-white font-black px-2 py-0.5 rounded text-[10px]">ATRASADA</span>}
                    </div>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {bloque.pedidos.map(p => (
                      <div key={p.id} className="p-3 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={!!productosSeleccionados[p.id]} onChange={(e) => setProductosSeleccionados({ ...productosSeleccionados, [p.id]: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-gray-800 border-gray-700" />
                          <div>
                            <span className="font-medium text-slate-200">{p.descripcion}</span>
                            {p.apartado_fragil && (
                              <span className="inline-block bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded ml-2">
                                ⚠️ APARTADOS / FRÁGIL
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-slate-400">
                          {p.cantidad > 1 ? `x${p.cantidad} · ` : ''}${Number(p.precio_venta).toFixed(0)}
                        </span>
                      </div>
                    ))}
                    
                    {anticiposDeEsteBloque.map((anticipo, aIdx) => {
                      const fechaTxt = anticipo.creado_en 
                        ? formatearFechaCorta(anticipo.creado_en) 
                        : 'Fecha reciente';
                      return (
                        <div key={anticipo.id || aIdx} className="p-3 bg-green-950/20 border-t border-gray-800/40 flex justify-between text-xs text-green-400 font-medium">
                          <span>↓ Anticipo vinculado ({fechaTxt})</span>
                          <span className="font-mono font-bold">-${Number(anticipo.monto).toFixed(0)}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="p-2.5 bg-gray-900/80 border-t border-gray-800/60 flex justify-between text-xs font-bold text-gray-300">
                    <span>Monto de esta entrega</span>
                    <span className="text-blue-400 font-mono">${subtotalFinalEntrega.toLocaleString('es-MX')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(modo === 'modo2' || (modo === 'modo1' && clienteSeleccionado)) && (
          <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">🛒 Agregar producto de tienda</h2>
            <input type="text" placeholder="Buscar por nombre o código de barras..." value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const exacto = todosProductos.find(p => p.codigo_barras === busquedaProducto)
              if (exacto) { agregarProductoAlCarrito(exacto); setBusquedaProducto(''); return }
              if (productosFiltrados.length === 1) { agregarProductoAlCarrito(productosFiltrados[0]); setBusquedaProducto('') }
            }} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-xs focus:outline-none" />
            {productosFiltrados.length > 0 && (
              <div className="absolute bg-gray-800 border border-gray-700 rounded-xl mt-1 z-30 divide-y divide-gray-700 w-[calc(100%-60px)] max-h-40 overflow-y-auto">
                {productosFiltrados.map(p => <div key={p.id} onClick={() => agregarProductoAlCarrito(p)} className="p-3 text-xs text-slate-200 hover:bg-blue-600 cursor-pointer flex justify-between font-medium"><span>{p.nombre}</span><span className="font-bold text-blue-400 font-mono">${Number(p.precio_venta).toFixed(0)}</span></div>)}
              </div>
            )}
            {carritoTienda.length > 0 && (
              <div className="border border-slate-800 bg-gray-950/40 rounded-xl overflow-hidden divide-y divide-gray-800">
                {carritoTienda.map(item => (
                  <div key={item.producto.id} className="p-3 flex justify-between items-center text-xs">
                    <div><p className="font-semibold text-slate-200">{item.producto.nombre}</p></div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => ajustarCantidadCarrito(item.producto.id, -1)} className="px-2 py-0.5 font-bold text-slate-400">-</button>
                        <span className="px-2 text-white font-mono">{item.cantidad}</span>
                        <button type="button" onClick={() => ajustarCantidadCarrito(item.producto.id, 1)} className="px-2 py-0.5 font-bold text-slate-400">+</button>
                      </div>
                      <span className="font-bold text-white font-mono text-right w-16">${(Number(item.producto.precio_venta) * item.cantidad).toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-xl space-y-4">
          <div className="border-b border-gray-800 pb-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Resumen final</div>
          <div className="text-xs space-y-2 font-medium">
            {modo === 'modo1' && desgloseTicketEncargos.map((item, idx) => (
              <div key={idx} className="flex justify-between text-gray-300">
                <span>Entrega {formatearFecha(item.fecha)}:</span>
                <span className="font-mono text-white">${item.montoNeto.toLocaleString()}</span>
              </div>
            ))}
            {subtotalTienda > 0 && <div className="flex justify-between text-gray-300"><span>Productos extra de tienda:</span><span className="font-mono text-white">${subtotalTienda.toLocaleString()}</span></div>}
          </div>

          <div className="flex justify-between items-center bg-gray-950 p-4 rounded-xl border border-gray-800 font-bold">
            <span className="text-xs text-gray-400">Total a cobrar</span>
            <span className="text-xl font-black font-mono text-white">${totalGeneral.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
          </div>



          <button type="button"
            onClick={totalGeneral === 0
              ? () => procesarCobroFinal({ metodo1: null, monto1: 0, metodo2: null, monto2: 0 })
              : () => { setModalRecibido(''); setModalMonto1(''); setModalDosMetodos(false); setMostrarModalCobro(true) }
            }
            disabled={loading || (modo === 'modo1' && !clienteSeleccionado) || (modo === 'modo2' && carritoTienda.length === 0)}
            className="w-full font-bold text-xs py-3.5 rounded-xl uppercase tracking-widest transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {loading ? 'Procesando...' : totalGeneral === 0 ? '✅ Marcar como entregado' : '✓ Registrar pago'}
          </button>
        </div>
      </div>
    </div>
      )}
    {renderModalCobroPOS()}
    </>
  );
}
// rebuild viernes, 29 de mayo de 2026, 23:49:57 MST
