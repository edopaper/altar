// Descubre dinámicamente los .svg de papel picado en /public/papel-cortado/
// (misma técnica que modelos y música: se recorta el prefijo /public).
const globbed = import.meta.glob('/public/papel-cortado/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const PAPER_LIST = Object.keys(globbed)
  .map((key) => {
    const path = key.replace(/^\/public/, '')
    const name = key.split('/').pop().replace(/\.svg$/, '').replace(/[-_]/g, ' ')
    return { name, path }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
