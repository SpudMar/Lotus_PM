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

interface Provider {
  id: string
  name: string
  abn: string
}

interface ProviderComboboxProps {
  value: string
  onValueChange: (id: string) => void
  disabled?: boolean
  className?: string
}

export function ProviderCombobox({
  value,
  onValueChange,
  disabled = false,
  className,
}: ProviderComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Provider[]>([])
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
        const res = await fetch(`/api/crm/providers/${value}`)
        if (res.ok) {
          const json = (await res.json()) as {
            data: { name: string; abn: string }
          }
          if (json.data) {
            setSelectedLabel(`${json.data.name} (ABN ${json.data.abn})`)
          }
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
        `/api/crm/providers/search?q=${encodeURIComponent(searchQuery)}&limit=10`
      )
      if (res.ok) {
        const json = (await res.json()) as { data: Provider[] }
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
          {value ? selectedLabel || 'Loading...' : 'Select provider...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or ABN..."
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
              <CommandEmpty>Type to search providers...</CommandEmpty>
            )}
            {!loading && query.length > 0 && results.length === 0 && (
              <CommandEmpty>No providers found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onValueChange(p.id)
                      setSelectedLabel(`${p.name} (ABN ${p.abn})`)
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
                      {p.name}{' '}
                      <span className="text-muted-foreground">(ABN {p.abn})</span>
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
