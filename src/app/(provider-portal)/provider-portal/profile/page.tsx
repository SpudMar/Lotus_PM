'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle } from 'lucide-react'

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

export default function ProviderProfilePage(): React.JSX.Element {
  const router = useRouter()
  const [profile, setProfile] = useState<ProviderProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [bankBsb, setBankBsb] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [bankAccountName, setBankAccountName] = useState('')

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/provider-portal/profile')
      if (res.status === 401 || res.status === 403) {
        router.push('/provider-portal/login')
        return
      }
      if (!res.ok) {
        setError('Failed to load profile')
        setLoading(false)
        return
      }
      const data = await res.json() as { provider: ProviderProfile }
      setProfile(data.provider)
      setName(data.provider.name)
      setPhone(data.provider.phone ?? '')
      setAddress(data.provider.address ?? '')
      setBankBsb(data.provider.bankBsb ?? '')
      setBankAccount(data.provider.bankAccount ?? '')
      setBankAccountName(data.provider.bankAccountName ?? '')
      setLoading(false)
    })()
  }, [router])

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)

    try {
      const res = await fetch('/api/provider-portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || undefined,
          phone: phone || null,
          address: address || null,
          bankBsb: bankBsb || null,
          bankAccount: bankAccount || null,
          bankAccountName: bankAccountName || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }

      const data = await res.json() as { provider: ProviderProfile }
      setProfile(data.provider)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? 'Profile not found'}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Manage your contact and payment details.</p>
      </div>

      {/* Read-only business info */}
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>These details are set by Lotus Assist and cannot be changed here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-500">ABN</p>
              <p className="text-gray-900">{profile.abn}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">GST Registered</p>
              <p className="text-gray-900">
                {profile.gstRegistered === true
                  ? 'Yes'
                  : profile.gstRegistered === false
                  ? 'No'
                  : '—'}
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Registered Business Name</p>
              <p className="text-gray-900">{profile.abnRegisteredName ?? '—'}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Portal Status</p>
              <Badge className="bg-emerald-100 text-emerald-800">
                {profile.providerStatus}
              </Badge>
            </div>
            <div>
              <p className="font-medium text-gray-500">Login Email</p>
              <p className="text-gray-900">{profile.email ?? '—'}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">ABN Status</p>
              <p className="text-gray-900">{profile.abnStatus ?? '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable contact + bank details */}
      <Card>
        <CardHeader>
          <CardTitle>Contact &amp; Banking Details</CardTitle>
          <CardDescription>Keep these up to date to ensure payments are processed correctly.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="mb-4 border-emerald-200 bg-emerald-50">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800 ml-2">
                Profile updated successfully.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Business / Trading Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0412 345 678"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Business Address</Label>
              <Input
                id="address"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, Sydney NSW 2000"
                disabled={saving}
              />
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Bank Account Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankBsb">BSB</Label>
                  <Input
                    id="bankBsb"
                    value={bankBsb}
                    onChange={e => setBankBsb(e.target.value)}
                    placeholder="062-001"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">Account Number</Label>
                  <Input
                    id="bankAccount"
                    value={bankAccount}
                    onChange={e => setBankAccount(e.target.value)}
                    placeholder="12345678"
                    disabled={saving}
                  />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label htmlFor="bankAccountName">Account Name</Label>
                <Input
                  id="bankAccountName"
                  value={bankAccountName}
                  onChange={e => setBankAccountName(e.target.value)}
                  placeholder="Sunrise Support Pty Ltd"
                  disabled={saving}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
