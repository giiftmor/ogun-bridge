import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPoolQuery = vi.fn()
vi.mock('../src/lib/db.js', () => ({
  pool: { query: mockPoolQuery },
}))

let alertService

beforeEach(async () => {
  vi.resetAllMocks()
  const mod = await import('../src/services/alertService.js')
  alertService = mod.alertService
})

describe('alertService.clearOldAlerts', () => {
  it('uses parameterised query (no SQL injection)', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 3 })
    const result = await alertService.clearOldAlerts(7)
    expect(result).toBe(3)
    // Verify parameterised query — no string interpolation
    const callArgs = mockPoolQuery.mock.calls[0]
    expect(callArgs[0]).not.toContain("'7 days'")
    expect(callArgs[0]).toContain('$1')
    expect(callArgs[1]).toEqual([7])
  })

  it('uses parameterised query with malicious input', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 0 })
    // SQL injection attempt should be harmless since we use parameterised query
    await alertService.clearOldAlerts("7; DROP TABLE sync_alerts --")
    const callArgs = mockPoolQuery.mock.calls[0]
    expect(callArgs[1]).toEqual(["7; DROP TABLE sync_alerts --"])
  })

  it('returns 0 on query error', async () => {
    mockPoolQuery.mockRejectedValue(new Error('DB error'))
    const result = await alertService.clearOldAlerts(7)
    expect(result).toBe(0)
  })
})

describe('alertService.createAlert', () => {
  it('inserts an alert and returns the id', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 42 }] })
    const result = await alertService.createAlert('sync_failure', 'Sync failed', {
      severity: 'critical',
      entityType: 'user',
      entityId: '123',
    })
    expect(result).toBe(42)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sync_alerts'),
      ['sync_failure', 'critical', 'user', '123', 'Sync failed', expect.any(String)]
    )
  })
})

describe('alertService.getUnacknowledgedAlerts', () => {
  it('returns alerts from database', async () => {
    const fakeAlerts = [{ id: 1, message: 'test' }]
    mockPoolQuery.mockResolvedValue({ rows: fakeAlerts })
    const result = await alertService.getUnacknowledgedAlerts(10)
    expect(result).toEqual(fakeAlerts)
  })
})

describe('alertService.acknowledgeAlert', () => {
  it('updates the alert', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 1 })
    const result = await alertService.acknowledgeAlert(1, 'admin')
    expect(result).toBe(true)
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE sync_alerts'),
      ['admin', 1]
    )
  })
})
