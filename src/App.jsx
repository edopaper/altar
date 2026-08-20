import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './components/AltarScene.jsx'
import AltarMenu from './components/AltarMenu.jsx'
import TransformToolbar from './components/TransformToolbar.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import { MODEL_CATEGORIES, MODEL_LIST } from './models.js'
import { PAPER_LIST } from './papel.js'

// Punto donde aparecen los objetos nuevos: centro del altar (nivel medio).
const SPAWN_POSITION = [0, 1.0, -2.2]

const SHAPE_LABELS = { cube: 'Cubo', sphere: 'Esfera', cone: 'Prisma' }

const STORAGE_KEY = 'altar-objects-v1'
const PHOTO_KEY = 'altar-photo-v1'
const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const PHOTO_SIZE = 512

// Escala la imagen conservando su proporción (máximo 512 px por lado, sin
// recortar) y la devuelve como data URL JPEG lista para localStorage.
async function processPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, PHOTO_SIZE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Restaura la escena guardada; descarta objetos cuyo .glb ya no exista en la
// carpeta de modelos (p. ej. si se renombró o movió el archivo).
function loadSavedObjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved)) return []
    const validModels = new Set(MODEL_LIST.map((m) => m.path))
    const validPapers = new Set(PAPER_LIST.map((p) => p.path))
    return saved.filter(
      (o) =>
        o &&
        typeof o.id === 'number' &&
        (o.type === 'shape' ||
          (o.type === 'paper' ? validPapers.has(o.paperPath) : validModels.has(o.modelPath))),
    )
  } catch {
    return []
  }
}

let nextId = 1

export default function App() {
  const [objects, setObjects] = useState(() => {
    const saved = loadSavedObjects()
    nextId = saved.reduce((max, o) => Math.max(max, o.id), 0) + 1
    return saved
  })
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('translate')
  const [snap, setSnap] = useState(false)
  const focusRef = useRef(null) // lo llena AltarScene para centrar la cámara

  // Autoguardado: cada cambio en la escena se persiste en localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(objects))
    } catch {
      // almacenamiento lleno o bloqueado: se ignora, la app sigue funcionando
    }
  }, [objects])

  const [photo, setPhoto] = useState(() => localStorage.getItem(PHOTO_KEY))

  const uploadPhoto = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      window.alert('El archivo debe ser una imagen.')
      return
    }
    if (file.size > PHOTO_MAX_BYTES) {
      window.alert('La imagen no puede pesar más de 5 MB.')
      return
    }
    try {
      const dataUrl = await processPhoto(file)
      setPhoto(dataUrl)
      localStorage.setItem(PHOTO_KEY, dataUrl)
    } catch {
      window.alert('No se pudo procesar la imagen.')
    }
  }

  const removePhoto = () => {
    setPhoto(null)
    localStorage.removeItem(PHOTO_KEY)
  }

  const clearAltar = () => {
    if (objects.length === 0) return
    if (!window.confirm('¿Quitar todos los objetos del altar? Esta acción no se puede deshacer.')) return
    setObjects([])
    setSelectedId(null)
  }

  const addShape = (shapeKind) => {
    const obj = {
      id: nextId++,
      type: 'shape',
      shapeKind,
      modelPath: null,
      name: `${SHAPE_LABELS[shapeKind]} ${nextId - 1}`,
      position: [...SPAWN_POSITION],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#e8873b',
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  const addModel = (model) => {
    const obj = {
      id: nextId++,
      type: 'model',
      shapeKind: null,
      modelPath: model.path,
      name: `${model.name} ${nextId - 1}`,
      position: [...SPAWN_POSITION],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#ffffff',
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  const addPaper = (paper) => {
    const obj = {
      id: nextId++,
      type: 'paper',
      shapeKind: null,
      modelPath: null,
      paperPath: paper.path,
      name: `${paper.name} ${nextId - 1}`,
      position: [0, 2.2, -2.2], // el papel picado suele ir colgado en alto
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#d6217e', // rosa mexicano
    }
    setObjects((prev) => [...prev, obj])
    setSelectedId(obj.id)
  }

  const updateObject = useCallback((id, patch) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  const removeObject = (id) => {
    setObjects((prev) => prev.filter((o) => o.id !== id))
    setSelectedId((sel) => (sel === id ? null : sel))
  }

  const duplicateObject = (id) => {
    const src = objects.find((o) => o.id === id)
    if (!src) return
    const copy = {
      ...src,
      id: nextId++,
      name: `${src.name} (copia)`,
      position: [src.position[0] + 0.3, src.position[1], src.position[2] + 0.3],
    }
    setObjects((prev) => [...prev, copy])
    setSelectedId(copy.id)
  }

  const selectFromList = (id) => {
    setSelectedId(id)
    const obj = objects.find((o) => o.id === id)
    if (obj && focusRef.current) focusRef.current(obj.position)
  }

  // Atajos estilo Blender: G mover, R rotar, S escalar
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const k = e.key.toLowerCase()
      if (k === 'g') setMode('translate')
      else if (k === 'r') setMode('rotate')
      else if (k === 's') setMode('scale')
      else if (k === 'escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selected = objects.find((o) => o.id === selectedId) ?? null

  return (
    <div className="app">
      <Canvas
        shadows
        camera={{ position: [0, 3.2, 5.5], fov: 50 }}
        onPointerMissed={(e) => {
          if (e.type === 'click') setSelectedId(null)
        }}
      >
        <AltarScene
          photo={photo}
          objects={objects}
          selectedId={selectedId}
          mode={mode}
          snap={snap}
          onSelect={setSelectedId}
          onTransform={updateObject}
          focusRef={focusRef}
        />
      </Canvas>

      <AltarMenu
        models={MODEL_LIST}
        categories={MODEL_CATEGORIES}
        objects={objects}
        selected={selected}
        snap={snap}
        onAddShape={addShape}
        onAddModel={addModel}
        papers={PAPER_LIST}
        onAddPaper={addPaper}
        onSelectObject={selectFromList}
        onColorChange={(color) => selected && updateObject(selected.id, { color })}
        onDuplicate={() => selected && duplicateObject(selected.id)}
        onDelete={() => selected && removeObject(selected.id)}
        onToggleSnap={() => setSnap((s) => !s)}
        onClearAltar={clearAltar}
        hasPhoto={!!photo}
        onUploadPhoto={uploadPhoto}
        onRemovePhoto={removePhoto}
        mode={mode}
        onModeChange={setMode}
      />

      <TransformToolbar mode={mode} onModeChange={setMode} hasSelection={!!selected} />
      <MusicPlayer />
    </div>
  )
}
