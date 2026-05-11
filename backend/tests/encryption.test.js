import { describe, it, expect, beforeAll } from 'vitest'

// AES-256-GCM requires exactly 32 bytes
process.env.ENCRYPTION_KEY = 'A'.repeat(32)

let encrypt, decrypt, getEncryptionKey

beforeAll(async () => {
  const mod = await import('../src/services/encryption.js')
  encrypt = mod.encrypt
  decrypt = mod.decrypt
  getEncryptionKey = mod.getEncryptionKey
})

describe('getEncryptionKey', () => {
  it('returns a 32-byte buffer from ENCRYPTION_KEY env var', async () => {
    const key = await getEncryptionKey()
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
    expect(key.toString('utf8')).toBe('A'.repeat(32))
  })
})

describe('encrypt/decrypt', () => {
  it('encrypts and decrypts a string', async () => {
    const original = 'sensitive-data-123'
    const encrypted = await encrypt(original)
    
    expect(encrypted).toHaveProperty('iv')
    expect(encrypted).toHaveProperty('encryptedData')
    expect(encrypted).toHaveProperty('authTag')
    expect(encrypted.encryptedData).not.toBe(original)
    
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe(original)
  })

  it('produces different ciphertexts for same input (random IV)', async () => {
    const a = await encrypt('same-value')
    const b = await encrypt('same-value')
    expect(a.encryptedData).not.toBe(b.encryptedData)
    expect(a.iv).not.toBe(b.iv)
  })

  it('handles empty string', async () => {
    const encrypted = await encrypt('')
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe('')
  })

  it('handles special characters', async () => {
    const original = 'héllo wörld! @#$%^&*()_+{}:">?<'
    const encrypted = await encrypt(original)
    const decrypted = await decrypt(encrypted)
    expect(decrypted).toBe(original)
  })

  it('throws on tampered data', async () => {
    const encrypted = await encrypt('test')
    encrypted.encryptedData = encrypted.encryptedData.replace(/^.{4}/, 'dead')
    await expect(decrypt(encrypted)).rejects.toThrow()
  })
})
