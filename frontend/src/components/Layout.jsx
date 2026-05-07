import { Link, Outlet } from 'react-router-dom'
import { Menu, Sun, Moon, User, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/utils/cn'
import { Sidebar } from './Sidebar'

export function Layout() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore()

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar sidebarOpen={sidebarOpen} toggleSidebar={toggleSidebar} />

      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Main Content */}
      <div
        className={cn(
          'transition-all duration-200 ease-in-out',
          sidebarOpen ? 'lg:pl-64' : 'pl-0'
        )}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center h-16 px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn(sidebarOpen && 'lg:hidden')}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex-1" />

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="mr-2"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {JSON.parse(localStorage.getItem('user') || '{}').username || 'User'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              asChild
            >
              <Link to="/my-profile">
                <User className="h-4 w-4 mr-2" />
                My Profile
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                localStorage.removeItem('auth_token')
                localStorage.removeItem('user')
                window.location.href = '/login'
              }}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
