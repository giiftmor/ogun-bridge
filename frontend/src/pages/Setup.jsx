import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../services/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle, Loader2 } from 'lucide-react'

const ALL_STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'database', title: 'Database' },
  { id: 'admin', title: 'Verify Admin' },
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

  // Filter out database step from the progress bar when DB is already connected
  const steps = useMemo(() => {
    if (setupStatus?.db_connected === false) return ALL_STEPS
    return ALL_STEPS.filter(s => s.id !== 'database')
  }, [setupStatus?.db_connected])

  const [dbForm, setDbForm] = useState({ host: '', port: '5432', database: '', user: '', password: '' })
  const [adminForm, setAdminForm] = useState({ username: 'superadmin', password: '', email: '' })
  const [authentikForm, setAuthentikForm] = useState({ baseUrl: '', apiToken: '' })
  const [ldapForm, setLdapForm] = useState({ host: '', port: '389', bindDN: '', bindPassword: '', baseDN: '', userBaseDN: '', groupBaseDN: '' })
  const [smtpForm, setSmtpForm] = useState({ host: '', port: '587', secure: false, username: '', password: '', fromName: 'Spectres', fromAddress: '' })
  const [testResults, setTestResults] = useState({})

  useEffect(() => { checkSetupStatus() }, [])

  const checkSetupStatus = async () => {
    try { const status = await apiClient.getSetupStatus(); setSetupStatus(status); if (status.setupComplete) { navigate('/login', { replace: true }); return } }
    catch (e) { setError('Failed to check setup status: ' + e.message) }
    finally { setLoading(false) }
  }

  const handleNext = () => { setError(''); setSuccess(''); setCurrentStep(prev => Math.min(prev + 1, steps.length - 1)) }
  const handleBack = () => { setError(''); setSuccess(''); setCurrentStep(prev => Math.max(prev - 1, 0)) }

  const handleSaveDatabase = async (e) => {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('')
    try {
      const result = await apiClient.saveDatabaseConfig({
        host: dbForm.host,
        port: dbForm.port,
        database: dbForm.database,
        user: dbForm.user,
        password: dbForm.password,
      })
      setSuccess(result.message || 'Database configured!')
      // Refresh status — the steps memo will recompute, shifting us to the Admin step
      const status = await apiClient.getSetupStatus()
      setSetupStatus(status)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleVerifyAdmin = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await apiClient.verifyAdmin(adminForm.username, adminForm.password); setSuccess('Admin credentials verified!'); setTimeout(() => handleNext(), 1000) }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleSaveAuthentik = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await apiClient.saveSetupConfig('authentik', authentikForm); setSuccess('Authentik configuration saved!'); setTimeout(() => handleNext(), 1000) }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleSaveLDAP = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await apiClient.saveSetupConfig('ldap', ldapForm); setSuccess('LDAP configuration saved!'); setTimeout(() => handleNext(), 1000) }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleSaveSMTP = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    try { await apiClient.saveSetupConfig('smtp', smtpForm); setSuccess('SMTP configuration saved!'); setTimeout(() => handleNext(), 1000) }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  const handleTestService = async (service) => {
    setTesting(true); setError('')
    const config = service === 'authentik' ? authentikForm : service === 'ldap' ? ldapForm : service === 'smtp' ? smtpForm : {}
    try { const result = await apiClient.testSetupService(service, config); setTestResults(prev => ({ ...prev, [service]: result })) }
    catch (e) { setTestResults(prev => ({ ...prev, [service]: { success: false, message: e.message } })) }
    finally { setTesting(false) }
  }

  const handleTestAll = async () => {
    setTesting(true); setError(''); const services = ['database', 'authentik', 'ldap', 'smtp']; const results = {}
    for (const service of services) {
      const config = service === 'authentik' ? authentikForm : service === 'ldap' ? ldapForm : service === 'smtp' ? smtpForm : {}
      try { results[service] = await apiClient.testSetupService(service, config) }
      catch (e) { results[service] = { success: false, message: e.message } }
    }
    setTestResults(results); setTesting(false)
  }

  const handleCompleteSetup = async () => {
    setSaving(true); setError('')
    try { await apiClient.completeSetup(); setSuccess('Setup completed!'); setTimeout(() => { navigate('/login', { replace: true }) }, 1500) }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-page"><div className="text-secondary text-[13px]">Loading setup...</div></div>
  }

  const step = steps[currentStep]

  return (
    <div className="min-h-screen bg-page flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-2xl">
        <Card className="py-8 px-4 sm:px-10">
          <CardContent className="p-0">
            <div className="mb-8 text-center">
              <h1 className="text-[20px] font-medium text-primary">Ogun Bridge Setup</h1>
              <p className="text-[13px] text-secondary mt-1">Welcome! Let's configure your system step by step.</p>
            </div>

            <div className="mb-8 flex justify-between">
              {steps.map((s, idx) => (
                <div key={s.id} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium ${
                    idx < currentStep ? 'bg-accent text-white' :
                    idx === currentStep ? 'border-2 border-accent text-accent' :
                    'border-2 border-border text-tertiary'
                  }`}>
                    {idx < currentStep ? <CheckCircle className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span className="mt-1 text-[11px] text-tertiary hidden sm:block">{s.title}</span>
                </div>
              ))}
            </div>

            {error && <div className="mb-4 bg-danger-bg border border-danger-text/20 text-danger-text px-4 py-3 rounded-sm text-[13px]">{error}</div>}
            {success && <div className="mb-4 bg-success-bg border border-success-text/20 text-success-text px-4 py-3 rounded-sm text-[13px]">{success}</div>}

            <div className="mt-6">
              {step.id === 'welcome' && (
                <div>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Welcome to Ogun Bridge</h2>
                  <p className="text-[13px] text-secondary mb-4">This setup wizard will guide you through configuring:</p>
                  <ul className="list-disc list-inside text-[13px] text-secondary space-y-1.5 mb-6">
                    <li>Database connection</li>
                    <li>Admin account for managing the system</li>
                    <li>Authentik integration for user management</li>
                    <li>LDAP (389DS) connection for directory services</li>
                    <li>SMTP settings for sending emails</li>
                  </ul>
                  <p className="text-[12px] text-tertiary">You'll be able to test each connection before proceeding.</p>
                  <div className="mt-6 flex justify-end"><Button onClick={handleNext}>Get Started</Button></div>
                </div>
              )}

              {step.id === 'database' && (
                <form onSubmit={handleSaveDatabase}>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Configure Database</h2>
                  <p className="text-[13px] text-secondary mb-6">The database connection failed on startup. Enter the correct credentials below to reconnect.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Host</label>
                        <Input type="text" required value={dbForm.host} onChange={e => setDbForm(p => ({ ...p, host: e.target.value }))} placeholder="localhost" /></div>
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Port</label>
                        <Input type="number" required value={dbForm.port} onChange={e => setDbForm(p => ({ ...p, port: e.target.value }))} /></div>
                    </div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Database Name</label>
                      <Input type="text" required value={dbForm.database} onChange={e => setDbForm(p => ({ ...p, database: e.target.value }))} placeholder="ogun_bridge" /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Username</label>
                      <Input type="text" required value={dbForm.user} onChange={e => setDbForm(p => ({ ...p, user: e.target.value }))} placeholder="postgres" /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Password</label>
                      <Input type="password" value={dbForm.password} onChange={e => setDbForm(p => ({ ...p, password: e.target.value }))} placeholder="Database password" /></div>
                  </div>
                  {saving && <p className="mt-3 text-[13px] text-secondary">Testing connection and saving configuration...</p>}
                  <div className="mt-6 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Connecting...' : 'Test & Save'}</Button></div>
                </form>
              )}

              {step.id === 'admin' && (
                <form onSubmit={handleVerifyAdmin}>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Enter Admin Credentials</h2>
                  <p className="text-[13px] text-secondary mb-6">Verify your super admin credentials (set in .env) to continue with the setup.</p>
                  <div className="space-y-4">
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Username</label>
                      <Input type="text" required value={adminForm.username} onChange={e => setAdminForm(p => ({ ...p, username: e.target.value }))} /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Password</label>
                      <Input type="password" required value={adminForm.password} onChange={e => setAdminForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your super admin password" /></div>
                  </div>
                  <div className="mt-6 flex justify-end"><Button type="submit" disabled={saving}>{saving ? 'Verifying...' : 'Verify & Continue'}</Button></div>
                </form>
              )}

              {step.id === 'authentik' && (
                <form onSubmit={handleSaveAuthentik}>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Authentik Configuration</h2>
                  <p className="text-[13px] text-secondary mb-6">Configure the connection to your Authentik instance.</p>
                  <div className="space-y-4">
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Authentik URL</label>
                      <Input type="url" required value={authentikForm.baseUrl} onChange={e => setAuthentikForm(p => ({ ...p, baseUrl: e.target.value }))} placeholder="http://localhost:9000" /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">API Token</label>
                      <Input type="password" required value={authentikForm.apiToken} onChange={e => setAuthentikForm(p => ({ ...p, apiToken: e.target.value }))} placeholder="Enter your Authentik API token" /></div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <Button type="button" variant="ghost" onClick={() => handleTestService('authentik')} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</Button>
                    {testResults.authentik && <span className={`text-[13px] ${testResults.authentik.success ? 'text-success-text' : 'text-danger-text'}`}>{testResults.authentik.success ? '\u2713 Connected!' : `\u2717 ${testResults.authentik.message}`}</span>}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="ghost" onClick={handleBack}>Back</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save & Continue'}</Button>
                  </div>
                </form>
              )}

              {step.id === 'ldap' && (
                <form onSubmit={handleSaveLDAP}>
                  <h2 className="text-[16px] font-medium text-primary mb-4">LDAP (389DS) Configuration</h2>
                  <p className="text-[13px] text-secondary mb-6">Configure the connection to your LDAP directory server.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Host</label><Input type="text" required value={ldapForm.host} onChange={e => setLdapForm(p => ({ ...p, host: e.target.value }))} placeholder="localhost" /></div>
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Port</label><Input type="number" required value={ldapForm.port} onChange={e => setLdapForm(p => ({ ...p, port: e.target.value }))} /></div>
                    </div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Bind DN</label><Input type="text" required value={ldapForm.bindDN} onChange={e => setLdapForm(p => ({ ...p, bindDN: e.target.value }))} placeholder="cn=Directory Manager,dc=example,dc=com" /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Bind Password</label><Input type="password" required value={ldapForm.bindPassword} onChange={e => setLdapForm(p => ({ ...p, bindPassword: e.target.value }))} /></div>
                    <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Base DN</label><Input type="text" required value={ldapForm.baseDN} onChange={e => setLdapForm(p => ({ ...p, baseDN: e.target.value }))} placeholder="dc=example,dc=com" /></div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <Button type="button" variant="ghost" onClick={() => handleTestService('ldap')} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</Button>
                    {testResults.ldap && <span className={`text-[13px] ${testResults.ldap.success ? 'text-success-text' : 'text-danger-text'}`}>{testResults.ldap.success ? '\u2713 Connected!' : `\u2717 ${testResults.ldap.message}`}</span>}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="ghost" onClick={handleBack}>Back</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save & Continue'}</Button>
                  </div>
                </form>
              )}

              {step.id === 'smtp' && (
                <form onSubmit={handleSaveSMTP}>
                  <h2 className="text-[16px] font-medium text-primary mb-4">SMTP Configuration</h2>
                  <p className="text-[13px] text-secondary mb-6">Configure email settings for sending notifications.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">SMTP Host</label><Input type="text" required value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" /></div>
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Port</label><Input type="number" required value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: e.target.value }))} /></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="secure" checked={smtpForm.secure} onCheckedChange={(checked) => setSmtpForm(p => ({ ...p, secure: checked }))} />
                      <label htmlFor="secure" className="text-[13px] text-secondary">Use TLS/SSL (port 465)</label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Username</label><Input type="text" value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} /></div>
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">Password</label><Input type="password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">From Name</label><Input type="text" value={smtpForm.fromName} onChange={e => setSmtpForm(p => ({ ...p, fromName: e.target.value }))} /></div>
                      <div><label className="block text-[12px] font-medium text-secondary mb-1.5">From Address</label><Input type="email" value={smtpForm.fromAddress} onChange={e => setSmtpForm(p => ({ ...p, fromAddress: e.target.value }))} /></div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-4">
                    <Button type="button" variant="ghost" onClick={() => handleTestService('smtp')} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</Button>
                    {testResults.smtp && <span className={`text-[13px] ${testResults.smtp.success ? 'text-success-text' : 'text-danger-text'}`}>{testResults.smtp.success ? '\u2713 Connected!' : `\u2717 ${testResults.smtp.message}`}</span>}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="ghost" onClick={handleBack}>Back</Button>
                    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save & Continue'}</Button>
                  </div>
                </form>
              )}

              {step.id === 'test' && (
                <div>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Test & Review</h2>
                  <p className="text-[13px] text-secondary mb-6">Test all connections before completing the setup.</p>
                  <div className="space-y-3">
                    {['database', 'authentik', 'ldap', 'smtp'].map(service => (
                      <div key={service} className="border border-border rounded-sm p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${testResults[service]?.success ? 'bg-success-text' : testResults[service]?.success === false ? 'bg-danger-text' : 'bg-border'}`} />
                            <span className="text-[13px] font-medium text-primary capitalize">{service === 'smtp' ? 'SMTP' : service}</span>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleTestService(service)} disabled={testing}>Test</Button>
                        </div>
                        {testResults[service] && !testResults[service].success && <p className="mt-2 text-[13px] text-danger-text">{testResults[service].message}</p>}
                        {testResults[service]?.success && <p className="mt-2 text-[13px] text-success-text">Connected successfully{testResults[service].userCount !== undefined && ` (${testResults[service].userCount} users found)`}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button type="button" variant="ghost" onClick={handleBack}>Back</Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="ghost" onClick={handleTestAll} disabled={testing}>{testing ? <><Loader2 className="h-4 w-4 animate-spin mr-2 inline" />Testing...</> : 'Test All'}</Button>
                      <Button type="button" onClick={() => handleNext()}>Continue</Button>
                    </div>
                  </div>
                </div>
              )}

              {step.id === 'complete' && (
                <div className="text-center">
                  <div className="mb-6">
                    <div className="mx-auto w-16 h-16 bg-success-bg rounded-full flex items-center justify-center">
                      <CheckCircle className="w-8 h-8 text-success-text" />
                    </div>
                  </div>
                  <h2 className="text-[16px] font-medium text-primary mb-4">Setup Complete!</h2>
                  <p className="text-[13px] text-secondary mb-6">Your Ogun Bridge system is now configured and ready to use.</p>
                  <Button type="button" onClick={handleCompleteSetup} disabled={saving}>{saving ? 'Completing...' : 'Go to Login'}</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
