const ENABLED_KEY = 'debug_logger'

const LEVEL_NAMES = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' }
const COLORS = {
  debug: '#888',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
}

function isEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false' } catch { return true }
}

function getTimestamp() {
  return new Date().toISOString().slice(11, 23)
}

function log(level, namespace, message, ...args) {
  if (!isEnabled()) return
  const ts = getTimestamp()
  const label = LEVEL_NAMES[level] || 'LOG'
  const color = COLORS[level] || '#888'

  const fn = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : console.log

  fn(
    '%c[' + ts + ']%c[' + label + ']%c[' + namespace + ']%c ' + message,
    'color:#888;font-weight:normal',
    'color:' + color + ';font-weight:bold',
    'color:#a78bfa;font-weight:bold',
    'color:inherit',
    ...args
  )
}

export const logger = {
  debug: (ns, msg, ...args) => log('debug', ns, msg, ...args),
  info: (ns, msg, ...args) => log('info', ns, msg, ...args),
  warn: (ns, msg, ...args) => log('warn', ns, msg, ...args),
  error: (ns, msg, ...args) => log('error', ns, msg, ...args),

  enable: () => { try { localStorage.setItem(ENABLED_KEY, 'true') } catch {} },
  disable: () => { try { localStorage.setItem(ENABLED_KEY, 'false') } catch {} },
  toggle: () => {
    const current = isEnabled()
    if (current) { logger.disable() } else { logger.enable() }
    return !current
  },
}

export function logQueryResult(component, queryName, data) {
  const count = Array.isArray(data) ? data.length : typeof data === 'object' ? Object.keys(data).length : '?'
  logger.info(component, 'query [' + queryName + '] resolved — ' + count + ' items')
}

export function wrapQueryFn(component, queryName, fn) {
  logger.debug(component, 'query [' + queryName + '] registered')
  return async (...args) => {
    logger.debug(component, 'query [' + queryName + '] fetching...')
    try {
      const result = await fn(...args)
      logger.info(component, 'query [' + queryName + '] success — ' + (Array.isArray(result) ? result.length + ' items' : typeof result))
      return result
    } catch (err) {
      logger.error(component, 'query [' + queryName + '] error', err.message || err)
      throw err
    }
  }
}

export function wrapMutationFn(component, mutationName, fn) {
  logger.debug(component, 'mutation [' + mutationName + '] registered')
  return async (...args) => {
    logger.info(component, 'mutation [' + mutationName + '] start', args)
    try {
      const result = await fn(...args)
      logger.info(component, 'mutation [' + mutationName + '] success', result)
      return result
    } catch (err) {
      logger.error(component, 'mutation [' + mutationName + '] error', err.message || err)
      throw err
    }
  }
}
