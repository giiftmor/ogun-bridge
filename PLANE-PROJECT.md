# Ogun Bridge — Project Tasks (Plane Import Ready)

Created: 2026-06-08
Source: PROJECT-SCOPE.md + IMPLEMENTATION-STATUS.md

## Module 1: Config Editor UI
**Priority:** Low | **Size:** M
Browser-based editing of sync-config, field mappings, and group sync settings. Currently requires direct DB/file edits.

## Module 2: Dark Mode Toggle
**Priority:** Low | **Size:** S
User-selectable light/dark theme with Tailwind CSS dark variant.

## Module 3: API Documentation Page
**Priority:** Low | **Size:** M
Interactive Swagger/OpenAPI docs generated from existing Express routes.

## Module 4: Mobile / Responsive UI
**Priority:** Low | **Size:** L
Proper mobile support for all admin pages. Currently desktop-optimized only.

## Module 5: LDAP Group Hierarchy Visualization
**Priority:** Low | **Size:** M
Tree view of LDAP OUs and nested groups. Currently flat list only.

## Module 6: Calendar-Based Sync Scheduling
**Priority:** Low | **Size:** M
Schedule syncs by day/time instead of fixed 5-minute interval.

## Module 7: Multi-Language (i18n)
**Priority:** Low | **Size:** L
Full internationalization support. All UI strings extracted to translation files.

## Module 8: MFA / TOTP 2FA
**Priority:** Low | **Size:** XL
Built-in two-factor auth in Ogun Bridge. TOTP generation, QR codes, backup codes.

## Module 9: LDAP as Primary Sync Source
**Priority:** Low | **Size:** XXL
Flip sync architecture from Authentik-first to LDAP-first. Major refactor.
