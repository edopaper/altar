import { readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../public/', import.meta.url)
async function files(dir, extension) {
  let entries
  try { entries = await readdir(new URL(dir, root), { withFileTypes: true }) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const paths = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(`${dir}${entry.name}/`, extension)
    : entry.name.endsWith(extension) ? [`/${dir}${entry.name}`] : []))
  return paths.flat().sort()
}
const catalog = {
  modelPaths: await files('models/altar/', '.glb'),
  paperPaths: await files('papel-cortado/', '.svg'),
  musicPaths: await files('music/', '.mp3'),
}
await writeFile(fileURLToPath(new URL('../supabase/functions/_shared/catalog.js', import.meta.url)),
  '// Generado por npm run catalog. Conserva rutas públicas sin duplicar archivos.\n' +
  Object.entries(catalog).map(([key, value]) => `export const ${key} = ${JSON.stringify(value, null, 2)}\n`).join('\n'))
