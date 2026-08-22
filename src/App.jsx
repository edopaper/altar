import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './components/AltarScene.jsx'
import AltarMenu from './components/AltarMenu.jsx'
import TransformToolbar from './components/TransformToolbar.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import AltarViewer from './components/AltarViewer.jsx'
import ThumbnailStage from './components/ThumbnailStage.jsx'
import AboutPanel from './components/AboutPanel.jsx'
import Toast from './components/Toast.jsx'
import { saveSharedAltar } from './storage.js'
import { MODEL_CATEGORIES, MODEL_LIST } from './models.js'
import { PAPER_LIST } from './papel.js'

// Punto donde aparecen los objetos nuevos: por encima del escalón más alto
// (y=1.75) para que el modelo no nazca oculto/enterrado dentro de la grada.
const SPAWN_POSITION = [0, 2.0, -2.2]

const SHAPE_LABELS = { cube: 'Cubo', sphere: 'Esfera', cone: 'Prisma' }

const STORAGE_KEY = 'altar-objects-v1'
const PHOTO_KEY = 'altar-photo-v1'
const CLOTH_COLOR_KEY = 'altar-cloth-color-v1'
const DEFAULT_CLOTH_COLOR = '#f7f2e8'

// Tope de objetos: cada uno con sombra cuesta hasta 4 draw calls (el pase
// normal más uno por cada luz que proyecta sombra), y el visor corre además
// en celulares con mucho menos margen que una laptop de desarrollo.
const MAX_OBJECTS = 150
const OBJECTS_WARNING_THRESHOLD = 100
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

// Intenta copiar al portapapeles; si el navegador lo bloquea (permiso,
// contexto no seguro, etc.) devuelve false para que el caller lo indique.
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
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

