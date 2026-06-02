const ROLE_PRIORITY = {
  super_admin: 120,
  password_manager: 100,
  viewer: 20,
};

export function createRoleMapper(mapping) {
  return (claims) => {
    const rawGroups = claims.groups || [];

    let bestRole = 'viewer';
    let bestPriority = ROLE_PRIORITY[bestRole] || 0;

    for (const groupName of rawGroups) {
      const mappedRole = mapping[groupName];
      if (mappedRole && ROLE_PRIORITY[mappedRole] > bestPriority) {
        bestRole = mappedRole;
        bestPriority = ROLE_PRIORITY[mappedRole];
      }
    }

    const mfa_enrolled = Boolean(claims.mfa_enrolled) || Boolean(claims.mfa_authenticated) || false;

    return { role: bestRole, groups: rawGroups, mfa_enrolled };
  };
}
