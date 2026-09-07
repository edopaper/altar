import { createContext, useContext, useEffect, useState } from 'react'
import { readLocal, writeLocal } from './localStore.js'
const Context = createContext(null)
export function QualityProvider({ children }) {
  const [preset, setPreset] = useState(() => {
    const saved = readLocal('altar-quality-v1', 'auto')
    return ['auto', 'low', 'high'].includes(saved) ? saved : 'auto'
  })
  const [slow, setSlow] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  const [systemMotion, setSystemMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [motionOverride, setMotionOverride] = useState(() => readLocal('altar-reduced-motion-v1'))
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setSystemMotion(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const reducedMotion = motionOverride === null ? systemMotion : motionOverride === 'true'
  const low = preset === 'low' || (preset === 'auto' && slow)
  const changePreset = (value) => { setPreset(value); writeLocal('altar-quality-v1', value) }
  const changeMotion = (value) => { setMotionOverride(String(value)); writeLocal('altar-reduced-motion-v1', String(value)) }
  return <Context.Provider value={{ preset, low, reducedMotion, changePreset, changeMotion, downgrade: () => setSlow(true) }}>{children}</Context.Provider>
}
export const useQuality = () => useContext(Context)
export function QualityControls({ floating = false }) {
  const quality = useQuality()
  return <details className={`quality-controls ${floating ? 'quality-controls--floating' : ''}`}>
    <summary>Opciones de visualización</summary>
    <label>Calidad <select value={quality.preset} onChange={(e) => quality.changePreset(e.target.value)}>
      <option value="auto">Automática</option><option value="low">Ahorro</option><option value="high">Alta</option>
    </select></label>
    <label><input type="checkbox" checked={quality.reducedMotion} onChange={(e) => quality.changeMotion(e.target.checked)} /> Reducir movimiento</label>
  </details>
}
