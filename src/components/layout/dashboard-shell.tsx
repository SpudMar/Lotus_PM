'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import type { Role } from '@/lib/auth/rbac'
import type { ReactNode } from 'react'

function LoadingSpinner(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

export function DashboardShell({ children }: { children: ReactNode }): React.JSX.Element {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <LoadingSpinner />
  }

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={session.user.role as Role} />
      <div className="pl-64">
        <Header />
        <main className="animate-fade-in p-6">{children}</main>
      </div>
    </div>
  )
}
