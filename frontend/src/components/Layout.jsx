import { useState, useRef, useEffect } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { Bell, Sun, Moon, User, LogOut, Settings, Menu, MoreVertical } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/store/useAppStore'
import { Sidebar } from './Sidebar'
import { CmdPalette } from './CmdPalette'
import { apiClient } from '@/services/api'

export function Layout() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme, logout: clearUserState, currentUser } = useAppStore()
  const [moreOpen, setMoreOpen] = useState(false)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const moreRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleCmdSelect = (item) => {
    if (item.type === 'user') {
      navigate(`/?q=${item.username}`)
    } else if (item.type === 'group') {
      navigate(`/?q=${item.name}`)
    } else if (item.type === 'service') {
      navigate(`/?q=${item.name}`)
    }
  }

  useEffect(() => {
    if (!moreOpen) return
    const handleClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [moreOpen])

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Sidebar sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} userRole={currentUser?.roleDefinition?.name} />

      <header
        className={cn(
          'sticky top-0 z-30 flex items-center h-12 px-5 bg-surface',
          'transition-[padding] duration-200 ease',
          sidebarOpen ? 'lg:pl-[220px]' : 'lg:pl-[52px]',
        )}
      >
        <button
          onClick={toggleSidebar}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150 mr-2"
          title="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>

        <button
          onClick={() => setCmdPaletteOpen(true)}
          className="flex items-center gap-2 h-8 px-3 rounded-pill bg-subtle border border-border text-tertiary hover:text-primary hover:border-border-strong transition-[border-color,color] duration-150 text-[13px] ml-2"
        >
          <span>Search...</span>
          <kbd className="px-1 py-0.5 rounded bg-page border border-border text-[10px] ml-4">⌘K</kbd>
        </button>

        <CmdPalette
          open={cmdPaletteOpen}
          onClose={() => setCmdPaletteOpen(false)}
          onSelect={handleCmdSelect}
        />

        <div className="flex-1 min-w-4" />

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <button
            onClick={toggleTheme}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          <button className="hidden lg:flex relative items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150">
            <Bell className="h-4 w-4" />
            <span className="absolute -top-[2px] -right-[2px] w-[7px] h-[7px] rounded-full bg-accent border-2 border-surface" />
          </button>

          <div className="flex items-center gap-1 ml-2 pl-2 lg:border-l border-border">
            <Link
              to="/my-profile"
              className="flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
            >
              <User className="h-4 w-4" />
            </Link>

            <div ref={moreRef} className="relative lg:hidden">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-sm bg-elevated border border-border shadow-lg py-1">
                  <button
                    onClick={() => { toggleTheme(); setMoreOpen(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    Toggle theme
                  </button>
                  <button
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
                  >
                    <Bell className="h-4 w-4" />
                    Notifications
                  </button>
                  <Link
                    to="/settings"
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="/settings"
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={async () => {
                clearUserState()
                try {
                  const res = await apiClient.logout()
                  const data = await res.json()
                  if (data.loginType === 'sso' && data.logoutUrl) {
                    window.location.href = data.logoutUrl
                  } else {
                    window.location.href = '/login?logged_out=true'
                  }
                } catch {
                  window.location.href = '/login?logged_out=true'
                }
              }}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-sm bg-page border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div
        className={cn(
          'flex-1 flex flex-col',
          'transition-[padding] duration-200 ease',
          sidebarOpen ? 'lg:pl-[220px]' : 'lg:pl-[52px]',
        )}
      >
        <div className="rounded-3xl sm:mr-6 sm:mb-8 flex-1 bg-page">
          <main className="p-8 max-w-7xl mx-auto w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
