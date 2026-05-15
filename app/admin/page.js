export default function Admin() {
  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-white text-3xl font-semibold mb-2">
          📦 Denog USA Compras
        </div>
        <div className="text-gray-400 mb-8">Panel de administración</div>
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-gray-400 text-sm mb-2">Clientes activos</div>
            <div className="text-white text-3xl font-semibold">0</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-gray-400 text-sm mb-2">Pedidos capturados</div>
            <div className="text-white text-3xl font-semibold">0</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="text-gray-400 text-sm mb-2">Por cobrar</div>
            <div className="text-white text-3xl font-semibold">$0</div>
          </div>
        </div>
      </div>
    </div>
  )
}