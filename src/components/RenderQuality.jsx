import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useQuality } from '../QualityContext.jsx'

export default function RenderQuality() {
  const { low, preset, downgrade, reducedMotion } = useQuality()
  const setFrameloop = useThree((state) => state.setFrameloop)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    setFrameloop(reducedMotion ? 'demand' : 'always')
    invalidate()
  }, [reducedMotion, setFrameloop, invalidate])
  const setDpr = useThree((state) => state.setDpr)
  useEffect(() => { setDpr(low ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)) }, [low, setDpr])
  return preset === 'auto' && !low && !reducedMotion
    ? <PerformanceMonitor bounds={() => [35, 55]} onDecline={downgrade} />
    : null
}
