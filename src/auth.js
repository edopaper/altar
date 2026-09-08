export const POST_LOGIN_REDIRECT_KEY = 'altar-admin-redirect'
export const USER_LOGIN_REDIRECT_KEY = 'altar-user-redirect'

export function getUserDisplayName(user) {
  const metadata = user?.user_metadata ?? {}
  return (
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    user?.email?.split('@')[0] ||
    'Usuario'
  )
}

export function getUserAvatar(user) {
  const metadata = user?.user_metadata ?? {}
  return metadata.avatar_url || metadata.picture || ''
}

// Solo guardamos rutas internas; el almacenamiento puede estar restringido.
export function rememberLoginRoute(key, route, storage) {
  try {
    storage ??= window.sessionStorage
    storage.removeItem(POST_LOGIN_REDIRECT_KEY)
    storage.removeItem(USER_LOGIN_REDIRECT_KEY)
    storage.setItem(key, route.startsWith('#/') ? route : '#/')
  } catch { /* El login aún puede volver al editor. */ }
}

export function consumeLoginRoute(storage) {
  try {
    storage ??= window.sessionStorage
    const route = storage.getItem(POST_LOGIN_REDIRECT_KEY) || storage.getItem(USER_LOGIN_REDIRECT_KEY)
    storage.removeItem(POST_LOGIN_REDIRECT_KEY)
    storage.removeItem(USER_LOGIN_REDIRECT_KEY)
    return route?.startsWith('#/') ? route : null
  } catch { return null }
}

export function getLoginErrorMessage(error) {
  if (/provider.*(disabled|not enabled)|unsupported provider/i.test(error?.message || '')) {
    return 'Google aún no está habilitado en Supabase. Actívalo en Authentication → Sign In / Providers.'
  }
  return 'No se pudo iniciar sesión con Google. Revisa tu conexión e inténtalo de nuevo.'
}

// Arranca el login con Google desde cualquier pantalla (el panel de cuenta o
// el aviso de "entra para publicar"). Deja a salvo el borrador de invitado,
// que de otro modo se perdería en el redirect de OAuth, y recuerda la ruta a
// la que volver. `client` se recibe por parámetro para que este módulo siga
// sin depender de supabaseClient.js (que necesita las variables de Vite y no
// se puede importar desde los tests). Lanza si el proveedor falla: quien
// llama decide cómo mostrarlo con getLoginErrorMessage().
export async function startGoogleLogin(client, { local, session } = {}) {
  try {
    local ??= window.localStorage
    session ??= window.sessionStorage
    const guest = local.getItem('workspace-v2')
    if (guest && (!window.location.hash || window.location.hash === '#/')) session.setItem('altar-login-draft', guest)
  } catch { /* sin borrador de invitado que preservar */ }
  rememberLoginRoute(USER_LOGIN_REDIRECT_KEY, window.location.hash || '#/', session)
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  })
  if (error) throw error
}
