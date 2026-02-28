'use client'

import { type ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Mail, ExternalLink, Plus, Flag } from 'lucide-react'

export interface ActionItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
}

export interface ActionGroup {
  label: string
  items: ActionItem[]
}

interface ContextActionMenuProps {
  groups: ActionGroup[]
}

export function ContextActionMenu({ groups }: ContextActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
            {group.items.map((item, ii) => (
              <DropdownMenuItem
                key={ii}
                onClick={item.onClick}
                className={item.variant === 'destructive' ? 'text-destructive' : ''}
              >
                {item.icon && <span className="mr-2">{item.icon}</span>}
                {item.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Convenience builders ────────────────────────────────────────────────────

export function emailAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Mail className="h-4 w-4" />, onClick }
}

export function navigateAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <ExternalLink className="h-4 w-4" />, onClick }
}

export function createAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Plus className="h-4 w-4" />, onClick }
}

export function flagAction(label: string, onClick: () => void): ActionItem {
  return { label, icon: <Flag className="h-4 w-4" />, onClick }
}
