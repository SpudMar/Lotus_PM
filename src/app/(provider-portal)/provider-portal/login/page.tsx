'use client'

/**
 * Provider portal login page — premium split-screen redesign.
 * Magic link authentication via /api/provider-portal/auth.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'

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

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 bg-emerald-700 flex-col justify-between p-12 xl:p-16">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                <path d="M12 3C12 3 5 8 5 14a7 7 0 0014 0c0-6-7-11-7-11z" fill="white" opacity="0.9"/>
                <path d="M12 3C12 3 12 10 12 17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-white font-display font-bold text-xl">Lotus Assist</span>
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
            Your invoices.<br />Clear and on time.
          </h1>
          <div className="space-y-5">
            {[
              'Real-time invoice status tracking',
              'Full payment history with references',
              'Secure NDIS claim lodgement',
            ].map(feat => (
              <div key={feat} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
                    <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-emerald-100 text-lg">{feat}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-emerald-300 text-sm">Lotus Assist Pty Ltd · NDIS Plan Management</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                <path d="M12 3C12 3 5 8 5 14a7 7 0 0014 0c0-6-7-11-7-11z" fill="white"/>
                <path d="M12 3C12 3 12 10 12 17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-display font-bold text-stone-900 text-xl">Lotus Assist</span>
          </div>

          {!success ? (
            <>
              <h2 className="font-display text-3xl font-bold text-stone-900 mb-2">Provider sign in</h2>
              <p className="text-stone-500 mb-8 text-base">
                Enter your email and we&apos;ll send you a secure sign-in link.
              </p>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-stone-700 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={submitting}
                    className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition disabled:opacity-60"
                    placeholder="billing@yourpractice.com.au"
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={!email || submitting}
                  className="w-full bg-emerald-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 text-base"
                >
                  {submitting ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>
              <p className="mt-8 text-sm text-stone-500 text-center">
                New provider?{' '}
                <Link href="/provider-portal/register" className="text-emerald-600 hover:text-emerald-800 font-medium underline">
                  Register here
                </Link>
              </p>
            </>
          ) : (
            <div className="text-center animate-fade-slide-up">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <Mail className="w-8 h-8 text-emerald-600" aria-hidden="true" />
              </div>
              <h2 className="font-display text-2xl font-bold text-stone-900 mb-3">Check your email</h2>
              <p className="text-stone-600 mb-2">
                We&apos;ve sent a sign-in link to{' '}
                <strong className="text-stone-900">{email}</strong>.
              </p>
              <p className="text-stone-500 text-sm mb-1">The link expires in 15 minutes.</p>
              <p className="text-stone-400 text-sm">Can&apos;t find it? Check your spam folder.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
