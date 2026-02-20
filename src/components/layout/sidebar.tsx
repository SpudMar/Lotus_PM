'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Receipt,
  CreditCard,
  Landmark,
  BarChart3,
  Settings,
  MessageSquare,
  Zap,
  FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Role } from '@/lib/auth/rbac'
import { hasPermission, type Permission } from '@/lib/auth/rbac'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  permission?: Permission
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Participants', href: '/participants', icon: Users, permission: 'participants:read' },
  { title: 'Providers', href: '/providers', icon: Building2, permission: 'providers:read' },
  { title: 'Plans', href: '/plans', icon: FileText, permission: 'plans:read' },
  { title: 'Invoices', href: '/invoices', icon: Receipt, permission: 'invoices:read' },
  { title: 'Claims', href: '/claims', icon: CreditCard, permission: 'claims:read' },
  { title: 'Banking', href: '/banking', icon: Landmark, permission: 'banking:read' },
  { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports:read' },
  { title: 'Comms', href: '/comms', icon: MessageSquare, permission: 'comms:read' },
  { title: 'Automation', href: '/automation', icon: Zap, permission: 'automation:read' },
  { title: 'Documents', href: '/documents', icon: FolderOpen, permission: 'documents:read' },
  { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings:read' },
]

interface SidebarProps {
  role: Role
}

export function Sidebar({ role }: SidebarProps): React.JSX.Element {
  const pathname = usePathname()

  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(role, item.permission)
  )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="text-lg">Lotus PM</span>
        </Link>
      </div>
      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
    </aside>
  )
}
