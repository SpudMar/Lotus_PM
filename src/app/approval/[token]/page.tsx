/**
 * Public participant invoice approval page — WS7.
 * No authentication required. Accessible via the token link sent by email/SMS.
 */
'use client'

import { useEffect, useState, use } from 'react'
import { formatAUD } from '@/lib/shared/currency'

interface ApprovalStatus {
  invoiceId: string
  participantApprovalStatus: string | null
  status: string
  totalCents: number
  invoiceDate: string
  providerName: string | null
}

type PageState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'ready'; data: ApprovalStatus }
  | { type: 'decided'; decision: 'APPROVED' | 'REJECTED' }
  | { type: 'already_decided'; status: string }

export default function ApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [state, setState] = useState<PageState>({ type: 'loading' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch(`/api/invoices/approval/status?token=${encodeURIComponent(token)}`)
        if (!res.ok) {
          const body = (await res.json()) as { error?: string }
          if (res.status === 410) {
            setState({ type: 'error', message: 'This approval link has expired. Please contact your plan manager.' })
          } else {
            setState({ type: 'error', message: body.error ?? 'Unable to load invoice details.' })
          }
          return
        }
        const body = (await res.json()) as { data: ApprovalStatus }
        const data = body.data
        // If already decided, show that state
        if (
          data.participantApprovalStatus === 'APPROVED' ||
          data.participantApprovalStatus === 'REJECTED' ||
          data.participantApprovalStatus === 'SKIPPED'
        ) {
          setState({ type: 'already_decided', status: data.participantApprovalStatus })
        } else {
          setState({ type: 'ready', data })
        }
      } catch {
        setState({ type: 'error', message: 'An unexpected error occurred. Please try again.' })
      }
    }
    void loadStatus()
  }, [token])

  async function handleDecision(decision: 'APPROVED' | 'REJECTED') {
    setSubmitting(true)
    try {
      const res = await fetch('/api/invoices/approval/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string; code?: string }
        if (body.code === 'TOKEN_EXPIRED') {
          setState({ type: 'error', message: 'This link has expired. Please contact your plan manager.' })
        } else if (body.code === 'TOKEN_USED') {
          setState({ type: 'already_decided', status: 'ALREADY_USED' })
        } else {
          setState({ type: 'error', message: body.error ?? 'Unable to submit your decision.' })
        }
      } else {
        setState({ type: 'decided', decision })
      }
    } catch {
      setState({ type: 'error', message: 'An unexpected error occurred. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Invoice Approval</h1>
          <p className="mt-1 text-sm text-gray-500">Lotus Assist Plan Management</p>
        </div>

        {state.type === 'loading' && (
          <div className="text-center text-gray-500 py-8">Loading invoice details...</div>
        )}

        {state.type === 'error' && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}

        {state.type === 'already_decided' && (
          <div className="rounded-lg bg-gray-50 border p-4 text-sm text-gray-700 text-center">
            {state.status === 'APPROVED' && 'You have already approved this invoice. Thank you.'}
            {state.status === 'REJECTED' && 'You have already rejected this invoice. Your plan manager has been notified.'}
            {state.status === 'SKIPPED' && 'This invoice has been automatically forwarded to your plan manager as the approval window has closed.'}
            {state.status === 'ALREADY_USED' && 'This approval link has already been used. If you need to make a change, please contact your plan manager.'}
          </div>
        )}

        {state.type === 'decided' && (
          <div className="text-center">
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                state.decision === 'APPROVED' ? 'bg-green-100' : 'bg-orange-100'
              }`}
            >
              {state.decision === 'APPROVED' ? (
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <p className="font-medium text-gray-900">
              {state.decision === 'APPROVED'
                ? 'Invoice approved'
                : 'Invoice sent back for review'}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {state.decision === 'APPROVED'
                ? 'Your plan manager has been notified. The invoice will now be processed.'
                : 'Your plan manager has been notified and will review the invoice.'}
            </p>
          </div>
        )}

        {state.type === 'ready' && (
          <div>
            <div className="rounded-lg bg-gray-50 border p-4 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Provider</span>
                <span className="font-medium text-gray-900">
                  {state.data.providerName ?? 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Invoice date</span>
                <span className="font-medium text-gray-900">
                  {new Date(state.data.invoiceDate).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">
                  {formatAUD(state.data.totalCents)}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Your plan manager is requesting your approval before processing this invoice.
              Please review the details above and indicate your decision.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => void handleDecision('REJECTED')}
                disabled={submitting}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Reject'}
              </button>
              <button
                onClick={() => void handleDecision('APPROVED')}
                disabled={submitting}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
