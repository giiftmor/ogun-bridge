import { Link, Outlet, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users,
  UserCog,
  User,
  FileText, 
  Settings, 
  Menu,
  Activity,
  Sun,
  Moon,
  ClipboardList,
  Shield,
  KeyRound,
  Mail,
  Server
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/utils/cn'

const navigation = [
  {
    category: 'Sync',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Groups', href: '/groups', icon: UserCog },
      { name: 'Changes', href: '/changes', icon: ClipboardList },
    ]
  },
  {
    category: 'Passwords',
    items: [
      { name: 'Passwords', href: '/password', icon: KeyRound },
      { name: 'Profile', href: '/profile', icon: User },
    ]
  },
  {
    category: 'Mailing',
    items: [
      { name: 'Mail Settings', href: '/mail', icon: Mail },
      { name: 'Mailboxes', href: '/mail-admin', icon: Server },
    ]
  },
  {
    category: 'Logs',
    items: [
      { name: 'Audit', href: '/audit', icon: Shield },
      { name: 'Logs', href: '/logs', icon: FileText },
    ]
  },
  {
    category: 'System',
    items: [
      { name: 'Schema Mapper', href: '/schema', icon: Settings },
    ]
  },
]

export function Layout() {
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useAppStore()
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Title */}
          <div className="flex items-center justify-between h-16 px-6 border-b">
            <div>
              <h1 className="text-xl font-bold">ALSM UI</h1>
              <p className="text-xs text-muted-foreground">Sync Manager</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="lg:hidden"
            >
              {/* <X className="h-5 w-5" /> */}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
            {navigation.map((group) => (
              <div key={group.category}>
                <h3 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {group.category}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href
                    const Icon = item.icon
                    
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        {item.name}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>v1.0.0</span>
            </div>
          </div>
        </div>
      </aside>

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
        </header>

        {/* Page Content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
