'use client'
import { useEffect } from 'react'

// El panel es claro. Hubo un interruptor claro/oscuro (31 ago – 1 sep 2026);
// se retiró para tener una sola identidad visual en vez de dos a medias.
// Los tokens de color viven en app/globals.css bajo .tema-claro.
export function useTema() {
  useEffect(() => {
    document.documentElement.classList.add('tema-claro')
    document.documentElement.classList.remove('tema-oscuro')
  }, [])

  return { clase: 'tema-claro' }
}
