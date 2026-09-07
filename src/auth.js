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
