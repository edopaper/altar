import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import AltarObject from './AltarObject.jsx'
import PhotoFrame from './PhotoFrame.jsx'
import CandleLights from './CandleLights.jsx'
import SoulField from './SoulField.jsx'

const ALTAR_CENTER = new THREE.Vector3(0, 1, -2.2)

// Umbral (con margen hacia el interior) a partir del cual cada pared empieza
// a desvanecerse: la cámara la "toca" antes de llegar a su superficie real,
// para que el desvanecimiento termine justo cuando cruzaría la pared.
const BACK_WALL_Z = -3.7
const SIDE_WALL_X = 5.5
const FADE_SPEED = 0.15 // suavizado por frame, no es instantáneo

/** Habitación: piso, pared trasera y dos paredes laterales cortas, sin techo. */
function Room() {
  const wallMat = { color: '#8d7ba8', roughness: 0.95, transparent: true }
  const backRef = useRef()
  const leftRef = useRef()
  const rightRef = useRef()

  // Cada pared se desvanece cuando la cámara la atraviesa u orbita más allá
  // de ella, para que nunca bloquee la vista desde el otro lado.
  useFrame(({ camera }) => {
    const fade = (mesh, visible) => {
      const mat = mesh.current?.material
      if (!mat) return
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, visible ? 1 : 0, FADE_SPEED)
    }
    fade(backRef, camera.position.z > BACK_WALL_Z)
    fade(leftRef, camera.position.x > -SIDE_WALL_X)
    fade(rightRef, camera.position.x < SIDE_WALL_X)
  })

  return (
    <group>
      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#7a6a94" roughness={1} />
      </mesh>
      {/* Pared trasera */}
      <mesh ref={backRef} position={[0, 4, -4]} receiveShadow>
        <boxGeometry args={[12, 8, 0.2]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
      {/* Paredes laterales cortas */}
      <mesh ref={leftRef} position={[-5.9, 4, -2.5]} receiveShadow>
        <boxGeometry args={[0.2, 8, 3]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
      <mesh ref={rightRef} position={[5.9, 4, -2.5]} receiveShadow>
        <boxGeometry args={[0.2, 8, 3]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
    </group>
  )
}

// Perfil (z, y) de la tela: recorre atrás → adelante siguiendo la silueta de
// la grada, con margen (+0.05) mayor que la amplitud de los pliegues para que
// las cajas interiores nunca asomen a través de la tela.
const CLOTH_PROFILE = [
  [-1.5, 1.75],
  [-0.25, 1.75],
  [-0.25, 1.15],
  [0.65, 1.15],
  [0.65, 0.55],
  [1.55, 0.55],
  [1.55, 0.02],
]
const CLOTH_WIDTH = 4.6
const CLOTH_SEGMENTS_X = 48
const CLOTH_SUBDIV = 6 // subdivisiones por tramo del perfil, para los pliegues

/** Malla de tela: rejilla sobre el perfil de la grada con ondas suaves. */
function buildClothGeometry() {
  // Muestrea el perfil con subdivisiones y guarda la normal 2D de cada tramo
  const samples = []
  for (let s = 0; s < CLOTH_PROFILE.length - 1; s++) {
    const [z0, y0] = CLOTH_PROFILE[s]
    const [z1, y1] = CLOTH_PROFILE[s + 1]
    const len = Math.hypot(z1 - z0, y1 - y0)
    const tz = (z1 - z0) / len
    const ty = (y1 - y0) / len
    // Normal exterior: tangente rotada 90° en el plano z-y
    const nz = -ty
    const ny = tz
    const last = s === CLOTH_PROFILE.length - 2
    for (let k = 0; k < CLOTH_SUBDIV + (last ? 1 : 0); k++) {
      const t = k / CLOTH_SUBDIV
      samples.push({ z: z0 + (z1 - z0) * t, y: y0 + (y1 - y0) * t, nz, ny })
    }
  }

  const rows = samples.length
  const cols = CLOTH_SEGMENTS_X + 1
  const positions = new Float32Array(rows * cols * 3)
  const indices = []

  for (let j = 0; j < rows; j++) {
    const { z, y, nz, ny } = samples[j]
    for (let i = 0; i < cols; i++) {
      const x = (i / CLOTH_SEGMENTS_X - 0.5) * CLOTH_WIDTH
      // Pliegues: ondas a lo largo del ancho, más marcadas en las caídas
      // verticales (ny≈0) que en las superficies horizontales
      const foldiness = 1 - Math.abs(ny) * 0.75
      const wave =
        (Math.sin(x * 4.2 + z * 2.0) * 0.022 + Math.sin(x * 9.5 + z * 5.0) * 0.009) * foldiness
      const idx = (j * cols + i) * 3
      positions[idx] = x
      positions[idx + 1] = y + ny * wave
      positions[idx + 2] = z + nz * wave
    }
  }

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < CLOTH_SEGMENTS_X; i++) {
      const a = j * cols + i
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Grada de 3 niveles cubierta por tela blanca: referencia visual, no restringe la colocación. */
function AltarSteps() {
  const clothGeo = useMemo(() => buildClothGeometry(), [])
  // Núcleo en tono hueso para que los costados descubiertos combinen con la tela
  const stepMat = { color: '#e9e2d4', roughness: 0.9 }
  return (
    <group position={[0, 0, -2.2]}>
      <mesh position={[0, 0.25, 0.9]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 0.5, 1.2]} />
        <meshStandardMaterial {...stepMat} />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 1.1, 1.2]} />
        <meshStandardMaterial {...stepMat} />
      </mesh>
      <mesh position={[0, 0.85, -0.9]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 1.7, 1.2]} />
        <meshStandardMaterial {...stepMat} />
      </mesh>
      <mesh geometry={clothGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#f7f2e8" roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function CeremonialLights() {
  return (
    <>
      {/* Base cálida estilo Kind Words: atardecer lavanda, todo legible y suave */}
      <ambientLight color="#c9b8e8" intensity={0.55} />
      <hemisphereLight args={['#ffd9c4', '#9d7fc4', 0.5]} />
      <directionalLight
        color="#ffdfb8"
        intensity={1.1}
        position={[2, 6, 4]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      {/* Velas / puntos ámbar */}
      <pointLight
        color="#ffb877"
        intensity={2}
        distance={9}
        decay={2}
        position={[-1.8, 1.6, -1.4]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      <pointLight
        color="#ffb877"
        intensity={2}
        distance={9}
        decay={2}
        position={[1.8, 1.6, -1.4]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      <pointLight color="#ffc48f" intensity={2} distance={7} decay={2} position={[0, 2.4, -2.8]} />
      <pointLight color="#ffc48f" intensity={1.5} distance={7} decay={2} position={[0, 0.8, -0.4]} />
    </>
  )
}

// Órbita automática del visor: sin actividad, la cámara oscila lentamente
// como péndulo alrededor del altar, sin pasar de ±45° (nunca ve las paredes
// por detrás). Cualquier interacción la pausa unos segundos.
const ORBIT_LIMIT = Math.PI / 4
const ORBIT_SPEED = 0.55 // autoRotateSpeed: lento, cozy
const IDLE_DELAY_MS = 4000

function IdleOrbit({ orbitRef }) {
  const idleRef = useRef(true)
  const speedRef = useRef(ORBIT_SPEED)

  useEffect(() => {
    let timer
    const wake = () => {
      idleRef.current = false
      clearTimeout(timer)
      timer = setTimeout(() => {
        idleRef.current = true
      }, IDLE_DELAY_MS)
    }
    window.addEventListener('pointerdown', wake)
    window.addEventListener('wheel', wake, { passive: true })
    window.addEventListener('touchstart', wake, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('wheel', wake)
      window.removeEventListener('touchstart', wake)
    }
  }, [])

  useFrame((_, delta) => {
    const controls = orbitRef.current
    if (!controls) return
    if (import.meta.env.DEV)
      window.__orbitDebug = { azimuth: controls.getAzimuthalAngle(), idle: idleRef.current }
    if (!idleRef.current) {
      controls.autoRotate = false
      return
    }
    // Péndulo: al llegar al límite de azimut invierte el sentido.
    // autoRotateSpeed positivo disminuye el azimut; negativo lo aumenta.
    const azimuth = controls.getAzimuthalAngle()
    if (azimuth >= ORBIT_LIMIT) speedRef.current = ORBIT_SPEED
    else if (azimuth <= -ORBIT_LIMIT) speedRef.current = -ORBIT_SPEED
    controls.autoRotate = true
    // autoRotate avanza un paso fijo POR FRAME; se normaliza con el delta
    // real para que la velocidad sea la misma a 30, 60 o 120 fps.
    controls.autoRotateSpeed = speedRef.current * Math.min(delta, 0.1) * 60
  })

  return null
}

export default function AltarScene({
  photo,
  objects,
  selectedId,
  mode,
  snap,
  onSelect,
  onTransform,
  focusRef,
  autoOrbit = false,
  messages = [],
}) {
  const orbitRef = useRef()

  // Expone a la UI una función para centrar la cámara en una posición.
  useEffect(() => {
    focusRef.current = (position) => {
      const controls = orbitRef.current
      if (!controls) return
      controls.target.set(position[0], position[1], position[2])
      controls.update()
    }
    return () => {
      focusRef.current = null
    }
  }, [focusRef])

  return (
    <>
      <color attach="background" args={['#4a3a68']} />
      <fog attach="fog" args={['#57457a', 9, 24]} />

      <CeremonialLights />
      <Room />
      <AltarSteps />
      <PhotoFrame photo={photo} />
      <CandleLights />
      <SoulField messages={messages} />

      {objects.map((obj) => (
        <AltarObject
          key={obj.id}
          object={obj}
          selected={obj.id === selectedId}
          mode={mode}
          snap={snap}
          onSelect={() => onSelect(obj.id)}
          onTransform={onTransform}
          orbitRef={orbitRef}
        />
      ))}

      {autoOrbit && <IdleOrbit orbitRef={orbitRef} />}

      <OrbitControls
        ref={orbitRef}
        makeDefault
        target={ALTAR_CENTER.toArray()}
        minDistance={1.5}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minPolarAngle={0.15}
        enableDamping
      />
    </>
  )
}
