/**
 * Error Translator - Maps technical errors to user-friendly messages with action buttons
 * Used throughout the UI to provide actionable error feedback for non-technical administrators
 */

const errorMappings = [
  {
    pattern: /535\s*5\.7\.8.*authentication failed/i,
    message: 'Mail server password is incorrect',
    action: 'Update SMTP Password',
    actionPath: '/mail',
    severity: 'error',
  },
  {
    pattern: /LDAP.*invalid credentials/i,
    message: 'LDAP bind credentials are invalid',
    action: 'Update LDAP Config',
    actionPath: '/schema',
    severity: 'error',
  },
  {
    pattern: /Authentik.*401.*Unauthorized/i,
    message: 'Authentik API token expired or invalid',
    action: 'Refresh Token',
    actionPath: '/schema',
    severity: 'error',
  },
  {
    pattern: /ECONNREFUSED.*Connection refused/i,
    message: 'Service is unreachable - check if the service is running',
    action: 'Check Health',
    actionPath: '/operations',
    severity: 'error',
  },
  {
    pattern: /ETIMEDOUT.*timeout/i,
    message: 'Connection timed out - service may be slow or unreachable',
    action: 'Check Health',
    actionPath: '/operations',
    severity: 'warning',
  },
  {
    pattern: /SASL PLAIN authentication failed/i,
    message: 'Email relay authentication failed - check SMTP credentials',
    action: 'Fix SMTP Settings',
    actionPath: '/mail',
    severity: 'error',
  },
  {
    pattern: /password.*expired/i,
    message: 'Your password has expired and must be changed',
    action: 'Change Password',
    actionPath: '/my-profile',
    severity: 'warning',
  },
  {
    pattern: /permission denied/i,
    message: 'You do not have permission to perform this action',
    action: null,
    severity: 'error',
  },
  {
    pattern: /quota exceeded/i,
    message: 'Mailbox quota exceeded - delete old emails or increase quota',
    action: 'Increase Quota',
    actionPath: '/mail',
    severity: 'warning',
  },
  {
    pattern: /sync.*already running/i,
    message: 'A sync is already in progress - please wait before starting another',
    action: 'View Status',
    actionPath: '/',
    severity: 'info',
  },
  {
    pattern: /no password set/i,
    message: 'User has no password set - they cannot log in',
    action: 'Set Password',
    actionPath: '/password',
    severity: 'warning',
  },
  {
    pattern: /group sync.*not configured/i,
    message: 'Group sync direction is not configured - set it in Group Manager',
    action: 'Configure',
    actionPath: '/groups-manager',
    severity: 'warning',
  },
]

/**
 * Translate a technical error to a user-friendly message
 * @param {Error|string} error - The error object or message
 * @returns {Object} Translated error with message, action, actionPath, severity
 */
export function translateError(error) {
  const errorMessage = typeof error === 'string' ? error : error?.message || String(error)

  for (const mapping of errorMappings) {
    if (mapping.pattern.test(errorMessage)) {
      return {
        originalError: errorMessage,
        message: mapping.message,
        action: mapping.action,
        actionPath: mapping.actionPath,
        severity: mapping.severity,
      }
    }
  }

  // Default fallback for unmatched errors
  return {
    originalError: errorMessage,
    message: 'An unexpected error occurred. Please try again or contact support.',
    action: 'Check Logs',
    actionPath: '/logs',
    severity: 'error',
  }
}

/**
 * React hook for using error translation with toast notifications
 * @param {Function} toast - The toast function (e.g., from react-hot-toast)
 * @returns {Function} showErrorToast - Displays a translated error toast
 */
export function useErrorToast(toast) {
  return (error, customAction = null) => {
    const translated = translateError(error)
    
    const message = translated.action 
      ? `${translated.message} - Click to ${customAction?.label || translated.action}`
      : translated.message
    
    toast.error(message, {
      duration: 6000,
      onClick: () => {
        if (customAction?.onClick) {
          customAction.onClick()
        } else if (customAction?.path || translated.actionPath) {
          window.location.href = customAction?.path || translated.actionPath
        }
      }
    })
  }
}

export default translateError
