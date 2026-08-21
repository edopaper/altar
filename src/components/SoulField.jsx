import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import SoulSpirit from './SoulSpirit.jsx'
import { MAX_CONCURRENT_SOULS } from './SoulLights.jsx'

// Ritmo calmado: pocos mensajes, sin apuro.
const BASE_SPAWN_INTERVAL = 20
const BASE_JITTER = 6
// Ritmo apurado: con varios mensajes en cola, aparecen más seguido para que
// no tarden minutos en pasar todos (y hay margen para 2 almas a la vez).
const BUSY_SPAWN_INTERVAL = 11
const BUSY_JITTER = 3
const BUSY_THRESHOLD = 3 // desde cuántos mensajes se considera "cola con varios esperando"
const FIRST_SPAWN_DELAY = 4

function randomPath(preferredSide) {
  const side = preferredSide ?? (Math.random() < 0.5 ? -1 : 1)
  return {
    x0: side * -5.0,
    x1: side * 5.0,
    z: -1.0 + (Math.random() - 0.5) * 0.6, // pasa cerca del frente del altar
    baseY: 1.85 + Math.random() * 0.25,
    arcHeight: 0.4 + Math.random() * 0.3,
    side,
  }
}

/**
 * Hace aparecer hasta 2 almas a la vez (nunca más: con más se vuelve difícil
 * leer los mensajes), ciclando por la lista de mensajes del altar. Cuando
 * hay varios mensajes esperando turno, el ritmo de aparición se acelera.
 */
export default function SoulField({ messages }) {
  const [souls, setSouls] = useState([])
  const nextSpawnRef = useRef(null)
  const indexRef = useRef(0)

  useFrame(({ clock }) => {
    if (messages.length === 0) return
    if (souls.length >= MAX_CONCURRENT_SOULS) return
    if (nextSpawnRef.current === null) nextSpawnRef.current = clock.elapsedTime + FIRST_SPAWN_DELAY
    if (clock.elapsedTime < nextSpawnRef.current) return

    const message = messages[indexRef.current % messages.length]
    indexRef.current += 1

    // Si ya hay un alma en pantalla, la nueva entra por el lado contrario
    // para que sus recorridos nunca se crucen.
    const activeSide = souls[0]?.path.side
    const preferredSide = activeSide ? -activeSide : undefined
    setSouls((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message,
        colorIndex: Math.floor(Math.random() * 3),
        path: randomPath(preferredSide),
      },
    ])

    const busy = messages.length >= BUSY_THRESHOLD
    const interval = busy ? BUSY_SPAWN_INTERVAL : BASE_SPAWN_INTERVAL
    const jitter = busy ? BUSY_JITTER : BASE_JITTER
    nextSpawnRef.current = clock.elapsedTime + interval + (Math.random() - 0.5) * jitter
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
