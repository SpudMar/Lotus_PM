'use client'

/**
 * Provider portal registration page — premium redesign.
 * Step indicator + ABN verification card.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AbnLookupData {
  entityName: string
  abnStatus: string
  gstRegistered: boolean
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  const steps = ['Verify ABN', 'Your Details']
  return (
    <div className="flex items-center mb-8">
      {steps.map((label, i) => {
        const stepNum = (i + 1) as 1 | 2
        const done = stepNum < current
        const active = stepNum === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  done ? 'bg-emerald-600 text-white' : active ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-stone-200 text-stone-400'
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden="true">
                    <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : stepNum}
              </div>
              <span className={`text-xs mt-1.5 font-medium ${active ? 'text-emerald-700' : done ? 'text-stone-600' : 'text-stone-400'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-12 sm:w-20 mx-2 mb-5 transition-colors ${done ? 'bg-emerald-500' : 'bg-stone-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
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

  const abnVerified = abnLookupData !== null && !abnError

  async function handleAbnBlur(): Promise<void> {
    const cleanAbn = abn.replace(/\s/g, '')
    if (cleanAbn.length !== 11) return

    setLookingUpAbn(true)
    setAbnError(null)
    setAbnLookupData(null)

    try {
      const res = await fetch(`/api/crm/providers/abn-lookup?abn=${cleanAbn}`)
      if (res.status === 503) return
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

      const json = (await res.json()) as {
        data?: { message: string }
        error?: string
        details?: Array<{ message: string }>
      }

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
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-sm p-10 max-w-md w-full text-center animate-fade-slide-up">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
              <circle cx="20" cy="20" r="18" stroke="#10b981" strokeWidth="2"/>
              <path d="M12 20l5.5 5.5L28 14" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="font-display text-3xl font-bold text-stone-900 mb-3">Registration Received</h2>
          <p className="text-stone-600 max-w-sm mx-auto mb-6 leading-relaxed">
            Our team will review your registration and send you a sign-in link once approved.
            This usually takes 1–2 business days.
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
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
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

        <h1 className="font-display text-2xl font-bold text-stone-900 mb-2">Register as a provider</h1>
        <p className="text-stone-500 text-sm mb-6">Let&apos;s verify your ABN to get started.</p>

        <StepIndicator current={abnVerified ? 2 : 1} />

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          {/* ABN */}
          <div className="space-y-1.5">
            <label htmlFor="abn" className="block text-sm font-semibold text-stone-700">ABN</label>
            <div className="relative">
              <input
                id="abn" type="text" placeholder="e.g. 51 824 753 556"
                value={abn} onChange={(e) => setAbn(e.target.value)}
                onBlur={() => void handleAbnBlur()} maxLength={14} required
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
              {lookingUpAbn && <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-stone-400" />}
            </div>
            {abnError && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{abnError}</AlertDescription>
              </Alert>
            )}
            {abnVerified && abnLookupData && (
              <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-fade-slide-up">
                <div className="flex items-center gap-2 mb-2">
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-emerald-600" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 8l2.5 2.5L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="font-semibold text-emerald-800 text-sm">ABN Verified</span>
                </div>
                <p className="text-stone-700 font-medium text-sm">{abnLookupData.entityName}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {abnLookupData.gstRegistered && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">GST Registered</span>
                  )}
                  <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">ABN Active</span>
                </div>
              </div>
            )}
          </div>

          {/* Remaining fields */}
          <div className={`space-y-5 transition-opacity ${abnVerified ? 'opacity-100 animate-fade-slide-up' : 'opacity-40 pointer-events-none'}`}>
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-semibold text-stone-700">Business / Trading Name</label>
              <input id="name" type="text" placeholder="e.g. Sunrise Support Services"
                value={name} onChange={(e) => setName(e.target.value)} required={abnVerified}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
              <p className="text-xs text-stone-400">Pre-filled from ABR if available — update if you trade under a different name.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="contactName" className="block text-sm font-semibold text-stone-700">Your Name</label>
              <input id="contactName" type="text" placeholder="e.g. Jane Smith"
                value={contactName} onChange={(e) => setContactName(e.target.value)} required={abnVerified}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-semibold text-stone-700">Business Email</label>
              <input id="email" type="email" placeholder="invoices@yourpractice.com.au"
                value={email} onChange={(e) => setEmail(e.target.value)} required={abnVerified}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="phone" className="block text-sm font-semibold text-stone-700">
                Phone <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input id="phone" type="tel" placeholder="e.g. 02 9000 0000"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition" />
            </div>
          </div>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          <button
            type="submit" disabled={submitting || !!abnError || !abnVerified}
            className="w-full bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 text-base"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting…
              </span>
            ) : 'Submit Registration'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-500">
          Already registered?{' '}
          <Link href="/provider-portal/login" className="text-emerald-600 font-medium hover:text-emerald-800 underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
