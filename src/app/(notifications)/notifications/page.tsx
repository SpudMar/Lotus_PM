'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react'
import { formatDateTimeAU } from '@/lib/shared/dates'

interface Notification {
  id: string
  type: 'INFO' | 'WARNING' | 'ACTION_REQUIRED' | 'SUCCESS'
  title: string
  body: string
  link: string | null
  category: string
  priority: string
  readAt: string | null
  dismissedAt: string | null
  createdAt: string
}

function typeIcon(type: string) {
  switch (type) {
    case 'WARNING': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case 'ACTION_REQUIRED': return <AlertCircle className="h-4 w-4 text-destructive" />
    case 'SUCCESS': return <CheckCircle className="h-4 w-4 text-green-500" />
    default: return <Info className="h-4 w-4 text-blue-500" />
  }
}

function priorityVariant(priority: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (priority) {
    case 'URGENT': return 'destructive'
    case 'HIGH': return 'default'
    default: return 'outline'
  }
}

export default function NotificationsPage(): React.JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<string>('all')

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (filter === 'unread') params.set('unreadOnly', 'true')
      const res = await fetch(`/api/notifications?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setNotifications(json.data)
        setUnreadCount(json.unreadCount)
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  /** Notify the header bell badge to re-fetch its unread count immediately. */
  function notifyBadgeRefresh() {
    window.dispatchEvent(new CustomEvent('lotus:notifications:changed'))
  }

  const handleMarkRead = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    })
    if (res.ok) {
      void loadNotifications()
      notifyBadgeRefresh()
    }
  }

  const handleDismiss = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss' }),
    })
    if (res.ok) {
      void loadNotifications()
      notifyBadgeRefresh()
    }
  }

  const handleMarkAllRead = async () => {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read-all' }),
    })
    if (res.ok) {
      void loadNotifications()
      notifyBadgeRefresh()
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Notifications"
          description={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          actions={
            unreadCount > 0 ? (
              <Button variant="outline" onClick={handleMarkAllRead}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark all read
              </Button>
            ) : undefined
          }
        />

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && (
          <div className="py-12 text-center text-muted-foreground">Loading notifications...</div>
        )}

        {!loading && notifications.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8" />
              <p>{filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</p>
            </CardContent>
          </Card>
        )}

        {!loading && notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={n.readAt ? 'opacity-70' : 'border-l-4 border-l-primary'}
              >
                <CardContent className="flex items-start gap-3 py-3">
                  <div className="mt-0.5">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{n.title}</span>
                      {n.priority !== 'NORMAL' && n.priority !== 'LOW' && (
                        <Badge variant={priorityVariant(n.priority)} className="text-xs">
                          {n.priority}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {n.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTimeAU(new Date(n.createdAt))}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!n.readAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleMarkRead(n.id)}
                        title="Mark as read"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDismiss(n.id)}
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
