// PostgREST corta en 1000 renglones y NO avisa. Es la peor clase de error: la
// consulta responde bien, la pantalla se pinta completa, y le faltan datos.
//
// Ya mordió dos veces:
// · Reportes → Transacciones pedía los pedidos de las entregas del periodo
//   (2,377 renglones el 7 de septiembre) y se quedaba con los primeros mil. A
//   quien cayera después le salía "Nada marcado como entregado" aunque sí
//   hubiera recogido. Así aparecieron Ibeth Higuera y Cristina García.
// · Score de clientes leía la tabla de pedidos completa —4,020 renglones— y
//   calculaba con la cuarta parte.
//
// Se le pasa una función que arma la consulta con el rango que se le pide, y
// devuelve todos los renglones.
//
//   const pedidos = await traerTodo((a, b) =>
//     supabase.from('pedidos').select('*').eq('entrega_id', id).range(a, b))
const PAGINA = 1000
const MAX_PAGINAS = 60   // 60,000 renglones: tope de seguridad, no un límite real

export async function traerTodo(hacerConsulta) {
  const filas = []
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const { data, error } = await hacerConsulta(i * PAGINA, i * PAGINA + PAGINA - 1)
    if (error) throw new Error(error.message)
    const lote = data || []
    filas.push(...lote)
    if (lote.length < PAGINA) return filas
  }
  return filas
}
