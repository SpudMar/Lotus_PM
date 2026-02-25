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

export interface SupportItemResult {
  id: string
  itemNumber: string
  name: string
  categoryCode: string
  categoryName: string
  unitPriceCents: number
  unit: string
}

interface SupportItemComboboxProps {
  value: string // itemNumber string for display
  onValueChange: (item: SupportItemResult) => void
  disabled?: boolean
  className?: string
}

export function SupportItemCombobox({
  value,
  onValueChange,
  disabled = false,
  className,
}: SupportItemComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupportItemResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (searchQuery: string): Promise<void> => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/ndis/support-items/search?q=${encodeURIComponent(searchQuery)}&limit=20`
      )
      if (res.ok) {
        const json = (await res.json()) as { data: SupportItemResult[] }
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
            'h-7 w-32 justify-between px-2 text-xs font-mono font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{value || '01_011_...'}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by code or name..."
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
              <CommandEmpty>Type to search support items...</CommandEmpty>
            )}
            {!loading && query.length > 0 && results.length === 0 && (
              <CommandEmpty>No support items found.</CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup>
                {results.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onValueChange(item)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        value === item.itemNumber ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs shrink-0">
                          {item.itemNumber}
                        </span>
                        <span className="text-xs truncate">{item.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {item.categoryName} &middot; ${(item.unitPriceCents / 100).toFixed(2)}/{item.unit}
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
