const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A missing URL/token is a configuration problem — retrying it cannot help.
function isTransient(errors = []) {
  return errors.some((error) => !/Missing (?:URL|token|host)|not configured/i.test(error))
}

/**
 * Re-run dependency verification when a service is briefly unavailable at boot.
 * Returns the last result if the service never recovers.
 */
export async function verifyCriticalServices(verify, { attempts = 3, delayMs = 3000 } = {}) {
  let result
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = await verify()
    if (result.db && result.authentik) return result
    if (!isTransient(result.errors)) break
    if (attempt < attempts) await sleep(delayMs)
  }
  return result
}
