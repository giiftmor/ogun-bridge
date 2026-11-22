import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMail = vi.fn()
const createTransport = vi.fn(() => ({ sendMail }))
vi.mock('nodemailer', () => ({ default: { createTransport } }))

const mockGetServiceConfig = vi.fn()
vi.mock('../src/services/config.js', () => ({
  getServiceConfig: mockGetServiceConfig,
  SERVICE_SMTP: 'smtp',
}))
vi.mock('../src/lib/db.js', () => ({
  default: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetServiceConfig.mockResolvedValue({
    host: 'smtp.spectres.co.za', port: 587, username: 'noreply@spectres.co.za',
    password: 'secret', fromName: 'Spectres', fromAddress: 'noreply@spectres.co.za',
  })
  sendMail.mockResolvedValue({ messageId: 'test-id' })
})

describe('sendApiKeyEmail', () => {
  it('sends an escaped key email and reports success', async () => {
    const { sendApiKeyEmail } = await import('../src/services/emailService.js')
    const result = await sendApiKeyEmail({
      to: 'dev@example.com', appName: '<b>Thoth</b>', slug: 'thoth',
      rawKey: 'abc&123', actor: 'admin',
    })
    expect(result).toEqual({ sent: true })
    expect(sendMail).toHaveBeenCalledTimes(1)
    const msg = sendMail.mock.calls[0][0]
    expect(msg.to).toBe('dev@example.com')
    expect(msg.text).toContain('abc&123')
    expect(msg.html).toContain('&lt;b&gt;Thoth&lt;/b&gt;')
    expect(msg.html).not.toContain('<b>Thoth</b>')
  })

  it('reports failure rather than throwing when SMTP is unconfigured', async () => {
    mockGetServiceConfig.mockResolvedValue({})
    const { sendApiKeyEmail } = await import('../src/services/emailService.js')
    const result = await sendApiKeyEmail({ to: 'dev@example.com', appName: 'Thoth', slug: 'thoth', rawKey: 'abc' })
    expect(result.sent).toBe(false)
    expect(result.error).toBeTruthy()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('reports failure rather than throwing when sendMail rejects', async () => {
    sendMail.mockRejectedValue(new Error('SMTP down'))
    const { sendApiKeyEmail } = await import('../src/services/emailService.js')
    const result = await sendApiKeyEmail({ to: 'dev@example.com', appName: 'Thoth', slug: 'thoth', rawKey: 'abc' })
    expect(result.sent).toBe(false)
    expect(result.error).toContain('SMTP down')
  })
})
