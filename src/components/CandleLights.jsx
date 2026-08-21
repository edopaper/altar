import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Pool fijo de luces: siempre montadas (los shaders se compilan una sola vez
// al inicio, sin tirones al agregar velas). Las que no se usan quedan en 0.
const MAX_LIGHTS = 6
// Velas a menos de esta distancia comparten una misma luz.
const CLUSTER_RADIUS = 1.1

// Registro global de flamas: cada CandleFlame se apunta aquí con su group,
// y el gestor lee sus posiciones de mundo cada frame.
const flames = new Set()

export function registerFlame(ref) {
  flames.add(ref)
  return () => flames.delete(ref)
}

/**
 * Gestor de luces compartidas entre velas cercanas: agrupa las flamas por
 * distancia (greedy) y coloca una point light en el centroide de cada grupo,
 * con intensidad según cuántas velas contenga y parpadeo propio.
 */
export default function CandleLights() {
  const lightRefs = useRef([])
  const seeds = useMemo(() => Array.from({ length: MAX_LIGHTS }, () => Math.random() * 100), [])
  const worldPos = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    // Agrupamiento greedy: cada flama entra al primer grupo a menos de
    // CLUSTER_RADIUS de su centroide; si no hay, abre grupo nuevo (con tope).
    const clusters = [] // { sum: Vector3, count }
    for (const ref of flames) {
      const group = ref.current
      if (!group) continue
      group.getWorldPosition(worldPos)
      let target = null
      let bestDist = Infinity
      for (const c of clusters) {
        const d = worldPos.distanceTo(c.centroid)
        if (d < bestDist) {
          bestDist = d
          target = c
        }
      }
      if (!target || (bestDist > CLUSTER_RADIUS && clusters.length < MAX_LIGHTS)) {
        clusters.push({ centroid: worldPos.clone(), sum: worldPos.clone(), count: 1 })
      } else {
        target.sum.add(worldPos)
        target.count += 1
        target.centroid.copy(target.sum).multiplyScalar(1 / target.count)
      }
    }

    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = lightRefs.current[i]
      if (!light) continue
      const cluster = clusters[i]
      if (!cluster) {
        light.intensity = 0
        continue
      }
      const t = clock.elapsedTime + seeds[i]
      const noise =
        Math.sin(t * 11.3) * 0.35 + Math.sin(t * 17.7 + 1.3) * 0.25 + Math.sin(t * 28.9 + 4.1) * 0.4
      const flicker = 0.8 + 0.2 * noise
      light.position.copy(cluster.centroid)
      // Más velas: más luz y más alcance, con crecimiento amortiguado
      light.intensity = 0.85 * Math.sqrt(cluster.count) * flicker
      light.distance = 2.2 + 0.4 * (cluster.count - 1)
    }
  })

  return (
    <>
      {Array.from({ length: MAX_LIGHTS }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => (lightRefs.current[i] = el)}
          color="#ffa64d"
          intensity={0}
          distance={2.2}
          decay={2}
        />
      ))}
    </>
  )
}
