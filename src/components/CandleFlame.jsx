import { useEffect, useRef } from 'react'
import { registerFlame } from './CandleLights.jsx'

/**
 * Punto de flama de una vela: no dibuja nada, solo marca la posición de la
 * mecha y se registra en CandleLights, que agrupa velas cercanas y les
 * asigna luces parpadeantes compartidas de un pool fijo.
 */
export default function CandleFlame({ position }) {
  const groupRef = useRef()

  useEffect(() => registerFlame(groupRef), [])

  return <group ref={groupRef} position={position} />
}
