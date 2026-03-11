const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const getToken = () => localStorage.getItem('auth_token')

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
        localStorage.removeItem('auth_token')
        window.location.href = '/login'
        throw new Error('Session expired')
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || 'API request failed')
      }

      return await response.json()
    } catch (error) {
      console.error('API Error:', error)
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
    localStorage.setItem('auth_token', data.token)
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
    localStorage.removeItem('auth_token')
  }

  async getCurrentUser() {
    return this.request('/auth/me')
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

  // User endpoints
  async getUsers(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    )
    const query = new URLSearchParams(cleanParams).toString()
    return this.request(`/users${query ? `?${query}` : ''}`)
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
}

export const apiClient = new ApiClient()
