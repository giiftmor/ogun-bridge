const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const getToken = () => {
  // Auth token is set as HTTP-only cookie on login; no localStorage needed.
  // Return null to rely on automatic cookie-based auth.
  return null
}

class ApiClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`
    const token = getToken()

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
      },
    }

    try {
      const response = await fetch(url, config)

    if (response.status === 401) {
      // Only redirect to login if it's a session/auth failure (not network error)
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        
        // Only redirect for actual auth failures (cookie will be cleared server-side)
        if (error.error?.includes('expired') || error.error?.includes('Invalid') || error.error?.includes('Not authenticated')) {
          window.location.href = '/login'
        }
        // For other 401s, just throw without redirect
        throw new Error(error.message || 'Authentication required')
      }
    }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || 'API request failed')
      }

      return await response.json()
    } catch (error) {
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
    const token = getToken()
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        })
      } catch (e) {
        console.warn('Logout request failed:', e)
      }
    }
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
    return this.request(`/groups/${groupId}/services`)
  }

  async addGroupService(groupId, service) {
    return this.request(`/groups/${groupId}/services`, {
      method: 'POST',
      body: JSON.stringify(service),
    })
  }

  async removeGroupService(groupId, serviceId) {
    return this.request(`/groups/${groupId}/services/${serviceId}`, {
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

  async getGroupMembers(groupId) {
    return this.request(`/groups/${groupId}/members`)
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
