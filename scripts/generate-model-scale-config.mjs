#!/usr/bin/env node
// Genera el JSON de configuración de escalas: un multiplicador por modelo
// .glb que ModelLoader aplica encima de su normalización automática (ver
// TARGET_SIZE en src/components/ModelLoader.jsx).
//
// Cada vez que se ejecuta, el script:
//   1. Recorre public/models/altar/ buscando todos los .glb.
//   2. Escribe un archivo nuevo en una carpeta temporal del sistema
//      (mismo comportamiento en cada corrida: no reutiliza el anterior).
//   3. Mueve ese archivo a public/configuraciones/model-scale.json, que es
//      el único archivo que la app lee en tiempo real (fetch) para saber
//      con qué escala mostrar cada modelo.
//
// Los modelos que ya tenían una escala configurada la conservan; los
// modelos nuevos entran con escala 1 (sin cambio) para editar a mano
// después. Los modelos que ya no existen en disco se quitan del JSON.
//
// Uso:
//   node scripts/generate-model-scale-config.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const MODELS_DIR = path.join(ROOT, 'public', 'models', 'altar')
const CONFIG_DIR = path.join(ROOT, 'public', 'configuraciones')
const CONFIG_FILE = path.join(CONFIG_DIR, 'model-scale.json')

// ---------- 1. Enumerar los .glb (misma lógica que generate-thumbnails.mjs) ----------
function walkGlb(dir, base = dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkGlb(full, base))
    } else if (entry.name.endsWith('.glb')) {
      const rel = path.relative(base, full).split(path.sep).join('/') // p.ej. "calabazas/pumpkin.glb"
      out.push(rel)
    }
  }
  return out
}

const modelRels = walkGlb(MODELS_DIR).sort()
console.log(`Encontrados ${modelRels.length} modelos .glb en ${path.relative(ROOT, MODELS_DIR)}`)

// ---------- 2. Partir de la config anterior (si existe) para no perder escalas ya ajustadas ----------
let previous = {}
if (fs.existsSync(CONFIG_FILE)) {
  try {
    previous = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).models ?? {}
  } catch {
    console.warn(`Aviso: ${path.relative(ROOT, CONFIG_FILE)} existía pero no se pudo leer, se regenera desde cero.`)
  }
}

const models = {}
let added = 0
for (const rel of modelRels) {
  const existingScale = previous[rel]?.scale
  models[rel] = { scale: typeof existingScale === 'number' ? existingScale : 1 }
  if (existingScale === undefined) added++
}
const removed = Object.keys(previous).filter((rel) => !(rel in models))

const config = {
  generatedAt: new Date().toISOString(),
  // "scale" es un multiplicador sobre el tamaño ya normalizado (1 = sin cambio).
  models,
}

// ---------- 3. Escribir primero en un archivo temporal ----------
const tempFile = path.join(os.tmpdir(), `altar-model-scale-${Date.now()}.json`)
fs.writeFileSync(tempFile, JSON.stringify(config, null, 2) + '\n')
console.log(`Archivo temporal creado en ${tempFile}`)

// ---------- 4. Mover el temporal a la carpeta de configuraciones que lee la app ----------
fs.mkdirSync(CONFIG_DIR, { recursive: true })
try {
  fs.renameSync(tempFile, CONFIG_FILE)
} catch {
  // rename puede fallar si tempFile y CONFIG_DIR están en discos distintos.
  fs.copyFileSync(tempFile, CONFIG_FILE)
  fs.unlinkSync(tempFile)
}

console.log(`Movido a ${path.relative(ROOT, CONFIG_FILE)}`)
console.log(`Modelos: ${modelRels.length} (${added} nuevos con escala 1, ${removed.length} eliminados)`)
if (removed.length) console.log(`  Eliminados: ${removed.join(', ')}`)
console.log('\nEdita el "scale" de cada modelo en ese archivo para ajustar cómo aparece.')
