'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'

interface SearchResult {
  id: string
  label: string
  href: string
}

interface SearchResponse {
  participants: SearchResult[]
  providers: SearchResult[]
  invoices: SearchResult[]
}

/**
 * Global search bar for sidebar navigation.
 * Searches across participants, providers, and invoices with debounced input.
 */
export function SearchBar(): React.JSX.Element {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchResults = useCallback(async (q: string) => {
    if (q.trim().length === 0) {
      setResults(null)
      setIsOpen(false)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) {
        const data = (await res.json()) as SearchResponse
        setResults(data)
        const hasResults =
          data.participants.length > 0 ||
          data.providers.length > 0 ||
          data.invoices.length > 0
        setIsOpen(hasResults || q.trim().length > 0)
      }
    } catch {
      // Silently fail -- search is not critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      void fetchResults(query)
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, fetchResults])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(href: string): void {
    setIsOpen(false)
    setQuery('')
    setResults(null)
    router.push(href)
  }

  const hasResults =
    results !== null &&
    (results.participants.length > 0 ||
      results.providers.length > 0 ||
      results.invoices.length > 0)

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results !== null && query.trim().length > 0) setIsOpen(true)
          }}
          placeholder="Search..."
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Global search"
        />
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-10 z-50 rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Searching...
            </div>
          )}

          {!loading && !hasResults && query.trim().length > 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No results found
            </div>
          )}

          {!loading && hasResults && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.participants.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Participants
                  </div>
                  {results.participants.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                      onClick={() => handleSelect(item.href)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {results.providers.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Providers
                  </div>
                  {results.providers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                      onClick={() => handleSelect(item.href)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {results.invoices.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Invoices
                  </div>
                  {results.invoices.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
                      onClick={() => handleSelect(item.href)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
