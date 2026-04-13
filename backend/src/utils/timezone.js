export const TIMEZONE = 'Africa/Johannesburg' // SAST = UTC+2

export function nowSAST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }))
}

export function toSAST(date) {
  if (!date) return null
  const d = new Date(date)
  return new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }))
}

export function formatSAST(date, options = {}) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    ...options,
  })
}

export function toISOStringSAST(date) {
  if (!date) return null
  const d = new Date(date)
  const offset = 120 // SAST is UTC+2 = 120 minutes
  const adjusted = new Date(d.getTime() + offset * 60 * 1000)
  return adjusted.toISOString()
}

export function sqlNowSAST() {
  return `NOW() AT TIME ZONE '${TIMEZONE}'`
}