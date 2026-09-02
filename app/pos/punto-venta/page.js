'use client';

import { useState, useEffect } from 'react';
import TiendaTienda from '../../components/pos/TiendaTienda';
import EncargosEntrega from '../../components/pos/EncargosEntrega';
import { calcularTotalesCarrito } from '../../../lib/pos/tiendaUtils';

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

  const [turnoEstado, setTurnoEstado] = useState('cargando')
  const [turnoInfo, setTurnoInfo] = useState(null)
  const [turnoOcupado, setTurnoOcupado] = useState(null)
  const [colaborador, setColaborador] = useState(null)
  const [retiroPendiente, setRetiroPendiente] = useState(null)
  const [horaActual, setHoraActual] = useState('')
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false)
  const [vendedorTienda, setVendedorTienda] = useState(null)
  const [vendedores, setVendedores] = useState([])

  const [modo, setModo] = useState('modo1');
  const [domicilios, setDomicilios] = useState([])
  const [cargandoDomicilios, setCargandoDomicilios] = useState(false)
  const [cobrandoDomicilio, setCobrandoDomicilio] = useState(null)
  const [pagoDomicilio, setPagoDomicilio] = useState({ metodo1: 'Efectivo', monto1: '', recibido1: '', metodo2: 'Transferencia', mostrar2: false, recibido2: '' })
  const [domiciliosBadge, setDomiciliosBadge] = useState(0)
  const [mostrarFormDom, setMostrarFormDom] = useState(false)
  const [formNuevo, setFormNuevo] = useState({ cliente_id: '', direccion: '', colonia: '', referencias: '', celular_contacto: '', celular_contacto_adicional: '', fecha_preferida: '', horario: '', notas: '' })
  const [entregasSeleccionadasDom, setEntregasSeleccionadasDom] = useState([])
  const [pedidosClienteDom, setPedidosClienteDom] = useState([])
  const [anticiposClienteDom, setAnticiposClienteDom] = useState([])
  const [guardandoDom, setGuardandoDom] = useState(false)
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

  useEffect(() => {
    const datos = localStorage.getItem('cliente')
    if (datos) {
      const c = JSON.parse(datos)
      setColaborador(c)
      setVendedorTienda(c)
      verificarTurno(c.id)
    } else {
      setTurnoEstado('sin_turno')
    }
    const intervalo = setInterval(() => {
      setHoraActual(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }))
    }, 1000)
    setHoraActual(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }))
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    if (turnoEstado === 'activo') {
      verificarRetiroPendiente()
      const intervalo = setInterval(verificarRetiroPendiente, 10000)
      return () => clearInterval(intervalo)
    }
  }, [turnoEstado])

  useEffect(() => {
    if (turnoEstado === 'activo') {
      cargarDomicilios()
      const intervalo = setInterval(cargarDomicilios, 60000)
      return () => clearInterval(intervalo)
    }
  }, [turnoEstado])

  const verificarTurno = async (colaborador_id) => {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const res = await fetch(`/api/caja?fecha=${hoy}`)
    const data = await res.json()
    if (data.ok) {
      // Agrupar todos los registros del sistema por colaborador
      const porColaborador = (data.cortes || []).reduce((acc, c) => {
        if (!acc[c.colaborador_id]) acc[c.colaborador_id] = { nombre: c.clientes?.nombre || 'Colaborador', registros: [] }
        acc[c.colaborador_id].registros.push(c)
        return acc
      }, {})

      // El último registro de cada colaborador determina si tiene turno activo
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
        setTurnoInfo(turnoActivoSistema.masReciente)
      } else {
        setTurnoEstado('caja_ocupada')
        setTurnoOcupado({ nombre: turnoActivoSistema.nombre, desde: turnoActivoSistema.masReciente.creado_en })
      }
    } else {
      setTurnoEstado('sin_turno')
    }
  }

  const verificarRetiroPendiente = async () => {
    const res = await fetch('/api/retiros?estado=pendiente')
    const data = await res.json()
    if (data.ok && data.retiros?.length > 0) setRetiroPendiente(data.retiros[0])
    else setRetiroPendiente(null)
  }

  const confirmarRetiro = async () => {
    if (!retiroPendiente) return
    setConfirmandoRetiro(true)
    await fetch('/api/retiros/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: retiroPendiente.id })
    })
    setConfirmandoRetiro(false)
    setRetiroPendiente(null)
  }

  const HORARIOS_SEMANA = ['10:00am - 1:30pm', '3:00pm - 7:00pm']
  const HORARIOS_SABADO = ['10:00am - 1:00pm', '2:00pm - 5:00pm']
