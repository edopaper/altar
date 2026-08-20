import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Marco de fotografía en la pared trasera, arriba del altar. Muestra la foto
 * cargada por el usuario (data URL) o un plano vacío como placeholder.
 */
export default function PhotoFrame({ photo }) {
  const texture = useMemo(() => {
    if (!photo) return null
    const t = new THREE.TextureLoader().load(photo)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [photo])

  // Libera la textura anterior al cambiar de foto o desmontar.
  useEffect(() => () => texture?.dispose(), [texture])

  return (
    <group position={[0, 2.65, -3.86]}>
      {/* Marco de madera oscura */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.14, 1.14, 0.07]} />
        <meshStandardMaterial color="#6b4f35" roughness={0.7} />
      </mesh>
      {/* Foto (o placeholder si aún no hay imagen) */}
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[0.98, 0.98]} />
        {texture ? (
          // key distinta: fuerza a remontar el material al poner/quitar foto,
          // porque Three.js no recompila el shader si solo cambia el map
          <meshStandardMaterial key="con-foto" map={texture} roughness={0.85} />
        ) : (
          <meshStandardMaterial key="sin-foto" color="#3a3048" roughness={0.9} />
        )}
      </mesh>
      {/* Luz cálida tenue que baña el retrato */}
      <pointLight color="#ffd9a0" intensity={1.2} distance={2.5} decay={2} position={[0, 0.4, 0.6]} />
    </group>
  )
}
