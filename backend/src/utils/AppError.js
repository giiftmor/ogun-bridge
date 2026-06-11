export const ErrorCodes = {
  VALIDATION_ERROR: { status: 400 },
  UNAUTHORIZED: { status: 401 },
  SESSION_EXPIRED: { status: 401 },
  ACCESS_DENIED: { status: 403 },
  OGUN_ACCESS_DENIED: { status: 403 },
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
  RATE_LIMITED: { status: 429 },
  DEPENDENCY_FAILURE: { status: 502 },
  INTERNAL_ERROR: { status: 500 },
}

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = ErrorCodes[code]?.status || 500
    this.details = details
  }
}
