import { Client, Attribute, Change } from 'ldapts'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'
import { getServiceConfig, SERVICE_LDAP } from '../services/config.js'

function hashPasswordLDAP(password) {
  const salt = crypto.randomBytes(8)
  const hash = crypto.createHash('sha1').update(password + salt.toString('binary')).digest()
  const saltedHash = Buffer.concat([hash, salt])
  const encoded = saltedHash.toString('base64')
  return '{SSHA}' + encoded
}

function escapeLDAPFilterValue(value) {
  if (!value) return ''
  return String(value).replace(/[\\*()\0]/g, (char) => {
    const codes = { '\\': '\\5c', '*': '\\2a', '(': '\\28', ')': '\\29', '\0': '\\00' }
    return codes[char]
  })
}

function escapeLDAPDNValue(value) {
  if (!value) return ''
  return String(value).replace(/[,\\+"\\<>;#=\0]/g, (char) => {
    const codes = { ',': '\\2c', '+': '\\2b', '"': '\\22', '\\': '\\5c', '<': '\\3c', '>': '\\3e', ';': '\\3b', '#': '\\23', '=': '\\3d' }
    return codes[char]
  })
}

export class LDAPClient {
  constructor() {
    this.client = null
    this.isConnected = false
  }
  
  async getConfig() {
    const config = await getServiceConfig(SERVICE_LDAP)
    return {
      host: config.host || '172.17.0.1',
      port: parseInt(config.port) || 389,
      bindDN: config.bindDN || 'cn=Directory Manager,dc=spectres,dc=co,dc=za',
      bindPassword: config.bindPassword,
      baseDN: config.baseDN || 'dc=spectres,dc=co,dc=za',
      userBaseDN: config.userBaseDN || 'ou=people,' + (config.baseDN || 'dc=spectres,dc=co,dc=za'),
      groupBaseDN: config.groupBaseDN || 'ou=groups,' + (config.baseDN || 'dc=spectres,dc=co,dc=za'),
    }
  }

  async connect() {
    if (this.isConnected) return;

    const config = await this.getConfig()
    
    this.client = new Client({
      url: 'ldap://' + config.host + ':' + config.port,
      timeout: 5000,
      connectTimeout: 10000,
    })

    await this.client.bind(config.bindDN, config.bindPassword)
    this.isConnected = true
    this._config = config
    logger.info('Connected to LDAP server')
  }
  
  async getBaseDN() {
    if (this._config) return this._config.baseDN
    const config = await this.getConfig()
    return config.baseDN
  }
  
  async getUserBaseDN() {
    if (this._config) return this._config.userBaseDN
    const config = await this.getConfig()
    return config.userBaseDN
  }
  
