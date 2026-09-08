import { QualityControls } from './QualityContext.jsx'
import { readLocal, writeLocal } from './localStore.js'
import useCloudDraft from './useCloudDraft.js'
import { restoreDraft, draftStatus } from './draftState.js'
import { startGoogleLogin, getLoginErrorMessage } from './auth.js'
import { supabase } from './supabaseClient.js'
import { TEMPLATES, createTemplate } from './templates.js'
import { configuredScaleVector } from './modelScale.js'
import { alignPositions, distributePositions, snapPositionsToGrid } from './arrange.js'
import Modal from './components/Modal.jsx'
import { restoreScene, isColor } from '../supabase/functions/_shared/scene-validation.js'
import { cleanTribute } from '../supabase/functions/_shared/tribute.js'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AltarScene from './components/AltarScene.jsx'
import AltarMenu from './components/AltarMenu.jsx'
import TransformToolbar from './components/TransformToolbar.jsx'
import MusicPlayer from './components/MusicPlayer.jsx'
import UserAccount from './components/UserAccount.jsx'
import PhotoCropModal from './components/PhotoCropModal.jsx'
const AboutPanel = lazy(() => import('./components/AboutPanel.jsx'))
const HelpPanel = lazy(() => import('./components/HelpPanel.jsx'))
const Onboarding = lazy(() => import('./components/Onboarding.jsx'))
const ShareModal = lazy(() => import('./components/ShareModal.jsx'))
const TributeEditor = lazy(() => import('./components/TributeEditor.jsx'))
const SharePreviewModal = lazy(() => import('./components/SharePreviewModal.jsx'))
import Toast from './components/Toast.jsx'

import { MODEL_CATEGORIES } from './models.js'
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

// El límite también se valida en el servidor. Las sombras puntuales añaden
// seis vistas por luz; el modo ahorro usa solo una sombra direccional.
const MAX_OBJECTS = 150
const OBJECTS_WARNING_THRESHOLD = 100
const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

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
function loadSavedObjects(prefix = '', fallback = []) {
  try {
    const raw = readLocal(prefix + STORAGE_KEY)
    if (!raw) return fallback
    const saved = JSON.parse(raw)
    return restoreScene(saved)
  } catch {
    return fallback
  }
}

let nextId = 1

