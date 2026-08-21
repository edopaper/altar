import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'

const FLIGHT_DURATION = 9 // segundos que tarda en cruzar la escena
const CHAR_INTERVAL = 0.055 // s por carácter revelado (máquina de escribir)
const FADE_IN_FRACTION = 0.12
const FADE_OUT_FRACTION = 0.85
// El alma entra desde el costado, lejos del altar; el texto empieza a
// escribirse recién cuando ya está cerca del centro, no nada más aparecer.
const TYPEWRITER_START_DELAY = 3

const COLORS = ['#ffcf8a', '#ffb3c6', '#fff3d6']

// Textura de halo compartida entre todas las almas: gradiente radial blanco
// que se desvanece, teñida por instancia con el color del sprite.
let haloTexture = null
function getHaloTexture() {
  if (haloTexture) return haloTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  haloTexture = new THREE.CanvasTexture(canvas)
  return haloTexture
}

/**
 * Un alma: esfera-núcleo brillante + halo aditivo + luz cálida, que cruza la
 * escena en un arco suave mientras un mensaje corto se escribe solo arriba,
 * y se desvanece al terminar. Avisa a SoulField con onDone para que la quite.
 */
export default function SoulSpirit({ soul, onDone }) {
  const groupRef = useRef()
  const coreRef = useRef()
  const haloRef = useRef()
  const lightRef = useRef()
  const startRef = useRef(null)
  const doneRef = useRef(false)
  const [charCount, setCharCount] = useState(0)

  const color = useMemo(() => COLORS[soul.colorIndex % COLORS.length], [soul.colorIndex])
  const halo = useMemo(() => getHaloTexture(), [])
  const { path, message } = soul

  useFrame(({ clock }) => {
    if (doneRef.current) return
    if (startRef.current === null) startRef.current = clock.elapsedTime
    const age = clock.elapsedTime - startRef.current
    const progress = Math.min(age / FLIGHT_DURATION, 1)

    if (progress >= 1) {
      doneRef.current = true
      onDone(soul.key)
      return
    }

    const x = THREE.MathUtils.lerp(path.x0, path.x1, progress)
    const y = path.baseY + Math.sin(progress * Math.PI) * path.arcHeight
    groupRef.current?.position.set(x, y, path.z)

    let opacity = 1
    if (progress < FADE_IN_FRACTION) opacity = progress / FADE_IN_FRACTION
    else if (progress > FADE_OUT_FRACTION) opacity = 1 - (progress - FADE_OUT_FRACTION) / (1 - FADE_OUT_FRACTION)

    // Respiración: leve pulso de tamaño e intensidad, distinto por alma
    const noise = Math.sin(age * 9 + soul.colorIndex) * 0.15 + Math.sin(age * 5.3 + 2) * 0.1
    const pulse = 1 + noise * 0.15

    if (coreRef.current) coreRef.current.material.opacity = opacity
    if (haloRef.current) {
      haloRef.current.material.opacity = opacity * 0.8
      haloRef.current.scale.setScalar(0.55 * pulse)
    }
    if (lightRef.current) lightRef.current.intensity = 1.3 * opacity * pulse

    const typingAge = Math.max(0, age - TYPEWRITER_START_DELAY)
    const chars = Math.floor(typingAge / CHAR_INTERVAL)
    if (chars !== charCount) setCharCount(chars)
  })

  const revealed = message.text.slice(0, charCount)
  const signature = message.author ? `${revealed}${charCount >= message.text.length ? ` — ${message.author}` : ''}` : revealed

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0} />
      </mesh>
      <sprite ref={haloRef} scale={0.55}>
        <spriteMaterial map={halo} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <pointLight ref={lightRef} color={color} intensity={0} distance={2.4} decay={2} />
      <Billboard position={[0, 0.32, 0]}>
        <Text
          fontSize={0.11}
          color={color}
          anchorX="center"
          anchorY="bottom"
          maxWidth={2.6}
          outlineWidth={0.006}
          outlineColor="#1a1428"
          outlineOpacity={0.6}
        >
          {signature}
        </Text>
      </Billboard>
    </group>
  )
}
