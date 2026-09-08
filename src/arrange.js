// Acomodo de una selección de objetos: ajuste a la rejilla, alineación y
// distribución. Todo es geometría pura sobre `position` (sin three.js) para
// poder probarlo con `npm test` y para que el editor solo tenga que aplicar
// el Map de posiciones que devuelven estas funciones.
//
// Se trabaja con el punto de anclaje (`position`) de cada objeto, no con su
// caja envolvente: es lo que el gizmo mueve y lo que ve quien arrastra, así
// que alinear velas de distinto tamaño deja sus bases donde uno espera.

// Paso de la rejilla, compartido con el snap del gizmo (AltarObject.jsx /
// AltarScene.jsx) para que arrastrar con snap y "ajustar a la rejilla"
// caigan en los mismos puntos.
export const GRID_STEP = 0.1

// Ejes en el orden de `position`: X ancho del altar, Y altura, Z profundidad.
export const AXIS_INDEX = { x: 0, y: 1, z: 2 }

// Redondeo a 4 decimales: evita que sumar/restar flotantes deje posiciones
// como 0.30000000000000004 en el JSON que se guarda y se comparte.
const round = (n) => Math.round(n * 10000) / 10000

const coordsOf = (objects, axis) => objects.map((o) => o.position[AXIS_INDEX[axis]])

// Reemplaza una sola coordenada del objeto, dejando las otras dos intactas.
const withCoord = (object, axis, value) =>
  object.position.map((n, i) => (i === AXIS_INDEX[axis] ? round(value) : n))

/**
 * Alinea todos los objetos sobre un mismo valor del eje `axis`:
 * 'min' el más chico, 'max' el más grande, 'center' el punto medio entre
 * ambos extremos (no el promedio, para que la fila no se corra hacia donde
 * haya más objetos amontonados).
 * Devuelve Map(id -> position) solo con los objetos que se mueven.
 */
export function alignPositions(objects, axis, edge) {
  const moves = new Map()
  if (!(axis in AXIS_INDEX) || objects.length < 2) return moves
  const coords = coordsOf(objects, axis)
  const min = Math.min(...coords)
  const max = Math.max(...coords)
  const target = edge === 'min' ? min : edge === 'max' ? max : (min + max) / 2
  objects.forEach((o, i) => {
    if (coords[i] === round(target)) return
    moves.set(o.id, withCoord(o, axis, target))
  })
  return moves
}

/**
 * Reparte los objetos con la misma separación sobre el eje `axis`, dejando
 * los dos extremos donde están (es el rango que ya eligió quien edita) y
 * recolocando los de en medio. Hacen falta 3 objetos para que signifique
 * algo. Devuelve Map(id -> position).
 */
export function distributePositions(objects, axis) {
  const moves = new Map()
  if (!(axis in AXIS_INDEX) || objects.length < 3) return moves
  const sorted = [...objects].sort(
    (a, b) => a.position[AXIS_INDEX[axis]] - b.position[AXIS_INDEX[axis]],
  )
  const first = sorted[0].position[AXIS_INDEX[axis]]
  const last = sorted[sorted.length - 1].position[AXIS_INDEX[axis]]
  const gap = (last - first) / (sorted.length - 1)
  // Todos en el mismo punto: no hay rango que repartir, se deja tal cual en
  // vez de amontonarlos otra vez sobre sí mismos.
  if (gap === 0) return moves
  sorted.slice(1, -1).forEach((o, i) => {
    const target = first + gap * (i + 1)
    if (o.position[AXIS_INDEX[axis]] === round(target)) return
    moves.set(o.id, withCoord(o, axis, target))
  })
  return moves
}

/**
 * Lleva cada objeto al punto más cercano de la rejilla, en los tres ejes.
 * Sirve tanto para uno solo como para una selección entera; a diferencia de
 * alinear/distribuir, no necesita comparar objetos entre sí.
 * Devuelve Map(id -> position).
 */
export function snapPositionsToGrid(objects, step = GRID_STEP) {
  const moves = new Map()
  if (!(step > 0)) return moves
  for (const o of objects) {
    const snapped = o.position.map((n) => round(Math.round(n / step) * step))
    if (snapped.every((n, i) => n === o.position[i])) continue
    moves.set(o.id, snapped)
  }
  return moves
}
