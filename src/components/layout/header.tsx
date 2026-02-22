'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Bell, ChevronRight, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/** Map pathname segments to readable labels */
const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  participants: 'Participants',
  providers: 'Providers',
  plans: 'Plans',
  invoices: 'Invoices',
  review: 'Email Triage',
  claims: 'Claims',
  batches: 'Batches',
  banking: 'Banking',
  reports: 'Reports',
  comms: 'Communications',
  automation: 'Automation',
  documents: 'Documents',
  coordinators: 'Coordinators',
  'service-agreements': 'Agreements',
  settings: 'Settings',
  'email-templates': 'Email Templates',
  notifications: 'Notifications',
}

function Breadcrumbs(): React.JSX.Element {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return <div />

  const crumbs = segments.map((seg, i) => {
    const href = '/' + segments.slice(0, i + 1).join('/')
    const label = segmentLabels[seg] ?? seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const isLast = i === segments.length - 1
    // Skip UUID-like segments (detail pages) — show as "Details"
    const isId = /^[0-9a-f-]{20,}$/i.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg)
    const displayLabel = isId ? 'Details' : label

    return { href, label: displayLabel, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}

export function Header(): React.JSX.Element {
  const { data: session } = useSession()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!session?.user) return

    let cancelled = false

    async function fetchCount() {
      try {
        const res = await fetch('/api/notifications/count')
        if (res.ok && !cancelled) {
          const json = await res.json()
          setUnreadCount(json.data.unreadCount)
        }
      } catch {
        // Silently ignore — notifications are non-critical
      }
    }

    void fetchCount()
    const interval = setInterval(() => void fetchCount(), 60_000)

    const handleChange = () => void fetchCount()
    window.addEventListener('lotus:notifications:changed', handleChange)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('lotus:notifications:changed', handleChange)
    }
  }, [session])

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/80 px-6 backdrop-blur-sm">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        {session?.user && (
          <>
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link href="/notifications">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications ({unreadCount} unread)</span>
              </Link>
            </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    {getInitials(session.user.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                  <Badge variant="secondary" className="mt-1 w-fit text-xs">
                    {formatRole(session.user.role)}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
        )}
      </div>
    </header>
  )
}
