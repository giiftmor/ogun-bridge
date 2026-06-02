# Ogun Bridge — Implementation Status

## Role Mapping Bug (Resolved)

**Issue:** The `roleMapping` in `src/middleware/auth.js` had two key mismatches against Authentik's actual group names:

| Mapping Key (old) | Authentik Group Name | Match? |
|---|---|---|
| `systems_admin` | `systems_admins` | ❌ (singular vs plural) |
| `passwords_manager_ogun` | `password_manager` | ❌ (typo + wrong suffix) |

This caused `admin` (member of `systems_admins`) to get `viewer` role instead of `super_admin`.

**Fix applied:** `src/middleware/auth.js` — changed keys to match Authentik's exact group names:
- `systems_admins` → `super_admin`
- `password_manager` → `password_manager`
- `ogun-bridge` → `viewer`

**Verified:** Role mapper produces correct roles for admin, oracle, and viewer users.
