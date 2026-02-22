'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
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
  Mail,
  UserCheck,
  Handshake,
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
  /** If true, show triage badge count next to this item */
  showTriageBadge?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Participants', href: '/participants', icon: Users, permission: 'participants:read' },
      { title: 'Providers', href: '/providers', icon: Building2, permission: 'providers:read' },
      { title: 'Plans', href: '/plans', icon: FileText, permission: 'plans:read' },
      { title: 'Agreements', href: '/service-agreements', icon: Handshake, permission: 'service-agreements:read' },
      { title: 'Coordinators', href: '/coordinators', icon: UserCheck, permission: 'coordinator:read' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { title: 'Invoices', href: '/invoices', icon: Receipt, permission: 'invoices:read' },
      { title: 'Email Triage', href: '/invoices/review', icon: Mail, permission: 'invoices:read', showTriageBadge: true },
      { title: 'Claims', href: '/claims', icon: CreditCard, permission: 'claims:read' },
      { title: 'Banking', href: '/banking', icon: Landmark, permission: 'banking:read' },
      { title: 'Reports', href: '/reports', icon: BarChart3, permission: 'reports:read' },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Comms', href: '/comms', icon: MessageSquare, permission: 'comms:read' },
      { title: 'Automation', href: '/automation', icon: Zap, permission: 'automation:read' },
      { title: 'Documents', href: '/documents', icon: FolderOpen, permission: 'documents:read' },
      { title: 'Settings', href: '/settings', icon: Settings, permission: 'settings:read' },
    ],
  },
]

function LotusIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4C16 4 12 10 12 16C12 22 16 26 16 26C16 26 20 22 20 16C20 10 16 4 16 4Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M8 10C8 10 6 16 8 20C10 24 14 26 14 26C14 26 12 20 12 16C12 12 8 10 8 10Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M24 10C24 10 26 16 24 20C22 24 18 26 18 26C18 26 20 20 20 16C20 12 24 10 24 10Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M4 14C4 14 4 18 6 21C8 24 12 26 12 26C12 26 8 22 8 18C8 14 4 14 4 14Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M28 14C28 14 28 18 26 21C24 24 20 26 20 26C20 26 24 22 24 18C24 14 28 14 28 14Z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  )
}

interface SidebarProps {
  role: Role
}

export function Sidebar({ role }: SidebarProps): React.JSX.Element {
  const pathname = usePathname()
  const [triageCount, setTriageCount] = useState<number>(0)

  useEffect(() => {
    if (!hasPermission(role, 'invoices:read')) return
    void fetch('/api/invoices/triage-count')
      .then((r) => r.json())
      .then((j: { data?: { count: number } }) => {
        if (j.data?.count !== undefined) setTriageCount(j.data.count)
      })
      .catch(() => null)
  }, [role])

  function checkActive(item: NavItem): boolean {
    if (item.href === '/invoices') {
      return pathname === '/invoices' || (
        pathname.startsWith('/invoices/') && !pathname.startsWith('/invoices/review')
      )
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-sidebar">
      {/* Brand header */}
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-5">
        <LotusIcon className="h-7 w-7 text-emerald-300" />
        <Link href="/dashboard" className="flex items-center">
          <span className="text-lg font-bold tracking-tight text-white">
            Lotus PM
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-6 px-3">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.permission || hasPermission(role, item.permission)
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = checkActive(item)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'bg-white/15 text-white shadow-sm'
                            : 'text-sidebar-foreground/70 hover:bg-white/8 hover:text-white'
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 h-6 w-1 rounded-r-full bg-emerald-300" />
                        )}
                        <item.icon className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          active ? 'text-emerald-300' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'
                        )} />
                        <span className="flex-1">{item.title}</span>
                        {item.showTriageBadge && triageCount > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-amber-950"
                            aria-label={`${triageCount} pending email invoices`}
                          >
                            {triageCount > 99 ? '99+' : triageCount}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Sidebar footer */}
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-[11px] text-[var(--sidebar-muted)]">Lotus Assist Pty Ltd</p>
      </div>
    </aside>
  )
}
