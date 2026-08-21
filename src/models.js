// Descubre dinámicamente los .glb en /public/models/altar/ y sus subcarpetas
// (sin hardcodear nombres). Las claves del glob incluyen el prefijo /public,
// que no existe en runtime: se recorta.
const globbed = import.meta.glob('/public/models/altar/**/*.glb', {
  eager: true,
  query: '?url',
  import: 'default',
})

// Nombre bonito para cada subcarpeta; una carpeta nueva sin entrada aquí
// aparece igual, con su nombre capitalizado.
const CATEGORY_LABELS = {
  altares: 'Altares',
  calabazas: 'Calabazas',
  criptas: 'Criptas',
  decoracion: 'Decoración',
  'muros-y-rejas': 'Muros y rejas',
  naturaleza: 'Naturaleza',
  personajes: 'Personajes',
  pilares: 'Pilares',
  tumbas: 'Tumbas',
  varios: 'Varios',
  'velas-y-faroles': 'Velas y faroles',
}

function prettify(slug) {
  const label = slug.replace(/-/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export const MODEL_LIST = Object.keys(globbed)
  .map((key) => {
    const path = key.replace(/^\/public/, '')
    const parts = key.split('/')
    const name = prettify(parts.pop().replace(/\.glb$/, ''))
    // Subcarpeta entre .../altar/ y el archivo; sin subcarpeta cae en "varios"
    const folder = parts[parts.indexOf('altar') + 1] ?? 'varios'
    // Generado por scripts/generate-thumbnails.mjs; si aún no existe, el
    // <img> del menú falla en silencio y cae de vuelta al texto (ver
    // AltarMenu.jsx), así que no hace falta comprobarlo aquí.
    const thumbnail = path.replace('/models/altar/', '/models/altar-thumbnails/').replace(/\.glb$/, '.png')
    return { name, path, category: CATEGORY_LABELS[folder] ?? prettify(folder), thumbnail }
  })
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

// Categorías ordenadas, cada una con sus modelos: [{ category, models: [...] }]
export const MODEL_CATEGORIES = MODEL_LIST.reduce((acc, model) => {
  const last = acc[acc.length - 1]
  if (last && last.category === model.category) last.models.push(model)
  else acc.push({ category: model.category, models: [model] })
  return acc
}, [])
