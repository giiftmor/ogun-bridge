import fetch from 'node-fetch'
import { logger } from '../utils/logger.js'
import { getServiceConfig, SERVICE_AUTHENTIK } from '../services/config.js'

export class AuthentikClient {
  constructor() {
    this._config = null
  }
  
  // Lazy-load config from DB
  async getConfig() {
    if (this._config) return this._config
    const config = await getServiceConfig(SERVICE_AUTHENTIK)
    this._config = {
      baseUrl: config.baseUrl || 'http://localhost:9000',
      apiToken: config.apiToken,
    }
    return this._config
  }

  async request(endpoint, options = {}) {
    const config = await this.getConfig()
    const url = config.baseUrl + endpoint
    
    if (!config.apiToken) {
      throw new Error('Authentik API token not configured. Please run /god-mode setup.')
    }

    const cfg = {
      ...options,
      headers: {
        'Authorization': 'Bearer ' + config.apiToken,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }

    try {
      const response = await fetch(url, cfg)

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: response.statusText
        }))
        throw new Error(error.message || 'Authentik API error: ' + response.status)
      }

      if (response.status === 204) {
        return { success: true } // No content response
      }

      return await response.json()
    } catch (error) {
      logger.error('Authentik API error:', error)
      throw error
    }
  }

  async getUsers(params = {}) {
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.set('search', params.search)
    if (params.is_active !== undefined) searchParams.set('is_active', params.is_active)
    if (params.page_size) searchParams.set('page_size', params.page_size)
    if (params.ordering) searchParams.set('ordering', params.ordering)

    const query = searchParams.toString()
    const endpoint = '/api/v3/core/users/' + (query ? '?' + query : '')
    const data = await this.request(endpoint)
    return data.results || []
  }

  async getUser(userId) {
    return this.request('/api/v3/core/users/' + userId + '/')
  }

  async createUser(userData) {
    return this.request('/api/v3/core/users/', {
      method: 'POST',
      body: JSON.stringify(userData),
    })
  }

  async updateUser(userId, updates) {
    return this.request('/api/v3/core/users/' + userId + '/', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async setPassword(userId, password) {
    return this.request('/api/v3/core/users/' + userId + '/set_password/', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  }

  async getUserByUsername(username) {
    const users = await this.getUsers({ search: username })
    return users.find(u => u.username === username) || null
  }

  async getUserGroups(userIdentifier) {
    const id = String(userIdentifier)

    // Numeric PK works directly with Authentik's user detail endpoint
    if (/^\d+$/.test(id)) {
      const data = await this.request(`/api/v3/core/users/${id}/`)
      return data.groups_obj || data.groups || []
    }

    // UUID/username/email — search first to get PK
    const users = await this.getUsers({ search: id })
    const user = users.length > 0
      ? users.find(u => u.uuid === id || u.username === id || u.email === id) || users[0]
      : null

    if (!user) {
      logger.warn('User not found for group lookup:', id)
      return []
    }

    const data = await this.request(`/api/v3/core/users/${user.pk}/`)
    return data.groups_obj || data.groups || []
  }

  async deleteUser(userId) {
    return this.request('/api/v3/core/users/' + userId + '/', {
      method: 'DELETE',
    })
  }

  async getGroups(params = {}) {
    const searchParams = new URLSearchParams()
    if (params.search) searchParams.set('search', params.search)
    if (!params.page_size) searchParams.set('page_size', '200')
    if (params.ordering) searchParams.set('ordering', params.ordering)

    const allResults = []
    let nextEndpoint = '/api/v3/core/groups/?' + searchParams.toString()

    while (nextEndpoint) {
      const data = await this.request(nextEndpoint)
      if (data.results) allResults.push(...data.results)
      nextEndpoint = data.next || null
    }

    return allResults
  }

  async getGroup(groupId, options = {}) {
    const params = new URLSearchParams()
    if (options.includeChildren) params.set('include_children', 'true')
    if (options.includeParents) params.set('include_parents', 'true')
    const query = params.toString()
    return this.request('/api/v3/core/groups/' + groupId + '/' + (query ? '?' + query : ''))
  }

  async resolveEffectiveMembers(groupId, depth = 3, visited = new Set()) {
    if (depth <= 0 || visited.has(groupId)) return []
    visited.add(groupId)

    const group = await this.getGroup(groupId, { includeChildren: true })
    const directMembers = group.users_obj?.map(u => u.username) || []
    const childMembers = (group.children_obj || []).flatMap(child =>
      this.resolveEffectiveMembers(child.pk, depth - 1, visited)
    )
    return [...new Set([...directMembers, ...childMembers])]
  }

  async getGroupAncestors(groupId, depth = 3) {
    if (depth <= 0) return []

    const group = await this.getGroup(groupId, { includeParents: true })
    const ancestors = []
    if (group.parents_obj?.length > 0) {
      for (const parent of group.parents_obj) {
        ancestors.push({ pk: parent.pk, name: parent.name, group_uuid: parent.group_uuid })
        const grandParents = await this.getGroupAncestors(parent.pk, depth - 1)
        ancestors.push(...grandParents)
      }
    }
    return ancestors
  }

  async createGroup(groupData) {
    return this.request('/api/v3/core/groups/', {
      method: 'POST',
      body: JSON.stringify(groupData),
    })
  }

  async updateGroup(groupId, updates) {
    return this.request('/api/v3/core/groups/' + groupId + '/', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async updateGroupAttributes(groupId, attributes) {
    const currentGroup = await this.getGroup(groupId)
    const mergedAttributes = {
      ...currentGroup.attributes,
      ...attributes,
    }
    return this.request('/api/v3/core/groups/' + groupId + '/', {
      method: 'PATCH',
      body: JSON.stringify({ attributes: mergedAttributes }),
    })
  }

  async deleteGroup(groupId) {
    return this.request('/api/v3/core/groups/' + groupId + '/', {
      method: 'DELETE',
    })
  }

  async getGroupUsers(groupId) {
    const group = await this.getGroup(groupId)
    return group.users_obj || []
  }

  async addUserToGroup(groupId, username) {
    const [group, user] = await Promise.all([
      this.getGroup(groupId),
      this.getUserByUsername(username),
    ])
    if (!user) throw new Error(`User '${username}' not found in Authentik`)

    const currentUsers = group.users_obj || []
    if (!currentUsers.some(u => u.pk === user.pk)) {
      const updatedUsers = [...currentUsers.map(u => u.pk), user.pk]
      return this.updateGroup(groupId, { users: updatedUsers })
    }
    return { success: true, message: 'User already in group' }
  }

  async removeUserFromGroup(groupId, username) {
    const [group, user] = await Promise.all([
      this.getGroup(groupId),
      this.getUserByUsername(username),
    ])
    if (!user) throw new Error(`User '${username}' not found in Authentik`)

    const currentUsers = group.users_obj || []
    const updatedUsers = currentUsers
      .filter(u => u.pk !== user.pk)
      .map(u => u.pk)
    return this.updateGroup(groupId, { users: updatedUsers })
  }
}

export const authentikClient = new AuthentikClient()