// Rutas por hash, sin dependencias: "#/" editor, "#/ver/<slug>" visor.
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()
  // Ruta oculta usada solo por scripts/generate-thumbnails.mjs, para
  // renderizar un modelo a la vez sobre fondo transparente.
  const thumbMatch = hash.match(/^#\/thumb\/(.+)$/)
  if (thumbMatch) return <ThumbnailStage path={decodeURIComponent(thumbMatch[1])} />
  const viewMatch = hash.match(/^#\/ver\/([a-z0-9]+)/i)
  if (viewMatch) return <AltarViewer slug={viewMatch[1]} />
  return <AltarEditor />
}

function AltarEditor() {
  const [objects, setObjects] = useState(() => {
    const saved = loadSavedObjects()
    nextId = saved.reduce((max, o) => Math.max(max, o.id), 0) + 1
    return saved
  })
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('translate')
  const [snap, setSnap] = useState(false)
  const [menuOpen, setMenuOpen] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)
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
  const [isSharing, setIsSharing] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  // Último altar compartido con éxito: si al tocar "Compartir" de nuevo el
  // contenido es idéntico, se reusa el link ya generado en vez de volver a
  // pegarle a la Edge Function (menos carga, y no gasta cupo del rate limit).
  const lastSharedRef = useRef(null)

  const showToast = useCallback((message, type = 'info', duration = 5000) => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), duration)
  }, [])
  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  const [clothColor, setClothColor] = useState(
    () => localStorage.getItem(CLOTH_COLOR_KEY) || DEFAULT_CLOTH_COLOR,
  )
  useEffect(() => {
    localStorage.setItem(CLOTH_COLOR_KEY, clothColor)
  }, [clothColor])

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

  // Publica un snapshot del altar bajo un slug y copia el enlace del visor.
  // Si el contenido es igual al del último share exitoso, no vuelve a llamar
  // a la Edge Function: copia de nuevo el link ya existente.
  const shareAltar = async () => {
    if (isSharing) return

    const shareKey = JSON.stringify({ objects, photo, clothColor })
    const cached = lastSharedRef.current
    if (cached && cached.key === shareKey) {
      const copied = await copyToClipboard(cached.url)
      showToast(
        copied
          ? 'Este altar ya estaba compartido. Enlace copiado de nuevo.'
          : `Este altar ya estaba compartido:\n${cached.url}`,
        'success',
      )
      return
    }

    setIsSharing(true)
    try {
      const { slug, remaining, limit } = await saveSharedAltar({ objects, photo, clothColor })
      const url = `${window.location.origin}${window.location.pathname}#/ver/${slug}`
      lastSharedRef.current = { key: shareKey, url }

      const copied = await copyToClipboard(url)
      const limitNote =
        typeof remaining === 'number' && typeof limit === 'number'
          ? `\nTe quedan ${remaining} de ${limit} compartidos esta hora.`
          : ''
      showToast(
        (copied ? 'Enlace copiado al portapapeles.' : `No se pudo copiar. Enlace:\n${url}`) + limitNote,
        'success',
      )
    } catch (err) {
      showToast(err?.message || 'No se pudo compartir el altar. Probá de nuevo en un momento.', 'error')
    } finally {
      setIsSharing(false)
    }
  }

  // Captura la escena como PNG: deselecciona (para que no salga el gizmo),
  // espera a que se pinte el siguiente frame y descarga el canvas.
  const captureScreenshot = () => {
    setSelectedId(null)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const canvas = document.querySelector('canvas')
        if (!canvas) return
        const link = document.createElement('a')
        link.download = `altar-${new Date().toISOString().slice(0, 10)}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }),
    )
  }

  const clearAltar = () => {
    if (objects.length === 0) return
    if (!window.confirm('¿Quitar todos los objetos del altar? Esta acción no se puede deshacer.')) return
    setObjects([])
    setSelectedId(null)
  }

  // Tope compartido por las cuatro formas de sumar objetos (forma, modelo,
  // papel picado, duplicar): evita seguir agregando pasado el límite.
  const atObjectLimit = () => {
    if (objects.length >= MAX_OBJECTS) {
      window.alert(`El altar llegó al máximo de ${MAX_OBJECTS} objetos. Elimina alguno para agregar otro.`)
      return true
    }
    return false
  }

  const addShape = (shapeKind) => {
    if (atObjectLimit()) return
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
    if (atObjectLimit()) return
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
    if (atObjectLimit()) return
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
    setObjects((prev) => prev.filter((o) => o.id !== id || o.locked))
    setSelectedId((sel) => (sel === id ? null : sel))
  }

  const toggleLock = (id) => {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, locked: !o.locked } : o)))
  }

  const duplicateObject = (id) => {
    if (atObjectLimit()) return
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
        gl={{ preserveDrawingBuffer: true }} // necesario para capturar el canvas
        camera={{ position: [0, 3.2, 5.5], fov: 50 }}
        onPointerMissed={(e) => {
          if (e.type === 'click') setSelectedId(null)
        }}
      >
        <AltarScene
          photo={photo}
          clothColor={clothColor}
          objects={objects}
          selectedId={selectedId}
          mode={mode}
          snap={snap}
          onSelect={setSelectedId}
          onTransform={updateObject}
          focusRef={focusRef}
        />
      </Canvas>

      {!menuOpen && (
        <button
          className="menu-show-btn"
          onClick={() => setMenuOpen(true)}
          title="Mostrar menú"
          aria-label="Mostrar menú"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {menuOpen && (
      <AltarMenu
        onHide={() => setMenuOpen(false)}
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
        onToggleLock={toggleLock}
        onColorChange={(color) => selected && updateObject(selected.id, { color })}
        onDuplicate={() => selected && duplicateObject(selected.id)}
        onDelete={() => selected && removeObject(selected.id)}
        onToggleSnap={() => setSnap((s) => !s)}
        onClearAltar={clearAltar}
        onShare={shareAltar}
        isSharing={isSharing}
        hasPhoto={!!photo}
        onUploadPhoto={uploadPhoto}
        onRemovePhoto={removePhoto}
        clothColor={clothColor}
        onClothColorChange={setClothColor}
        mode={mode}
        onModeChange={setMode}
        maxObjects={MAX_OBJECTS}
        objectsWarningAt={OBJECTS_WARNING_THRESHOLD}
        onShowAbout={() => setAboutOpen(true)}
      />
      )}

      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}

      <Toast toast={toast} onClose={() => setToast(null)} />

      <TransformToolbar mode={mode} onModeChange={setMode} hasSelection={!!selected} />
      <MusicPlayer />
      <button
        className="capture-btn"
        onClick={captureScreenshot}
        title="Capturar imagen del altar"
        aria-label="Capturar imagen del altar"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
    </div>
  )
}
