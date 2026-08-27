import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { TransformControls, useHelper } from '@react-three/drei'
import ModelLoader from './ModelLoader.jsx'
import PaperCutout from './PaperCutout.jsx'

const ROTATION_SNAP = THREE.MathUtils.degToRad(15)
const SPAWN_PULSE_DURATION = 0.6 // segundos

// Esfera de wireframe que se expande y se desvanece alrededor de un objeto
// recién agregado/duplicado, para que se note incluso si queda fuera de
// foco o detrás de otro objeto (App.jsx controla cuánto vive vía `justAdded`).
function SpawnPulse() {
  const ref = useRef()
  const startRef = useRef(null)
  useFrame(({ clock }) => {
    if (startRef.current === null) startRef.current = clock.elapsedTime
    const t = Math.min((clock.elapsedTime - startRef.current) / SPAWN_PULSE_DURATION, 1)
    if (!ref.current) return
    ref.current.scale.setScalar(0.3 + t * 1.4)
    ref.current.material.opacity = 1 - t
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.35, 16, 16]} />
      <meshBasicMaterial color="#ffb347" transparent opacity={1} wireframe depthWrite={false} />
    </mesh>
  )
}

function ShapeGeometry({ shapeKind }) {
  switch (shapeKind) {
    case 'sphere':
      return <sphereGeometry args={[0.25, 32, 32]} />
    case 'cone':
      return <coneGeometry args={[0.22, 0.5, 6]} />
    case 'cube':
    default:
      return <boxGeometry args={[0.4, 0.4, 0.4]} />
  }
}

/** Fallback mientras carga un modelo: cubo gris. */
function LoadingCube() {
  return (
    <mesh castShadow>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshStandardMaterial color="#666666" />
    </mesh>
  )
}

/**
 * Un objeto del altar: <group> transformable con la geometría o el modelo dentro.
 * Para pasar de placeholder a modelo final solo cambia lo que se renderiza aquí.
 */
export default function AltarObject({
  object,
  selected,
  showGizmo,
  justAdded,
  mode,
  snap,
  onSelect,
  onTransform,
  orbitRef,
}) {
  const groupRef = useRef()

  // Highlight de selección: caja envolvente naranja alrededor del group.
  // Se muestra en todos los objetos seleccionados, aunque el gizmo (abajo)
  // solo aparezca cuando hay uno solo seleccionado.
  useHelper(selected ? groupRef : false, THREE.BoxHelper, '#ffb347')

  const commitTransform = () => {
    const g = groupRef.current
    if (!g) return
    onTransform(object.id, {
      position: g.position.toArray(),
      rotation: [g.rotation.x, g.rotation.y, g.rotation.z],
      scale: g.scale.toArray(),
    })
  }

  const content =
    object.type === 'model' ? (
      <Suspense fallback={<LoadingCube />}>
        <ModelLoader path={object.modelPath} />
      </Suspense>
    ) : object.type === 'paper' ? (
      <PaperCutout path={object.paperPath} color={object.color} />
    ) : (
      <mesh castShadow receiveShadow>
        <ShapeGeometry shapeKind={object.shapeKind} />
        <meshStandardMaterial
          color={object.color}
          roughness={0.7}
          emissive={selected ? object.color : '#000000'}
          emissiveIntensity={selected ? 0.25 : 0}
        />
      </mesh>
    )

  return (
    <>
      <group
        ref={groupRef}
        position={object.position}
        rotation={object.rotation}
        scale={object.scale}
        onClick={(e) => {
          // Un objeto bloqueado ignora el clic (no se selecciona por accidente)
          if (object.locked) return
          e.stopPropagation()
          // Shift/Ctrl/Cmd+clic suma o quita este objeto de la selección
          // actual en vez de reemplazarla (selección múltiple).
          onSelect(e.shiftKey || e.ctrlKey || e.metaKey)
        }}
      >
        {content}
        {justAdded && <SpawnPulse />}
      </group>

      {/* Con selección múltiple el movimiento lo maneja un solo gizmo
          compartido en AltarScene (GroupTransformControls); acá solo se
          muestra cuando este es el único objeto seleccionado. */}
      {selected && showGizmo && !object.locked && (
        <TransformControls
          object={groupRef}
          mode={mode}
          translationSnap={snap ? 0.1 : null}
          rotationSnap={snap ? ROTATION_SNAP : null}
          scaleSnap={snap ? 0.1 : null}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true
            commitTransform()
          }}
        />
      )}
    </>
  )
}
