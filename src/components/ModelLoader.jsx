import { useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import CandleFlame from './CandleFlame.jsx'

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']

// Kenney exporta sus paletas con filtro nearest (look pixelado intencional).
// Se cambia a filtrado lineal con mipmaps y anisotropía para que se vean suaves.
function smoothTextures(root, maxAnisotropy) {
  root.traverse((node) => {
    if (!node.isMesh) return
    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const mat of materials) {
      if (!mat) continue
      for (const slot of TEXTURE_SLOTS) {
        const tex = mat[slot]
        if (!tex) continue
        tex.magFilter = THREE.LinearFilter
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = maxAnisotropy
        tex.needsUpdate = true
      }
    }
  })
}

// Tamaño inicial objetivo (dimensión mayor) para que ningún modelo aparezca
// gigante ni microscópico. El usuario después lo reescala libremente.
const TARGET_SIZE = 0.45

/**
 * Carga un .glb respetando sus materiales originales. La normalización de
 * escala vive en un group interno, así el scale del estado sigue siendo [1,1,1]
 * y el gizmo de escala parte de una base neutra.
 */
export default function ModelLoader({ path }) {
  const { scene } = useGLTF(path)
  const gl = useThree((state) => state.gl)

  useMemo(() => smoothTextures(scene, gl.capabilities.getMaxAnisotropy()), [scene, gl])

  const { factor, offsetY, topY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const f = TARGET_SIZE / maxDim
    // Apoya el modelo sobre su base (y=0 local) en lugar de su origen arbitrario.
    return { factor: f, offsetY: -box.min.y * f, topY: size.y * f }
  }, [scene])

  // Los modelos de la carpeta de velas llevan flama parpadeante en la punta.
  // La flama va FUERA del group normalizado: las luces no escalan bien dentro.
  const isCandle = path.includes('/velas-y-faroles/')

  return (
    <>
      <group scale={factor} position={[0, offsetY, 0]}>
        <Clone object={scene} castShadow receiveShadow deep />
      </group>
      {isCandle && <CandleFlame position={[0, topY + 0.015, 0]} />}
    </>
  )
}
