import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import ModelLoader from './ModelLoader.jsx'

/**
 * Avisa (vía un flag en window) que el modelo ya se pintó, para que el
 * script de captura (scripts/generate-thumbnails.mjs) sepa cuándo tomar el
 * screenshot. Dos rAF de margen: uno para que el frame recién montado se
 * pinte, otro para que quede estable.
 */
function ReadySignal() {
  useEffect(() => {
    let id2
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        window.__thumbReady = true
      })
    })
    return () => {
      cancelAnimationFrame(id1)
      if (id2) cancelAnimationFrame(id2)
    }
  }, [])
  return null
}

/**
 * Escena mínima, sin UI ni resto del altar: un solo modelo centrado sobre
 * fondo transparente, usada solo para generar thumbnails. Se accede vía la
 * ruta oculta "#/thumb/<ruta-del-modelo>" (ver App.jsx).
 */
export default function ThumbnailStage({ path }) {
  return (
    <div style={{ width: 256, height: 256 }}>
      <Canvas
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [0.55, 0.48, 0.85], fov: 32 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.2, 0)}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} />
        <directionalLight position={[-2, 1.2, -1]} intensity={0.5} />
        <Suspense fallback={null}>
          <ModelLoader path={path} />
          <ReadySignal />
        </Suspense>
      </Canvas>
    </div>
  )
}