export default function AltarEditor({ initialAltar = null, draftPrefix = '' }) {
  const [workspace] = useState(() => {
    let stored = null
    try { stored = JSON.parse(readLocal(draftPrefix + 'workspace-v2')) } catch {}
    if (!stored && draftPrefix.startsWith('account:') && draftPrefix.endsWith(':root:')) {
      try { const guest = JSON.parse(sessionStorage.getItem('altar-login-draft')); if (guest) stored = { content: guest.content, revision: 0, baseline: null } } catch {}
    }
    if (!stored) {
      let legacyPrefix = draftPrefix
      if (draftPrefix.startsWith('account:') && draftPrefix.endsWith(':root:')) {
        try {
          const edit = JSON.parse(readLocal('altar-edit-v1'))
          if (edit?.userId && draftPrefix === `account:${edit.userId}:root:`) legacyPrefix = ''
        } catch {}
      }
      const legacy = loadSavedObjects(legacyPrefix, null)
      if (legacy) {
        const rawPhoto = readLocal(legacyPrefix + PHOTO_KEY)
        let legacyPhoto = rawPhoto
        try { legacyPhoto = JSON.parse(rawPhoto) } catch {}
        stored = { content: { objects: legacy, photo: legacyPhoto, clothColor: readLocal(legacyPrefix + CLOTH_COLOR_KEY, DEFAULT_CLOTH_COLOR), name: readLocal(legacyPrefix + 'altar-name-v1', initialAltar?.name ?? 'Mi altar') }, slug: initialAltar?.slug, revision: 0, baseline: null }
      }
    }
    if (stored && !stored.slug && draftPrefix.startsWith('account:') && draftPrefix.endsWith(':root:')) {
      try {
        const edit = JSON.parse(readLocal('altar-edit-v1'))
        if (edit?.slug && edit?.editToken && (!edit.userId || draftPrefix === `account:${edit.userId}:root:`)) {
          stored = { ...stored, slug: edit.slug, editToken: edit.editToken, revision: 0 }
        }
      } catch {}
    }
    return restoreDraft(initialAltar, stored)
  })
  useEffect(() => {
    if (draftPrefix.startsWith('account:') && draftPrefix.endsWith(':root:')) {
      try { sessionStorage.removeItem('altar-login-draft') } catch {}
    }
  }, [])
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [namePanelOpen, setNamePanelOpen] = useState(true)
  const [objects, setObjects] = useState(() => {
    const saved = restoreScene(workspace.content.objects)
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
  const [helpOpen, setHelpOpen] = useState(false)
  // Bienvenida de primera visita: solo se muestra si nunca se cerró en
  // este navegador (no depende de si ya hay objetos, por si vino de un
  // altar restaurado o compartido con otro dispositivo).
  const [showOnboarding, setShowOnboarding] = useState(() => !readLocal(ONBOARDING_KEY))
  const dismissOnboarding = () => {
    try {
      writeLocal(ONBOARDING_KEY, '1')
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

  const [photo, setPhoto] = useState(workspace.content.photo)
  const [photoCropSource, setPhotoCropSource] = useState(null)
  // Modal de compartir (redes sociales + link): null mientras está cerrado.
  const [shareInfo, setShareInfo] = useState(null)
  // Captura (data URL) mostrada en el modal de confirmación previo a
  // compartir: null mientras está cerrado.
  const [sharePreview, setSharePreview] = useState(null)
  // Aviso previo al login cuando alguien sin sesión intenta publicar.
  const [loginPrompt, setLoginPrompt] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = useCallback((message, type = 'info', duration = 5000, action = null) => {
    clearTimeout(toastTimerRef.current)
    setToast({ message, type, action })
    toastTimerRef.current = setTimeout(() => setToast(null), duration)
  }, [])
  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  const [clothColor, setClothColor] = useState(workspace.content.clothColor ?? DEFAULT_CLOTH_COLOR)
  const [altarName, setAltarName] = useState(workspace.content.name)
  // Dedicatoria: null mientras nadie escribió nada (ver tribute.js).
  const [tribute, setTribute] = useState(() => cleanTribute(workspace.content.tribute))
  const [tributeOpen, setTributeOpen] = useState(false)
  const applyContent = (value) => {
    setObjects(restoreScene(value.objects))
    nextId = Math.max(0, ...value.objects.map(o => o.id)) + 1
    setPhoto(value.photo)
    setClothColor(value.clothColor ?? DEFAULT_CLOTH_COLOR)
    setAltarName(value.name)
    setTribute(cleanTribute(value.tribute))
    setSelectedIds([])
    historyRef.current = []
    futureRef.current = []
    setCanUndo(false)
    setCanRedo(false)
  }
  const content = { objects, photo, clothColor, name: altarName, tribute }
  const cloud = useCloudDraft(content, applyContent, workspace, draftPrefix)
  const isSharing = cloud.busy
  // Único mensaje de guardado (ver draftStatus): lo comparten el panel del
  // nombre, el aviso flotante con el menú cerrado y la nota del menú, para
  // que no vuelvan a contar tres historias distintas a la vez.
  const draftState = draftStatus({
    managed: cloud.managed, online: cloud.online, busy: cloud.busy, dirty: cloud.dirty,
    error: cloud.error, localError: cloud.localError, updatedAt: cloud.updated_at,
  })
  const useTemplate = (id) => {
    const next = createTemplate(id)
    if (objects.length || photo) {
      if (!writeLocal(draftPrefix + 'recovery-v2', JSON.stringify(content))) {
        showToast('No se pudo respaldar tu altar. Libera espacio antes de cambiar de plantilla.', 'error')
        return
      }
    }
    pushHistory()
    setObjects(next.objects)
    setClothColor(next.clothColor)
    nextId = next.objects.length + 1
    setSelectedIds([])
    setTemplatesOpen(false)
    showToast('Plantilla lista. Puedes mover cada ofrenda y añadir tu fotografía.')
  }

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
    const sourceUrl = URL.createObjectURL(file)
    setPhotoCropSource((current) => {
      if (current?.revoke) URL.revokeObjectURL(current.url)
      return { url: sourceUrl, revoke: true }
    })
  }

  const editPhotoCrop = () => {
    if (photo) setPhotoCropSource({ url: photo, revoke: false })
  }

  const closePhotoCrop = () => {
    setPhotoCropSource((current) => {
      if (current?.revoke) URL.revokeObjectURL(current.url)
      return null
    })
  }

  const confirmPhotoCrop = (dataUrl) => {
    setPhoto(dataUrl)
    closePhotoCrop()
  }

  useEffect(() => () => {
    if (photoCropSource?.revoke) URL.revokeObjectURL(photoCropSource.url)
  }, [photoCropSource])

  const removePhoto = () => {
    setPhoto(null)
    if (photoCropSource) {
      closePhotoCrop()
    }
  }

  // Paso previo a compartir: muestra una captura de la escena para
  // confirmar el encuadre antes de publicar. Recién al confirmar se llama
  // a shareAltar (y por lo tanto a la Edge Function).
  const requestShare = () => {
    if (isSharing) return
    // Publicar necesita cuenta (la Edge Function exige sesión). Sin ella se
    // pide el login acá, antes de la captura: dejar seguir hasta el final y
    // recién ahí fallar era el camino confuso que había.
    if (!cloud.managed) {
      setLoginPrompt({ error: '' })
      return
    }
    withCleanCanvas((canvas) => setSharePreview(canvas.toDataURL('image/jpeg', 0.8)))
  }

  // Aviso "entra para publicar": null mientras está cerrado.
  const goToLogin = async () => {
    setLoginPrompt({ error: '', busy: true })
    try {
      await startGoogleLogin(supabase)
    } catch (err) {
      setLoginPrompt({ error: getLoginErrorMessage(err), busy: false })
    }
  }

  const shareAltar = async () => {
    const result = await cloud.save(true)
    // save() devuelve null si falló (el mensaje queda en el panel) o si un
    // autoguardado tenía tomado el candado justo en ese momento: sin este
    // aviso, publicar parecía no hacer nada.
    if (!result) {
      showToast(cloud.error || 'No se pudo publicar ahora. Espera un momento y vuelve a intentarlo.', 'error')
      return
    }
    const url = `${window.location.origin}${window.location.pathname}#/ver/${result.slug}`
    copyToClipboard(url)
    setShareInfo({ url, note: result.updated ? 'Versión publicada. El enlace sigue siendo el mismo.' : 'Tu altar ya está publicado.' })
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
      scale: configuredScaleVector(model.path),
      color: '#ffffff',
      configuredScale: true,
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
    if (patch.position) patch = { ...patch, position: patch.position.map((n) => Math.max(-1000, Math.min(1000, n))) }
    if (patch.scale) patch = { ...patch, scale: patch.scale.map((n) => (n < 0 ? -1 : 1) * Math.max(0.001, Math.min(100, Math.abs(n)))) }
    if (patch.rotation) patch = { ...patch, rotation: patch.rotation.map((n) => n % (Math.PI * 2)) }
    pushHistory()
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  // Confirma una sola actualización al soltar el gizmo de grupo.
  // Durante el arrastre Three.js muestra la previsualización sin actualizar React.
  const translateMany = useCallback((ids, delta) => {
    setObjects((prev) =>
      prev.map((o) =>
        ids.includes(o.id)
          ? { ...o, position: o.position.map((n, i) => Math.max(-1000, Math.min(1000, n + delta[i]))) }
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
      name: `${src.name.slice(0, 112)} (copia)`,
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
      name: `${src.name.slice(0, 112)} (copia)`,
      position: [src.position[0] + 0.3, src.position[1], src.position[2] + 0.3],
    }))
    pushHistory()
    setObjects((prev) => [...prev, ...copies])
    setSelectedIds(copies.map((c) => c.id))
    markJustAdded(copies[copies.length - 1].id)
  }

  // Acomodo en lote (alinear / distribuir / ajustar a la rejilla): las
  // funciones de arrange.js calculan las posiciones nuevas y acá solo se
  // aplican. Los objetos bloqueados quedan fuera, igual que en el resto de
  // las acciones en lote, así que tampoco cuentan como referencia.
  const arrangeSelected = (compute) => {
    const movable = objects.filter((o) => selectedIds.includes(o.id) && !o.locked)
    if (movable.length === 0) return
    const moves = compute(movable)
    if (moves.size === 0) return
    pushHistory()
    setObjects((prev) => prev.map((o) => (moves.has(o.id) ? { ...o, position: moves.get(o.id) } : o)))
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
      if (e.target.closest('input, textarea, select, [contenteditable], [role=dialog]')) return
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
    <div className={`app ${menuOpen ? 'app--menu-open' : ''}`}>
      {!menuOpen && <QualityControls floating />}
      <UserAccount />
      <div className={`altar-name-control ${namePanelOpen ? '' : 'altar-name-control--collapsed'}`}>
        <button
          className="altar-name-toggle"
          type="button"
          onClick={() => setNamePanelOpen((open) => !open)}
          aria-expanded={namePanelOpen}
          aria-controls="altar-name-panel"
        >
          <span>{altarName || 'Mi altar'}</span>
          <span aria-hidden="true">{namePanelOpen ? '▾' : '▴'}</span>
        </button>
        <div id="altar-name-panel" className="altar-name-panel" hidden={!namePanelOpen}>
          <label htmlFor="altar-name">Nombre de tu altar</label>
          <input id="altar-name" maxLength={120} value={altarName} onChange={e => setAltarName(e.target.value)} />
          {/* Un solo renglón de estado del guardado (draftStatus) y otro,
              aparte, de visibilidad: se guarda solo, y publicar es la única
              decisión que queda en manos de quien arma el altar. */}
          <p className={`draft-state draft-state--${draftState.tone}`} role={draftState.tone === 'error' ? 'alert' : 'status'}>
            {draftState.text}
            {draftState.retry === 'cloud' && <button className="btn btn--sm" disabled={isSharing || !!cloud.conflict} onClick={() => cloud.save(false)}>Reintentar</button>}
            {draftState.retry === 'local' && <button className="btn btn--sm" onClick={cloud.retryLocal}>Reintentar</button>}
          </p>
          <p className="publish-state">
            {cloud.is_published
              ? 'Publicado. Los cambios aparecen en el enlace cuando vuelves a publicar.'
              : 'Sin publicar. Por ahora solo tú lo ves.'}
          </p>
          <div className="shape-row"><button className="btn btn--primary" disabled={isSharing || !!cloud.conflict} onClick={requestShare}>{cloud.is_published ? 'Publicar cambios' : 'Publicar altar'}</button><button className="btn" onClick={() => setTemplatesOpen(true)}>Plantillas</button></div>
          {readLocal(draftPrefix + 'recovery-v2') && <button className="menu-about-link" onClick={cloud.restoreRecovery}>Recuperar copia anterior</button>}
        </div>
      </div>
      {!menuOpen && <div className={`draft-status draft-state--${draftState.tone}`} role="status">
        {draftState.text}
        {draftState.retry === 'local' && <button className="btn btn--sm" onClick={cloud.retryLocal}>Reintentar</button>}
      </div>}
      {cloud.conflict && <Modal label="Cambios en otro dispositivo" className="message-form" onClose={() => {}}>
        <h2>Hay dos versiones de tu altar</h2>
        <p>Tu copia local tiene cambios y existe una versión más reciente en tu cuenta. Elige cuál quieres conservar antes de sincronizar.</p>
        <p>En tu cuenta: {cloud.conflict.name} · {new Date(cloud.conflict.updated_at).toLocaleString('es-MX')} · {cloud.conflict.objects.length} objetos</p>
        <p>En este navegador: {altarName} · {objects.length} objetos</p>
        <button className="btn btn--primary" onClick={() => cloud.resolve(false)}>Usar versión de mi cuenta</button>
        <button className="btn" onClick={() => cloud.resolve(true)}>Conservar mis cambios locales</button>
        <p>Si eliges la versión de tu cuenta, podrás recuperar tu copia local desde «Recuperar copia anterior».</p>
      </Modal>}
      {loginPrompt && <Modal label="Entra para publicar" className="message-form" onClose={() => setLoginPrompt(null)}>
        <h2>Publicar necesita tu cuenta</h2>
        <p>El enlace público vive en tu cuenta: desde ahí puedes actualizar el altar sin cambiar el enlace, o darlo de baja cuando quieras.</p>
        <p>Tu altar no se pierde: lo que armaste hasta ahora viaja contigo al volver del login.</p>
        {loginPrompt.error && <p role="alert">{loginPrompt.error}</p>}
        <button className="btn btn--primary" onClick={goToLogin} disabled={loginPrompt.busy}>
          {loginPrompt.busy ? 'Abriendo…' : 'Entrar con Google'}
        </button>
        <button className="btn" onClick={() => setLoginPrompt(null)}>Seguir sin publicar</button>
      </Modal>}
      {templatesOpen && <Modal label="Elegir plantilla" className="message-form template-picker" onClose={() => setTemplatesOpen(false)}>
        <h2>Un punto de partida para tu homenaje</h2>
        <p>La plantilla sustituye la decoración y el mantel; conserva tu fotografía. Guardaremos una copia de tu composición anterior.</p>
        <div className="template-grid">{TEMPLATES.map(t => <button className="template-card" key={t.id} onClick={() => useTemplate(t.id)}>
          <img src={t.objects[t.objects.length - 1].modelPath.replace('/models/altar/', '/models/altar-thumbnails/').replace('.glb', '.png')} alt="" />
          <strong>{t.name}</strong><span>{t.description}</span><small>{t.objects.length} ofrendas · Editable</small>
        </button>)}</div>
        <button className="btn" onClick={() => setTemplatesOpen(false)}>Seguir con mi altar</button>
      </Modal>}
      <Canvas
        shadows
        dpr={[1, 1.5]}
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

      <Suspense fallback={<div className="loading-notice" role="status">Cargando…</div>}>
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
        onAlignSelected={(axis, edge) => arrangeSelected((sel) => alignPositions(sel, axis, edge))}
        onDistributeSelected={(axis) => arrangeSelected((sel) => distributePositions(sel, axis))}
        onSnapSelectedToGrid={() => arrangeSelected((sel) => snapPositionsToGrid(sel))}
        onDuplicateSelected={duplicateSelected}
        onDeleteSelected={removeSelected}
        onRename={renameObject}
        onToggleSnap={() => setSnap((s) => !s)}
        onClearAltar={clearAltar}
        hasPhoto={!!photo}
        onUploadPhoto={uploadPhoto}
        onEditPhoto={editPhotoCrop}
        onRemovePhoto={removePhoto}
        clothColor={clothColor}
        onClothColorChange={setClothColor}
        mode={mode}
        onModeChange={setMode}
        draftState={draftState}
        onRetryLocalSave={cloud.retryLocal}
        maxObjects={MAX_OBJECTS}
        objectsWarningAt={OBJECTS_WARNING_THRESHOLD}
        tribute={tribute}
        onEditTribute={() => setTributeOpen(true)}
        onShowAbout={() => setAboutOpen(true)}
        onShowHelp={() => setHelpOpen(true)}
      />
      )}

      {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {showOnboarding && (
        <Onboarding
          onClose={dismissOnboarding}
          onShowHelp={() => {
            dismissOnboarding()
            setHelpOpen(true)
          }}
        />
      )}
      {shareInfo && (
        <ShareModal url={shareInfo.url} note={shareInfo.note} onClose={() => {
          setShareInfo(null)
        }} />
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
      {tributeOpen && (
        <TributeEditor
          tribute={tribute}
          photo={photo}
          onSave={setTribute}
          onClose={() => setTributeOpen(false)}
        />
      )}
      {photoCropSource && (
        <PhotoCropModal
          source={photoCropSource.url}
          onCancel={closePhotoCrop}
          onConfirm={confirmPhotoCrop}
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
        className="capture-btn help-btn"
        onClick={() => setHelpOpen(true)}
        title="Ayuda"
        aria-label="Ayuda"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 1.8-2.8 2.2-2.8 3.6" />
          <circle cx="12" cy="17.2" r="0.4" fill="currentColor" />
        </svg>
      </button>
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
      </Suspense>
    </div>
  )
}
