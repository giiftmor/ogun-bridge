// SSO sessions carry the resolved RBAC role in roleDefinition.name, while
// emergency-admin sessions carry it in the legacy `role` field.
export function getEffectiveRole(user) {
  return user?.roleDefinition?.name || user?.role || null
}
