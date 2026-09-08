import test from 'node:test'
import assert from 'node:assert/strict'
import { alignPositions, distributePositions, snapPositionsToGrid, GRID_STEP } from '../src/arrange.js'

const obj = (id, position) => ({ id, position })
const at = (moves, id) => moves.get(id)

test('alinear usa el extremo pedido y el centro del rango, no el promedio', () => {
  // Dos velas amontonadas en x=0 y una en x=4: el centro es 2, no 1.33.
  const velas = [obj(1, [0, 1, 0]), obj(2, [0, 1, 1]), obj(3, [4, 1, 2])]
  assert.equal(at(alignPositions(velas, 'x', 'center'), 1)[0], 2)
  assert.equal(at(alignPositions(velas, 'x', 'min'), 3)[0], 0)
  assert.equal(at(alignPositions(velas, 'x', 'max'), 1)[0], 4)
})

test('alinear solo toca el eje pedido y omite lo que ya está en su lugar', () => {
  const moves = alignPositions([obj(1, [0, 1, 0]), obj(2, [2, 5, 9])], 'y', 'max')
  assert.deepEqual(at(moves, 1), [0, 5, 0])
  assert.equal(moves.has(2), false) // el más alto ya define el objetivo
})

test('alinear necesita al menos dos objetos y un eje válido', () => {
  assert.equal(alignPositions([obj(1, [0, 0, 0])], 'x', 'min').size, 0)
  assert.equal(alignPositions([obj(1, [0, 0, 0]), obj(2, [1, 0, 0])], 'w', 'min').size, 0)
})

test('distribuir deja los extremos y reparte los de en medio con la misma separación', () => {
  const ofrendas = [obj(1, [0, 1, 0]), obj(2, [0.4, 1, 0]), obj(3, [3.7, 1, 0]), obj(4, [6, 1, 0])]
  const moves = distributePositions(ofrendas, 'x')
  assert.equal(moves.has(1), false)
  assert.equal(moves.has(4), false)
  assert.equal(at(moves, 2)[0], 2)
  assert.equal(at(moves, 3)[0], 4)
})

test('distribuir ordena por posición, no por orden de selección', () => {
  const moves = distributePositions([obj(1, [6, 0, 0]), obj(2, [0, 0, 0]), obj(3, [5, 0, 0])], 'x')
  assert.equal(at(moves, 3)[0], 3)
})

test('distribuir no hace nada con menos de tres objetos ni si están todos en el mismo punto', () => {
  assert.equal(distributePositions([obj(1, [0, 0, 0]), obj(2, [2, 0, 0])], 'x').size, 0)
  const juntos = [obj(1, [1, 0, 0]), obj(2, [1, 0, 0]), obj(3, [1, 0, 0])]
  assert.equal(distributePositions(juntos, 'x').size, 0)
})

test('ajustar a la rejilla redondea los tres ejes al paso más cercano', () => {
  const moves = snapPositionsToGrid([obj(1, [0.34, 1.96, -2.21]), obj(2, [0.5, 1, -2])])
  assert.deepEqual(at(moves, 1), [0.3, 2, -2.2])
  assert.equal(moves.has(2), false) // ya estaba sobre la rejilla
  assert.equal(GRID_STEP, 0.1)
})

test('ajustar a la rejilla no deja ruido de coma flotante en las posiciones', () => {
  const moves = snapPositionsToGrid([obj(1, [0.7000000000000001, 0, 2.9999999]), obj(2, [1.15, 0, 0])], 0.5)
  assert.deepEqual(at(moves, 1), [0.5, 0, 3])
  assert.deepEqual(at(moves, 2), [1, 0, 0])
  assert.equal(snapPositionsToGrid([obj(1, [0.34, 0, 0])], 0).size, 0)
})
