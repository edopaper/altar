import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal.jsx'

const VIEWPORT_W = 260
const VIEWPORT_H = 325
const OUTPUT_H = 512
const OUTPUT_W = Math.round((OUTPUT_H * VIEWPORT_W) / VIEWPORT_H)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getDisplaySize(image, zoom) {
  const coverScale = Math.max(VIEWPORT_W / image.naturalWidth, VIEWPORT_H / image.naturalHeight)
  return {
    width: image.naturalWidth * coverScale * zoom,
    height: image.naturalHeight * coverScale * zoom,
  }
}

function clampOffset(offset, image, zoom) {
  const size = getDisplaySize(image, zoom)
  return {
    x: clamp(offset.x, (VIEWPORT_W - size.width) / 2, (size.width - VIEWPORT_W) / 2),
    y: clamp(offset.y, (VIEWPORT_H - size.height) / 2, (size.height - VIEWPORT_H) / 2),
  }
}

async function renderCrop(image, zoom, offset) {
  const size = getDisplaySize(image, zoom)
  const left = (VIEWPORT_W - size.width) / 2 + offset.x
  const top = (VIEWPORT_H - size.height) / 2 + offset.y
  const sx = (-left / size.width) * image.naturalWidth
  const sy = (-top / size.height) * image.naturalHeight
  const sw = (VIEWPORT_W / size.width) * image.naturalWidth
  const sh = (VIEWPORT_H / size.height) * image.naturalHeight

  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_W
  canvas.height = OUTPUT_H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#1c1623'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function PhotoCropModal({ source, onCancel, onConfirm }) {
  const imageRef = useRef(null)
  const dragRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)

  const display = useMemo(() => {
    if (!loaded || !imageRef.current) return { width: VIEWPORT_W, height: VIEWPORT_H }
    return getDisplaySize(imageRef.current, zoom)
  }, [loaded, zoom])

  useEffect(() => {
    if (!loaded || !imageRef.current) return
    setOffset((current) => clampOffset(current, imageRef.current, zoom))
  }, [loaded, zoom])

  const startDrag = (event) => {
    if (!loaded || !imageRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, offset }
  }

  const drag = (event) => {
    if (!dragRef.current || !imageRef.current) return
    const next = {
      x: dragRef.current.offset.x + event.clientX - dragRef.current.x,
      y: dragRef.current.offset.y + event.clientY - dragRef.current.y,
    }
    setOffset(clampOffset(next, imageRef.current, zoom))
  }

  const stopDrag = () => {
    dragRef.current = null
  }

  const confirm = async () => {
    if (!imageRef.current) return
    setSaving(true)
    try {
      onConfirm(await renderCrop(imageRef.current, zoom, clampOffset(offset, imageRef.current, zoom)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onCancel} label="Encuadrar fotografía" className="photo-crop-modal">
      <div className="photo-crop-header">
        <h2>Encuadrar fotografía</h2>
        <button className="menu-hide-btn" onClick={onCancel} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div
        className="photo-crop-stage"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <img
          ref={imageRef}
          src={source}
          alt="Vista previa de la fotografía"
          draggable="false"
          onLoad={() => setLoaded(true)}
          onError={() => {
            window.alert('No se pudo procesar la imagen.')
            onCancel()
          }}
          style={{
            width: `${display.width}px`,
            height: `${display.height}px`,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          }}
        />
        <div className="photo-crop-frame" aria-hidden="true" />
      </div>
      <label className="photo-crop-control">
        Acercamiento
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      <div className="photo-crop-actions">
        <button className="btn" onClick={onCancel}>Cancelar</button>
        <button className="btn btn--primary" onClick={confirm} disabled={!loaded || saving}>
          {saving ? 'Procesando…' : 'Usar encuadre'}
        </button>
      </div>
    </Modal>
  )
}
