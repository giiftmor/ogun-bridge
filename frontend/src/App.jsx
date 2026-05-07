import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
import { ServiceManager } from './pages/ServiceManager'
import { VersionHistory } from './pages/VersionHistory'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { CreatePassword } from './pages/CreatePassword'
import { OperationsCenter } from './pages/OperationsCenter'
import { SyncManager } from './pages/SyncManager'
import { apiClient } from './services/api'
import { useAppStore } from './store/useAppStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
})

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token')

      if (location.pathname === '/login') {
        setAuthenticated(false)
        setLoading(false)
        return
      }

      if (!token) {
        setAuthenticated(false)
        setLoading(false)
        return
      }

      try {
        const user = await apiClient.getCurrentUser()
        localStorage.setItem('user', JSON.stringify(user))
        setAuthenticated(true)
      } catch (e) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user')
        setAuthenticated(false)
      }
      setLoading(false)
    }

    checkAuth()
  }, [location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-tertiary text-[13px]">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

export function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

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
      <Toaster position="top-right" toastOptions={{
        style: {
          background: 'hsl(var(--bg-surface))',
          color: 'hsl(var(--text-primary))',
          border: '0.5px solid hsl(var(--border))',
          borderRadius: '12px',
          fontSize: '13px',
        },
      }} />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/create-password" element={<CreatePassword />} />
          <Route path="/create-password/:token" element={<CreatePassword />} />
          <Route path="/self-service-password" element={<SelfServicePasswordChange />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UserBrowser />} />
            <Route path="users/:username" element={<UserDetail />} />
            <Route path="groups" element={<GroupBrowser />} />
            <Route path="services" element={<ServiceManager />} />
            <Route path="logs" element={<LogViewer />} />
            <Route path="changes" element={<ChangesBrowser />} />
            <Route path="audit" element={<AuditViewer />} />
            <Route path="password" element={<PasswordManagement />} />
            <Route path="profile" element={<UserDetail />} />
            <Route path="my-profile" element={<UserDetail isOwnProfile={true} />} />
            <Route path="mail" element={<MailSettings />} />
            <Route path="mail-admin" element={<MailAdmin />} />
            <Route path="operations" element={<OperationsCenter />} />
            <Route path="schema" element={<SchemaMapper />} />
            <Route path="sync-manager" element={<SyncManager />} />
            <Route path="groups-manager" element={<Navigate to="/services" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
