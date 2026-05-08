import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Network,
  FileText,
  Settings,
  Activity,
  ClipboardList,
  Shield,
  KeyRound,
  Mail,
  ArrowLeftRight,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAppStore } from '@/store/useAppStore'

const defaultNavigation = [
  {
    label: 'USER ADMINISTRATION',
    items: [
      { name: 'Users', href: '/users', icon: Users },
      { name: 'Services', href: '/services', icon: Network },
      { name: 'Passwords', href: '/password', icon: KeyRound },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Operations', href: '/operations', icon: Activity },
      { name: 'Changes', href: '/changes', icon: ClipboardList },
      { name: 'Audit', href: '/audit', icon: Shield },
      { name: 'Logs', href: '/logs', icon: FileText },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'Sync Manager', href: '/sync-manager', icon: ArrowLeftRight },
      { name: 'Mail Settings', href: '/mail', icon: Mail },
      { name: 'Schema Mapper', href: '/schema', icon: Settings },
      { name: 'Version History', href: '/versions', icon: History },
    ],
  },
]

function NavItem({ item, collapsed }) {
  const location = useLocation()
  const isActive = location.pathname === item.href
  const Icon = item.icon

  return (
    <Link
      to={item.href}
      title={collapsed ? item.name : undefined}
      className={cn(
        'flex items-center gap-2 px-[10px] py-[7px] rounded-sm text-[13px] cursor-pointer',
        'transition-[background,color] duration-150 ease',
        isActive
          ? 'bg-accent-tint text-accent font-medium'
          : 'text-secondary hover:bg-subtle hover:text-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className={cn('shrink-0', collapsed ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden="true" />
      {!collapsed && (
        <>
          <span>{item.name}</span>
          {item.badge && (
            <span className="ml-auto inline-flex items-center rounded-pill bg-accent-tint text-accent text-[11px] font-medium px-[7px] py-[1px]">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  )
}

function SidebarBody({ navigation = defaultNavigation, collapsed }) {
  return (
    <nav className="flex-1 flex flex-col gap-[2px] px-[10px] pt-4 pb-2 overflow-y-auto">
      {navigation.map((group) => (
        <div key={group.label} className="mb-1">
          {!collapsed && (
            <div className="px-[10px] pt-3 pb-1 text-[10px] font-medium tracking-[0.07em] uppercase text-tertiary">
              {group.label}
            </div>
          )}
          <div className="flex flex-col gap-[2px]">
            {group.items.map((item) => (
              <NavItem key={item.name} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarHeader({ collapsed }) {
  return (
    <div className={cn(
      'flex items-center h-12 px-[14px] shrink-0',
      collapsed && 'justify-center px-0',
    )}>
      <div className={cn(
        'flex items-center gap-3',
        collapsed && 'justify-center',
      )}>
        <div className="w-7 h-7 rounded-sm bg-accent flex items-center justify-center shrink-0">
          <Network className="w-4 h-4 text-white" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[14px] font-medium text-primary leading-tight">Ogun Bridge</span>
            <span className="text-[11px] text-tertiary leading-tight">Identity Manager</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function Sidebar({ sidebarOpen, toggleSidebar, navigation = defaultNavigation }) {
  const collapsed = !sidebarOpen

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col',
        'transition-[width,transform] duration-200 ease',
        collapsed ? 'w-[52px]' : 'w-[220px]',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0',
      )}
    >
      <SidebarHeader collapsed={collapsed} />
      <SidebarBody navigation={navigation} collapsed={collapsed} />
      <button
        onClick={toggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'hidden lg:flex items-center justify-center h-8 border-t border-border text-tertiary hover:text-primary hover:bg-subtle transition-[background,color] duration-150',
          collapsed ? 'w-full' : 'w-full',
        )}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  )
}
