import { paperPaths } from '../supabase/functions/_shared/catalog.js'

export const PAPER_LIST = paperPaths
  .map((key) => {
    const path = key
    const name = key.split('/').pop().replace(/\.svg$/, '').replace(/[-_]/g, ' ')
    return { name, path }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
