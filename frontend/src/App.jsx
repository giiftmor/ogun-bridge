import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { Layout } from './components/Layout'
import { apiClient } from './services/api'
import { useAppStore } from './store/useAppStore'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const UserBrowser = lazy(() => import('./pages/UserBrowser').then(m => ({ default: m.UserBrowser })))
const GroupBrowser = lazy(() => import('./pages/GroupBrowser').then(m => ({ default: m.GroupBrowser })))
const LogViewer = lazy(() => import('./pages/LogViewer').then(m => ({ default: m.LogViewer })))
const SchemaMapper = lazy(() => import('./pages/SchemaMapper').then(m => ({ default: m.SchemaMapper })))
const ChangesBrowser = lazy(() => import('./pages/ChangesBrowser').then(m => ({ default: m.ChangesBrowser })))
const AuditViewer = lazy(() => import('./pages/AuditViewer').then(m => ({ default: m.AuditViewer })))
const PasswordManagement = lazy(() => import('./pages/PasswordManagement').then(m => ({ default: m.PasswordManagement })))
const SelfServicePasswordChange = lazy(() => import('./pages/SelfServicePasswordChange').then(m => ({ default: m.SelfServicePasswordChange })))
const UserDetail = lazy(() => import('./pages/UserDetail').then(m => ({ default: m.UserDetail })))
const MailSettings = lazy(() => import('./pages/MailSettings').then(m => ({ default: m.MailSettings })))
const MailAdmin = lazy(() => import('./pages/MailAdmin').then(m => ({ default: m.MailAdmin })))
const ProfileManagement = lazy(() => import('./pages/ProfileManagement').then(m => ({ default: m.ProfileManagement })))
const ServiceManager = lazy(() => import('./pages/ServiceManager').then(m => ({ default: m.ServiceManager })))
const VersionHistory = lazy(() => import('./pages/VersionHistory').then(m => ({ default: m.VersionHistory })))
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })))
const AdminLogin = lazy(() => import('./pages/AdminLogin').then(m => ({ default: m.AdminLogin })))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then(m => ({ default: m.ResetPassword })))
const CreatePassword = lazy(() => import('./pages/CreatePassword').then(m => ({ default: m.CreatePassword })))
const OperationsCenter = lazy(() => import('./pages/OperationsCenter').then(m => ({ default: m.OperationsCenter })))
const SyncManager = lazy(() => import('./pages/SyncManager').then(m => ({ default: m.SyncManager })))
const Setup = lazy(() => import('./pages/Setup').then(m => ({ default: m.Setup })))
const RoleManagement = lazy(() => import('./pages/RoleManagement').then(m => ({ default: m.RoleManagement })))

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
      if (location.pathname === '/login' || location.pathname === '/login/admin') {
        setAuthenticated(false)
        setLoading(false)
        return
      }

      try {
        const user = await apiClient.getCurrentUser()
        setAuthenticated(true)
      } catch (e) {
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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-page"><div className="text-tertiary text-[13px]">Loading...</div></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/login/admin" element={<AdminLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/create-password" element={<CreatePassword />} />
            <Route path="/create-password/:token" element={<CreatePassword />} />
            <Route path="/self-service-password" element={<SelfServicePasswordChange />} />
            <Route path="/god-mode" element={<Setup />} />

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
              <Route path="versions" element={<VersionHistory />} />
              <Route path="roles" element={<RoleManagement />} />
              <Route path="groups-manager" element={<Navigate to="/services" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
