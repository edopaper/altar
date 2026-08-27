import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './components/AltarScene.jsx'
import AltarMenu from './components/AltarMenu.jsx'
import TransformToolbar from './components/TransformToolbar.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import AltarViewer from './components/AltarViewer.jsx'
import ThumbnailStage from './components/ThumbnailStage.jsx'
import AboutPanel from './components/AboutPanel.jsx'
import Onboarding from './components/Onboarding.jsx'
import ShareModal from './components/ShareModal.jsx'
import SharePreviewModal from './components/SharePreviewModal.jsx'
import Toast from './components/Toast.jsx'
import AdminDashboard, { POST_LOGIN_REDIRECT_KEY } from './components/AdminDashboard.jsx'
import { supabase } from './supabaseClient.js'
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
const ONBOARDING_KEY = 'altar-onboarded-v1'
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

// Recuerda el último altar compartido (huella del contenido + url) en
// localStorage, no solo en memoria: así "sin cambios desde la última vez"
// sigue siendo válido aunque se recargue la página o se vuelva otro día.
const LAST_SHARE_KEY = 'altar-last-share-v1'

function loadLastShare() {
  try {
    const raw = localStorage.getItem(LAST_SHARE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLastShare(entry) {
  try {
    localStorage.setItem(LAST_SHARE_KEY, JSON.stringify(entry))
  } catch {
    // almacenamiento lleno o bloqueado: se ignora, solo se pierde el atajo
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

  // Tras volver del login con GitHub (sin hash propio en el redirectTo, para
  // no chocar con supabase-js al parsear el token de la URL), si el usuario
  // había arrancado el login desde el panel de admin lo mandamos de vuelta.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN') return
      const redirect = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
      if (redirect) {
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
        window.location.hash = redirect
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Ruta oculta usada solo por scripts/generate-thumbnails.mjs, para
  // renderizar un modelo a la vez sobre fondo transparente.
  const thumbMatch = hash.match(/^#\/thumb\/(.+)$/)
  if (thumbMatch) return <ThumbnailStage path={decodeURIComponent(thumbMatch[1])} />
  const viewMatch = hash.match(/^#\/ver\/([a-z0-9]+)/i)
  if (viewMatch) return <AltarViewer slug={viewMatch[1]} />
  if (hash.startsWith('#/admin')) return <AdminDashboard />
  return <AltarEditor />
}

function AltarEditor() {
  const [objects, setObjects] = useState(() => {
    const saved = loadSavedObjects()
    nextId = saved.reduce((max, o) => Math.max(max, o.id), 0) + 1
    return saved
  })
  // Selección múltiple: lista de ids. La mayoría de las acciones (menú
  // "Seleccionado", atajos G/R/S) siguen pensadas para un solo objeto; con
  // 2+ seleccionados el menú muestra un panel de acciones en lote y el
  // gizmo de mover en grupo (GroupTransformControls en AltarScene.jsx).
  const [selectedIds, setSelectedIds] = useState([])
  // Espeja selectedIds para leerlo desde el listener de teclado (atajo F de
  // enfocar cámara) sin depender de una closure vieja.
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  // additive=true (Shift/Ctrl/Cmd+clic) suma o quita `id` de la selección
  // actual; si no, la reemplaza. id=null limpia la selección.
  const selectObject = useCallback((id, additive = false) => {
    setSelectedIds((prev) => {
      if (id == null) return []
      if (!additive) return [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }, [])
  const [mode, setMode] = useState('translate')
  const [snap, setSnap] = useState(false)
  const [menuOpen, setMenuOpen] = useState(true)
  const [aboutOpen, setAboutOpen] = useState(false)
  // Bienvenida de primera visita: solo se muestra si nunca se cerró en
  // este navegador (no depende de si ya hay objetos, por si vino de un
  // altar restaurado o compartido con otro dispositivo).
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  const dismissOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      // almacenamiento lleno o bloqueado: se ignora, solo vuelve a aparecer la próxima vez
    }
    setShowOnboarding(false)
  }

  // Id del último objeto agregado/duplicado: dispara un pulso breve sobre
  // él (AltarObject.jsx) para que se note incluso si queda fuera de foco o
  // detrás de otro objeto en escenas grandes.
  const [justAddedId, setJustAddedId] = useState(null)
  const justAddedTimerRef = useRef(null)
  const markJustAdded = (id) => {
    clearTimeout(justAddedTimerRef.current)
    setJustAddedId(id)
    justAddedTimerRef.current = setTimeout(() => setJustAddedId(null), 700)
  }
  useEffect(() => () => clearTimeout(justAddedTimerRef.current), [])
  const focusRef = useRef(null) // lo llena AltarScene para centrar la cámara

  // Historial para Ctrl+Z / Ctrl+Shift+Z: pilas de snapshots de `objects`
  // (acotadas para no crecer sin límite en una sesión larga). objectsRef
  // espeja el estado más reciente para que undo/redo (llamados desde el
  // listener de teclado, con identidad estable) siempre lean el valor
  // actual sin depender de closures viejas.
  const HISTORY_LIMIT = 20
  const objectsRef = useRef(objects)
  useEffect(() => {
    objectsRef.current = objects
  }, [objects])
  const historyRef = useRef([])
  const futureRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Guarda el estado previo a un cambio para poder deshacerlo. Cualquier
  // acción nueva descarta el "rehacer" pendiente (se abre una rama nueva).
  // Se llama ANTES de aplicar el cambio con setObjects.
  const pushHistory = () => {
    historyRef.current = [...historyRef.current, objectsRef.current].slice(-HISTORY_LIMIT)
    futureRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const past = historyRef.current[historyRef.current.length - 1]
    historyRef.current = historyRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, objectsRef.current].slice(-HISTORY_LIMIT)
    setObjects(past)
    setSelectedIds([])
    setCanUndo(historyRef.current.length > 0)
    setCanRedo(true)
  }, [])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current[futureRef.current.length - 1]
    futureRef.current = futureRef.current.slice(0, -1)
    historyRef.current = [...historyRef.current, objectsRef.current].slice(-HISTORY_LIMIT)
    setObjects(next)
    setSelectedIds([])
    setCanRedo(futureRef.current.length > 0)
    setCanUndo(true)
  }, [])

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
  // Modal de compartir (redes sociales + link): null mientras está cerrado.
  const [shareInfo, setShareInfo] = useState(null)
  // Captura (data URL) mostrada en el modal de confirmación previo a
  // compartir: null mientras está cerrado.
  const [sharePreview, setSharePreview] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  // Último altar compartido con éxito: si al tocar "Compartir" de nuevo el
  // contenido es idéntico, se reusa el link ya generado en vez de volver a
  // pegarle a la Edge Function (menos carga, y no gasta cupo del rate limit).
  // Se precarga desde localStorage para que la detección de "sin cambios"
  // sobreviva a un reload, no solo dentro de la misma sesión.
  const lastSharedRef = useRef(loadLastShare())

  const showToast = useCallback((message, type = 'info', duration = 5000, action = null) => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, type, action })
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

  // Paso previo a compartir: muestra una captura de la escena para
  // confirmar el encuadre antes de publicar. Recién al confirmar se llama
  // a shareAltar (y por lo tanto a la Edge Function).
  const requestShare = () => {
    if (isSharing) return
    withCleanCanvas((canvas) => setSharePreview(canvas.toDataURL('image/jpeg', 0.8)))
  }

  // Publica un snapshot del altar bajo un slug y abre el modal de
  // compartir (redes sociales + link). Si el contenido es igual al del
  // último share exitoso, no vuelve a llamar a la Edge Function: reabre el
  // modal con el link ya existente.
  const shareAltar = async () => {
    if (isSharing) return

    const shareKey = JSON.stringify({ objects, photo, clothColor })
    const cached = lastSharedRef.current
    if (cached && cached.key === shareKey) {
      copyToClipboard(cached.url) // best-effort, el modal ya deja copiar a mano
      setShareInfo({ url: cached.url, note: 'Sin cambios desde la última vez.' })
      return
    }

    setIsSharing(true)
    try {
      const { slug, remaining, limit, updated } = await saveSharedAltar({ objects, photo, clothColor })
      const url = `${window.location.origin}${window.location.pathname}#/ver/${slug}`
      const entry = { key: shareKey, url }
      lastSharedRef.current = entry
      saveLastShare(entry)
      copyToClipboard(url) // best-effort, el modal ya deja copiar a mano

      const limitNote =
        typeof remaining === 'number' && typeof limit === 'number'
          ? ` Te quedan ${remaining} de ${limit} compartidos esta hora.`
          : ''
      const note =
        (updated ? 'Cambios guardados en el mismo enlace de siempre.' : 'Tu altar ya está publicado.') + limitNote
      setShareInfo({ url, note })
    } catch (err) {
      showToast(err?.message || 'No se pudo compartir el altar. Probá de nuevo en un momento.', 'error')
    } finally {
      setIsSharing(false)
    }
  }

  // Deselecciona (para que no salga el gizmo en la imagen), espera a que se
  // pinte el siguiente frame y entrega el canvas listo para capturar. Lo
  // comparten la descarga de PNG y el preview previo a compartir.
  const withCleanCanvas = (fn) => {
    setSelectedIds([])
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const canvas = document.querySelector('canvas')
        if (canvas) fn(canvas)
      }),
    )
  }

  // Captura la escena como PNG y la descarga.
  const captureScreenshot = () => {
    withCleanCanvas((canvas) => {
      const link = document.createElement('a')
      link.download = `altar-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    })
  }

  // Sin confirm() bloqueante: limpia al instante y ofrece "Deshacer" en un
  // toast (misma política que eliminar un objeto individual, que tampoco
  // pide confirmación porque todo pasa por el historial de Ctrl+Z).
  const clearAltar = () => {
    if (objects.length === 0) return
    pushHistory()
    setObjects([])
    setSelectedIds([])
    showToast('Se quitaron todos los objetos del altar.', 'info', 8000, {
      label: 'Deshacer',
      onClick: undo,
    })
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
    pushHistory()
    setObjects((prev) => [...prev, obj])
    setSelectedIds([obj.id])
    markJustAdded(obj.id)
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
    pushHistory()
    setObjects((prev) => [...prev, obj])
    setSelectedIds([obj.id])
    markJustAdded(obj.id)
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
    pushHistory()
    setObjects((prev) => [...prev, obj])
    setSelectedIds([obj.id])
    markJustAdded(obj.id)
  }

  const updateObject = useCallback((id, patch) => {
    pushHistory()
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  // Aplica el mismo delta de posición a varios objetos a la vez: lo usa
  // GroupTransformControls (AltarScene.jsx) mientras se arrastra el gizmo
  // compartido de mover en grupo. No llama a pushHistory (dispara en cada
  // frame de arrastre); eso lo hace onGroupDragStart una sola vez.
  const translateMany = useCallback((ids, delta) => {
    setObjects((prev) =>
      prev.map((o) =>
        ids.includes(o.id)
          ? { ...o, position: [o.position[0] + delta[0], o.position[1] + delta[1], o.position[2] + delta[2]] }
          : o,
      ),
    )
  }, [])
  const groupDragStarted = useRef(false)
  const onGroupDragStart = useCallback(() => {
    if (groupDragStarted.current) return
    groupDragStarted.current = true
    pushHistory()
  }, [])
  const onGroupDragEnd = useCallback(() => {
    groupDragStarted.current = false
  }, [])

  const removeObject = (id) => {
    pushHistory()
    setObjects((prev) => prev.filter((o) => o.id !== id || o.locked))
    setSelectedIds((sel) => sel.filter((s) => s !== id))
  }

  // Elimina todos los objetos seleccionados (los bloqueados, si por algún
  // motivo estuvieran en la selección, se conservan).
  const removeSelected = () => {
    if (selectedIds.length === 0) return
    pushHistory()
    setObjects((prev) => prev.filter((o) => !selectedIds.includes(o.id) || o.locked))
    setSelectedIds([])
  }

  const toggleLock = (id) => {
    pushHistory()
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
    pushHistory()
    setObjects((prev) => [...prev, copy])
    setSelectedIds([copy.id])
    markJustAdded(copy.id)
  }

  // Duplica todos los objetos seleccionados de una vez, conservando el
  // mismo desplazamiento visible que la duplicación individual, y deja
  // seleccionadas las copias (no los originales).
  const duplicateSelected = () => {
    if (selectedIds.length === 0) return
    const sources = objects.filter((o) => selectedIds.includes(o.id))
    if (sources.length === 0) return
    if (objects.length + sources.length > MAX_OBJECTS) {
      window.alert(`El altar llegó al máximo de ${MAX_OBJECTS} objetos. Elimina alguno para agregar otro.`)
      return
    }
    const copies = sources.map((src) => ({
      ...src,
      id: nextId++,
      name: `${src.name} (copia)`,
      position: [src.position[0] + 0.3, src.position[1], src.position[2] + 0.3],
    }))
    pushHistory()
    setObjects((prev) => [...prev, ...copies])
    setSelectedIds(copies.map((c) => c.id))
    markJustAdded(copies[copies.length - 1].id)
  }

  const renameObject = (id, name) => {
    pushHistory()
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, name } : o)))
  }

  // additive=true (Shift/Ctrl/Cmd+clic en la lista) extiende la selección
  // en vez de reemplazarla, igual que el clic en la escena 3D.
  const selectFromList = (id, additive = false) => {
    selectObject(id, additive)
    if (!additive) {
      const obj = objects.find((o) => o.id === id)
      if (obj && focusRef.current) focusRef.current(obj.position)
    }
  }

  // Atajos estilo Blender: G mover, R rotar, S escalar, F enfoca la cámara
  // en el objeto seleccionado. Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z (o
  // Ctrl+Y) rehace.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const cmd = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (cmd && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (cmd && k === 'y') {
        e.preventDefault()
        redo()
      } else if (k === 'g') setMode('translate')
      else if (k === 'r') setMode('rotate')
      else if (k === 's') setMode('scale')
      else if (k === 'escape') setSelectedIds([])
      else if (k === 'f') {
        const obj = objectsRef.current.find((o) => o.id === selectedIdsRef.current[0])
        if (obj && focusRef.current) focusRef.current(obj.position)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Con selección múltiple el gizmo de grupo solo mueve (no rota/escala),
  // así que al pasar de 1 a 2+ seleccionados forzamos el modo a "translate"
  // para que la toolbar no quede mostrando Rotar/Escalar como activos sin
  // que hagan nada.
  useEffect(() => {
    if (selectedIds.length > 1) setMode('translate')
  }, [selectedIds.length])

  const selected = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) ?? null : null
  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id))

  return (
    <div className="app">
      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }} // necesario para capturar el canvas
        camera={{ position: [0, 3.2, 5.5], fov: 50 }}
        onPointerMissed={(e) => {
          if (e.type === 'click') setSelectedIds([])
        }}
      >
        <AltarScene
          photo={photo}
          clothColor={clothColor}
          objects={objects}
          selectedIds={selectedIds}
          justAddedId={justAddedId}
          mode={mode}
          snap={snap}
          onSelect={selectObject}
          onTransform={updateObject}
          onTranslateMany={translateMany}
          onGroupDragStart={onGroupDragStart}
          onGroupDragEnd={onGroupDragEnd}
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
        categories={MODEL_CATEGORIES}
        objects={objects}
        selected={selected}
        selectedIds={selectedIds}
        selectedObjects={selectedObjects}
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
        onDuplicateSelected={duplicateSelected}
        onDeleteSelected={removeSelected}
        onRename={renameObject}
        onToggleSnap={() => setSnap((s) => !s)}
        onClearAltar={clearAltar}
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
      {showOnboarding && <Onboarding onClose={dismissOnboarding} />}
      {shareInfo && (
        <ShareModal url={shareInfo.url} note={shareInfo.note} onClose={() => setShareInfo(null)} />
      )}
      {sharePreview && (
        <SharePreviewModal
          image={sharePreview}
          onConfirm={() => {
            setSharePreview(null)
            shareAltar()
          }}
          onClose={() => setSharePreview(null)}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />

      <TransformToolbar
        mode={mode}
        onModeChange={setMode}
        hasSelection={selectedIds.length > 0}
        multiSelect={selectedIds.length > 1}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />
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
      <button
        className="capture-btn publish-btn"
        onClick={requestShare}
        disabled={(objects.length === 0 && !photo) || isSharing}
        title={isSharing ? 'Compartiendo…' : 'Compartir altar'}
        aria-label={isSharing ? 'Compartiendo…' : 'Compartir altar'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
      </button>
    </div>
  )
}
