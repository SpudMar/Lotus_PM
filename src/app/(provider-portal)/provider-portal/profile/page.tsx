'use client'

/**
 * Provider portal profile page — premium redesign.
 * Per-section edit mode (contact + banking separately).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Lock, Loader2, CheckCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ProviderProfile {
  id: string
  name: string
  abn: string
  email: string | null
  phone: string | null
  address: string | null
  bankBsb: string | null
  bankAccount: string | null
  bankAccountName: string | null
  abnStatus: string | null
  abnRegisteredName: string | null
  gstRegistered: boolean | null
  providerStatus: string
}

function ProviderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE:           { label: 'Active',                          cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
    INVITED:          { label: 'Invited — complete your profile', cls: 'bg-blue-100 text-blue-800 border border-blue-300' },
    PENDING_APPROVAL: { label: 'Pending Approval',                cls: 'bg-amber-100 text-amber-800 border border-amber-300' },
    SUSPENDED:        { label: 'Suspended — contact support',     cls: 'bg-red-100 text-red-800 border border-red-300' },
  }
  const cfg = map[status] ?? { label: status, cls: 'bg-stone-100 text-stone-700 border border-stone-200' }
  return (
    <span className={`inline-flex text-sm font-medium px-3 py-1 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

export default function ProviderProfilePage(): React.JSX.Element {
  const router = useRouter()
  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Contact edit state
  const [editingContact, setEditingContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')

  // Banking edit state
  const [editingBanking, setEditingBanking] = useState(false)
  const [bankBsb, setBankBsb] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/provider-portal/profile')
      if (res.status === 401 || res.status === 403) {
        router.push('/provider-portal/login')
        return
      }
      if (!res.ok) {
        setFetchError('Failed to load profile')
        setLoading(false)
        return
      }
      const data = await res.json() as { provider: ProviderProfile }
      setProfile(data.provider)
      setContactName(data.provider.name ?? '')
      setContactPhone(data.provider.phone ?? '')
      setContactAddress(data.provider.address ?? '')
      setBankBsb(data.provider.bankBsb ?? '')
      setBankAccount(data.provider.bankAccount ?? '')
      setBankAccountName(data.provider.bankAccountName ?? '')
      setLoading(false)
    })()
  }, [router])

  async function handleSaveContact(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaveError(null)
    setSaveSuccess(false)
    setSaving(true)
    try {
      const res = await fetch('/api/provider-portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName || undefined,
          phone: contactPhone || null,
          address: contactAddress || null,
        }),
      })
      const data = await res.json() as { provider?: ProviderProfile; error?: string }
      if (!res.ok) {
        setSaveError(data.error ?? 'Save failed.')
      } else {
        if (data.provider) setProfile(data.provider)
        setEditingContact(false)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch {
      setSaveError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveBanking(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setSaveError(null)
    setSaveSuccess(false)
    setSaving(true)
    try {
      const res = await fetch('/api/provider-portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankBsb: bankBsb || null,
          bankAccount: bankAccount || null,
          bankAccountName: bankAccountName || null,
        }),
      })
      const data = await res.json() as { provider?: ProviderProfile; error?: string }
      if (!res.ok) {
        setSaveError(data.error ?? 'Save failed.')
      } else {
        if (data.provider) setProfile(data.provider)
        setEditingBanking(false)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      }
    } catch {
      setSaveError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        <span className="text-stone-500">Loading your profile…</span>
      </div>
    )
  }

  if (fetchError || !profile) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{fetchError ?? 'Profile not found'}</AlertDescription>
      </Alert>
    )
  }

  const fields = [profile.name, profile.phone, profile.address, profile.bankBsb, profile.bankAccount, profile.bankAccountName]
  const completed = fields.filter(Boolean).length
  const completionPct = Math.round((completed / fields.length) * 100)

  return (
    <div className="animate-fade-in space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">{profile.name}</h1>
          <div className="mt-2">
            <ProviderStatusBadge status={profile.providerStatus} />
          </div>
        </div>
      </div>

      {/* Profile completion */}
      {completionPct < 100 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-amber-800 text-sm font-semibold">Complete your profile</p>
            <p className="text-amber-700 text-sm font-bold">{completionPct}%</p>
          </div>
          <div
            className="w-full bg-amber-200 rounded-full h-2"
            role="progressbar"
            aria-valuenow={completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-amber-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="text-amber-700 text-xs mt-2">Add your contact and banking details to receive faster payments.</p>
        </div>
      )}

      {saveSuccess && (
        <Alert className="border-emerald-200 bg-emerald-50">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800 ml-2">Profile updated successfully.</AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* Verified Information */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-5 h-5 text-stone-400" aria-hidden="true" />
          <h2 className="font-display font-semibold text-stone-700">Verified Information</h2>
          <span className="ml-auto text-xs text-stone-400">Read-only</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-stone-500 font-medium mb-1">ABN</dt>
            <dd className="text-stone-900 font-semibold">{profile.abn}</dd>
          </div>
          <div>
            <dt className="text-stone-500 font-medium mb-1">Registered Business Name</dt>
            <dd className="text-stone-900">{profile.abnRegisteredName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-stone-500 font-medium mb-1">GST Registered</dt>
            <dd className="text-stone-900">
              {profile.gstRegistered === true ? 'Yes' : profile.gstRegistered === false ? 'No' : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-stone-500 font-medium mb-1">Login Email</dt>
            <dd className="text-stone-900">{profile.email ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Contact Details */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-stone-900">Contact Details</h2>
          {!editingContact && (
            <button
              onClick={() => setEditingContact(true)}
              className="text-sm text-emerald-600 hover:text-emerald-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
            >
              Edit
            </button>
          )}
        </div>
        {editingContact ? (
          <form onSubmit={(e) => void handleSaveContact(e)} className="space-y-4">
            <div>
              <label htmlFor="cName" className="block text-sm font-medium text-stone-700 mb-1">Business / Trading Name</label>
              <input id="cName" type="text" value={contactName} onChange={e => setContactName(e.target.value)} required disabled={saving}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60" />
            </div>
            <div>
              <label htmlFor="cPhone" className="block text-sm font-medium text-stone-700 mb-1">Phone (optional)</label>
              <input id="cPhone" type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} disabled={saving} placeholder="0412 345 678"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60" />
            </div>
            <div>
              <label htmlFor="cAddress" className="block text-sm font-medium text-stone-700 mb-1">Business Address (optional)</label>
              <textarea id="cAddress" value={contactAddress} onChange={e => setContactAddress(e.target.value)} disabled={saving} rows={2} placeholder="Street, Suburb, State, Postcode"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none disabled:opacity-60" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => { setEditingContact(false); setContactName(profile.name ?? ''); setContactPhone(profile.phone ?? ''); setContactAddress(profile.address ?? '') }}
                className="text-sm text-stone-500 hover:text-stone-700 px-4 py-2 rounded-lg hover:bg-stone-100 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-4 text-sm">
            <div><dt className="text-stone-500 font-medium mb-1">Business / Trading Name</dt><dd className="text-stone-900">{profile.name || '—'}</dd></div>
            <div><dt className="text-stone-500 font-medium mb-1">Phone</dt><dd className="text-stone-900">{profile.phone || '—'}</dd></div>
            <div><dt className="text-stone-500 font-medium mb-1">Business Address</dt><dd className="text-stone-900 whitespace-pre-line">{profile.address || '—'}</dd></div>
          </dl>
        )}
      </div>

      {/* Banking Details */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-stone-900">Banking Details</h2>
          {!editingBanking && (
            <button onClick={() => setEditingBanking(true)}
              className="text-sm text-emerald-600 hover:text-emerald-800 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
              Edit
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4 text-xs text-stone-400">
          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Your banking details are encrypted and used only for NDIS payment processing</span>
        </div>
        {editingBanking ? (
          <form onSubmit={(e) => void handleSaveBanking(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bBsb" className="block text-sm font-medium text-stone-700 mb-1">BSB</label>
                <input id="bBsb" type="text" value={bankBsb} onChange={e => setBankBsb(e.target.value)} placeholder="062-000" disabled={saving}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60" />
              </div>
              <div>
                <label htmlFor="bAcc" className="block text-sm font-medium text-stone-700 mb-1">Account Number</label>
                <input id="bAcc" type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="12345678" disabled={saving}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60" />
              </div>
            </div>
            <div>
              <label htmlFor="bName" className="block text-sm font-medium text-stone-700 mb-1">Account Name</label>
              <input id="bName" type="text" value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} placeholder="SUNRISE SUPPORT SERVICES PTY LTD" disabled={saving}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => { setEditingBanking(false); setBankBsb(profile.bankBsb ?? ''); setBankAccount(profile.bankAccount ?? ''); setBankAccountName(profile.bankAccountName ?? '') }}
                className="text-sm text-stone-500 hover:text-stone-700 px-4 py-2 rounded-lg hover:bg-stone-100 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div><dt className="text-stone-500 font-medium mb-1">BSB</dt><dd className="text-stone-900 font-mono">{profile.bankBsb || '—'}</dd></div>
              <div><dt className="text-stone-500 font-medium mb-1">Account Number</dt><dd className="text-stone-900 font-mono">{profile.bankAccount || '—'}</dd></div>
            </div>
            <div><dt className="text-stone-500 font-medium mb-1">Account Name</dt><dd className="text-stone-900">{profile.bankAccountName || '—'}</dd></div>
          </dl>
        )}
      </div>
    </div>
  )
}
