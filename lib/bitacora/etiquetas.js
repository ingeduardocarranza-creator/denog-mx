// La bitácora guarda los renglones tal como están en la base: nombres de
// columna y uuids. Sin traducir, la pantalla sería ilegible para quien no
// escribió el sistema. Aquí vive esa traducción, en un solo lugar.

export const TABLAS = {
  pagos:            { nombre: 'Pago',             icono: '💵' },
  pagos_cancelados: { nombre: 'Pago cancelado',   icono: '🚫' },
  ventas_tienda:    { nombre: 'Venta de tienda',  icono: '🏪' },
  cortes_caja:      { nombre: 'Caja',             icono: '💰' },
  retiros_caja:     { nombre: 'Retiro de caja',   icono: '📤' },
  pendientes:       { nombre: 'Comprobante',      icono: '🧾' },
  pedidos:          { nombre: 'Pedido',           icono: '📦' },
}

export const OPERACIONES = {
  INSERT: { nombre: 'Se creó',     tono: 'verde' },
  UPDATE: { nombre: 'Se modificó', tono: 'ambar' },
  DELETE: { nombre: 'Se borró',    tono: 'rojo'  },
}

export const CAMPOS = {
  // Dinero
  monto: 'Monto', precio_venta: 'Precio', precio_unitario: 'Precio unitario',
  costo_unitario: 'Costo unitario', cantidad: 'Cantidad',
  total_contado: 'Contado', total_esperado: 'Esperado', diferencia: 'Diferencia',
  total_efectivo: 'Efectivo del turno', total_transferencia: 'Transferencias del turno',
  total_terminal: 'Terminal del turno', total_retiros: 'Retiros del turno',
  descuento_tipo: 'Tipo de descuento', descuento_valor: 'Descuento',
  // Quién y de quién
  cliente_id: 'Cliente', vendedor_id: 'Quien cobró', colaborador_id: 'Colaborador',
  admin_id: 'Admin', resuelto_por: 'Resuelto por', atendido_por: 'Atendido por',
  cancelado_por: 'Cancelado por', descartado_por: 'Descartado por',
  nombre_suelto: 'Nombre suelto', telefono_suelto: 'Teléfono suelto',
  nombre_whatsapp: 'Nombre en WhatsApp', telefono_whatsapp: 'Teléfono de WhatsApp',
  // Qué
  metodo: 'Método', tipo: 'Tipo', estado: 'Estado', descripcion: 'Descripción',
  nombre_producto: 'Producto', motivo: 'Motivo', justificacion: 'Justificación',
  cancelado_motivo: 'Motivo de la cancelación', descartado_motivo: 'Motivo de descarte',
  resumen: 'Resumen', detalle: 'Detalle', origen: 'Origen',
  pendiente_aprobacion: 'Pendiente de aprobación',
  // Ligas
  entrega_id: 'Entrega', pedido_id: 'Pedido', pago_id: 'Pago',
  pendiente_id: 'Comprobante', domicilio_id: 'Domicilio',
  pedido_mercadito_id: 'Pedido de Mercadito',
  // Tiempos
  creado_en: 'Registrado', entregado_en: 'Hora de entrega', desde: 'Periodo desde',
  hasta: 'Periodo hasta', resuelto_en: 'Resuelto', atendido_en: 'Atendido',
  cancelado_en: 'Cancelado', descartado_en: 'Descartado',
}

// Campos que son dinero: se pintan con signo de pesos.
export const DINERO = new Set([
  'monto', 'precio_venta', 'precio_unitario', 'costo_unitario',
  'total_contado', 'total_esperado', 'diferencia', 'total_efectivo',
  'total_transferencia', 'total_terminal', 'total_retiros',
])

// Campos que apuntan a una persona: se cambia el uuid por su nombre.
export const PERSONAS = new Set([
  'cliente_id', 'vendedor_id', 'colaborador_id', 'admin_id',
  'resuelto_por', 'atendido_por', 'cancelado_por', 'descartado_por',
])

// Campos que no aportan nada al leer un cambio.
export const OCULTOS = new Set([
  'id', 'imagen_url', 'mensaje_wa_id', 'foto_url', 'fotos',
])

export const etiquetaCampo = (c) => CAMPOS[c] || c.replace(/_/g, ' ')
export const etiquetaTabla = (t) => TABLAS[t] || { nombre: t, icono: '•' }
