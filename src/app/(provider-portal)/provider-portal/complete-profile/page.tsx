'use client'

/**
 * Provider portal — complete profile page — premium redesign.
 * Token-gated via invite link.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2, AlertCircle, Shield, Lock } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
          token, name, email,
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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-stone-500">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span>Loading your invitation…</span>
        </div>
      </div>
    )
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-sm p-10 max-w-md w-full text-center animate-fade-slide-up">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
          </div>
          <h2 className="font-display text-2xl font-bold text-stone-900 mb-3">Invalid Invitation</h2>
          <p className="text-stone-600 mb-6">{tokenError}</p>
          <p className="text-stone-400 text-sm">
            Contact{' '}
            <a href="mailto:support@lotusassist.com.au" className="text-emerald-600 hover:underline">
              support@lotusassist.com.au
            </a>{' '}
            if you need a new invitation link.
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-sm p-10 max-w-md w-full text-center animate-fade-slide-up">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
              <circle cx="20" cy="20" r="18" stroke="#10b981" strokeWidth="2"/>
              <path d="M12 20l5.5 5.5L28 14" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="font-display text-3xl font-bold text-stone-900 mb-3">Profile Submitted</h2>
          <p className="text-stone-600 max-w-sm mx-auto mb-6 leading-relaxed">
            Thank you! Your profile has been submitted for review. We will be in touch shortly to
            confirm your account activation.
          </p>
          <p className="text-stone-400 text-sm">
            Questions? Email{' '}
            <a href="mailto:support@lotusassist.com.au" className="text-emerald-600 underline">
              support@lotusassist.com.au
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 py-12">
      <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-10 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M12 3C12 3 5 8 5 14a7 7 0 0014 0c0-6-7-11-7-11z" fill="white"/>
              <path d="M12 3C12 3 12 10 12 17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-display font-bold text-stone-900">Lotus Assist Provider Portal</span>
        </div>

        <h1 className="font-display text-2xl font-bold text-stone-900 mb-1">Complete Your Profile</h1>
        <p className="text-stone-500 text-sm mb-6">
          {provider
            ? `You've been invited to complete your profile for ABN ${provider.abn}.`
            : 'Fill in your provider details to get started.'}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          {/* Business Details */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
              <Shield className="w-4 h-4 text-stone-400" aria-hidden="true" />
              <h2 className="font-display font-semibold text-stone-700 text-sm">Business Details</h2>
            </div>
            <div className="space-y-4">
              {provider?.abn && (
                <div>
                  <p className="text-xs font-medium text-stone-500 mb-1">ABN</p>
                  <p className="text-sm font-mono bg-stone-50 px-3 py-2 rounded-lg border border-stone-200 text-stone-700">{provider.abn}</p>
                </div>
              )}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-stone-700 mb-1.5">Business / Trading Name</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-semibold text-stone-700 mb-1.5">Business Address</label>
                <textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
                  placeholder="Street, Suburb, State, Postcode"
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none" />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <h2 className="font-display font-semibold text-stone-700 text-sm mb-4 pb-3 border-b border-stone-100">Contact Details</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-stone-700 mb-1.5">Business Email</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-stone-700 mb-1.5">
                  Phone <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <h2 className="font-display font-semibold text-stone-700 text-sm mb-4 pb-3 border-b border-stone-100">Bank Details</h2>
            <div className="flex items-center gap-2 mb-4 text-xs text-stone-400">
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Your bank details are encrypted and used only for NDIS payment processing</span>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bankBsb" className="block text-sm font-semibold text-stone-700 mb-1.5">BSB</label>
                  <input id="bankBsb" type="text" placeholder="e.g. 062-000" value={bankBsb} onChange={(e) => setBankBsb(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
                </div>
                <div>
                  <label htmlFor="bankAccount" className="block text-sm font-semibold text-stone-700 mb-1.5">Account Number</label>
                  <input id="bankAccount" type="text" placeholder="e.g. 12345678" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
                </div>
              </div>
              <div>
                <label htmlFor="bankAccountName" className="block text-sm font-semibold text-stone-700 mb-1.5">Account Name</label>
                <input id="bankAccountName" type="text" placeholder="e.g. SUNRISE SUPPORT SERVICES PTY LTD" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
              </div>
            </div>
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <button type="submit" disabled={submitting}
            className="w-full bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </span>
            ) : 'Submit Profile'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CompleteProfilePage(): React.JSX.Element {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    }>
      <CompleteProfileForm />
    </Suspense>
  )
}
