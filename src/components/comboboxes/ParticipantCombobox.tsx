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

interface Participant {
  id: string
  firstName: string
  lastName: string
  ndisNumber: string
}

interface ParticipantComboboxProps {
  value: string
  onValueChange: (id: string) => void
  disabled?: boolean
  className?: string
}

export function ParticipantCombobox({
  value,
  onValueChange,
  disabled = false,
  className,
}: ParticipantComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch the display label for the currently selected value
  useEffect(() => {
    if (!value) {
      setSelectedLabel('')
      return
    }

    const fetchLabel = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/crm/participants/search?q=&limit=1`)
        // If the value is already set, try to fetch the specific participant
        const detailRes = await fetch(`/api/crm/participants/${value}`)
        if (detailRes.ok) {
          const json = (await detailRes.json()) as {
            data: { firstName: string; lastName: string; ndisNumber: string }
          }
          if (json.data) {
            setSelectedLabel(
              `${json.data.firstName} ${json.data.lastName} — ${json.data.ndisNumber}`
            )
          }
        } else if (res.ok) {
          // fallback: search might find it
          setSelectedLabel('')
        }
      } catch {
        // Silent fail
      }
    }

    void fetchLabel()
  }, [value])

  const search = useCallback(async (searchQuery: string): Promise<void> => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/crm/participants/search?q=${encodeURIComponent(searchQuery)}&limit=10`
      )
      if (res.ok) {
        const json = (await res.json()) as { data: Participant[] }
        setResults(json.data)
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length > 0) {
      debounceRef.current = setTimeout(() => {
        void search(query)
      }, 300)
    } else {
      setResults([])
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

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
          {value ? selectedLabel || 'Loading...' : 'Select participant...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or NDIS number..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && query.length === 0 && (
              <CommandEmpty>Type to search participants...</CommandEmpty>
            )}
            {!loading && query.length > 0 && results.length === 0 && (
              <CommandEmpty>No participants found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onValueChange(p.id)
                      setSelectedLabel(
                        `${p.firstName} ${p.lastName} — ${p.ndisNumber}`
                      )
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === p.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span>
                      {p.firstName} {p.lastName}{' '}
                      <span className="text-muted-foreground">— {p.ndisNumber}</span>
                    </span>
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
