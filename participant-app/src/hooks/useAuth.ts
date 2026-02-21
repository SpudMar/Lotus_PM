import { useState, useEffect } from 'react'
import { getStoredToken, clearToken } from '@/api/client'
import type { AuthSession } from '@/types'

interface UseAuthReturn {
  session: AuthSession | null
  isLoading: boolean
  signOut: () => Promise<void>
  setSession: (s: AuthSession) => void
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void checkSession()
  }, [])

  async function checkSession(): Promise<void> {
    try {
      const token = await getStoredToken()
      if (!token) {
        setSession(null)
      }
      // Token present — session state managed by login screen setting via setSession
    } finally {
      setIsLoading(false)
    }
  }

  async function signOut(): Promise<void> {
    await clearToken()
    setSession(null)
  }

  return { session, isLoading, signOut, setSession }
}
