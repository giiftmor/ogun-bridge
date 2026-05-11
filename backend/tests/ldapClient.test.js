import crypto from 'crypto'
import { describe, it, expect } from 'vitest'

function hashPasswordLDAP(password) {
  const salt = crypto.randomBytes(8)
  const hash = crypto.createHash('sha1').update(password + salt.toString('binary')).digest()
  const saltedHash = Buffer.concat([hash, salt])
  const encoded = saltedHash.toString('base64')
  return '{SSHA}' + encoded
}

function escapeLDAPFilterValue(value) {
  if (!value) return ''
  return String(value).replace(/[\\*()\0]/g, (char) => {
    const codes = { '\\': '\\5c', '*': '\\2a', '(': '\\28', ')': '\\29', '\0': '\\00' }
    return codes[char]
  })
}

function escapeLDAPDNValue(value) {
  if (!value) return ''
  return String(value).replace(/[,\\+"\\<>;#=\0]/g, (char) => {
    const codes = { ',': '\\2c', '+': '\\2b', '"': '\\22', '\\': '\\5c', '<': '\\3c', '>': '\\3e', ';': '\\3b', '#': '\\23', '=': '\\3d' }
    return codes[char]
  })
}

describe('hashPasswordLDAP', () => {
  it('returns a string starting with {SSHA}', () => {
    const result = hashPasswordLDAP('test123')
    expect(result).toMatch(/^\{SSHA\}/)
  })

  it('returns different salts for same password', () => {
    const a = hashPasswordLDAP('test123')
    const b = hashPasswordLDAP('test123')
    expect(a).not.toBe(b)
  })

  it('returns different hashes for different passwords', () => {
    const a = hashPasswordLDAP('password1')
    const b = hashPasswordLDAP('password2')
    expect(a).not.toBe(b)
  })

  it('produces a valid base64 encoded string after {SSHA}', () => {
    const result = hashPasswordLDAP('test')
    const encoded = result.replace('{SSHA}', '')
    expect(() => Buffer.from(encoded, 'base64').toString('utf8')).not.toThrow()
    expect(Buffer.from(encoded, 'base64').toString('base64')).toBe(encoded)
  })
})

describe('escapeLDAPFilterValue', () => {
  it('escapes asterisk', () => {
    expect(escapeLDAPFilterValue('*')).toBe('\\2a')
  })

  it('escapes parentheses', () => {
    expect(escapeLDAPFilterValue('(test)')).toBe('\\28test\\29')
  })

  it('escapes backslash', () => {
    expect(escapeLDAPFilterValue('\\')).toBe('\\5c')
  })

  it('returns empty string for null/undefined', () => {
    expect(escapeLDAPFilterValue(null)).toBe('')
    expect(escapeLDAPFilterValue(undefined)).toBe('')
  })

  it('passes through safe strings', () => {
    expect(escapeLDAPFilterValue('hello')).toBe('hello')
    expect(escapeLDAPFilterValue('user123')).toBe('user123')
  })
})

describe('escapeLDAPDNValue', () => {
  it('escapes comma', () => {
    expect(escapeLDAPDNValue('ou,test')).toBe('ou\\2ctest')
  })

  it('escapes equals sign', () => {
    expect(escapeLDAPDNValue('a=b')).toBe('a\\3db')
  })

  it('escapes plus sign', () => {
    expect(escapeLDAPDNValue('a+b')).toBe('a\\2bb')
  })

  it('returns empty string for null/undefined', () => {
    expect(escapeLDAPDNValue(null)).toBe('')
    expect(escapeLDAPDNValue(undefined)).toBe('')
  })

  it('passes through safe DNs', () => {
    expect(escapeLDAPDNValue('admin')).toBe('admin')
    expect(escapeLDAPDNValue('John Doe')).toBe('John Doe')
  })
})
