#!/usr/bin/env node
// Genera las capturas de pantalla reales que usa el panel de ayuda
// (HelpPanel.jsx), en public/help/. Siembra un altar de ejemplo vía
// localStorage y fotografía las vistas clave: general, catálogo de
// decoración, edición de un objeto y confirmación de compartir.
//
// Uso: node scripts/generate-help-shots.mjs
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
const OUT_DIR = path.join(ROOT, 'public', 'help')
const PORT = 5198

// Altar de ejemplo: rutas reales de public/models/altar/. Si un .glb se
// renombra, loadSavedObjects() lo descarta y la captura sale sin él (no
// rompe el script).
const SAMPLE_OBJECTS = [
  { id: 1, type: 'model', shapeKind: null, modelPath: '/models/altar/comida/pan-muerto.glb', name: 'Pan muerto 1', position: [-1.2, 2.0, -2.2], rotation: [0, 0.4, 0], scale: [1, 1, 1], color: '#ffffff' },
  { id: 2, type: 'model', shapeKind: null, modelPath: '/models/altar/velas/veladora.glb', name: 'Veladora 2', position: [1.1, 2.0, -2.2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' },
  { id: 3, type: 'model', shapeKind: null, modelPath: '/models/altar/decoracion/flor-cempasuchil.glb', name: 'Flor cempasuchil 3', position: [0, 1.35, -1.4], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' },
  { id: 4, type: 'model', shapeKind: null, modelPath: '/models/altar/comida/calavera-azucar.glb', name: 'Calavera azucar 4', position: [-0.6, 0.8, -0.6], rotation: [0, -0.3, 0], scale: [1, 1, 1], color: '#ffffff' },
  { id: 5, type: 'model', shapeKind: null, modelPath: '/models/altar/velas/velas.glb', name: 'Velas 5', position: [0.8, 0.8, -0.6], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' },
]

// ---------- Chromium de Playwright (mismo criterio que generate-thumbnails) ----------
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

// ---------- Servidor de Vite dedicado ----------
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

// ---------- Capturas ----------
const { chromium } = await import('playwright-core')
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })

// Estado sembrado ANTES de que cargue la app: sin onboarding (taparía la
// vista) y con un altar de ejemplo ya armado.
await page.addInitScript(
  ({ objects }) => {
    localStorage.setItem('altar-onboarded-v1', '1')
    localStorage.setItem('altar-objects-v1', JSON.stringify(objects))
    localStorage.removeItem('altar-photo-v1')
  },
  { objects: SAMPLE_OBJECTS },
)

fs.mkdirSync(OUT_DIR, { recursive: true })
const shot = (name) => path.join(OUT_DIR, name)

// Espera a que los .glb del altar de ejemplo terminen de descargar y se
// pinten. Sin esto, AltarObject muestra su fallback de Suspense (un cubo
// gris) y la captura sale con cubos en vez de los modelos: un timeout fijo
// no alcanza, porque Vite primero sirve las ~30 transformaciones del glob
// del catálogo y recién después los modelos de la escena.
const MODEL_PATHS = [...new Set(SAMPLE_OBJECTS.map((o) => o.modelPath))]

async function waitForScene() {
  await page.waitForSelector('canvas')
  // 1. Cada .glb de la escena efectivamente descargado (Performance API).
  await page.waitForFunction(
    (paths) =>
      paths.every((p) =>
        performance
          .getEntriesByType('resource')
          .some((e) => new URL(e.name).pathname === p && e.responseEnd > 0),
      ),
    MODEL_PATHS,
    { timeout: 60000 },
  )
  // 2. Nada más entrando por la red durante 2s seguidos. Descargar el .glb
  //    no alcanza: después viene el parseo y recién ahí se piden las
  //    texturas externas (public/models/altar/Textures/). Si se captura
  //    antes, AltarObject sigue mostrando su fallback de Suspense y el
  //    altar sale con cubos grises en vez de los modelos.
  await page.waitForFunction(
    () => {
      const n = performance.getEntriesByType('resource').length
      const prev = window.__lastResourceCount
      const since = window.__stableSince ?? 0
      if (n !== prev) {
        window.__lastResourceCount = n
        window.__stableSince = Date.now()
        return false
      }
      return Date.now() - since > 2000
    },
    null,
    { timeout: 60000, polling: 250 },
  )
  // 3. Margen para que Suspense resuelva y el frame quede estable.
  await page.waitForTimeout(2500)
}

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.menu')
  await waitForScene()

  // 1. Vista general: menú + altar armado + botones flotantes.
  await page.screenshot({ quality: 85, type: 'jpeg', path: shot('vista-general.jpg') })
  console.log('vista-general.jpg ✓')

  // 2. Catálogo de decoración: la sección del menú con chips y miniaturas.
  //    Recorte por boundingBox (no element screenshot: su chequeo de
  //    "element stable" se cuelga con el canvas re-renderizando al lado).
  //    Se acota la altura: la sección completa es muy vertical y en el panel
  //    de ayuda quedaría al doble de alto que el resto de las capturas,
  //    empujando el texto de esa sección fuera de vista. Con este recorte
  //    entra el título, el buscador, los chips y una fila y media de
  //    miniaturas, que es lo que hay que mostrar.
  const decorSection = page.locator('.menu-section', { hasText: 'Decoración (' }).first()
  const box = await decorSection.boundingBox()
  await page.screenshot({
    quality: 85,
    type: 'jpeg',
    path: shot('catalogo.jpg'),
    clip: { ...box, height: Math.min(box.height, 300) },
  })
  console.log('catalogo.jpg ✓')

  // 3. Edición: seleccionar un objeto desde la lista (enfoca la cámara y
  //    muestra gizmo + panel "Seleccionado" + toolbar).
  await page.locator('.object-item', { hasText: 'Veladora' }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ quality: 85, type: 'jpeg', path: shot('edicion.jpg') })
  console.log('edicion.jpg ✓')

  // 4. Compartir: el botón abre la confirmación con la captura del altar.
  await page.locator('.publish-btn').click()
  await page.waitForSelector('.share-preview-img', { timeout: 10000 })
  await page.waitForTimeout(400)
  await page.screenshot({ quality: 85, type: 'jpeg', path: shot('compartir.jpg') })
  console.log('compartir.jpg ✓')

  await browser.close()
  console.log(`\nListo: capturas en ${path.relative(ROOT, OUT_DIR)}/`)
  shutdown(0)
} catch (err) {
  console.error(err)
  await browser.close()
  shutdown(1)
}
