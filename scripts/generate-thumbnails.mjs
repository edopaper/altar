#!/usr/bin/env node
// Genera un thumbnail PNG (transparente) por cada modelo .glb en
// public/models/altar/, para mostrar una vista previa en el menú en vez de
// solo el nombre del archivo.
//
// Uso:
//   node scripts/generate-thumbnails.mjs           genera los que falten o
//                                                   estén desactualizados
//   node scripts/generate-thumbnails.mjs --force    regenera todos
//
// Requiere un Chromium de Playwright ya descargado (basta con haber corrido
// `npx playwright install chromium` una vez en esta máquina).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const MODELS_DIR = path.join(ROOT, 'public', 'models', 'altar')
const THUMBS_DIR = path.join(ROOT, 'public', 'models', 'altar-thumbnails')
const PORT = 5199
const FORCE = process.argv.includes('--force')

// ---------- 1. Enumerar los .glb ----------
function walkGlb(dir, base = dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkGlb(full, base))
    } else if (entry.name.endsWith('.glb')) {
      const rel = path.relative(base, full) // p.ej. "calabazas/pumpkin.glb"
      const relUrl = rel.split(path.sep).join('/')
      out.push({
        glbAbs: full,
        rel: relUrl,
        modelUrl: '/models/altar/' + relUrl,
        thumbAbs: path.join(THUMBS_DIR, rel.replace(/\.glb$/, '.png')),
      })
    }
  }
  return out
}

const models = walkGlb(MODELS_DIR).sort((a, b) => a.rel.localeCompare(b.rel))
console.log(`Encontrados ${models.length} modelos .glb en ${path.relative(ROOT, MODELS_DIR)}`)

const pending = FORCE
  ? models
  : models.filter((m) => {
      if (!fs.existsSync(m.thumbAbs)) return true
      return fs.statSync(m.glbAbs).mtimeMs > fs.statSync(m.thumbAbs).mtimeMs
    })

if (pending.length === 0) {
  console.log('Todos los thumbnails ya están al día. Usa --force para regenerarlos igual.')
  process.exit(0)
}
console.log(`Generando ${pending.length} thumbnail(s)...\n`)

// ---------- 2. Ubicar un Chromium ya instalado ----------
function findChromium() {
  const roots = [
    path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
    path.join(os.homedir(), '.cache', 'ms-playwright'), // Linux
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null, // Windows
  ].filter(Boolean)

  const search = (dir) => {
    if (!fs.existsSync(dir)) return null
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.name === 'chrome-headless-shell' || entry.name === 'chrome-headless-shell.exe') return full
      if (!entry.isDirectory()) continue
      if (entry.name === 'Chromium.app') {
        const mac = path.join(full, 'Contents/MacOS/Chromium')
        if (fs.existsSync(mac)) return mac
        continue
      }
      const found = search(full)
      if (found) return found
    }
    return null
  }

  for (const root of roots) {
    const found = search(root)
    if (found) return found
  }
  return null
}

const executablePath = findChromium()
if (!executablePath) {
  console.error(
    'No se encontró un Chromium de Playwright instalado.\n' +
      'Corre `npx playwright install chromium` una vez y vuelve a intentar.',
  )
  process.exit(1)
}
console.log(`Usando Chromium: ${executablePath}\n`)

// ---------- 3. Levantar un servidor de Vite dedicado ----------
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  stdio: 'ignore',
})

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume()
          resolve()
        })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error('El servidor de Vite no respondió a tiempo.'))
          else setTimeout(attempt, 300)
        })
    }
    attempt()
  })
}

function shutdown(code) {
  server.kill('SIGTERM')
  process.exit(code)
}
process.on('SIGINT', () => shutdown(1))

try {
  await waitForServer(`http://localhost:${PORT}/`)
} catch (err) {
  console.error(err.message)
  shutdown(1)
}

// ---------- 4. Capturar cada modelo con un navegador headless ----------
const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 320, height: 320 } })

let ok = 0
let failed = 0

for (const [i, model] of pending.entries()) {
  const label = `[${i + 1}/${pending.length}] ${model.rel}`
  try {
    // El "?t=" (no solo el hash) fuerza una recarga completa de página: si
    // solo cambiara el hash, la app SPA no recargaría (para que el visor
    // navegue rápido) y window.__thumbReady seguiría en true de la vuelta
    // anterior, capturando el canvas antes de que el modelo nuevo cargara.
    const url = `http://localhost:${PORT}/?t=${Date.now()}#/thumb/${encodeURIComponent(model.modelUrl)}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__thumbReady === true, { timeout: 20000 })
    const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.mkdirSync(path.dirname(model.thumbAbs), { recursive: true })
    fs.writeFileSync(model.thumbAbs, Buffer.from(base64, 'base64'))
    console.log(`${label} ✓`)
    ok++
  } catch (err) {
    console.error(`${label} ✗ ${err.message}`)
    failed++
  }
}

await browser.close()
console.log(`\nListo: ${ok} generados, ${failed} fallidos.`)
shutdown(failed > 0 ? 1 : 0)
