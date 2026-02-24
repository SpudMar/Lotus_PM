'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function ProviderAuthVerifyPage(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('Invalid login link — token is missing.')
      return
    }

    void (async () => {
      try {
        const result = await signIn('provider-magic-link', {
          token,
          redirect: false,
          callbackUrl: '/provider-portal/dashboard',
        })

        if (result?.error) {
          setError('This login link is invalid or has expired. Please request a new one.')
        } else if (result?.url) {
          router.push(result.url)
        } else {
          router.push('/provider-portal/dashboard')
        }
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-red-500" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Login link expired</h2>
                <p className="mt-2 text-gray-600">{error}</p>
                <a
                  href="/provider-portal/login"
                  className="mt-4 inline-block text-emerald-600 hover:underline font-medium"
                >
                  Request a new login link
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Signing you in...</h2>
              <p className="mt-2 text-gray-500">Please wait while we verify your login link.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
