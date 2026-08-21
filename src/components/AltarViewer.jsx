import { useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './AltarScene.jsx'
import MusicPlayer from './MusicPlayer.jsx'
import { loadSharedAltar } from '../storage.js'

const noop = () => {}

/**
 * Visor público de un altar compartido (solo lectura): misma escena que el
 * editor pero sin selección, sin gizmos y sin panel de edición.
 */
export default function AltarViewer({ slug }) {
  const data = useMemo(() => loadSharedAltar(slug), [slug])
  const focusRef = useRef(null)

  if (!data) {
    return (
      <div className="viewer-missing">
        <h1>Altar no encontrado</h1>
        <p>El enlace no existe o ya no está disponible en este navegador.</p>
        <a className="btn viewer-missing-btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
    )
  }

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 3.2, 5.5], fov: 50 }}>
        <AltarScene
          photo={data.photo}
          objects={data.objects}
          selectedId={null}
          mode="translate"
          snap={false}
          onSelect={noop}
          onTransform={noop}
          focusRef={focusRef}
        />
      </Canvas>

      <div className="viewer-bar">
        <span className="viewer-title">{data.name}</span>
        <a className="btn" href="#/">
          Crear mi propio altar
        </a>
      </div>
      <MusicPlayer />
    </div>
  )
}
