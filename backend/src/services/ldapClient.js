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

  async resolveNestedGroupMembers(groupDN, depth = 3, visited = new Set()) {
    if (depth <= 0 || visited.has(groupDN)) return []
    visited.add(groupDN)

    const members = []
    const searchEntries = await this.search(groupDN, {
      scope: 'base',
      attributes: ['member'],
    })
    const memberDNs = searchEntries[0]?.member || []
    const memberArray = Array.isArray(memberDNs) ? memberDNs : [memberDNs]

    for (const member of memberArray) {
      if (/^uid=/i.test(member)) {
        const match = member.match(/^uid=([^,]+)/)
        if (match) members.push(match[1])
      } else if (/^cn=/i.test(member)) {
        const nestedMembers = await this.resolveNestedGroupMembers(member, depth - 1, visited)
        members.push(...nestedMembers)
      }
    }
    return [...new Set(members)]
  }

  async getGroupTree(baseDN = null, depth = 3) {
    if (!baseDN) baseDN = await this.getGroupBaseDN()
    const groups = await this.search(baseDN, {
      filter: '(objectClass=groupOfNames)',
      attributes: ['cn', 'description', 'member'],
    })

    const buildTree = async (parentDN, remainingDepth) => {
      if (remainingDepth <= 0) return []
      const children = []
      for (const group of groups) {
        const members = Array.isArray(group.member) ? group.member : [group.member]
        if (members.includes(parentDN)) {
          const childGroups = await buildTree(group.dn, remainingDepth - 1)
          children.push({
            cn: group.cn,
            dn: group.dn,
            description: (group.description || [''])[0],
            memberCount: members.filter(m => /^uid=/i.test(m)).length,
            nestedGroupCount: members.filter(m => /^cn=/i.test(m)).length,
            children: childGroups,
          })
        }
      }
      return children
    }

    const tree = []
    for (const group of groups) {
      const parentCheck = group.member
        ? (Array.isArray(group.member) ? group.member : [group.member])
            .some(m => m === parentDN)
        : false
      const isRoot = !parentCheck
      if (isRoot) {
        const children = await buildTree(group.dn, depth - 1)
        const members = Array.isArray(group.member) ? group.member : [group.member]
        tree.push({
          cn: group.cn,
          dn: group.dn,
          description: (group.description || [''])[0],
          memberCount: members.filter(m => /^uid=/i.test(m)).length,
          nestedGroupCount: members.filter(m => /^cn=/i.test(m)).length,
          children,
        })
      }
    }
    return tree
  }

  async updateUser(uid, attributes) {
    await this.connect()
    
    const baseDN = await this.getBaseDN()
    const dn = 'uid=' + escapeLDAPDNValue(uid) + ',ou=people,' + baseDN
    
    const changes = Object.entries(attributes).map(([key, value]) =>
      new Change({
        operation: 'replace',
        modification: new Attribute({
          type: key,
          values: Array.isArray(value) ? value : [String(value)],
        }),
      })
    )
    
    try {
      await this.client.modify(dn, changes)
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

  async createGroup(groupName, attrs = {}) {
    await this.connect()
    const baseDN = await this.getBaseDN()
    const dn = 'cn=' + escapeLDAPDNValue(groupName) + ',ou=groups,' + baseDN

    const entry = {
      objectClass: ['groupOfNames', 'top'],
      cn: groupName,
      member: attrs.member || ['uid=placeholder,ou=people,' + baseDN],
    }
    if (attrs.description) entry.description = attrs.description

    try {
      await this.client.add(dn, entry)
      logger.info('Created LDAP group ' + groupName)
      return { dn }
    } catch (error) {
      logger.error('Failed to create LDAP group ' + groupName + ':', error)
      throw error
    }
  }

  async updateGroup(groupName, attributes) {
    await this.connect()
    const baseDN = await this.getBaseDN()
    const dn = 'cn=' + escapeLDAPDNValue(groupName) + ',ou=groups,' + baseDN

    const changes = Object.entries(attributes).map(([key, value]) =>
      new Change({
        operation: 'replace',
        modification: new Attribute({
          type: key,
          values: Array.isArray(value) ? value : [String(value)],
        }),
      })
    )

    try {
      await this.client.modify(dn, changes)
      logger.info('Updated LDAP group ' + groupName)
    } catch (error) {
      logger.error('Failed to update LDAP group ' + groupName + ':', error)
      throw error
    }
  }

  async deleteGroup(groupName) {
    await this.connect()
    const baseDN = await this.getBaseDN()
    const dn = 'cn=' + escapeLDAPDNValue(groupName) + ',ou=groups,' + baseDN

    try {
      await this.client.del(dn)
      logger.info('Deleted LDAP group ' + groupName)
    } catch (error) {
      logger.error('Failed to delete LDAP group ' + groupName + ':', error)
      throw error
    }
  }
}

export const ldapClient = new LDAPClient()
