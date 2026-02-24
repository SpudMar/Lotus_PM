'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Loader2 } from 'lucide-react'

export default function ProviderLoginPage(): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/provider-portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Something went wrong')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-600" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
                <p className="mt-2 text-gray-600">
                  We sent a secure login link to{' '}
                  <span className="font-medium text-gray-900">{email}</span>.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  The link expires in 15 minutes. Check your spam folder if you don&apos;t see it.
                </p>
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
        <CardHeader>
          <CardTitle>Provider Portal Login</CardTitle>
          <CardDescription>
            We&apos;ll send you a secure login link — no password needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="billing@yourpractice.com.au"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={submitting || !email}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending link...
                </>
              ) : (
                'Send login link'
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500">
            Not yet registered?{' '}
            <a href="/provider-portal/register" className="text-emerald-600 hover:underline">
              Register here
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
