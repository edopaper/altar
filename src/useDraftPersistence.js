import { useEffect, useRef, useState } from 'react'
import { writeLocal } from './localStore.js'

export default function useDraftPersistence(objects, photo, clothColor, prefix = '') {
  const [status, setStatus] = useState('saving')
  const pending = useRef(null)
  const timer = useRef(null)
  const flush = (announce = true) => {
    if (!pending.current) return
    const draft = pending.current
    const results = [
      writeLocal(prefix + 'altar-objects-v1', JSON.stringify(draft.objects)),
      writeLocal(prefix + 'altar-photo-v1', prefix ? JSON.stringify(draft.photo) : draft.photo),
      writeLocal(prefix + 'altar-cloth-color-v1', draft.clothColor),
    ]
    const ok = results.every(Boolean)
    if (ok) pending.current = null
    if (announce) setStatus(ok ? 'saved' : 'error')
  }
  useEffect(() => {
    pending.current = { objects, photo, clothColor }
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
    return () => clearTimeout(timer.current)
  }, [objects, photo, clothColor])
  useEffect(() => {
    const save = () => flush(false)
    const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer.current)
      save()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return { status, retry: () => flush() }
}
