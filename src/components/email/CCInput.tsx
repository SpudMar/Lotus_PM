'use client'

/**
 * CCInput — tag-style CC email input.
 * User types an email address and presses Enter or comma to add it as a chip.
 * Each chip shows "email@x.com ×" with a remove button.
 */

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface CCInputProps {
  value: string[]
  onChange: (emails: string[]) => void
  disabled?: boolean
}

export function CCInput({ value, onChange, disabled = false }: CCInputProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState(false)

  function addEmail(raw: string): void {
    const email = raw.trim().toLowerCase()
    if (!email) return
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(true)
      return
    }
    if (value.includes(email)) {
      setInputValue('')
      return
    }
    onChange([...value, email])
    setInputValue('')
    setError(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmail(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    } else {
      setError(false)
    }
  }

  function handleRemove(email: string): void {
    onChange(value.filter((e) => e !== email))
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring min-h-[36px]">
      {value.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {email}
          <button
            type="button"
            aria-label={`Remove ${email}`}
            onClick={() => handleRemove(email)}
            disabled={disabled}
            className="ml-0.5 opacity-60 hover:opacity-100 disabled:pointer-events-none"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        type="email"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          setError(false)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue) addEmail(inputValue)
        }}
        disabled={disabled}
        placeholder={value.length === 0 ? 'Type email + Enter to add…' : ''}
        className={[
          'flex-1 min-w-[140px] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
          error ? 'text-destructive' : '',
        ].join(' ')}
        aria-label="CC email address"
        aria-describedby={error ? 'cc-error' : undefined}
      />
      {error && (
        <span id="cc-error" className="sr-only">
          Invalid email address
        </span>
      )}
    </div>
  )
}
