'use client'
import PedidosWhatsApp from '../../components/PedidosWhatsApp'

// La pantalla ahora vive como pestaña en Encargos > Pedidos. Esta ruta se
// conserva porque el menú de colaboradores apunta aquí y para no romper
// enlaces guardados.
export default function Pendientes() {
  return <PedidosWhatsApp />
}
