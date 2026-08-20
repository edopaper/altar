import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls, useHelper } from '@react-three/drei'
import ModelLoader from './ModelLoader.jsx'
import PaperCutout from './PaperCutout.jsx'

const ROTATION_SNAP = THREE.MathUtils.degToRad(15)

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
export default function AltarObject({ object, selected, mode, snap, onSelect, onTransform, orbitRef }) {
  const groupRef = useRef()

  // Highlight de selección: caja envolvente naranja alrededor del group.
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
          e.stopPropagation()
          onSelect()
        }}
      >
        {content}
      </group>

      {selected && (
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
