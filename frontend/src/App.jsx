import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import { GroupManager } from './pages/GroupManager'
import { VersionHistory } from './pages/VersionHistory'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { CreatePassword } from './pages/CreatePassword'
import { OperationsCenter } from './pages/OperationsCenter'
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

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token')
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
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
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
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/create-password" element={<CreatePassword />} />
          <Route path="/create-password/:token" element={<CreatePassword />} />
          <Route path="/self-service-password" element={<SelfServicePasswordChange />} />

          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UserBrowser />} />
            <Route path="users/:username" element={<UserDetail />} />
            <Route path="groups" element={<GroupBrowser />} />
            <Route path="groups-manager" element={<GroupManager />} />
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
          </Route>

          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
