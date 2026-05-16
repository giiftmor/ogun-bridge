import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, User, Users, Mail, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import toast from 'react-hot-toast'
import { apiClient } from '@/services/api'

export function OnboardingWizard({ open, onClose }) {
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [selectedGroups, setSelectedGroups] = useState([])
  const [sendInvite, setSendInvite] = useState(true)

  const queryClient = useQueryClient()

  const { data: groups = [] } = useQuery({
    queryKey: ['groups-list'],
    queryFn: () => apiClient.getGroups(),
  })

  const onboardMutation = useMutation({
    mutationFn: (data) => apiClient.onboardUser(data),
    onSuccess: (data) => {
      toast.success(`User '${data.user?.username || username}' onboarded successfully`)
      queryClient.invalidateQueries(['users'])
      resetForm()
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  const resetForm = () => {
    setStep(0)
    setUsername('')
    setName('')
    setEmail('')
    setSelectedGroups([])
    setSendInvite(true)
  }

  const toggleGroup = (pk) => {
    setSelectedGroups(prev =>
      prev.includes(pk) ? prev.filter(g => g !== pk) : [...prev, pk]
    )
  }

  const canProceed = () => {
    switch (step) {
      case 0: return username.trim().length > 0
      case 1: return true
      case 2: return true
      default: return true
    }
  }

  const handleSubmit = () => {
    onboardMutation.mutate({
      username: username.trim(),
      name: name.trim() || username.trim(),
      email: email.trim() || `${username.trim()}@spectres.co.za`,
      groupPks: selectedGroups,
      sendInvite,
    })
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Onboard New User</DialogTitle>
          <CardDescription>
            Step {step + 1} of 3
          </CardDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i <= step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-5 w-5 text-accent" />
              <span className="font-medium">User Details</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizUsername">Username *</Label>
              <Input id="wizUsername" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g., jdoe" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizName">Display Name</Label>
              <Input id="wizName" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizEmail">Email</Label>
              <Input id="wizEmail" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-accent" />
              <span className="font-medium">Group Selection</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Select groups to add the user to:
            </p>
            <div className="max-h-[240px] overflow-y-auto border rounded p-2 space-y-1">
              {groups.map(g => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-subtle cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedGroups.includes(g.id)}
                    onCheckedChange={() => toggleGroup(g.id)}
                  />
                  <div>
                    <span className="font-medium">{g.name}</span>
                    {g.description && (
                      <span className="text-tertiary ml-2 text-xs">{g.description}</span>
                    )}
                  </div>
                </label>
              ))}
              {groups.length === 0 && (
                <p className="text-sm text-tertiary text-center py-4">No groups available</p>
              )}
            </div>
            {selectedGroups.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedGroups.map(pk => {
                  const g = groups.find(gr => gr.id === pk)
                  return g ? <Badge key={pk} variant="secondary">{g.name}</Badge> : null
                })}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="h-5 w-5 text-accent" />
              <span className="font-medium">Invite Options</span>
            </div>
            <label className="flex items-center gap-3 p-3 border rounded cursor-pointer">
              <Checkbox checked={sendInvite} onCheckedChange={(c) => setSendInvite(c === true)} />
              <div>
                <p className="font-medium text-sm">Send password invite email</p>
                <p className="text-xs text-tertiary">
                  User will receive an email to set their password
                </p>
              </div>
            </label>
            <div className="bg-subtle rounded p-4 space-y-2 text-sm">
              <p className="font-medium">Summary</p>
              <DetailSummary label="Username" value={username} />
              <DetailSummary label="Name" value={name || username} />
              <DetailSummary label="Email" value={email || `${username}@spectres.co.za`} />
              <DetailSummary label="Groups" value={`${selectedGroups.length} selected`} />
              <DetailSummary label="Send invite" value={sendInvite ? 'Yes' : 'No'} />
            </div>
          </div>
        )}

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div>
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(s => s - 1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              {step < 2 ? (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={onboardMutation.isPending}>
                  {onboardMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Create & Invite
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailSummary({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-tertiary">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