  async getGroupBaseDN() {
    if (this._config) return this._config.groupBaseDN
    const config = await this.getConfig()
    return config.groupBaseDN
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.unbind()
      this.client = null
      this.isConnected = false
      this._config = null
      logger.info('Disconnected from LDAP server')
    }
  }

  async setUserPassword(username, newPassword) {
    await this.connect()
    
    try {
      const baseDN = await this.getBaseDN()
      const userDN = 'uid=' + escapeLDAPDNValue(username) + ',ou=people,' + baseDN
      const hashedPassword = hashPasswordLDAP(newPassword)
      
      await this.client.modify(userDN, [
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: 'userPassword',
            values: [hashedPassword],
          }),
        }),
      ])
      
      logger.info('Password set for LDAP user: ' + username + ' (SSHA)')
      return true
    } catch (error) {
      logger.error('Failed to set LDAP password for ' + username + ':', error.message)
      return false
    }
  }

  async verifyPassword(username, password) {
    let tempClient = null
    
    try {
      const config = await this.getConfig()
      
      tempClient = new Client({
        url: 'ldap://' + config.host + ':' + config.port,
        timeout: 5000,
        connectTimeout: 10000,
      })
      
      const baseDN = await this.getBaseDN()
      const userDN = 'uid=' + escapeLDAPDNValue(username) + ',ou=people,' + baseDN
      
      await tempClient.bind(userDN, password)
      await tempClient.unbind()
      
      logger.info('Password verified for LDAP user: ' + username)
      return true
    } catch (error) {
      if (tempClient) {
        try { await tempClient.unbind() } catch (e) {}
      }
      if (error.message && error.message.includes('Invalid credentials')) {
        logger.info('Password verification failed for ' + username + ': Invalid credentials')
      } else {
        logger.info('Password verification failed for ' + username + ': ' + error.message)
      }
      return false
    }
  }

  async setPasswordExpiration(username, expirationDate) {
    await this.connect()
    
    try {
      const baseDN = await this.getBaseDN()
      const userDN = 'uid=' + escapeLDAPDNValue(username) + ',ou=people,' + baseDN
      
      const expireTimestamp = expirationDate 
        ? Math.floor(new Date(expirationDate).getTime() / 1000)
        : null
      
      await this.client.modify(userDN, [
        new Change({
          operation: 'replace',
          modification: new Attribute({
            type: 'shadowExpire',
            values: [expireTimestamp ? expireTimestamp.toString() : ''],
          }),
        }),
      ])
      
      logger.info('Password expiration set for ' + username + ': ' + expirationDate)
      return true
    } catch (error) {
      logger.error('Failed to set password expiration for ' + username + ':', error.message)
      return false
    }
  }

  async getPasswordExpiration(username) {
    await this.connect()
    
    try {
      const baseDN = await this.getBaseDN()
      const userDN = 'uid=' + escapeLDAPDNValue(username) + ',ou=people,' + baseDN
      const { searchEntries } = await this.client.search(userDN, {
        attributes: ['shadowExpire'],
      })
      
      if (searchEntries[0] && searchEntries[0].shadowExpire) {
        const expireTimestamp = parseInt(searchEntries[0].shadowExpire)
        return new Date(expireTimestamp * 1000).toISOString()
      }
      return null
    } catch (error) {
      logger.error('Failed to get password expiration for ' + username + ':', error.message)
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
      const baseDN = await this.getBaseDN()
      return await this.search('ou=people,' + baseDN, {
        filter: '(objectClass=inetOrgPerson)',
        attributes: ['uid', 'cn', 'sn', 'mail', 'altEmail', 'memberOf', 'employeeNumber'],
      })
    } catch (error) {
      logger.error('Failed to get LDAP users:', error)
      throw error
    }
  }

  async getUser(uid) {
    try {
      const baseDN = await this.getBaseDN()
      const entries = await this.search('ou=people,' + baseDN, {
        filter: '(uid=' + escapeLDAPFilterValue(uid) + ')',
        attributes: ['uid', 'cn', 'sn', 'mail', 'altEmail', 'memberOf', 'employeeNumber'],
      })
      return entries[0] || null
    } catch (error) {
      logger.error('Failed to get LDAP user ' + uid + ':', error)
      throw error
    }
  }

  async getGroups() {
    try {
      const baseDN = await this.getBaseDN()
      return await this.search('ou=groups,' + baseDN, {
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
      const baseDN = await this.getBaseDN()
      const entries = await this.search('ou=groups,' + baseDN, {
        filter: '(cn=' + escapeLDAPFilterValue(cn) + ')',
      })
      return entries[0] || null
    } catch (error) {
      logger.error('Failed to get LDAP group ' + cn + ':', error)
      throw error
    }
  }

  async updateUser(uid, attributes) {
    await this.connect()
    
    const baseDN = await this.getBaseDN()
    const dn = 'uid=' + escapeLDAPDNValue(uid) + ',ou=people,' + baseDN
    
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
      logger.info('Updated LDAP user ' + uid, { attributes })
    } catch (error) {
      logger.error('Failed to update LDAP user ' + uid + ':', error)
      throw error
    }
  }

  async deleteUser(uid) {
    await this.connect()
    
    const baseDN = await this.getBaseDN()
    const dn = 'uid=' + escapeLDAPDNValue(uid) + ',ou=people,' + baseDN
    
    try {
      await this.client.del(dn)
      logger.info('Deleted LDAP user ' + uid)
    } catch (error) {
      logger.error('Failed to delete LDAP user ' + uid + ':', error)
      throw error
    }
  }
}

export const ldapClient = new LDAPClient()
