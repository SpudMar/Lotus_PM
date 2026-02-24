'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, Loader2 } from 'lucide-react'

interface AbnLookupData {
  entityName: string
  abnStatus: string
  gstRegistered: boolean
}

export default function ProviderRegisterPage(): React.JSX.Element {
  const [abn, setAbn] = useState('')
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [abnLookupData, setAbnLookupData] = useState<AbnLookupData | null>(null)
  const [abnError, setAbnError] = useState<string | null>(null)
  const [lookingUpAbn, setLookingUpAbn] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAbnBlur(): Promise<void> {
    const cleanAbn = abn.replace(/\s/g, '')
    if (cleanAbn.length !== 11) return

    setLookingUpAbn(true)
    setAbnError(null)

    try {
      const res = await fetch(`/api/crm/providers/abn-lookup?abn=${cleanAbn}`)
      if (res.status === 503) {
        // ABR not configured — skip enrichment silently
        return
      }
      if (!res.ok) return

      const json = (await res.json()) as { data: AbnLookupData | null }
      if (json.data) {
        setAbnLookupData(json.data)
        if (!name) setName(json.data.entityName)
        if (json.data.abnStatus !== 'Active') {
          setAbnError(`ABN status is "${json.data.abnStatus}" — only active ABNs can register.`)
        }
      }
    } catch {
      // ABR lookup failure is non-fatal
    } finally {
      setLookingUpAbn(false)
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/provider-portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn, name, contactName, email, phone: phone || undefined }),
      })

      const json = (await res.json()) as { data?: { message: string }; error?: string; details?: Array<{ message: string }> }

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          setError(json.details.map((d) => d.message).join(', '))
        } else {
          setError(json.error ?? 'Registration failed. Please try again.')
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

  if (success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Registration Received</h2>
          <p className="text-gray-600">
            Thank you for registering. We will review your application and be in touch shortly.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider Registration</CardTitle>
        <CardDescription>
          Register as an NDIS service provider with Lotus Assist. Once approved, we can process
          your invoices and pay you faster.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          {/* ABN field */}
          <div className="space-y-1.5">
            <Label htmlFor="abn">ABN</Label>
            <div className="relative">
              <Input
                id="abn"
                type="text"
                placeholder="e.g. 51 824 753 556"
                value={abn}
                onChange={(e) => setAbn(e.target.value)}
                onBlur={() => void handleAbnBlur()}
                maxLength={14}
                required
              />
              {lookingUpAbn && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
            {abnError && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{abnError}</AlertDescription>
              </Alert>
            )}
            {abnLookupData && !abnError && (
              <p className="text-xs text-emerald-600">
                ABN verified: {abnLookupData.entityName} ({abnLookupData.abnStatus})
                {abnLookupData.gstRegistered ? ' · GST registered' : ''}
              </p>
            )}
          </div>

          {/* Business name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Business / Trading Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="e.g. Sunrise Support Services"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Pre-filled from ABR if available — update if you trade under a different name.
            </p>
          </div>

          {/* Contact name */}
          <div className="space-y-1.5">
            <Label htmlFor="contactName">Your Name</Label>
            <Input
              id="contactName"
              type="text"
              placeholder="e.g. Jane Smith"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Business Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="invoices@yourpractice.com.au"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g. 02 9000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={submitting || !!abnError}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Registration'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
