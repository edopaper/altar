import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import AltarObject from './AltarObject.jsx'

const ALTAR_CENTER = new THREE.Vector3(0, 1, -2.2)

/** Habitación: piso, pared trasera y dos paredes laterales cortas, sin techo. */
function Room() {
  const wallMat = { color: '#8d7ba8', roughness: 0.95 }
  return (
    <group>
      {/* Piso */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[12, 10]} />
        <meshStandardMaterial color="#7a6a94" roughness={1} />
      </mesh>
      {/* Pared trasera */}
      <mesh position={[0, 2, -4]} receiveShadow>
        <boxGeometry args={[12, 4, 0.2]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
      {/* Paredes laterales cortas */}
      <mesh position={[-5.9, 2, -2.5]} receiveShadow>
        <boxGeometry args={[0.2, 4, 3]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
      <mesh position={[5.9, 2, -2.5]} receiveShadow>
        <boxGeometry args={[0.2, 4, 3]} />
        <meshStandardMaterial {...wallMat} />
      </mesh>
    </group>
  )
}

/** Grada de 3 niveles: referencia visual, no restringe la colocación. */
function AltarSteps() {
  const stepMat = { color: '#a288bd', roughness: 0.9 }
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
        intensity={8}
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
        intensity={8}
        distance={9}
        decay={2}
        position={[1.8, 1.6, -1.4]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      <pointLight color="#ffc48f" intensity={5} distance={7} decay={2} position={[0, 2.4, -2.8]} />
      <pointLight color="#ffc48f" intensity={4} distance={7} decay={2} position={[0, 0.8, -0.4]} />
    </>
  )
}

export default function AltarScene({ objects, selectedId, mode, snap, onSelect, onTransform, focusRef }) {
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
