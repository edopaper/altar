import { useEffect, useState } from 'react'
import * as THREE from 'three'

// La foto se ajusta dentro de este tamaño máximo, conservando su proporción.
const MAX_PHOTO_SIDE = 0.98
const FRAME_BORDER = 0.16
const FRAME_DEPTH = 0.07

/**
 * Marco de fotografía en la pared trasera, arriba del altar. El marco adapta
 * su proporción a la foto cargada (horizontal, vertical o cuadrada); sin foto
 * muestra un plano oscuro cuadrado como placeholder.
 */
export default function PhotoFrame({ photo }) {
  const [loaded, setLoaded] = useState(null) // { texture, aspect }

  useEffect(() => {
    if (!photo) {
      setLoaded(null)
      return
    }
    let cancelled = false
    let texture = null
    new THREE.TextureLoader().load(photo, (t) => {
      if (cancelled) {
        t.dispose()
        return
      }
      t.colorSpace = THREE.SRGBColorSpace
      texture = t
      setLoaded({ texture: t, aspect: t.image.width / t.image.height })
    })
    return () => {
      cancelled = true
      texture?.dispose()
      setLoaded(null)
    }
  }, [photo])

  const aspect = loaded?.aspect ?? 1
  const photoW = aspect >= 1 ? MAX_PHOTO_SIDE : MAX_PHOTO_SIDE * aspect
  const photoH = aspect >= 1 ? MAX_PHOTO_SIDE / aspect : MAX_PHOTO_SIDE

  return (
    <group position={[0, 2.65, -3.86]}>
      {/* Marco de madera oscura */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[photoW + FRAME_BORDER, photoH + FRAME_BORDER, FRAME_DEPTH]} />
        <meshStandardMaterial color="#6b4f35" roughness={0.7} />
      </mesh>
      {/* Foto (o placeholder si aún no hay imagen) */}
      <mesh position={[0, 0, FRAME_DEPTH / 2 + 0.005]}>
        <planeGeometry args={[photoW, photoH]} />
        {loaded ? (
          // key distinta: fuerza a remontar el material al poner/quitar foto,
          // porque Three.js no recompila el shader si solo cambia el map
          <meshStandardMaterial key="con-foto" map={loaded.texture} roughness={0.85} />
        ) : (
          <meshStandardMaterial key="sin-foto" color="#3a3048" roughness={0.9} />
        )}
      </mesh>
      {/* Luz cálida tenue que baña el retrato */}
      <pointLight color="#ffd9a0" intensity={1.2} distance={2.5} decay={2} position={[0, 0.4, 0.6]} />
    </group>
  )
}
