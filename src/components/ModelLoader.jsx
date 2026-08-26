import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import CandleFlame from './CandleFlame.jsx'

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']

// Kenney exporta sus paletas con filtro nearest (look pixelado intencional).
// Se cambia a filtrado lineal con mipmaps y anisotropía para que se vean suaves.
//
// `scene` viene cacheado por useGLTF (una sola instancia compartida por path),
// pero cada objeto colocado monta su propio ModelLoader: sin este set, el
// traverse + `needsUpdate = true` se repetiría por cada instancia, re-subiendo
// a la GPU las mismas texturas ya procesadas. Se marca por referencia de scene.
const smoothedScenes = new WeakSet()
function smoothTextures(root, maxAnisotropy) {
  if (smoothedScenes.has(root)) return
  smoothedScenes.add(root)
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

// Multiplicador extra por modelo, generado por
// scripts/generate-model-scale-config.mjs en public/configuraciones/model-scale.json.
// Se cachea a nivel de módulo: todos los ModelLoader comparten un solo fetch.
const SCALE_CONFIG_URL = '/configuraciones/model-scale.json'
let scaleConfigPromise = null
function loadScaleConfig() {
  if (!scaleConfigPromise) {
    scaleConfigPromise = fetch(SCALE_CONFIG_URL)
      .then((res) => (res.ok ? res.json() : { models: {} }))
      .then((data) => data.models ?? {})
      .catch(() => ({}))
  }
  return scaleConfigPromise
}

function getConfiguredScale(modelPath, scaleConfig) {
  const rel = modelPath.replace(/^\/models\/altar\//, '')
  const scale = scaleConfig?.[rel]?.scale
  return typeof scale === 'number' ? scale : 1
}

/**
 * Carga un .glb respetando sus materiales originales. La normalización de
 * escala vive en un group interno, así el scale del estado sigue siendo [1,1,1]
 * y el gizmo de escala parte de una base neutra.
 */
export default function ModelLoader({ path }) {
  const { scene } = useGLTF(path)
  const gl = useThree((state) => state.gl)

  // null mientras carga: el primer render de cada sesión usa escala 1 hasta
  // que llegue el JSON (se cachea, así que solo pasa una vez).
  const [scaleConfig, setScaleConfig] = useState(null)
  useEffect(() => {
    let alive = true
    loadScaleConfig().then((config) => alive && setScaleConfig(config))
    return () => {
      alive = false
    }
  }, [])

  useMemo(() => smoothTextures(scene, gl.capabilities.getMaxAnisotropy()), [scene, gl])

  const { factor, offsetY, topY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const configuredScale = getConfiguredScale(path, scaleConfig)
    const f = (TARGET_SIZE / maxDim) * configuredScale
    // Apoya el modelo sobre su base (y=0 local) en lugar de su origen arbitrario.
    return { factor: f, offsetY: -box.min.y * f, topY: size.y * f }
  }, [scene, path, scaleConfig])

  // Los modelos de la carpeta de velas llevan flama parpadeante en la punta.
  // La flama va FUERA del group normalizado: las luces no escalan bien dentro.
  const isCandle = path.includes('/velas/')

  return (
    <>
      <group scale={factor} position={[0, offsetY, 0]}>
        {/* Sin `deep`: todas las instancias del mismo modelo comparten geometría
            y material en vez de clonarlos (ningún modelo GLTF muta su material
            por selección; eso solo pasa con las formas básicas). `dispose={null}`
            evita que, al borrar una instancia, React Three Fiber libere el
            recurso compartido y rompa las demás instancias que lo siguen usando. */}
        <Clone object={scene} castShadow receiveShadow dispose={null} />
      </group>
      {isCandle && <CandleFlame position={[0, topY + 0.015, 0]} />}
    </>
  )
}
