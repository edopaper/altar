// Descubre dinámicamente los .glb en /public/models/altar/ (sin hardcodear nombres).
// Las claves del glob incluyen el prefijo /public, que no existe en runtime: se recorta.
const globbed = import.meta.glob('/public/models/altar/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const MODEL_LIST = Object.keys(globbed)
  .map((key) => {
    const path = key.replace(/^\/public/, '')
    const name = key.split('/').pop().replace(/\.glb$/, '')
    return { name, path }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
