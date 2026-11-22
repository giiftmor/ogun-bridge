import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getEffectiveRole } from '../src/lib/authRole.js'

test('SSO super admin is recognized via roleDefinition.name even when the legacy role field is member', () => {
  assert.equal(getEffectiveRole({ role: 'member', roleDefinition: { name: 'super_admin' } }), 'super_admin')
})

test('emergency admin is recognized via the legacy role field', () => {
  assert.equal(getEffectiveRole({ role: 'super_admin', roleDefinition: { name: 'super_admin' } }), 'super_admin')
})

test('user without an RBAC role definition falls back to the legacy role field', () => {
  assert.equal(getEffectiveRole({ role: 'admin', roleDefinition: null }), 'admin')
})

test('missing user has no effective role', () => {
  assert.equal(getEffectiveRole(null), null)
})
