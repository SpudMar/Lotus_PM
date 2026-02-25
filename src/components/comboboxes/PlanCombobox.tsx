'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlanResult {
  id: string
  startDate: string
  endDate: string
  status: string
  participant: {
    firstName: string
    lastName: string
    ndisNumber: string
  }
}

interface PlanComboboxProps {
  value: string
  onValueChange: (id: string) => void
  participantId?: string
  disabled?: boolean
  className?: string
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PlanCombobox({
  value,
  onValueChange,
  participantId,
  disabled = false,
  className,
}: PlanComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlanResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load plans when popover opens (especially useful when participantId is set)
  const search = useCallback(
    async (searchQuery: string): Promise<void> => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery) params.set('q', searchQuery)
        if (participantId) params.set('participantId', participantId)
        params.set('limit', '10')

        const res = await fetch(`/api/plans/search?${params.toString()}`)
        if (res.ok) {
          const json = (await res.json()) as { data: PlanResult[] }
          setResults(json.data)
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    },
    [participantId]
  )

  // Auto-load results when popover opens (to show available plans)
  useEffect(() => {
    if (open) {
      void search(query)
    }
  }, [open, search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search on query change
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void search(query)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search, open])

  // Update selected label when value or results change
  useEffect(() => {
    if (!value) {
      setSelectedLabel('')
      return
    }
    const found = results.find((p) => p.id === value)
    if (found) {
      setSelectedLabel(
        `${formatDateShort(found.startDate)} – ${formatDateShort(found.endDate)} (${found.status})`
      )
    }
  }, [value, results])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          {value ? selectedLabel || 'Loading...' : 'Select plan (optional)...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search plans..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && results.length === 0 && (
              <CommandEmpty>No plans found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((plan) => (
                  <CommandItem
                    key={plan.id}
                    value={plan.id}
                    onSelect={() => {
                      onValueChange(plan.id)
                      setSelectedLabel(
                        `${formatDateShort(plan.startDate)} – ${formatDateShort(plan.endDate)} (${plan.status})`
                      )
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === plan.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">
                        {formatDateShort(plan.startDate)} – {formatDateShort(plan.endDate)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {plan.status} &middot; {plan.participant.firstName}{' '}
                        {plan.participant.lastName}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