const horariosDelDia = (f) => {
    if (!f) return []
    const dia = new Date(f + 'T12:00:00').getDay()
    if (dia === 0) return []
    if (dia === 6) return ['10:00am - 1:00pm', '2:00pm - 5:00pm']
    return ['10:00am - 1:30pm', '3:00pm - 7:00pm']
  }

  const cargarPedidosClienteDom = async (cliente_id) => {
    if (!cliente_id) { setPedidosClienteDom([]); setAnticiposClienteDom([]); return }
    const [pedsRes, antRes] = await Promise.all([
      fetch(`/api/cliente/pedidos?cliente_id=${cliente_id}`).then(r => r.json()),
      fetch(`/api/anticipos?cliente_id=${cliente_id}`).then(r => r.json())
    ])
    if (pedsRes.ok) setPedidosClienteDom(pedsRes.pedidos.filter(p => p.estado?.toLowerCase() !== 'entregado'))
    if (antRes.ok) setAnticiposClienteDom(antRes.anticipos || [])
  }

  const toggleEntregaDom = (entrega, index, entregasClienteDom) => {
    const yaSelec = entregasSeleccionadasDom.find(e => e.fecha === entrega.fecha)
    if (yaSelec) {
      setEntregasSeleccionadasDom(entregasSeleccionadasDom.filter(e => e.fecha !== entrega.fecha))
    } else {
      const primeraNoSelec = entregasClienteDom.findIndex(e => !entregasSeleccionadasDom.find(s => s.fecha === e.fecha))
      if (index > primeraNoSelec) return
      setEntregasSeleccionadasDom([...entregasSeleccionadasDom, entrega])
    }
  }

  const crearDomicilio = async () => {
    if (!formNuevo.cliente_id || entregasSeleccionadasDom.length === 0 || !formNuevo.direccion || !formNuevo.colonia || !formNuevo.fecha_preferida || !formNuevo.horario) {
      alert('Llena todos los campos obligatorios'); return
    }
    setGuardandoDom(true)
    const subtotal = entregasSeleccionadasDom.reduce((s, e) => s + e.total, 0)
    await fetch('/api/domicilios/crear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: formNuevo.cliente_id,
        entrega_ids: entregasSeleccionadasDom.map(e => e.entrega_id),
        direccion: formNuevo.direccion, colonia: formNuevo.colonia,
        referencias: formNuevo.referencias, celular_contacto: formNuevo.celular_contacto, celular_contacto_adicional: formNuevo.celular_contacto_adicional,
        fecha_preferida: formNuevo.fecha_preferida, horario: formNuevo.horario,
        notas: formNuevo.notas, subtotal, total: null, costo_envio: null, estado: 'pendiente'
      })
    })
    fetch('/api/clientes/actualizar-direccion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: formNuevo.cliente_id, direccion: formNuevo.direccion, colonia: formNuevo.colonia, referencias: formNuevo.referencias, celular_contacto: formNuevo.celular_contacto }) })
    setGuardandoDom(false)
    setMostrarFormDom(false)
    setEntregasSeleccionadasDom([])
    setFormNuevo({ cliente_id: '', direccion: '', colonia: '', referencias: '', celular_contacto: '', celular_contacto_adicional: '', fecha_preferida: '', horario: '', notas: '' })
    setPedidosClienteDom([])
    setAnticiposClienteDom([])
    console.log('[Domicilios] Domicilio creado — recargando lista...')
    cargarDomicilios()
  }

  const cargarDomicilios = async () => {
    setCargandoDomicilios(true)
    // Usar fecha LOCAL (no UTC) para evitar desfase horario en México
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    console.log('[Domicilios] Cargando para fecha local:', hoy)
    const res = await fetch(`/api/domicilios/listar?fecha=${hoy}`)
    const data = await res.json()
    console.log('[Domicilios] Respuesta API:', data.ok, 'total:', data.domicilios?.length, data.ok ? '' : data.mensaje)
    if (data.ok) {
      setDomicilios(data.domicilios)
      setDomiciliosBadge(data.domicilios.filter(d => ['pendiente', 'confirmado', 'en_camino'].includes(d.estado)).length)
      console.log('[Domicilios] Estados:', data.domicilios.map(d => `${d.clientes?.nombre}: ${d.estado} (${d.fecha_preferida})`))
    } else {
      console.error('[Domicilios] Error:', data.mensaje)
    }
    setCargandoDomicilios(false)
  }

  const confirmarCostoDomicilio = async (d, costo_envio) => {
    await fetch('/api/domicilios/actualizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, estado: 'confirmado', costo_envio, total: (d.subtotal || 0) + costo_envio })
    })
    cargarDomicilios()
  }

  const cambiarEstadoDomicilio = async (id, estado) => {
    await fetch('/api/domicilios/actualizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado })
    })
    cargarDomicilios()
  }

  const cancelarDomicilio = async (id) => {
    if (!confirm('¿Estás seguro de que quieres cancelar este domicilio?')) return
    await fetch('/api/domicilios/actualizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado: 'cancelado' })
    })
    cargarDomicilios()
  }

  const getTotalAnticiposDom = (d) => (d.anticipos_detalle || []).reduce((s, a) => s + (a.monto || 0), 0)
  const getTotalAPagarDom   = (d) => Math.max(0, (d.total || 0) - getTotalAnticiposDom(d))
  const fmtDom = (n) => `$${(n || 0).toLocaleString('es-MX')}`
  const fmtFechaDom = (f) => {
    if (!f) return ''
    const meses = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
    const d = new Date(f + 'T12:00:00')
    return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
  }
  const fmtFechaShortDom = (f) => {
    if (!f) return ''
    const d = new Date(f)
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  }

  const registrarPagoDomicilio = async (d) => {
    const totalAPagar = getTotalAPagarDom(d)

    if (totalAPagar === 0) {
      for (const entrega_id of (d.entrega_ids || [])) {
        await fetch('/api/pedidos/actualizar-estado', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, estado: 'Entregado' })
        })
      }
      await fetch('/api/domicilios/actualizar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, estado: 'entregado' })
      })
      setCobrandoDomicilio(null)
      setPagoDomicilio({ metodo1: 'Efectivo', monto1: '', recibido1: '', metodo2: 'Transferencia', mostrar2: false, recibido2: '' })
      cargarDomicilios()
      return
    }

    const monto1 = parseFloat(pagoDomicilio.monto1) || 0
    const monto2 = pagoDomicilio.mostrar2 ? totalAPagar - monto1 : 0
    if (monto1 <= 0) return

    const totalPago = monto1 + monto2
    let restante = totalPago
    for (let i = 0; i < (d.entrega_ids || []).length; i++) {
      const entrega_id = d.entrega_ids[i]
      const prodsEnt = (d.productos_detalle || []).filter(p => p.entrega_id === entrega_id)
      const antEnt   = (d.anticipos_detalle || []).filter(a => a.entrega_id === entrega_id)
      const subEnt   = prodsEnt.reduce((s, p) => s + (p.precio_venta || 0), 0)
      const antSumEnt = antEnt.reduce((s, a) => s + (a.monto || 0), 0)
      let porPagar = Math.max(0, subEnt - antSumEnt)
      if (i === 0) porPagar += (d.costo_envio || 0)
      const aplicar = Math.min(restante, porPagar)
      restante -= aplicar
      if (aplicar <= 0) continue
      const prop = totalPago > 0 ? monto1 / totalPago : 1
      const m1 = Math.round(aplicar * prop)
      const m2 = aplicar - m1
      if (m1 > 0) await fetch('/api/punto-venta/pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, vendedor_id: colaborador?.id, pagos: [{ monto: m1, metodo: pagoDomicilio.metodo1 }] })
      })
      if (pagoDomicilio.mostrar2 && m2 > 0) await fetch('/api/punto-venta/pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, vendedor_id: colaborador?.id, pagos: [{ monto: m2, metodo: pagoDomicilio.metodo2 }] })
      })
      await fetch('/api/pedidos/actualizar-estado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: d.cliente_id, entrega_id, estado: 'Entregado' })
      })
    }
    await fetch('/api/domicilios/actualizar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d.id, estado: 'entregado' })
    })
    setCobrandoDomicilio(null)
    setPagoDomicilio({ metodo1: 'Efectivo', monto1: '', recibido1: '', metodo2: 'Transferencia', mostrar2: false, recibido2: '' })
    cargarDomicilios()
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

  const getTiempoTurno = () => {
    if (!turnoInfo?.creado_en) return ''
    const minutos = Math.floor((new Date() - new Date(turnoInfo.creado_en)) / 60000)
    const horas = Math.floor(minutos / 60)
    const mins = minutos % 60
    return horas > 0 ? `${horas}h ${mins}m` : `${mins}m`
  }

  const iniciales = colaborador?.nombre?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CO'

  useEffect(() => {
    Promise.all([
      fetch('/api/clientes/listar').then(r => r.json()),
      fetch('/api/productos?stock=true').then(r => r.json()),
      fetch('/api/entregas').then(r => r.json()),
    ]).then(([clRes, prRes, enRes]) => {
      const clientes = clRes.clientes || [];
      setTodosClientes(clientes);
      setTodosProductos(prRes.productos || []);
      setTodasEntregas(enRes.entregas || []);
      setVendedores(clientes.filter(c => c.rol === 'admin' || c.rol === 'vendedor'));
    });
  }, []);

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

    const res = await fetch(`/api/punto-venta/cliente?cliente_id=${cliente.id}`).then(r => r.json());
    const historialPedidos = res.pedidos || [];
    const pedidosMercaditoConSaldo = res.mercadito || [];
    const pagos = res.anticipos || [];

    setListaAnticipos(pagos);
    const totalAnticipos = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
    setAnticiposDisponibles(totalAnticipos);

    setPedidosMercaditoCliente(pedidosMercaditoConSaldo);
    const seleccionMercaditoInicial = {};
    pedidosMercaditoConSaldo.forEach((pm) => { seleccionMercaditoInicial[pm.id] = true; });
    setMercaditoSeleccionado(seleccionMercaditoInicial);

    const bloques = [];
    // La entrega que viene en la respuesta manda sobre la lista cargada al
    // abrir la página: si el admin marcó "En tienda" hace un minuto, el POS
    // del colaborador ya lo sabe sin recargar (y al revés).
    const entregasFrescas = res.entregas || [];
    const entregasIds = [...new Set(historialPedidos.map(p => p.entrega_id))];

    entregasIds.forEach(eId => {
      const datosEntrega = entregasFrescas.find(e => e.id === eId) || todasEntregas.find(e => e.id === eId);
      const pedidosDeEstaEntrega = historialPedidos.filter(p => p.entrega_id === eId);
      if (datosEntrega) {
        const hoy = new Date();
        const fechaE = new Date(datosEntrega.fecha_entrega);
        const diasDiferencia = (hoy - fechaE) / (1000 * 60 * 60 * 24);
        const atrasada = diasDiferencia > 7;
        bloques.push({ entrega: datosEntrega, pedidos: pedidosDeEstaEntrega, atrasada, bloqueada: datosEntrega.estado !== 'en_tienda' });
      }
    });

    bloques.sort((a, b) => new Date(a.entrega.fecha_entrega) - new Date(b.entrega.fecha_entrega));
    setBloquesEntregas(bloques);
    // Lo que todavía no está en tienda arranca sin palomear y no se puede
    // palomear: no debe poder entrar a un cobro ni por descuido.
    const entregasBloqueadas = new Set(bloques.filter(b => b.bloqueada).map(b => b.entrega.id));
    const seleccionInicial = {};
    historialPedidos.forEach(p => { seleccionInicial[p.id] = !entregasBloqueadas.has(p.entrega_id); });
    setProductosSeleccionados(seleccionInicial);
  };

  let desgloseTicketEncargos = [];
  let sumaEncargosTotalNeto = 0;

  bloquesEntregas.forEach((b, idx) => {
    let subtotalArticulos = 0;
    b.pedidos.forEach(p => { if (productosSeleccionados[p.id]) subtotalArticulos += Number(p.precio_venta) || 0; });
    const anticiposDeEsteBloque = listaAnticipos.filter(ant => ant.entrega_id === b.entrega.id);
    if (idx === 0) {
      const anticiposGenerales = listaAnticipos.filter(ant => !ant.entrega_id);
      anticiposDeEsteBloque.push(...anticiposGenerales);
    }
    const totalDescuentoAnticipos = anticiposDeEsteBloque.reduce((acc, a) => acc + Number(a.monto), 0);
    const subtotalNetoEntrega = Math.max(0, subtotalArticulos - totalDescuentoAnticipos);
    if (subtotalArticulos > 0 || totalDescuentoAnticipos > 0) {
      desgloseTicketEncargos.push({ fecha: b.entrega.fecha_entrega, montoNeto: subtotalNetoEntrega });
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
        b.pedidos.forEach(p => { if (productosSeleccionados[p.id]) textoArticulos += `• ${p.descripcion}\n`; });
      });
      carritoEncargoTienda.forEach(linea => { textoArticulos += `• ${linea.nombre} (x${linea.cantidad})\n`; });
    }
    if (modo === 'modo2') {
      carritoVentaTienda.forEach(linea => { textoArticulos += `• ${linea.nombre} (x${linea.cantidad})\n`; });
    }

    const infoTicket = {
      telefono: clienteSeleccionado?.telefono || '',
      mensajeWhatsapp: `¡Hola! Tu entrega de *Denog USA Compras* ha sido registrada con éxito. ✅\n\n*Artículos entregados:*\n${textoArticulos}\n*Total cobrado:* $${totalGeneral.toLocaleString('es-MX')} MXN\n\n¡Muchas gracias por tu preferencia! 📦✨`
    };

    try {
      const bloquesOrdenados = [...bloquesEntregas]
        .filter(bloque => !bloque.bloqueada)
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
          vendedorTiendaId: vendedorTienda?.id ?? null,
        }),
      });

      const resultado = await res.json();
      if (!resultado.ok) throw new Error(resultado.mensaje || 'Error al cobrar');

      setMensaje({ tipo: 'exito', texto: totalGeneral === 0 ? '¡Pedido entregado! Cubierto con anticipos' : '¡Cobro registrado con éxito en caja!' });
      setTicketListo(infoTicket);

      const prRes = await fetch('/api/productos?stock=true').then(r => r.json());
      setTodosProductos(prRes.productos || []);

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
        style={{ position: 'fixed', inset: 0, background: 'var(--w80)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'var(--sup-2)', border: '1px solid var(--w10)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 70px var(--w70)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Cobro · {tipoLabel}</div>
              <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 800 }}>{nombreCliente}</div>
              <div style={{ color: 'var(--tinta)', fontSize: 44, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginTop: 6 }}>{fmtP(totalGeneral)}</div>
            </div>
            <button onClick={() => setMostrarModalCobro(false)}
              style={{ background: 'var(--w06)', border: '1px solid var(--w10)', borderRadius: 10, width: 36, height: 36, color: 'var(--w50)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
              ✕
            </button>
          </div>

          {/* Toggle un pago / dividido */}
          <div className="grid grid-cols-2 gap-1.5 bg-gray-950 p-1.5 rounded-2xl border border-gray-800 mb-5">
            <button type="button" onClick={() => setModalDosMetodos(false)}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${!modalDosMetodos ? 'sobre-color' : 'text-gray-400'}`} style={!modalDosMetodos ? { background: 'var(--verde)' } : undefined}>💳 Un solo pago</button>
            <button type="button" onClick={() => setModalDosMetodos(true)}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${modalDosMetodos ? 'sobre-color' : 'text-gray-400'}`} style={modalDosMetodos ? { background: 'var(--verde)' } : undefined}>✂️ Pago dividido</button>
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
              className={`h-15 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2.5 transition-all ${puedeConfirmar && !loading ? 'bg-gradient-to-b from-green-500 to-green-600 sobre-color shadow-lg shadow-green-500/30' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}>
              {loading ? 'Procesando...' : `✅ ${puedeConfirmar ? `Confirmar cobro · ${money(total)}` : 'Confirmar cobro'}`}
            </button>
          </div>

        </div>
      </div>
    )
  }

  const renderModalCobroDomicilio = () => {
    if (!cobrandoDomicilio) return null
    const d = domicilios.find(dom => dom.id === cobrandoDomicilio)
    if (!d) return null
    const totalAPagar = getTotalAPagarDom(d)
    return (
          <div onClick={e => { if (e.target === e.currentTarget) setCobrandoDomicilio(null) }}
            style={{ position: 'fixed', inset: 0, background: 'var(--w80)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--sup-2)', border: '1px solid var(--w10)', borderRadius: 24, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 70px var(--w70)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Cobro · domicilio</div>
                  <div style={{ color: 'var(--tinta)', fontSize: 20, fontWeight: 800 }}>{d.clientes?.nombre}</div>
                  <div style={{ color: 'var(--w30)', fontSize: 11, marginTop: 2 }}>📅 {formatearFecha(d.fecha_preferida)} · 🕐 {d.horario}</div>
                </div>
                <button onClick={() => setCobrandoDomicilio(null)}
                  style={{ background: 'var(--w06)', border: '1px solid var(--w10)', borderRadius: 10, width: 36, height: 36, color: 'var(--w50)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ✕
                </button>
              </div>
              <div style={{ background: totalAPagar === 0 ? 'rgba(74,222,128,0.08)' : 'var(--w04)', border: `1px solid ${totalAPagar === 0 ? 'rgba(74,222,128,0.2)' : 'var(--w08)'}`, borderRadius: 16, padding: '14px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'var(--w40)', fontSize: 12 }}>Total a cobrar</div>
                <div style={{ color: totalAPagar === 0 ? 'var(--verde)' : 'var(--tinta)', fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtDom(totalAPagar)}</div>
              </div>
              <div style={{ background: 'var(--w02)', border: '1px solid var(--w05)', borderRadius: 14, padding: 14, marginBottom: 20 }}>
                {(d.entrega_ids || []).map((entrega_id, idx) => {
                  const prodsEnt = (d.productos_detalle || []).filter(p => p.entrega_id === entrega_id)
                  const antEnt   = (d.anticipos_detalle || []).filter(a => a.entrega_id === entrega_id)
                  const subEnt   = prodsEnt.reduce((s, p) => s + (p.precio_venta || 0), 0)
                  const antSum   = antEnt.reduce((s, a) => s + (a.monto || 0), 0)
                  const porPagar = Math.max(0, subEnt - antSum) + (idx === 0 ? (d.costo_envio || 0) : 0)
                  const entInfo  = todasEntregas.find(e => e.id === entrega_id)
                  const fechaEnt = entInfo ? fmtFechaDom(entInfo.fecha_entrega) : String(entrega_id)
                  return (
                    <div key={entrega_id} style={{ marginBottom: idx < d.entrega_ids.length - 1 ? 12 : 0, paddingBottom: idx < d.entrega_ids.length - 1 ? 12 : 0, borderBottom: idx < d.entrega_ids.length - 1 ? '1px solid var(--w05)' : 'none' }}>
                      <div style={{ color: 'var(--verde)', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>📦 {fechaEnt}</div>
                      {prodsEnt.map((p, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ color: 'var(--w45)', fontSize: 11 }}>• {p.descripcion}</span><span style={{ color: 'var(--w50)', fontSize: 11 }}>{fmtDom(p.precio_venta)}</span></div>))}
                      {idx === 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ color: 'rgba(245,158,11,0.7)', fontSize: 11 }}>🚚 Envío</span><span style={{ color: 'var(--ambar-t)', fontSize: 11 }}>{fmtDom(d.costo_envio)}</span></div>}
                      {antEnt.map((a, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ color: 'rgba(16,185,129,0.7)', fontSize: 11 }}>✅ Anticipo {fmtFechaShortDom(a.creado_en)}</span><span style={{ color: 'var(--verde)', fontSize: 11, fontWeight: 600 }}>-{fmtDom(a.monto)}</span></div>))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 5, marginTop: 5, borderTop: '1px solid var(--w04)' }}>
                        <span style={{ color: 'var(--w30)', fontSize: 10 }}>Por pagar</span>
                        <span style={{ color: 'var(--rojo-t)', fontSize: 11, fontWeight: 700 }}>{fmtDom(porPagar)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              {totalAPagar === 0 ? (
                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'center' }}>
                  <div style={{ color: 'var(--verde)', fontSize: 15, fontWeight: 700 }}>✅ Pagado con anticipos</div>
                  <div style={{ color: 'rgba(74,222,128,0.6)', fontSize: 12, marginTop: 4 }}>Sin cobro adicional — solo se registrará la entrega</div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Método de pago</div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      {['Efectivo','Transferencia','Terminal'].map(m => (
                        <button key={m} onClick={() => setPagoDomicilio({ ...pagoDomicilio, metodo1: m, recibido1: '' })}
                          style={{ flex: 1, padding: '12px 8px', borderRadius: 14, border: `2px solid ${pagoDomicilio.metodo1 === m ? 'rgba(74,222,128,0.5)' : 'var(--w08)'}`, background: pagoDomicilio.metodo1 === m ? 'rgba(74,222,128,0.12)' : 'var(--w03)', color: pagoDomicilio.metodo1 === m ? 'var(--verde)' : 'var(--w40)', fontSize: 13, fontWeight: pagoDomicilio.metodo1 === m ? 700 : 400, cursor: 'pointer' }}>
                          {m}
                        </button>
                      ))}
                    </div>
                    <input type="number" value={pagoDomicilio.monto1} onChange={e => setPagoDomicilio({ ...pagoDomicilio, monto1: e.target.value })}
                      placeholder={`Monto en ${pagoDomicilio.metodo1}`}
                      style={{ width: '100%', background: 'var(--w06)', border: '1px solid var(--w12)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 16, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                    {pagoDomicilio.metodo1 === 'Efectivo' && (
                      <input type="number" value={pagoDomicilio.recibido1} onChange={e => setPagoDomicilio({ ...pagoDomicilio, recibido1: e.target.value })}
                        placeholder="Con cuánto pagó"
                        style={{ width: '100%', background: 'var(--w04)', border: '1px solid var(--w07)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginTop: 8, fontVariantNumeric: 'tabular-nums' }} />
                    )}
                    {pagoDomicilio.metodo1 === 'Efectivo' && pagoDomicilio.recibido1 && (() => {
                      const montoEfec = pagoDomicilio.mostrar2 ? (parseFloat(pagoDomicilio.monto1) || 0) : totalAPagar
                      const recibido = parseFloat(pagoDomicilio.recibido1) || 0
                      const feria = recibido - montoEfec
                      return feria !== 0 && (
                        <div style={{ background: feria > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${feria > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 16, marginTop: 10, textAlign: 'center' }}>
                          {feria > 0
                            ? <><div style={{ color: 'var(--verde)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Dar de cambio al cliente</div><div style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtDom(feria)}</div></>
                            : <><div style={{ color: 'var(--rojo-t)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta cobrar</div><div style={{ color: 'var(--rojo-t)', fontSize: 36, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtDom(Math.abs(feria))}</div></>
                          }
                        </div>
                      )
                    })()}
                  </div>
                  {!pagoDomicilio.mostrar2 ? (
                    <button onClick={() => setPagoDomicilio({ ...pagoDomicilio, mostrar2: true })}
                      style={{ width: '100%', background: 'transparent', border: '1px dashed var(--w15)', borderRadius: 12, padding: '10px', color: 'var(--w35)', fontSize: 12, cursor: 'pointer', marginBottom: 16 }}>
                      + Agregar segundo método de pago
                    </button>
                  ) : (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ color: 'var(--w40)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Segundo método</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        {['Efectivo','Transferencia','Terminal'].filter(m => m !== pagoDomicilio.metodo1).map(m => (
                          <button key={m} onClick={() => setPagoDomicilio({ ...pagoDomicilio, metodo2: m, recibido2: '' })}
                            style={{ flex: 1, padding: '12px 8px', borderRadius: 14, border: `2px solid ${pagoDomicilio.metodo2 === m ? 'rgba(193,85,58,0.5)' : 'var(--w08)'}`, background: pagoDomicilio.metodo2 === m ? 'rgba(193,85,58,0.12)' : 'var(--w03)', color: pagoDomicilio.metodo2 === m ? 'var(--marca)' : 'var(--w40)', fontSize: 13, fontWeight: pagoDomicilio.metodo2 === m ? 700 : 400, cursor: 'pointer' }}>
                            {m}
                          </button>
                        ))}
                      </div>
                      <div style={{ background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 12, padding: '12px 16px', color: 'var(--marca)', fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: pagoDomicilio.metodo2 === 'Efectivo' ? 8 : 0 }}>
                        {fmtDom(totalAPagar - (parseFloat(pagoDomicilio.monto1) || 0))} en {pagoDomicilio.metodo2}
                      </div>
                      {pagoDomicilio.metodo2 === 'Efectivo' && (
                        <input type="number" value={pagoDomicilio.recibido2} onChange={e => setPagoDomicilio({ ...pagoDomicilio, recibido2: e.target.value })}
                          placeholder="Con cuánto pagó (2do método)"
                          style={{ width: '100%', background: 'var(--w04)', border: '1px solid var(--w07)', borderRadius: 12, padding: '12px 16px', color: 'var(--tinta)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
                      )}
                      {pagoDomicilio.metodo2 === 'Efectivo' && pagoDomicilio.recibido2 && (() => {
                        const montoM2 = totalAPagar - (parseFloat(pagoDomicilio.monto1) || 0)
                        const recibido = parseFloat(pagoDomicilio.recibido2) || 0
                        const feria = recibido - montoM2
                        return feria !== 0 && (
                          <div style={{ background: feria > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.1)', border: `2px solid ${feria > 0 ? 'rgba(74,222,128,0.5)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 14, padding: 16, marginTop: 8, textAlign: 'center' }}>
                            {feria > 0
                              ? <><div style={{ color: 'var(--verde)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>💵 Dar de cambio</div><div style={{ color: 'var(--verde)', fontSize: 40, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtDom(feria)}</div></>
                              : <><div style={{ color: 'var(--rojo-t)', fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>⚠️ Falta</div><div style={{ color: 'var(--rojo-t)', fontSize: 36, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtDom(Math.abs(feria))}</div></>
                            }
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => registrarPagoDomicilio(d)}
                  style={{ flex: 1, background: 'var(--verde-suave)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 14, padding: '14px', color: 'var(--verde)', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                  {totalAPagar === 0 ? '✅ Confirmar entrega' : '✅ Confirmar cobro'}
                </button>
                <button onClick={() => setCobrandoDomicilio(null)}
                  style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 14, padding: '14px 18px', color: 'var(--w40)', fontSize: 15, cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
          </div>
    )
  }

  const MODOS = {
    modo1: { nombre: 'Encargos',  icono: '📦', desc: 'Entrega de compras que llegaron de USA',
             activo: 'bg-[#c1553a] sobre-color shadow-lg shadow-[#c1553a]/40',  banner: 'bg-[#c1553a]',  borde: 'border-[#c1553a] ring-4 ring-[#c1553a]/15',  texto: 'text-[#dd8a6c]' },
    modo2: { nombre: 'Tienda',    icono: '🏬', desc: 'Venta directa en el mostrador de la tienda',
             activo: 'bg-emerald-600 sobre-color shadow-lg shadow-emerald-600/40', banner: 'bg-emerald-600', borde: 'border-emerald-600 ring-4 ring-emerald-600/15', texto: 'text-emerald-400' },
    modo3: { nombre: 'Domicilio', icono: '🚚', desc: 'Pedido para enviar a domicilio del cliente',
             activo: 'bg-amber-500 sobre-color shadow-lg shadow-amber-500/40',    banner: 'bg-amber-500',   borde: 'border-amber-500 ring-4 ring-amber-500/15',   texto: 'text-amber-400' },
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
    <div className="min-h-screen bg-gray-950 text-white">

      {turnoEstado === 'cargando' && (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: 'var(--w40)', fontSize: 14 }}>Cargando...</div>
        </div>
      )}

      {turnoEstado === 'sin_turno' && (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 440, width: '100%' }}>
            <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 18, padding: '20px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(193,85,58,0.2)', border: '2px solid rgba(193,85,58,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'var(--marca)', fontWeight: 700, flexShrink: 0 }}>{iniciales}</div>
              <div>
                <div style={{ color: 'var(--w40)', fontSize: 11 }}>Bienvenido 👋</div>
                <div style={{ color: 'var(--tinta)', fontSize: 17, fontWeight: 700 }}>{colaborador?.nombre}</div>
                <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 2 }}>{getDiaSemana()} {getMesActual()} · {horaActual}</div>
              </div>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: 'var(--ambar-t)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>💰 No has abierto tu turno</div>
                <div style={{ color: 'rgba(245,158,11,0.5)', fontSize: 12 }}>Abre la caja antes de empezar a cobrar</div>
              </div>
              <button onClick={() => window.location.href = '/pos/caja'}
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 16px', color: 'var(--ambar-t)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Abrir turno →
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => { localStorage.removeItem('colaborador'); window.location.href = '/' }}
                style={{ background: 'transparent', border: 'none', color: 'var(--w35)', fontSize: '13px', padding: '8px', cursor: 'pointer', marginTop: '12px' }}
              >
                🚪 Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {turnoEstado === 'cerrado' && (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
      <div style={{ fontSize: 50, marginBottom: 16 }}>✅</div>
      <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Turno cerrado</div>
      <div style={{ color: 'var(--w40)', fontSize: 13, marginBottom: 24 }}>Hasta luego, {colaborador?.nombre?.split(' ')[0]}</div>
      <button onClick={() => { localStorage.removeItem('cliente'); window.location.href = '/' }}
        style={{ width: '100%', background: 'var(--w05)', border: '1px solid var(--w08)', borderRadius: 12, padding: '11px 24px', color: 'var(--w50)', fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
        Cerrar sesión
      </button>
      <button onClick={() => window.location.href = '/pos/caja?nuevo=true'}
        style={{ width: '100%', background: 'rgba(193,85,58,0.08)', border: '1px solid rgba(193,85,58,0.15)', borderRadius: 12, padding: '11px 24px', color: 'var(--marca)', fontSize: 13, cursor: 'pointer' }}>
        🔓 Abrir nuevo turno
      </button>
    </div>
  </div>
)}

      {turnoEstado === 'caja_ocupada' && (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 16 }}>🔒</div>
            <div style={{ color: 'var(--tinta)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Caja ocupada</div>
            <div style={{ color: 'var(--w50)', fontSize: 14, marginBottom: 24 }}>
              <span style={{ color: 'var(--ambar-t)', fontWeight: 600 }}>{turnoOcupado?.nombre}</span> tiene un turno activo.<br />
              Espera a que cierre su turno para poder cobrar.
            </div>
            <button onClick={() => verificarTurno(colaborador?.id)}
              style={{ background: 'var(--w05)', border: '1px solid var(--w08)', borderRadius: 12, padding: '11px 24px', color: 'var(--w50)', fontSize: 13, cursor: 'pointer' }}>
              Verificar de nuevo
            </button>
          </div>
        </div>
      )}

      {turnoEstado === 'activo' && (
        <div className="p-6">

          {/* Header colaborador */}
          <div style={{ marginBottom: 16, background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 14, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(193,85,58,0.2)', border: '2px solid rgba(193,85,58,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--marca)', fontWeight: 700 }}>{iniciales}</div>
              <div>
                <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 700 }}>{colaborador?.nombre}</div>
                <div style={{ color: 'var(--w30)', fontSize: 10 }}>{getDiaSemana()} {getMesActual()} · {horaActual}</div>
              </div>
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--verde)' }}></div>
                <span style={{ color: 'var(--verde)', fontSize: 10, fontWeight: 600 }}>Turno activo · {getTiempoTurno()}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.location.href = '/pos/caja'}
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 12px', color: 'var(--ambar-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                💰 Caja
              </button>
              <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); localStorage.removeItem('cliente'); window.location.href = '/' }}
                style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius: 8, padding: '6px 12px', color: 'var(--w40)', fontSize: 11, cursor: 'pointer' }}>
                Salir
              </button>
            </div>
          </div>

          {/* Retiro pendiente */}
          {retiroPendiente && (
            <div style={{ marginBottom: 16, background: 'rgba(193,85,58,0.06)', border: '1px solid rgba(193,85,58,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>📤</span>
                <div>
                  <div style={{ color: 'var(--marca)', fontSize: 13, fontWeight: 600 }}>Retiro pendiente de confirmar</div>
                  <div style={{ color: 'var(--w45)', fontSize: 11 }}>El admin solicitó retirar ${retiroPendiente.monto?.toLocaleString('es-MX')} · {retiroPendiente.motivo}</div>
                </div>
              </div>
              <button onClick={confirmarRetiro} disabled={confirmandoRetiro}
                style={{ background: 'rgba(193,85,58,0.15)', border: '1px solid rgba(193,85,58,0.3)', borderRadius: 10, padding: '8px 14px', color: 'var(--marca)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {confirmandoRetiro ? 'Confirmando...' : 'Confirmar retiro →'}
              </button>
            </div>
          )}

          {/* POS header */}
          <div className="max-w-4xl mx-auto mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
            <div className="flex items-center gap-3.5">
              <div style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,var(--marca-t),var(--marca))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🛍️</div>
              <div>
                {/* La fecha y la hora ya están en la barra de arriba: aquí
                    sobraban. Se deja sólo quién es y en qué está. */}
                <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.6, color: 'var(--tinta)', lineHeight: 1.1 }}>Punto de venta</h1>
                <div style={{ fontSize: 12.5, color: 'var(--w40)', marginTop: 3 }}>Colaborador · {colaborador?.nombre}</div>
              </div>
            </div>
            {/* CONTROLES DE PESTAÑAS */}
            <div className="grid grid-cols-3 gap-1 rounded-xl w-full sm:w-96 h-fit" style={{ background: 'var(--w05)', border: '1px solid var(--w08)', padding: 4 }}>
              <button type="button" onClick={() => cambiarDeModoLimpiandoTodo('modo1')}
                className={`flex items-center justify-center gap-1.5 py-3 text-[13.5px] font-bold rounded-lg transition-all ${modo === 'modo1' ? MODOS.modo1.activo : 'text-gray-400 hover:text-white'}`}>
                📦 Encargos
              </button>
              <button type="button" onClick={() => cambiarDeModoLimpiandoTodo('modo2')}
                className={`flex items-center justify-center gap-1.5 py-3 text-[13.5px] font-bold rounded-lg transition-all ${modo === 'modo2' ? MODOS.modo2.activo : 'text-gray-400 hover:text-white'}`}>
                🏬 Tienda
              </button>
              <button type="button" onClick={() => cambiarDeModoLimpiandoTodo('modo3')}
                className={`flex items-center justify-center gap-1.5 py-3 text-[13.5px] font-bold rounded-lg transition-all ${modo === 'modo3' ? MODOS.modo3.activo : 'text-gray-400 hover:text-white'}`}>
                🚚 Domicilio
                {/* Ahora que Domicilios salió del menú lateral, este contador
                    es la única señal de que hay entregas esperando. Era un
                    punto rojo de 8 px en la esquina; pasa a ser una pastilla
                    legible al lado del nombre, como los badges del menú. */}
                {domiciliosBadge > 0 && (
                  <span style={{
                    background: 'var(--rojo)', color: '#ffffff', fontSize: 11, fontWeight: 800,
                    borderRadius: 999, minWidth: 20, padding: '2px 7px', lineHeight: 1.35,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{domiciliosBadge > 99 ? '99+' : domiciliosBadge}</span>
                )}
              </button>
            </div>
          </div>

          {mensaje.texto && <div className="max-w-4xl mx-auto p-4 rounded-xl mb-6 text-sm font-semibold text-center bg-green-900/40 text-green-400 border border-green-800">{mensaje.texto}</div>}

          {ticketListo && (
            <div className="max-w-4xl mx-auto p-4 bg-[#4a1b0c]/40 border border-[#6d2a19] rounded-2xl mb-6 flex flex-col sm:flex-row justify-between items-center gap-3">
              <span className="text-xs text-[#dd8a6c] font-medium">El cobro cerró de forma exitosa. ¿Quieres enviarle el comprobante digital al cliente?</span>
              <button onClick={enviarWhatsApp} className="bg-green-700 hover:bg-green-800 sobre-color px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-md transition-all">
                💬 Enviar Ticket por WhatsApp
              </button>
            </div>
          )}

          <div className={(modo === 'modo1' || modo === 'modo2') ? 'max-w-6xl mx-auto grid grid-cols-1 gap-6' : 'max-w-4xl mx-auto grid grid-cols-1 gap-6'}>
            {/* BANNER: EN QUÉ SECCIÓN ESTOY */}
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-6 ${MODOS[modo].banner}`}>
              <span className="text-2xl">{MODOS[modo].icono}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold tracking-widest sobre-color-suave uppercase">Estás en</span>
                <span className="text-lg font-extrabold sobre-color">{MODOS[modo].nombre}</span>
              </div>
              <span className="ml-auto text-xs font-medium sobre-color-suave text-right max-w-[240px]">{MODOS[modo].desc}</span>
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
                vendedorTienda={vendedorTienda}
                setVendedorTienda={setVendedorTienda}
                vendedores={vendedores}
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

            {/* En Domicilio no hay un "resumen final": cada domicilio se cobra
                en su propia tarjeta, abajo. Aquí vivía un encabezado con
                "Total a cobrar $0.00" y un botón grande de MARCAR COMO
                ENTREGADO que no podían hacer nada — el desglose que mostraban
                estaba condicionado a modo1, imposible dentro de este bloque.
                Un botón así de visible que no hace nada es una trampa en la
                pantalla del colaborador. */}
            {modo === 'modo3' && (
            <div className="space-y-4">

            {/* ─── MODO 3: DOMICILIOS ─────────────────────────────── */}
            {modo === 'modo3' && (
              <div style={{ background: 'var(--w03)', border: '1px solid var(--w07)', borderRadius: 16, padding: 16 }}>
                {/* Header + acciones */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 700 }}>🚚 Domicilios del día</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setMostrarFormDom(f => !f); setEntregasSeleccionadasDom([]); setPedidosClienteDom([]); setAnticiposClienteDom([]) }}
                      style={{ padding: '5px 14px', borderRadius: 8, background: mostrarFormDom ? 'var(--w06)' : 'rgba(193,85,58,0.2)', border: `1px solid ${mostrarFormDom ? 'var(--w10)' : 'rgba(193,85,58,0.35)'}`, color: mostrarFormDom ? 'var(--w40)' : 'var(--marca)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      {mostrarFormDom ? 'Cancelar' : '+ Nuevo'}
                    </button>
                    <button onClick={cargarDomicilios} style={{ padding: '5px 12px', borderRadius: 8, background: 'var(--w06)', border: '1px solid var(--w10)', color: 'var(--w50)', fontSize: 11, cursor: 'pointer' }}>↻</button>
                  </div>
                </div>

                {/* Formulario nuevo domicilio */}
                {mostrarFormDom && (() => {
                  const clientesFiltradosDom = todosClientes.filter(c => c.rol !== 'admin').sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'))
                  const clienteTieneDom = domicilios.some(d => String(d.cliente_id) === String(formNuevo.cliente_id) && ['pendiente','confirmado','en_camino'].includes(d.estado))
                  const entregasClienteDom = Object.values(
                    pedidosClienteDom.reduce((acc, p) => {
                      const f = p.entregas?.fecha_entrega
                      if (!f) return acc
                      if (!acc[f]) acc[f] = { fecha: f, entrega_id: p.entrega_id, productos: [], total: 0 }
                      acc[f].productos.push(p)
                      acc[f].total += p.precio_venta || 0
                      return acc
                    }, {})
                  ).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
                  const subtotalSel = entregasSeleccionadasDom.reduce((s, e) => s + e.total, 0)
                  const fmtF = (f) => {
                    if (!f) return ''
                    const m = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
                    const d = new Date(f + 'T12:00:00')
                    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`
                  }
                  const fmtFS = (f) => { if (!f) return ''; const d = new Date(f); return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) }
                  const iStyle = { width:'100%', background: 'var(--w05)', border: '1px solid var(--w10)', borderRadius:10, padding:'8px 12px', color: 'var(--tinta)', fontSize:12, outline: 'none', boxSizing:'border-box' }
                  const lStyle = { color: 'var(--w40)', fontSize:10, textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:5 }
                  return (
                    <div style={{ background: 'rgba(193,85,58,0.04)', border: '1px solid rgba(193,85,58,0.15)', borderRadius:14, padding:16, marginBottom:16 }}>
                      <div style={{ color: 'var(--tinta)', fontSize:13, fontWeight:600, marginBottom:14 }}>➕ Nuevo domicilio</div>

                      {/* ① Cliente */}
                      <div style={{ marginBottom:12 }}>
                        <label style={lStyle}>① Cliente *</label>
                        <select value={formNuevo.cliente_id}
                          onChange={e => {
                            const c = todosClientes.find(cl => String(cl.id) === e.target.value)
                            setFormNuevo({ ...formNuevo, cliente_id: e.target.value, direccion: c?.direccion || '', colonia: c?.colonia || '', referencias: c?.referencias || '', celular_contacto: c?.celular_contacto || c?.telefono || '', celular_contacto_adicional: '' })
                            setEntregasSeleccionadasDom([])
                            cargarPedidosClienteDom(e.target.value)
                          }}
                          style={iStyle}>
                          <option value="">-- Elige un cliente --</option>
                          {clientesFiltradosDom.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        {clienteTieneDom && (
                          <div style={{ marginTop:6, color: 'var(--rojo-t)', fontSize:11, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius:8, padding:'6px 10px' }}>
                            ⚠️ Este cliente ya tiene un domicilio activo
                          </div>
                        )}
                      </div>

                      {/* ② Entregas */}
                      {formNuevo.cliente_id && !clienteTieneDom && (
                        <div style={{ marginBottom:12 }}>
                          <label style={lStyle}>② Entregas pendientes — selecciona en orden</label>
                          {entregasClienteDom.length === 0 ? (
                            <div style={{ padding:16, textAlign:'center', color: 'var(--w30)', fontSize:12, background: 'var(--w02)', borderRadius:10 }}>Sin pedidos pendientes</div>
                          ) : entregasClienteDom.map((entrega, index) => {
                            const selec = entregasSeleccionadasDom.find(e => e.fecha === entrega.fecha)
                            const anteriorSelec = index === 0 || entregasSeleccionadasDom.find(e => e.fecha === entregasClienteDom[index-1].fecha)
                            const bloqueada = !anteriorSelec && !selec
                            const antEnt = anticiposClienteDom.filter(a => a.entrega_id === entrega.entrega_id)
                            const antSum = antEnt.reduce((s,a) => s + (a.monto||0), 0)
                            const porPagar = Math.max(0, entrega.total - antSum)
                            return (
                              <div key={entrega.fecha} onClick={() => !bloqueada && toggleEntregaDom(entrega, index, entregasClienteDom)}
                                style={{ background: selec ? 'rgba(245,158,11,0.06)' : bloqueada ? 'var(--w02)' : 'var(--w03)', border: `1px solid ${selec ? 'rgba(245,158,11,0.35)' : bloqueada ? 'var(--w04)' : 'var(--w08)'}`, borderRadius:12, padding:10, marginBottom:6, cursor: bloqueada ? 'not-allowed' : 'pointer', opacity: bloqueada ? 0.35 : 1 }}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${selec ? 'var(--ambar-borde)' : 'var(--w20)'}`, background: selec ? 'rgba(245,158,11,0.15)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color: selec ? 'var(--ambar-t)' : 'transparent', flexShrink:0 }}>✓</div>
                                    <span style={{ color: selec ? 'var(--ambar-t)' : 'var(--w70)', fontSize:12, fontWeight:600 }}>📅 {fmtF(entrega.fecha)}</span>
                                    {index === 0 && <span style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--rojo-t)', fontSize:9, padding:'2px 6px', borderRadius:10 }}>⚠️ Más antigua</span>}
                                  </div>
                                  <span style={{ color: selec ? 'var(--ambar-t)' : 'var(--w50)', fontSize:12, fontWeight:700 }}>{fmtDom(entrega.total)}</span>
                                </div>
                                <div style={{ paddingLeft:26 }}>
                                  {entrega.productos.map(p => (
                                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0', borderBottom: '1px solid var(--w04)' }}>
                                      <span style={{ color: 'var(--w40)', fontSize:10 }}>{p.descripcion}</span>
                                      <span style={{ color: 'var(--w45)', fontSize:10 }}>{fmtDom(p.precio_venta)}</span>
                                    </div>
                                  ))}
                                  {antEnt.length > 0 && (
                                    <div style={{ marginTop:4, paddingTop:3, borderTop: '1px solid rgba(16,185,129,0.15)' }}>
                                      {antEnt.map((a,i) => (
                                        <div key={i} style={{ display:'flex', justifyContent:'space-between' }}>
                                          <span style={{ color: 'rgba(16,185,129,0.6)', fontSize:9 }}>✅ Anticipo {fmtFS(a.creado_en)}</span>
                                          <span style={{ color: 'var(--verde)', fontSize:9, fontWeight:600 }}>-{fmtDom(a.monto)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4, paddingTop:3, borderTop: '1px solid var(--w06)' }}>
                                    <span style={{ color: 'var(--w30)', fontSize:10 }}>Por pagar</span>
                                    <span style={{ color: 'var(--rojo-t)', fontSize:10, fontWeight:600 }}>{fmtDom(porPagar)}</span>
                                  </div>
                                  {bloqueada && <div style={{ marginTop:5, textAlign:'center', color: 'var(--w20)', fontSize:9 }}>🔒 Selecciona primero la entrega anterior</div>}
                                </div>
                              </div>
                            )
                          })}
                          {entregasSeleccionadasDom.length > 0 && (
                            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius:8, padding:'7px 12px', display:'flex', justifyContent:'space-between', marginTop:4 }}>
                              <span style={{ color: 'var(--w50)', fontSize:11 }}>{entregasSeleccionadasDom.length} entrega{entregasSeleccionadasDom.length > 1 ? 's' : ''} seleccionada{entregasSeleccionadasDom.length > 1 ? 's' : ''}</span>
                              <span style={{ color: 'var(--ambar-t)', fontSize:13, fontWeight:700 }}>{fmtDom(subtotalSel)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ③ Datos de entrega */}
                      {entregasSeleccionadasDom.length > 0 && !clienteTieneDom && (
                        <div>
                          <div style={{ height:1, background: 'var(--w06)', marginBottom:12 }} />
                          <label style={lStyle}>③ Datos de entrega</label>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                            {[
                              { label:'Calle y número *', key:'direccion', placeholder:'Blvd. Morelos #432' },
                              { label:'Colonia *', key:'colonia', placeholder:'Villa del Real' },
                              { label:'Referencias', key:'referencias', placeholder:'Casa azul, cerca de...' },
                              { label:'Celular', key:'celular_contacto', placeholder:'662 000 0000' },
                              { label:'Celular adicional (opcional)', key:'celular_contacto_adicional', placeholder:'662 000 0001' },
                            ].map(campo => (
                              <div key={campo.key}>
                                <label style={lStyle}>{campo.label}</label>
                                <input type="text" value={formNuevo[campo.key]} placeholder={campo.placeholder}
                                  onChange={e => setFormNuevo({...formNuevo, [campo.key]: e.target.value})}
                                  style={iStyle} />
                              </div>
                            ))}
                            <div>
                              <label style={lStyle}>Fecha *</label>
                              <input type="date" value={formNuevo.fecha_preferida}
                                onChange={e => setFormNuevo({...formNuevo, fecha_preferida: e.target.value, horario: ''})}
                                style={{ ...iStyle, borderColor: formNuevo.fecha_preferida && new Date(formNuevo.fecha_preferida + 'T12:00:00').getDay() === 0 ? 'rgba(239,68,68,0.4)' : 'var(--w10)' }} />
                              {formNuevo.fecha_preferida && new Date(formNuevo.fecha_preferida + 'T12:00:00').getDay() === 0 && <div style={{ color: 'var(--rojo-t)', fontSize:10, marginTop:3 }}>⚠️ No hay servicio los domingos</div>}
                            </div>
                            <div>
                              <label style={lStyle}>Horario *</label>
                              <select value={formNuevo.horario}
                                onChange={e => setFormNuevo({...formNuevo, horario: e.target.value})}
                                style={iStyle}>
                                <option value="">-- Elige horario --</option>
                                {horariosDelDia(formNuevo.fecha_preferida).map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                            <div style={{ gridColumn:'1 / -1' }}>
                              <label style={lStyle}>Notas</label>
                              <input type="text" value={formNuevo.notas} placeholder="Instrucciones especiales..."
                                onChange={e => setFormNuevo({...formNuevo, notas: e.target.value})}
                                style={iStyle} />
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:8 }}>
                            <button onClick={crearDomicilio} disabled={guardandoDom}
                              style={{ flex:1, background: 'rgba(193,85,58,0.2)', border: '1px solid rgba(193,85,58,0.3)', borderRadius:10, padding:'10px', color: 'var(--marca)', fontSize:13, fontWeight:600, cursor:'pointer', opacity: guardandoDom ? 0.6 : 1 }}>
                              {guardandoDom ? 'Guardando...' : '✓ Crear domicilio'}
                            </button>
                            <button onClick={() => { setMostrarFormDom(false); setEntregasSeleccionadasDom([]); setPedidosClienteDom([]); setAnticiposClienteDom([]) }}
                              style={{ background: 'var(--w04)', border: '1px solid var(--w08)', borderRadius:10, padding:'10px 14px', color: 'var(--w40)', fontSize:12, cursor:'pointer' }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      {!formNuevo.cliente_id && (
                        <div style={{ textAlign:'center', padding:16, color: 'var(--w25)', fontSize:12 }}>
                          Selecciona un cliente para ver sus entregas pendientes
                        </div>
                      )}
                    </div>
                  )
                })()}

                {cargandoDomicilios ? (
                  <div style={{ textAlign: 'center', color: 'var(--w30)', padding: 32, fontSize: 13 }}>Cargando...</div>
                ) : domicilios.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--w25)', padding: 32, fontSize: 13 }}>No hay domicilios para hoy</div>
                ) : (
                  domicilios.map(d => {
                    const colorBorde = d.estado === 'cancelado' ? 'rgba(248,113,113,0.15)' : d.estado === 'entregado' ? 'rgba(74,222,128,0.15)' : d.estado === 'en_camino' ? 'rgba(251,191,36,0.15)' : d.estado === 'confirmado' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'
                    const colorEstado = d.estado === 'cancelado' ? 'var(--rojo-t)' : d.estado === 'entregado' ? 'var(--verde)' : d.estado === 'en_camino' ? 'var(--ambar-t)' : d.estado === 'confirmado' ? 'var(--verde)' : 'var(--ambar-t)'
                    const etiquetaEstado = d.estado === 'cancelado' ? '❌ Cancelado' : d.estado === 'entregado' ? '✅ Entregado' : d.estado === 'en_camino' ? '🚚 En camino' : d.estado === 'confirmado' ? '✅ Confirmado' : '⏳ Por confirmar'
                    const totalAPagar = getTotalAPagarDom(d)
                    const cobrando = cobrandoDomicilio === d.id

                    return (
                      <div key={d.id} style={{ background: 'var(--w02)', border: `1px solid ${colorBorde}`, borderRadius: 14, padding: 14, marginBottom: 10, opacity: d.estado === 'cancelado' ? 0.5 : 1 }}>

                        {/* Info principal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ color: 'var(--tinta)', fontSize: 13, fontWeight: 600 }}>{d.clientes?.nombre}</div>
                            <div style={{ color: 'var(--w40)', fontSize: 11, marginTop: 2 }}>📍 {d.direccion}, Col. {d.colonia}</div>
                            {d.referencias && <div style={{ color: 'var(--w30)', fontSize: 10 }}>📝 {d.referencias}</div>}
                            <div style={{ color: 'var(--w30)', fontSize: 10 }}>📱 {d.celular_contacto} · 📅 {fmtFechaDom(d.fecha_preferida)} {d.horario}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                            <div style={{ color: colorEstado, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{etiquetaEstado}</div>
                            {d.costo_envio > 0 && <div style={{ color: 'var(--ambar-t)', fontSize: 11 }}>{fmtDom(d.costo_envio)} envío</div>}
                            {d.total > 0 && <div style={{ color: 'var(--tinta)', fontSize: 14, fontWeight: 800 }}>{fmtDom(totalAPagar)}</div>}
                          </div>
                        </div>

                        {/* Pendiente: elegir costo envío */}
                        {d.estado === 'pendiente' && (
                          <div>
                            <div style={{ color: 'var(--w40)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Elige el costo de envío</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                              {[{ monto: 50, label: 'Zona corta · 0-5 km', color: 'var(--verde)', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)' },
                                { monto: 70, label: 'Zona larga · 5.1+ km', color: '#818cf8', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)' }].map(op => (
                                <button key={op.monto} onClick={() => confirmarCostoDomicilio(d, op.monto)}
                                  style={{ background: op.bg, border: `1px solid ${op.border}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                                  <div style={{ color: op.color, fontSize: 20, fontWeight: 800 }}>${op.monto}</div>
                                  <div style={{ color: 'var(--w40)', fontSize: 10 }}>{op.label}</div>
                                </button>
                              ))}
                            </div>
                            <button onClick={() => cancelarDomicilio(d.id)}
                              style={{ width: '100%', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 8, padding: '7px', color: 'var(--rojo-t)', fontSize: 11, cursor: 'pointer' }}>
                              ❌ Cancelar domicilio
                            </button>
                          </div>
                        )}

                        {/* Confirmado: marcar en camino */}
                        {d.estado === 'confirmado' && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => cambiarEstadoDomicilio(d.id, 'en_camino')}
                              style={{ flex: 1, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '8px', color: 'var(--ambar-t)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              🚚 Marcar en camino
                            </button>
                            <button onClick={() => cancelarDomicilio(d.id)}
                              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 8, padding: '8px 12px', color: 'var(--rojo-t)', fontSize: 11, cursor: 'pointer' }}>
                              ❌ Cancelar
                            </button>
                          </div>
                        )}

                        {/* En camino: registrar cobro */}
                        {d.estado === 'en_camino' && !cobrando && (
                          turnoEstado === 'activo' ? (
                            <button onClick={() => { setCobrandoDomicilio(d.id); setPagoDomicilio({ metodo1: 'Efectivo', monto1: totalAPagar > 0 ? String(totalAPagar) : '', recibido1: '', metodo2: 'Transferencia', mostrar2: false, recibido2: '' }) }}
                              style={{ width: '100%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px', color: 'var(--verde)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {totalAPagar === 0 ? '✅ Marcar como entregado (cubierto por anticipos)' : '💳 Registrar cobro y marcar entregado'}
                            </button>
                          ) : (
                            <div style={{ textAlign: 'center', color: 'var(--w30)', fontSize: 11, padding: '10px', background: 'var(--w03)', borderRadius: 8, border: '1px solid var(--w06)' }}>
                              🔒 Abre tu turno para cobrar
                            </div>
                          )
                        )}

                      </div>
                    )
                  })
                )}
              </div>
            )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>

    {renderModalCobroPOS()}
    {renderModalCobroDomicilio()}
    </>
  );
}