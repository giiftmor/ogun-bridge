import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
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
  Server,
  LogOut,
  History,
  Network,
  ArrowLeftRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

const defaultNavigation = [
  {
    category: 'User Administration',
    items: [
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Group Services', href: '/groups-manager', icon: Network },
      { name: 'Passwords', href: '/password', icon: KeyRound },
    ]
  },
  {
    category: 'Monitoring',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Monitoring', href: '/operations', icon: Activity },
      { name: 'Changes', href: '/changes', icon: ClipboardList },
      { name: 'Audit', href: '/audit', icon: Shield },
      { name: 'Logs', href: '/logs', icon: FileText },
    ]
  },
  {
    category: 'System',
    items: [
      { name: 'Sync Manager', href: '/sync-manager', icon: ArrowLeftRight },
      { name: 'Mail Settings', href: '/mail', icon: Mail },
      { name: 'Schema Mapper', href: '/schema', icon: Settings },
      { name: 'Version History', href: '/versions', icon: History },
    ]
  },
]

function SidebarHeader({ toggleSidebar }) {
  return (
    <div className="flex items-center justify-between h-16 px-6 border-b">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
          <Network className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Ogun Bridge</h1>
          <p className="text-xs text-muted-foreground">Identity Manager</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="lg:hidden"
      >
      </Button>
    </div>
  )
}

function SidebarBody({ navigation = defaultNavigation }) {
  const location = useLocation()

  return (
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
  )
}

function SidebarFooter() {
  return (
    <div className="p-4 border-t">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-4 w-4" />
        <span>v1.0.0</span>
      </div>
    </div>
  )
}

export function Sidebar({ sidebarOpen, toggleSidebar, navigation = defaultNavigation }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      <div className="flex flex-col h-full">
        <SidebarHeader toggleSidebar={toggleSidebar} />
        <SidebarBody navigation={navigation} />
        <SidebarFooter />
      </div>
    </aside>
  )
}
