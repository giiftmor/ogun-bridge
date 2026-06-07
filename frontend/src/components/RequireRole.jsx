import { useAppStore } from '@/store/useAppStore'

export function RequireRole({ roles, children, fallback = null }) {
  const currentUser = useAppStore(state => state.currentUser)
  const userRole = currentUser?.roleDefinition?.name || currentUser?.role

  if (!userRole || userRole === 'super_admin') return children
  if (roles.includes(userRole)) return children

  return fallback
}
