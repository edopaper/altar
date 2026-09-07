export function readLocal(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
export function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    return true
  } catch { return false }
}
