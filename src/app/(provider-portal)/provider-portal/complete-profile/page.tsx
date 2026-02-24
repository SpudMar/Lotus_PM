'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'

interface ProviderData {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  address: string | null
  bankBsb: string | null
  bankAccount: string | null
  bankAccountName: string | null
}

function CompleteProfileForm(): React.JSX.Element {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderData | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [bankBsb, setBankBsb] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token provided. Please use the link from your invitation email.')
      setLoading(false)
      return
    }

    void fetch(`/api/provider-portal/complete-profile?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j: { data?: ProviderData; error?: string; code?: string }) => {
        if (j.code === 'TOKEN_EXPIRED' || j.code === 'TOKEN_INVALID') {
          setTokenError(j.error ?? 'Invalid or expired invitation link.')
        } else if (j.data) {
          setProvider(j.data)
          setName(j.data.name ?? '')
          setEmail(j.data.email ?? '')
          setPhone(j.data.phone ?? '')
          setAddress(j.data.address ?? '')
          setBankBsb(j.data.bankBsb ?? '')
          setBankAccount(j.data.bankAccount ?? '')
          setBankAccountName(j.data.bankAccountName ?? '')
        } else {
          setTokenError('Invalid invitation link.')
        }
      })
      .catch(() => {
        setTokenError('Failed to load invitation. Please check your connection.')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/provider-portal/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name,
          email,
          phone: phone || undefined,
          address: address || undefined,
          bankBsb: bankBsb || undefined,
          bankAccount: bankAccount || undefined,
          bankAccountName: bankAccountName || undefined,
        }),
      })

      const json = (await res.json()) as {
        data?: { message: string }
        error?: string
        code?: string
        details?: Array<{ message: string }>
      }

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          setError(json.details.map((d) => d.message).join(', '))
        } else {
          setError(json.error ?? 'Submission failed. Please try again.')
        }
        return
      }

      setSuccess(true)
    } catch {
      setError('Network error — please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <span className="ml-2 text-gray-600">Loading your invitation...</span>
      </div>
    )
  }

  if (tokenError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h2>
          <p className="text-gray-600">{tokenError}</p>
          <p className="text-sm text-gray-500 mt-4">
            Contact{' '}
            <a href="mailto:support@lotusassist.com.au" className="text-emerald-600 hover:underline">
              support@lotusassist.com.au
            </a>{' '}
            if you need a new invitation link.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Profile Submitted</h2>
          <p className="text-gray-600">
            Thank you! Your profile has been submitted for review. We will be in touch shortly to
            confirm your account activation.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Your Provider Profile</CardTitle>
        <CardDescription>
          {provider
            ? `You've been invited to complete your profile for ${provider.abn}. Filling in your details helps us process your invoices faster.`
            : 'Fill in your provider details to get started.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          {/* Business Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b">
              Business Details
            </h3>
            <div className="space-y-4">
              {provider?.abn && (
                <div className="space-y-1.5">
                  <Label>ABN</Label>
                  <p className="text-sm font-mono bg-gray-50 px-3 py-2 rounded border">
                    {provider.abn}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="name">Business / Trading Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Business Address</Label>
                <Textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, Suburb, State, Postcode"
                />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b">
              Contact Details
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Business Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-1 border-b">
              Bank Details
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Your bank details are used for payment of approved invoices. This information is
              stored securely.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bankBsb">BSB</Label>
                  <Input
                    id="bankBsb"
                    placeholder="e.g. 062-000"
                    value={bankBsb}
                    onChange={(e) => setBankBsb(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bankAccount">Account Number</Label>
                  <Input
                    id="bankAccount"
                    placeholder="e.g. 12345678"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountName">Account Name</Label>
                <Input
                  id="bankAccountName"
                  placeholder="e.g. SUNRISE SUPPORT SERVICES PTY LTD"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Profile'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function CompleteProfilePage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <CompleteProfileForm />
    </Suspense>
  )
}
