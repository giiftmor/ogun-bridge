import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { UserBrowser } from './pages/UserBrowser'
import { GroupBrowser } from './pages/GroupBrowser'
import { LogViewer } from './pages/LogViewer'
import { SchemaMapper } from './pages/SchemaMapper'
import { ChangesBrowser } from './pages/ChangesBrowser'
import { AuditViewer } from './pages/AuditViewer'
import { PasswordManagement } from './pages/PasswordManagement'
import { SelfServicePasswordChange } from './pages/SelfServicePasswordChange'
import { UserDetail } from './pages/UserDetail'
import { MailSettings } from './pages/MailSettings'
import { MailAdmin } from './pages/MailAdmin'
import { ProfileManagement } from './pages/ProfileManagement'
import { apiClient } from './services/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
})

export function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

  // Fetch timezone from server
  useEffect(() => {
    const fetchTimezone = async () => {
      try {
        const health = await apiClient.getSystemHealth()
        if (health.timezone) {
          localStorage.setItem('timezone', health.timezone)
        }
      } catch (e) {
        console.warn('Could not fetch timezone:', e)
      }
    }
    fetchTimezone()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          {/* Self-service password change - standalone page */}
          <Route path="/self-service-password" element={<SelfServicePasswordChange />} />
          
          {/* Admin routes with layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UserBrowser />} />
            <Route path="users/:username" element={<UserDetail />} />
            <Route path="groups" element={<GroupBrowser />} />
            <Route path="logs" element={<LogViewer />} />
            <Route path="changes" element={<ChangesBrowser />} />
            <Route path="audit" element={<AuditViewer />} />
            <Route path="password" element={<PasswordManagement />} />
            <Route path="profile" element={<ProfileManagement />} />
            <Route path="mail" element={<MailSettings />} />
            <Route path="mail-admin" element={<MailAdmin />} />
            <Route path="schema" element={<SchemaMapper />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
