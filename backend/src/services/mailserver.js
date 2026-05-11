import { spawn } from 'child_process'
import { logger } from '../utils/logger.js'
import { ldapClient } from './ldapClient.js'

function validateEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email address: ${email}`)
  }
  return email
}

function validateContainerName(name) {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid container name: ${name}`)
  }
  return name
}

function runDockerCommand(containerName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', containerName, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `Exit code ${code}`))
    })
    child.on('error', reject)
  })
}

export class MailserverIntegration {
  constructor(config) {
    this.config = config
    this.containerName = validateContainerName(config.containerName || 'mailserver')
    this.ldapMode = config.ldapMode !== false
  }

  async createMailbox(username, email) {
    if (!this.config.enabled) return

    if (this.ldapMode) {
      logger.info('Mailbox creation handled by LDAP sync', { username, email })
      return
    }

    try {
      validateEmail(email)
      logger.info('Creating mailbox', { username, email })
      await runDockerCommand(this.containerName, ['setup', 'email', 'add', email])
      logger.info('Mailbox created successfully', { email })
    } catch (error) {
      if (error.message.includes('already exists')) {
        logger.debug('Mailbox already exists', { email })
      } else {
        logger.error('Failed to create mailbox', { username, email, error: error.message })
      }
    }
  }

  async deleteMailbox(username) {
    if (!this.config.enabled) return

    if (this.ldapMode) {
      logger.info('Mailbox deletion handled by LDAP sync', { username })
      return
    }

    try {
      const email = `${username}@${this.config.domain}`
      validateEmail(email)
      logger.info('Deleting mailbox', { username, email })
      await runDockerCommand(this.containerName, ['setup', 'email', 'del', email])
      logger.info('Mailbox deleted successfully', { email })
    } catch (error) {
      logger.error('Failed to delete mailbox', { username, error: error.message })
    }
  }

  async updateQuota(email, quotaInMB) {
    if (!this.config.enabled || !this.config.quotaManagement) return

    if (this.ldapMode) {
      logger.info('Quota update not supported in LDAP mode', { email })
      return
    }

    try {
      validateEmail(email)
      await runDockerCommand(this.containerName, ['setup', 'quota', 'set', email, `${quotaInMB}M`])
      logger.info('Updated mailbox quota', { email, quota: quotaInMB })
    } catch (error) {
      logger.error('Failed to update quota', { email, error: error.message })
    }
  }

  async listMailboxes() {
    if (!this.config.enabled) return []

    if (this.ldapMode) {
      return this.listMailboxesFromLDAP()
    }

    try {
      const stdout = await runDockerCommand(this.containerName, ['setup', 'email', 'list'])
      const mailboxes = stdout.split('\n').filter(line => line.includes('@'))
      logger.debug('Listed mailboxes', { count: mailboxes.length })
      return mailboxes
    } catch (error) {
      logger.error('Failed to list mailboxes', { error: error.message })
      return []
    }
  }

  async listMailboxesFromLDAP() {
    try {
      const users = await ldapClient.getUsers()
      const mailboxes = users
        .filter(user => user.mail)
        .map(user => `${user.mail} ${this.config.quota || '1024M'}`)
      
      logger.debug('Listed mailboxes from LDAP', { count: mailboxes.length })
      return mailboxes
    } catch (error) {
      logger.error('Failed to list mailboxes from LDAP', { error: error.message })
      return []
    }
  }
}
