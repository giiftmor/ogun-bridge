const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const DEFAULT_TIMEOUT = 30000

const getToken = () => {
  // Auth token is set as HTTP-only cookie on login; no localStorage needed.
  // Return null to rely on automatic cookie-based auth.
  return null
}

class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function classifyError(error) {
  if (error.name === 'AbortError') {
    return { code: 'NETWORK_TIMEOUT', message: 'Request timed out' }
  }
  if (error instanceof TypeError) {
    return { code: 'NETWORK_ERROR', message: 'Network error - check your connection' }
  }
  if (error instanceof ApiError) {
    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      status: error.status,
      details: error.details,
    }
  }
  return {
    code: error.code || 'UNKNOWN_ERROR',
    message: error.message || 'An unexpected error occurred',
  }
}

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const token = getToken()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

    const config = {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, config)
      clearTimeout(timeoutId)

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new ApiError(error.code || 'UNAUTHORIZED', error.error || error.message || 'Authentication required', 401, error.details)
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new ApiError(error.code || 'UNKNOWN_ERROR', error.error || error.message || 'API request failed', error.status || response.status, error.details)
      }

      return await response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  // Auth endpoints
  async login(username, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }))
      throw new Error(error.message || 'Login failed')
    }

    const data = await response.json()
    return data
  }

  async logout() {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    return response
  }

  async getCurrentUser() {
    return this.request('/auth/me')
  }

  async forgotPassword(usernameOrEmail) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ username: usernameOrEmail.includes('@') ? undefined : usernameOrEmail, email: usernameOrEmail.includes('@') ? usernameOrEmail : undefined }),
    })
  }

  async verifyResetToken(token) {
    return this.request(`/auth/verify-reset-token/${token}`)
  }

  async resetPassword(token, newPassword) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    })
  }

  async resendResetToken(usernameOrEmail) {
    return this.request('/auth/resend-reset-token', {
      method: 'POST',
      body: JSON.stringify({ username: usernameOrEmail.includes('@') ? undefined : usernameOrEmail, email: usernameOrEmail.includes('@') ? usernameOrEmail : undefined }),
    })
  }

  async register(username, password, email, role = 'viewer') {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, role }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Registration failed' }))
      throw new Error(error.message || 'Registration failed')
    }

    return response.json()
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  }

  // Setup endpoints
  async getSetupStatus() {
    const response = await fetch(`${API_BASE_URL}/setup/status`)
    if (!response.ok) {
      throw new Error('Failed to get setup status')
    }
    return response.json()
  }

  async verifyAdmin(username, password) {
    const response = await fetch(`${API_BASE_URL}/setup/verify-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Invalid admin credentials' }))
      throw new Error(error.message || 'Invalid admin credentials')
    }
    return response.json()
  }

  async createSetupAdmin(username, password, email) {
    const response = await fetch(`${API_BASE_URL}/setup/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create admin' }))
      throw new Error(error.message || 'Failed to create admin')
    }
    return response.json()
  }

  async getSetupConfig(service) {
    const response = await fetch(`${API_BASE_URL}/setup/config/${service}`)
    if (!response.ok) {
      throw new Error(`Failed to get ${service} config`)
    }
    return response.json()
  }

  async getSetupGodMode() {
    const response = await fetch(`${API_BASE_URL}/setup/god-mode`)
    if (!response.ok) {
      throw new Error('Failed to load existing configuration')
    }
    return response.json()
  }

  async saveSetupConfig(service, config) {
    const response = await fetch(`${API_BASE_URL}/setup/config/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `Failed to save ${service} config` }))
      throw new Error(error.message || `Failed to save ${service} config`)
    }
    return response.json()
  }

  async testSetupService(service, config = {}) {
    const response = await fetch(`${API_BASE_URL}/setup/test/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: `${service} test failed` }))
      throw new Error(error.message || `${service} test failed`)
    }
    return response.json()
  }

  async completeSetup() {
    const response = await fetch(`${API_BASE_URL}/setup/complete`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to complete setup' }))
      throw new Error(error.message || 'Failed to complete setup')
    }
    return response.json()
  }

  async saveDatabaseConfig(config) {
    const response = await fetch(`${API_BASE_URL}/setup/config/database`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to configure database')
    }

    return data
  }

  // Dashboard endpoints
  async getDashboardStats() {
    return this.request('/dashboard/stats')
  }

  async getRecentActivity() {
    return this.request('/dashboard/activity')
  }

  async getSystemHealth() {
    return this.request('/health')
  }

  async previewSync({ direction, group_name }) {
    return this.request('/sync/preview', {
      method: 'POST',
      body: JSON.stringify({ direction, group_name }),
    })
  }

  async runSync({ direction, group_name, force = false }) {
    const query = force ? '?force=true' : ''
    return this.request(`/sync/run${query}`, {
      method: 'POST',
      body: JSON.stringify({ direction, group_name, force }),
    })
  }

  async getExternalHealth() {
    return this.request('/health/external')
  }

  async testService(service) {
    return this.request(`/health/test-service/${service}`, { method: 'POST' })
  }

  async getOperationsLogs(params = {}) {
    const { category = 'all', level = 'all', limit = 100 } = params
    const query = new URLSearchParams({ category, level, limit: limit.toString() }).toString()
    return this.request(`/operations/logs?${query}`)
  }

  async getOperationsStats() {
    return this.request('/operations/stats')
  }

  // User endpoints
  async getUsers(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/users${query ? `?${query}` : ''}`)
  }

  async getUsersList() {
    // Use fetch directly to avoid auth redirect for public endpoint
    const url = `${API_BASE_URL}/users/public-list`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching users list:', error)
      return []
    }
  }

  async getUser(userId) {
    return this.request(`/users/${userId}`)
  }

  async getUserComparison(userId) {
    return this.request(`/users/${userId}/compare`)
  }

  async testUserMapping(userId) {
    return this.request(`/users/${userId}/test-mapping`, { method: 'POST' })
  }

  async getUserDetail(username) {
    return this.request(`/users/${username}/detail`)
  }

  async getUserProfile(username) {
    return this.request(`/users/${username}/profile`)
  }

  async setUserAltEmail(username, altEmail) {
    return this.request(`/users/${username}/alt-email`, {
      method: 'PUT',
      body: JSON.stringify({ altEmail }),
    })
  }

  async forcePasswordReset(username) {
    return this.request(`/invite/force-reset/${username}`, { method: 'POST' })
  }

  async inviteUser(username) {
    return this.request(`/invite/send/${username}`, { method: 'POST' })
  }

  async generateTempPassword(username) {
    return this.request('/auth/generate-temp-password', {
      method: 'POST',
      body: JSON.stringify({ username }),
    })
  }

  // Group endpoints
  async getGroups(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/groups${query ? `?${query}` : ''}`)
  }

  async getGroupComparison(groupId) {
    return this.request(`/groups/${groupId}/compare`)
  }

  async getGroupTree() {
    return this.request('/groups/tree')
  }

  async getGroupMembers(groupId) {
    return this.request(`/groups/${groupId}/members`)
  }

  async getGroup(groupId) {
    return this.request(`/groups/${groupId}`)
  }

  async updateGroupSyncDirection(groupId, sync_direction) {
    return this.request(`/groups/${groupId}/sync-direction`, {
      method: 'PATCH',
      body: JSON.stringify({ sync_direction }),
    })
  }

  async getGroupServices(groupId) {
    return this.request(`/groups-manager/${groupId}/services`)
  }

  async addGroupService(groupId, service) {
    return this.request(`/groups-manager/${groupId}/services`, {
      method: 'POST',
      body: JSON.stringify(service),
    })
  }

  async removeGroupService(groupId, serviceId) {
    return this.request(`/groups-manager/${groupId}/services/${serviceId}`, {
      method: 'DELETE',
    })
  }

  async triggerGroupSync(options = {}) {
    return this.request('/groups/sync', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  async getGroupSyncConfigs() {
    return this.request('/groups/config')
  }

  async syncGroupNow(options = {}) {
    return this.request('/groups/sync-now', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  // Schema endpoints
  async getFieldMappings() {
    return this.request('/schema/mappings')
  }

  async updateFieldMapping(mapping) {
    return this.request('/schema/mappings', {
      method: 'PUT',
      body: JSON.stringify(mapping),
    })
  }

  async validateMapping(mapping) {
    return this.request('/schema/validate', {
      method: 'POST',
      body: JSON.stringify(mapping),
    })
  }

  async testMapping(testData) {
    return this.request('/schema/test', {
      method: 'POST',
      body: JSON.stringify(testData),
    })
  }

  // Changes endpoints
  async getChanges(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/changes${query ? `?${query}` : ''}`)
  }

  async getPendingChanges() {
    return this.request('/changes/pending')
  }

  async approveChange(changeId, comment) {
    return this.request(`/changes/${changeId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    })
  }

  async rejectChange(changeId, reason) {
    return this.request(`/changes/${changeId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  // Logs endpoints
  async getLogs(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/logs${query ? `?${query}` : ''}`)
  }

  // Audit endpoints
  async getAuditLogs(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/audit${query ? `?${query}` : ''}`)
  }

  async getAuditStats() {
    return this.request('/audit/stats')
  }

  // Password management endpoints
  async syncPassword(username, password, expirationDays = undefined) {
    return this.request(`/password/sync/${username}`, {
      method: 'POST',
      body: JSON.stringify({ password, expirationDays }),
    })
  }

  async verifyLdapPassword(username, password) {
    return this.request(`/test/verify-ldap-password/${username}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  }

  async validatePassword(password) {
    return this.request('/password/validate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  }

  async getPasswordPolicy() {
    return this.request('/password/policy')
  }

  async getPasswordHistory(username) {
    return this.request(`/password/history/${username}`)
  }

  async changePassword(username, currentPassword, newPassword) {
    return this.request('/password/change', {
      method: 'POST',
      body: JSON.stringify({ username, currentPassword, newPassword }),
    })
  }

  async getPasswordExpiration(username) {
    return this.request(`/password/expiration/${username}`)
  }

  async setPasswordExpiration(username, expirationDays) {
    return this.request(`/password/expiration/${username}`, {
      method: 'POST',
      body: JSON.stringify({ expirationDays }),
    })
  }

  // Group lifecycle CRUD
  async createGroup(data) {
    return this.request('/groups-manager/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateGroup(id, data) {
    return this.request(`/groups-manager/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteGroup(id) {
    return this.request(`/groups-manager/groups/${id}`, {
      method: 'DELETE',
    })
  }

  async addGroupMembers(id, usernames) {
    return this.request(`/groups-manager/groups/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ usernames }),
    })
  }

  async removeGroupMember(id, username) {
    return this.request(`/groups-manager/groups/${id}/members/${username}`, {
      method: 'DELETE',
    })
  }

  // User lifecycle CRUD
  async createUser(data) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    })
  }

  async exportUsersCSV() {
    const response = await fetch(`${API_BASE_URL}/users/export/csv`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Export failed' }))
      throw new Error(error.message || 'Export failed')
    }
    return response.blob()
  }

  async importUsersCSV(rows) {
    return this.request('/users/import/csv', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    })
  }

  async getUserGroups(username) {
    return this.request(`/users/${username}/groups`)
  }

  async addUserToGroupByPk(username, group_pk) {
    return this.request(`/users/${username}/groups`, {
      method: 'POST',
      body: JSON.stringify({ group_pk }),
    })
  }

  async removeUserFromGroupByPk(username, groupId) {
    return this.request(`/users/${username}/groups/${groupId}`, {
      method: 'DELETE',
    })
  }

  async searchAll(q) {
    return this.request(`/search?q=${encodeURIComponent(q)}`)
  }

  async onboardUser(data) {
    return this.request('/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Group manager / services endpoints
  async getServicesList() {
    return this.request('/groups-manager/services')
  }

  async addUserToGroup(username, groupName) {
    return this.request(`/groups-manager/add-user/${username}`, {
      method: 'POST',
      body: JSON.stringify({ group_name: groupName }),
    })
  }

  async assignServiceToGroup(serviceName, groupId) {
    return this.request(`/groups-manager/services/${encodeURIComponent(serviceName)}/assign-group`, {
      method: 'POST',
      body: JSON.stringify({ group_id: groupId }),
    })
  }

  async unassignServiceFromGroup(serviceName, groupName) {
    return this.request(`/groups-manager/services/${encodeURIComponent(serviceName)}/unassign-group/${encodeURIComponent(groupName)}`, {
      method: 'DELETE',
    })
  }

  async updateService(serviceName, data) {
    return this.request(`/groups-manager/services/${encodeURIComponent(serviceName)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteService(serviceName) {
    return this.request(`/groups-manager/services/${encodeURIComponent(serviceName)}`, {
      method: 'DELETE',
    })
  }

  async checkServiceHealth(serviceName) {
    return this.request(`/groups-manager/health/${encodeURIComponent(serviceName)}`, {
      method: 'POST',
    })
  }

  // Mail config endpoints
  async getMailConfig() {
    return this.request('/mail/config')
  }

  async saveMailConfig(config) {
    return this.request('/mail/config', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async testMailConfig() {
    return this.request('/mail/test', {
      method: 'POST',
    })
  }

  // Mail admin endpoints
  async getMailStatus() {
    return this.request('/mail/admin/status')
  }

  async createMailbox(username, email) {
    return this.request('/mail/admin/mailbox', {
      method: 'POST',
      body: JSON.stringify({ username, email }),
    })
  }

  async deleteMailbox(email) {
    return this.request(`/mail/admin/mailbox/${email}`, {
      method: 'DELETE',
    })
  }

  async updateMailQuota(email, quotaInMB) {
    return this.request('/mail/admin/quota', {
      method: 'POST',
      body: JSON.stringify({ email, quotaInMB }),
    })
  }

  async getMailAdminConfig() {
    return this.request('/mail/admin/config')
  }

  async saveMailAdminConfig(enabled, domain) {
    return this.request('/mail/admin/config', {
      method: 'POST',
      body: JSON.stringify({ enabled, domain }),
    })
  }

  // RBAC endpoints
  
  async createRbacApp(data) { return this.request('/rbac/apps', { method: 'POST', body: JSON.stringify(data) }) }
  async getRbacApps() { return this.request('/rbac/apps') }
  async getRbacApp(appSlug) { return this.request(`/rbac/apps/${appSlug}`) }
  async updateRbacApp(slug, data) { return this.request(`/rbac/apps/${slug}`, { method: 'PUT', body: JSON.stringify(data) }) }
  async getRbacRoles(appSlug) { return this.request(`/rbac/roles/${appSlug}`) }
  async createRbacRole(appSlug, data) { return this.request(`/rbac/roles/${appSlug}`, { method: 'POST', body: JSON.stringify(data) }) }
  async updateRbacRole(id, data) { return this.request(`/rbac/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }) }
  async deleteRbacRole(id) { return this.request(`/rbac/roles/${id}`, { method: 'DELETE' }) }
  async getRbacRolePermissions(id) { return this.request(`/rbac/roles/${id}/permissions`) }
  async updateRbacRolePermissions(id, permissions) { return this.request(`/rbac/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }) }
  async getRbacMappings(appSlug) { return this.request(`/rbac/mappings/${appSlug}`) }
  async createRbacMapping(appSlug, data) { return this.request(`/rbac/mappings/${appSlug}`, { method: 'POST', body: JSON.stringify(data) }) }
  async createRbacMappingsBulk(appSlug, data) { return this.request(`/rbac/mappings/${appSlug}/bulk`, { method: 'POST', body: JSON.stringify(data) }) }
  async updateRbacMapping(id, data) { return this.request(`/rbac/mappings/${id}`, { method: 'PUT', body: JSON.stringify(data) }) }
  async deleteRbacMapping(id) { return this.request(`/rbac/mappings/${id}`, { method: 'DELETE' }) }
  async getRbacSchema(appSlug) { return this.request(`/rbac/schema/${appSlug}`) }
  async updateRbacSchema(appSlug, modules) { return this.request(`/rbac/schema/${appSlug}`, { method: 'POST', body: JSON.stringify({ modules, source: 'admin_override' }) }) }
  async getRbacUsers(appSlug) { return this.request(`/rbac/users/${appSlug}`) }
  async overrideRbacUserRole(appSlug, sub, role_definition_id) { return this.request(`/rbac/users/${appSlug}/${sub}/role`, { method: 'PUT', body: JSON.stringify({ role_definition_id }) }) }
  async syncRbacUsers(appSlug) { return this.request(`/rbac/sync/${appSlug}`, { method: 'POST' }) }
  async getRbacAuthentikGroups() { return this.request('/rbac/authentik-groups') }
  async getRbacBaseRoles() { return this.request('/rbac/base-roles') }
  // Version control endpoints
  async getVersionHistory(entityType, entityId, limit = 20) {
    return this.request(`/versions/history/${entityType}/${entityId}?limit=${limit}`)
  }

  async getVersion(entityType, entityId, versionNumber) {
    return this.request(`/versions/${entityType}/${entityId}/${versionNumber}`)
  }

  async getLatestVersion(entityType, entityId) {
    return this.request(`/versions/${entityType}/${entityId}/latest`)
  }

  async getAllVersionedEntities() {
    return this.request('/versions/entities')
  }

  async createSnapshot(entityType, entityId, snapshotData, description) {
    return this.request('/versions/snapshot', {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, snapshot_data: snapshotData, description }),
    })
  }

  async rollbackToVersion(entityType, entityId, versionNumber) {
    return this.request(`/versions/rollback/${entityType}/${entityId}/${versionNumber}`, {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient()
