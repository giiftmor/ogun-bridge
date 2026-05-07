import { useState, useRef, useEffect } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Menu, Search, Bell, Sun, Moon, User, LogOut, Settings } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/store/useAppStore'
import { Sidebar } from './Sidebar'

export function Layout() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore()
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)

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

  return (
    <div className="min-h-screen bg-page flex">
      <Sidebar sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div
        className={cn(
          'flex flex-col flex-1 min-w-0',
          'transition-[padding] duration-200 ease',
          sidebarOpen ? 'lg:pl-[220px]' : 'lg:pl-0',
        )}
      >
        <header className="sticky top-0 z-30 flex items-center h-12 px-5 border-b border-border bg-surface">
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150',
              sidebarOpen && 'lg:hidden',
            )}
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="relative ml-3">
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
                'h-8 w-[200px] max-w-[240px] rounded-pill bg-subtle border border-border pl-9 pr-3',
                'text-[13px] text-primary placeholder:text-tertiary',
                'transition-[border-color] duration-150 ease',
                'hover:border-border-strong',
                'focus-visible:outline-none focus-visible:border-border-strong focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-tint)),0_0_0_1px_hsl(var(--accent))]',
              )}
            />
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button className="relative flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150">
              <Bell className="h-4 w-4" />
              <span className="absolute -top-[2px] -right-[2px] w-[7px] h-[7px] rounded-full bg-accent border-2 border-surface" />
            </button>

            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border">
              <Link
                to="/my-profile"
                className="flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
              >
                <User className="h-4 w-4" />
              </Link>
              <Link
                to="/settings"
                className="flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
              >
                <Settings className="h-4 w-4" />
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem('auth_token')
                  localStorage.removeItem('user')
                  window.location.href = '/login'
                }}
                className="flex items-center justify-center w-8 h-8 rounded-sm bg-transparent border border-border text-secondary hover:bg-subtle hover:text-primary transition-[background,color] duration-150"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
