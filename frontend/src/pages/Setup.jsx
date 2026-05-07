import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'admin', title: 'Admin Account' },
  { id: 'authentik', title: 'Authentik' },
  { id: 'ldap', title: 'LDAP' },
  { id: 'smtp', title: 'SMTP' },
  { id: 'test', title: 'Test & Review' },
  { id: 'complete', title: 'Complete' },
]

export function Setup() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [setupStatus, setSetupStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [adminForm, setAdminForm] = useState({ username: 'superadmin', password: '', email: '' })
  const [authentikForm, setAuthentikForm] = useState({ baseUrl: '', apiToken: '' })
  const [ldapForm, setLdapForm] = useState({
    host: '', port: '389', bindDN: '', bindPassword: '', baseDN: '', userBaseDN: '', groupBaseDN: ''
  })
  const [smtpForm, setSmtpForm] = useState({
    host: '', port: '587', secure: false, username: '', password: '', fromName: 'Spectres', fromAddress: ''
  })
  const [testResults, setTestResults] = useState({})

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const status = await apiClient.getSetupStatus()
      setSetupStatus(status)
      
      if (status.setupComplete) {
        navigate('/login', { replace: true })
        return
      }
    } catch (e) {
      setError('Failed to check setup status: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    setError('')
    setSuccess('')
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1))
  }

  const handleBack = () => {
    setError('')
    setSuccess('')
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      await apiClient.createSetupAdmin(adminForm.username, adminForm.password, adminForm.email)
      setSuccess('Admin account created successfully!')
      setTimeout(() => handleNext(), 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAuthentik = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      await apiClient.saveSetupConfig('authentik', authentikForm)
      setSuccess('Authentik configuration saved!')
      setTimeout(() => handleNext(), 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLDAP = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      await apiClient.saveSetupConfig('ldap', ldapForm)
      setSuccess('LDAP configuration saved!')
      setTimeout(() => handleNext(), 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSMTP = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      await apiClient.saveSetupConfig('smtp', smtpForm)
      setSuccess('SMTP configuration saved!')
      setTimeout(() => handleNext(), 1000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestService = async (service) => {
    setTesting(true)
    setError('')
    
    try {
      const config = service === 'authentik' ? authentikForm 
        : service === 'ldap' ? ldapForm 
        : service === 'smtp' ? smtpForm 
        : {}
      
      const result = await apiClient.testSetupService(service, config)
      setTestResults(prev => ({ ...prev, [service]: result }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [service]: { success: false, message: e.message } }))
    } finally {
      setTesting(false)
    }
  }

  const handleTestAll = async () => {
    setTesting(true)
    setError('')
    
    const services = ['database', 'authentik', 'ldap', 'smtp']
    const results = {}
    
    for (const service of services) {
      try {
        const config = service === 'authentik' ? authentikForm 
          : service === 'ldap' ? ldapForm 
          : service === 'smtp' ? smtpForm 
          : {}
        
        results[service] = await apiClient.testSetupService(service, config)
      } catch (e) {
        results[service] = { success: false, message: e.message }
      }
    }
    
    setTestResults(results)
    setTesting(false)
  }

  const handleCompleteSetup = async () => {
    setSaving(true)
    setError('')
    
    try {
      await apiClient.completeSetup()
      setSuccess('Setup completed successfully!')
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1500)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading setup...</div>
      </div>
    )
  }

  const step = STEPS[currentStep]

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Ogun Bridge Setup
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Welcome! Let's configure your system step by step.
            </p>
          </div>

          {/* Steps indicator */}
          <div className="mb-8 flex justify-between">
            {STEPS.map((s, idx) => (
              <div
                key={s.id}
                className={`flex flex-col items-center ${
                  idx <= currentStep ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    idx < currentStep
                      ? 'bg-indigo-600 text-white'
                      : idx === currentStep
                      ? 'border-2 border-indigo-600 text-indigo-600'
                      : 'border-2 border-gray-300 text-gray-400'
                  }`}
                >
                  {idx < currentStep ? '✓' : idx + 1}
                </div>
                <span className="mt-1 text-xs hidden sm:block">{s.title}</span>
              </div>
            ))}
          </div>

          {/* Error/Success messages */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded">
              {success}
            </div>
          )}

          {/* Step content */}
          <div className="mt-6">
            {/* Welcome Step */}
            {step.id === 'welcome' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Welcome to Ogun Bridge
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  This setup wizard will guide you through configuring:
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2 mb-6">
                  <li>Admin account for managing the system</li>
                  <li>Authentik integration for user management</li>
                  <li>LDAP (389DS) connection for directory services</li>
                  <li>SMTP settings for sending emails</li>
                </ul>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  You'll be able to test each connection before proceeding.
                </p>
              </div>
            )}

            {/* Admin Step */}
            {step.id === 'admin' && (
              <form onSubmit={handleCreateAdmin}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Create Admin Account
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  This account will have full administrative access to Ogun Bridge.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={adminForm.username}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {saving ? 'Creating...' : 'Create Admin & Continue'}
                  </button>
                </div>
              </form>
            )}

            {/* Authentik Step */}
            {step.id === 'authentik' && (
              <form onSubmit={handleSaveAuthentik}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Authentik Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Configure the connection to your Authentik instance.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Authentik URL
                    </label>
                    <input
                      type="url"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={authentikForm.baseUrl}
                      onChange={(e) => setAuthentikForm(prev => ({ ...prev, baseUrl: e.target.value }))}
                      placeholder="http://localhost:9000"
                    />
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      API Token
                    </label>
                    <input
                      type="password"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={authentikForm.apiToken}
                      onChange={(e) => setAuthentikForm(prev => ({ ...prev, apiToken: e.target.value }))}
                      placeholder="Enter your Authentik API token"
                    />
                  </div>
                </div>
                
                <div className="mt-4 flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => handleTestService('authentik')}
                    disabled={testing}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                
                  {testResults.authentik && (
                    <span className={`text-sm ${testResults.authentik.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults.authentik.success ? '✓ Connected!' : `✗ ${testResults.authentik.message}`}
                    </span>
                  )}
                </div>
                
                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </form>
            )}

            {/* LDAP Step */}
            {step.id === 'ldap' && (
              <form onSubmit={handleSaveLDAP}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  LDAP (389DS) Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Configure the connection to your LDAP directory server.
                </p>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Host
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={ldapForm.host}
                        onChange={(e) => setLdapForm(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Port
                      </label>
                      <input
                        type="number"
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={ldapForm.port}
                        onChange={(e) => setLdapForm(prev => ({ ...prev, port: e.target.value }))}
                      />
                    </div>
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bind DN
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={ldapForm.bindDN}
                      onChange={(e) => setLdapForm(prev => ({ ...prev, bindDN: e.target.value }))}
                      placeholder="cn=Directory Manager,dc=example,dc=com"
                    />
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bind Password
                    </label>
                    <input
                      type="password"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={ldapForm.bindPassword}
                      onChange={(e) => setLdapForm(prev => ({ ...prev, bindPassword: e.target.value }))}
                    />
                  </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Base DN
                    </label>
                    <input
                      type="text"
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                      value={ldapForm.baseDN}
                      onChange={(e) => setLdapForm(prev => ({ ...prev, baseDN: e.target.value }))}
                      placeholder="dc=example,dc=com"
                    />
                  </div>
                </div>
                
                <div className="mt-4 flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => handleTestService('ldap')}
                    disabled={testing}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                
                  {testResults.ldap && (
                    <span className={`text-sm ${testResults.ldap.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults.ldap.success ? '✓ Connected!' : `✗ ${testResults.ldap.message}`}
                    </span>
                  )}
                </div>
                
                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </form>
            )}

            {/* SMTP Step */}
            {step.id === 'smtp' && (
              <form onSubmit={handleSaveSMTP}>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  SMTP Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Configure email settings for sending notifications and password resets.
                </p>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.host}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Port
                      </label>
                      <input
                        type="number"
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.port}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, port: e.target.value }))}
                      />
                    </div>
                  </div>
                
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="secure"
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                      checked={smtpForm.secure}
                      onChange={(e) => setSmtpForm(prev => ({ ...prev, secure: e.target.checked }))}
                    />
                    <label htmlFor="secure" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                      Use TLS/SSL (port 465)
                    </label>
                  </div>
                
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Username
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.username}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, username: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Password
                      </label>
                      <input
                        type="password"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.password}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, password: e.target.value }))}
                      />
                    </div>
                  </div>
                
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        From Name
                      </label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.fromName}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, fromName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        From Address
                      </label>
                      <input
                        type="email"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                        value={smtpForm.fromAddress}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, fromAddress: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center space-x-4">
                  <button
                    type="button"
                    onClick={() => handleTestService('smtp')}
                    disabled={testing}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                
                  {testResults.smtp && (
                    <span className={`text-sm ${testResults.smtp.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults.smtp.success ? '✓ Connected!' : `✗ ${testResults.smtp.message}`}
                    </span>
                  )}
                </div>
                
                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </form>
            )}

            {/* Test & Review Step */}
            {step.id === 'test' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Test & Review
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Test all connections before completing the setup.
                </p>
                
                <div className="space-y-4">
                  {['database', 'authentik', 'ldap', 'smtp'].map(service => (
                    <div key={service} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${
                            testResults[service]?.success ? 'bg-green-500' : 
                            testResults[service]?.success === false ? 'bg-red-500' : 'bg-gray-300'
                          }`} />
                          <span className="font-medium text-gray-900 dark:text-white capitalize">
                            {service === 'smtp' ? 'SMTP' : service}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTestService(service)}
                          disabled={testing}
                          className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                        >
                          Test
                        </button>
                      </div>
                      {testResults[service] && !testResults[service].success && (
                        <p className="mt-2 text-sm text-red-600">{testResults[service].message}</p>
                      )}
                      {testResults[service]?.success && (
                        <p className="mt-2 text-sm text-green-600">
                          Connected successfully
                          {testResults[service].userCount !== undefined && ` (${testResults[service].userCount} users found)`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    Back
                  </button>
                  <div className="space-x-3">
                    <button
                      type="button"
                      onClick={handleTestAll}
                      disabled={testing}
                      className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                    >
                      {testing ? 'Testing...' : 'Test All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNext()}
                      className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Complete Step */}
            {step.id === 'complete' && (
              <div className="text-center">
                <div className="mb-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  Setup Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Your Ogun Bridge system is now configured and ready to use.
                </p>
                <button
                  type="button"
                  onClick={handleCompleteSetup}
                  disabled={saving}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {saving ? 'Completing...' : 'Go to Login'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
