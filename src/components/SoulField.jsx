import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import SoulSpirit from './SoulSpirit.jsx'

const SPAWN_INTERVAL = 20 // segundos entre almas
const SPAWN_JITTER = 6 // variación aleatoria, para que no se sienta un metrónomo
const FIRST_SPAWN_DELAY = 4

function randomPath() {
  const side = Math.random() < 0.5 ? -1 : 1
  return {
    x0: side * -5.0,
    x1: side * 5.0,
    z: -1.0 + (Math.random() - 0.5) * 0.6, // pasa cerca del frente del altar
    baseY: 1.85 + Math.random() * 0.25,
    arcHeight: 0.4 + Math.random() * 0.3,
  }
}

/**
 * Hace aparecer un alma cada cierto tiempo, ciclando por la lista de
 * mensajes del altar (que ya se cargó en un único batch más arriba).
 */
export default function SoulField({ messages }) {
  const [souls, setSouls] = useState([])
  const nextSpawnRef = useRef(null)
  const indexRef = useRef(0)

  useFrame(({ clock }) => {
    if (messages.length === 0) return
    if (nextSpawnRef.current === null) nextSpawnRef.current = clock.elapsedTime + FIRST_SPAWN_DELAY
    if (clock.elapsedTime < nextSpawnRef.current) return

    const message = messages[indexRef.current % messages.length]
    indexRef.current += 1
    setSouls((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        colorIndex: Math.floor(Math.random() * 3),
        path: randomPath(),
      },
    ])
    nextSpawnRef.current = clock.elapsedTime + SPAWN_INTERVAL + (Math.random() - 0.5) * SPAWN_JITTER
  })

  if (messages.length === 0) return null

  return (
    <>
      {souls.map((soul) => (
        <SoulSpirit key={soul.key} soul={soul} onDone={(key) => setSouls((prev) => prev.filter((s) => s.key !== key))} />
      ))}
    </>
  )
}
