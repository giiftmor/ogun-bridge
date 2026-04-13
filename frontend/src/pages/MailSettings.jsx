import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Mail, Send, Save, TestTube, Loader2, CheckCircle, XCircle, Server } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SkeletonCard } from '@/components/ui/skeleton'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function MailSettings() {
  const [settings, setSettings] = useState({
    host: '',
    port: '',
    secure: false,
    user: '',
    password: '',
    fromName: '',
    fromAddress: '',
  })

  const { data: mailConfig, isLoading } = useQuery({
    queryKey: ['mail-config'],
    queryFn: () => apiClient.getMailConfig(),
  })

  useEffect(() => {
    if (mailConfig) {
      setSettings({
        host: mailConfig.host || '',
        port: mailConfig.port?.toString() || '',
        secure: mailConfig.secure || false,
        user: mailConfig.user || '',
        password: '',
        fromName: mailConfig.fromName || '',
        fromAddress: mailConfig.fromAddress || '',
      })
    }
  }, [mailConfig])

  const saveMutation = useMutation({
    mutationFn: (data) => apiClient.saveMailConfig(data),
    onSuccess: () => {
      toast.success('Mail settings saved successfully')
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  const testMutation = useMutation({
    mutationFn: () => apiClient.testMailConfig(),
    onSuccess: () => {
      toast.success('Test email sent successfully')
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`)
    },
  })

  const handleInputChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    saveMutation.mutate(settings)
  }

  const handleTest = () => {
    testMutation.mutate()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mail Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure SMTP settings for email notifications
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SMTP Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              SMTP Configuration
            </CardTitle>
            <CardDescription>
              Configure your SMTP server details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label htmlFor="host">SMTP Host</Label>
                <Input
                  id="host"
                  value={settings.host}
                  onChange={(e) => handleInputChange('host', e.target.value)}
                  placeholder="smtp.example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={settings.port}
                  onChange={(e) => handleInputChange('port', e.target.value)}
                  placeholder="587"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.secure}
                  onChange={(e) => handleInputChange('secure', e.target.checked)}
                  className="rounded border-input"
                />
                Use TLS/SSL (secure connection)
              </Label>
            </div>

            <div>
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                value={settings.user}
                onChange={(e) => handleInputChange('user', e.target.value)}
                placeholder="smtp_username"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={settings.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="••••••••"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* From Address */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Sender Information
            </CardTitle>
            <CardDescription>
              Configure the sender email address
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                value={settings.fromName}
                onChange={(e) => handleInputChange('fromName', e.target.value)}
                placeholder="ALSM System"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="fromAddress">From Address</Label>
              <Input
                id="fromAddress"
                type="email"
                value={settings.fromAddress}
                onChange={(e) => handleInputChange('fromAddress', e.target.value)}
                placeholder="alsm@example.com"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Button 
                onClick={handleSave} 
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>

              <Button 
                variant="outline"
                onClick={handleTest}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
