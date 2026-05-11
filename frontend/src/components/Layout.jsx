import { useState, useRef, useEffect } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Search, Bell, Sun, Moon, User, LogOut, Settings, Menu, MoreVertical } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/store/useAppStore'
import { Sidebar } from './Sidebar'
import { apiClient } from '@/services/api'

export function Layout() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore()
  const [searchFocused, setSearchFocused] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const searchRef = useRef(null)
  const moreRef = useRef(null)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      <Sidebar sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} />

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

        <div className="relative max-w-[240px] w-full sm:w-auto">
          <Search className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150',
            searchFocused ? 'text-accent' : 'text-tertiary',
          )} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={cn(
              'h-8 w-full sm:w-[200px] rounded-pill bg-subtle border border-border pl-9 pr-3',
              'text-[13px] text-primary placeholder:text-tertiary',
              'transition-[border-color] duration-150 ease',
              'hover:border-border-strong',
              'focus-visible:outline-none focus-visible:border-border-strong focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]',
            )}
          />
        </div>

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
                await apiClient.logout()
                window.location.href = '/login'
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
