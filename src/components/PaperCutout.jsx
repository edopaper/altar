import { useEffect, useState } from 'react'
import * as THREE from 'three'

const RASTER_WIDTH = 1024 // resolución del rasterizado del SVG
const TARGET_SIZE = 0.6 // lado mayor del plano en unidades de escena

// Caché de texturas por combinación svg+color, compartida entre instancias.
const textureCache = new Map()

/**
 * Rasteriza el SVG y lo tiñe del color pedido: se dibuja la silueta y con
 * composite "source-in" se rellena todo con el color plano, conservando los
 * huecos (transparencia) del recorte. Así cualquier SVG funciona sin importar
 * los colores que traiga dentro.
 */
async function loadTintedTexture(path, color) {
  const cacheKey = `${path}|${color}`
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey)

  const promise = (async () => {
    const svgText = await (await fetch(path)).text()
    const blob = new Blob([svgText], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const aspect = (img.width || 1) / (img.height || 1)
      const canvas = document.createElement('canvas')
      canvas.width = RASTER_WIDTH
      canvas.height = Math.max(1, Math.round(RASTER_WIDTH / aspect))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = color
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      return { texture, aspect }
    } finally {
      URL.revokeObjectURL(url)
    }
  })()

  textureCache.set(cacheKey, promise)
  promise.catch(() => textureCache.delete(cacheKey))
  return promise
}

/**
 * Plano de papel picado: SVG rasterizado con huecos transparentes, teñido del
 * color del objeto. No proyecta sombra (proyectaría su rectángulo completo).
 */
export default function PaperCutout({ path, color }) {
  const [loaded, setLoaded] = useState(null) // { texture, aspect }

  useEffect(() => {
    let cancelled = false
    loadTintedTexture(path, color).then(
      (result) => !cancelled && setLoaded(result),
      () => !cancelled && setLoaded(null),
    )
    return () => {
      cancelled = true
    }
  }, [path, color])

  if (!loaded) return null

  const { texture, aspect } = loaded
  const width = aspect >= 1 ? TARGET_SIZE : TARGET_SIZE * aspect
  const height = aspect >= 1 ? TARGET_SIZE / aspect : TARGET_SIZE

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        key={`${path}|${color}`}
        map={texture}
        transparent
        alphaTest={0.1}
        side={THREE.DoubleSide}
        roughness={0.9}
      />
    </mesh>
  )
}
