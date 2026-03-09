import { Client, Attribute, Change } from 'ldapts'
import { logger } from '../utils/logger.js'

export class LDAPClient {
  constructor() {
    this.host = process.env.LDAP_HOST || '172.17.0.1'
    this.port = parseInt(process.env.LDAP_PORT || '389')
    this.bindDN = process.env.LDAP_BIND_DN || 'cn=Directory Manager,dc=spectres,dc=co,dc=za'
    this.bindPassword = process.env.LDAP_BIND_PASSWORD
    this.baseDN = process.env.LDAP_BASE_DN || 'dc=spectres,dc=co,dc=za'
    this.client = null
    this.isConnected = false
  }

  async connect() {
    if (this.isConnected) return

    this.client = new Client({
      url: `ldap://${this.host}:${this.port}`,
      timeout: 5000,
      connectTimeout: 10000,
    })

    await this.client.bind(this.bindDN, this.bindPassword)
    this.isConnected = true
    logger.info('Connected to LDAP server')
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.unbind()
      this.client = null
      this.isConnected = false
      logger.info('Disconnected from LDAP server')
    }
  }

  async setUserPassword(username, newPassword) {
    await this.connect()
    
    try {
      const userDN = `uid=${username},ou=people,${this.baseDN}`
      
      await this.client.modify(userDN, [
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: 'userPassword',
            values: [newPassword],
          }),
        }),
      ])
      
      logger.info(`Password set for LDAP user: ${username}`)
      return true
    } catch (error) {
      logger.error(`Failed to set LDAP password for ${username}:`, error.message)
      return false
    }
  }

  async verifyPassword(username, password) {
    let tempClient = null
    
    try {
      tempClient = new Client({
        url: `ldap://${this.host}:${this.port}`,
        timeout: 5000,
        connectTimeout: 10000,
      })
      
      const userDN = `uid=${username},ou=people,${this.baseDN}`
      await tempClient.bind(userDN, password)
      await tempClient.unbind()
      
      logger.info(`Password verified for LDAP user: ${username}`)
      return true
    } catch (error) {
      if (tempClient) {
        try { await tempClient.unbind() } catch (e) {}
      }
      logger.info(`Password verification failed for ${username}: ${error.message}`)
      return false
    }
  }

  async setPasswordExpiration(username, expirationDate) {
    await this.connect()
    
    try {
      const userDN = `uid=${username},ou=people,${this.baseDN}`
      
      const expireTimestamp = expirationDate 
        ? Math.floor(new Date(expirationDate).getTime() / 1000)
        : null
      
      await this.client.modify(userDN, [
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: 'shadowExpire',
            values: [expireTimestamp.toString()],
          }),
        }),
      ])
      
      logger.info(`Password expiration set for ${username}: ${expirationDate}`)
      return true
    } catch (error) {
      logger.error(`Failed to set password expiration for ${username}:`, error.message)
      return false
    }
  }

  async getPasswordExpiration(username) {
    await this.connect()
    
    try {
      const userDN = `uid=${username},ou=people,${this.baseDN}`
      const { searchEntries } = await this.client.search(userDN, {
        attributes: ['shadowExpire'],
      })
      
      if (searchEntries[0]?.shadowExpire) {
        const expireTimestamp = parseInt(searchEntries[0].shadowExpire)
        return new Date(expireTimestamp * 1000).toISOString()
      }
      return null
    } catch (error) {
      logger.error(`Failed to get password expiration for ${username}:`, error.message)
      return null
    }
  }

  async search(base, options = {}) {
    await this.connect()

    const { searchEntries } = await this.client.search(base, {
      scope: 'sub',
      filter: '(objectClass=*)',
      ...options,
    })

    return searchEntries
  }

  async getUsers() {
    try {
      return await this.search(`ou=people,${this.baseDN}`, {
        filter: '(objectClass=inetOrgPerson)',
        attributes: ['uid', 'cn', 'sn', 'mail', 'altEmail', 'memberOf'],
      })
    } catch (error) {
      logger.error('Failed to get LDAP users:', error)
      throw error
    }
  }

  async getUser(uid) {
    try {
      const entries = await this.search(`ou=people,${this.baseDN}`, {
        filter: `(uid=${uid})`,
      })
      return entries[0] || null
    } catch (error) {
      logger.error(`Failed to get LDAP user ${uid}:`, error)
      throw error
    }
  }

  async getGroups() {
    try {
      return await this.search(`ou=groups,${this.baseDN}`, {
        filter: '(objectClass=groupOfNames)',
        attributes: ['cn', 'description', 'member'],
      })
    } catch (error) {
      logger.error('Failed to get LDAP groups:', error)
      throw error
    }
  }

  async getGroup(cn) {
    try {
      const entries = await this.search(`ou=groups,${this.baseDN}`, {
        filter: `(cn=${cn})`,
      })
      return entries[0] || null
    } catch (error) {
      logger.error(`Failed to get LDAP group ${cn}:`, error)
      throw error
    }
  }

  async updateUser(uid, attributes) {
    await this.connect()
    
    const dn = `uid=${uid},ou=people,${this.baseDN}`
    
    try {
      await this.client.modify(dn, [
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: Object.keys(attributes)[0],
            values: [Object.values(attributes)[0]],
          }),
        }),
      ])
      logger.info(`Updated LDAP user ${uid}`, { attributes })
    } catch (error) {
      logger.error(`Failed to update LDAP user ${uid}:`, error)
      throw error
    }
  }

  async deleteUser(uid) {
    await this.connect()
    
    const dn = `uid=${uid},ou=people,${this.baseDN}`
    
    try {
      await this.client.del(dn)
      logger.info(`Deleted LDAP user ${uid}`)
    } catch (error) {
      logger.error(`Failed to delete LDAP user ${uid}:`, error)
      throw error
    }
  }
}

export const ldapClient = new LDAPClient()