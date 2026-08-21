import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Tope de almas simultáneas: dos como máximo, para que cada mensaje siga
// siendo legible (más de dos escribiéndose a la vez se vuelve ruido visual)
// y para acotar el pool de luces.
export const MAX_CONCURRENT_SOULS = 2

// Registro compartido: cada SoulSpirit anota aquí su posición/color/
// intensidad en vez de traer su propia luz, así el número de luces de la
// escena nunca fluctúa (mismo motivo que CandleLights: evita recompilar
// shaders cada vez que un alma aparece o desaparece).
const registry = new Set()

export function registerSoulLight(entry) {
  registry.add(entry)
  return () => registry.delete(entry)
}

/**
 * Pool fijo de luces (una por alma concurrente permitida) que sigue a cada
 * alma activa. Asignación directa, sin agrupar por cercanía: como el tope
 * de almas coincide con el tamaño del pool, cada una tiene su propia luz.
 */
export default function SoulLights() {
  const lightRefs = useRef([])

  useFrame(() => {
    const entries = Array.from(registry)
    for (let i = 0; i < MAX_CONCURRENT_SOULS; i++) {
      const light = lightRefs.current[i]
      if (!light) continue
      const entry = entries[i]
      if (!entry) {
        light.intensity = 0
        continue
      }
      light.position.copy(entry.position)
      light.color.set(entry.color)
      light.intensity = entry.intensity
    }
  })

  return (
    <>
      {Array.from({ length: MAX_CONCURRENT_SOULS }, (_, i) => (
        <pointLight key={i} ref={(el) => (lightRefs.current[i] = el)} distance={2.4} decay={2} intensity={0} />
      ))}
    </>
  )
}
