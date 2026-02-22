'use client'

import { Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LotusLogo({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4C16 4 12 10 12 16C12 22 16 26 16 26C16 26 20 22 20 16C20 10 16 4 16 4Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M8 10C8 10 6 16 8 20C10 24 14 26 14 26C14 26 12 20 12 16C12 12 8 10 8 10Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M24 10C24 10 26 16 24 20C22 24 18 26 18 26C18 26 20 20 20 16C20 12 24 10 24 10Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M4 14C4 14 4 18 6 21C8 24 12 26 12 26C12 26 8 22 8 18C8 14 4 14 4 14Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M28 14C28 14 28 18 26 21C24 24 20 26 20 26C20 26 24 22 24 18C24 14 28 14 28 14Z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  )
}

function LoginForm(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    })

    setLoading(false)

    if (result?.error) {
      setError('Invalid email or password')
    } else if (result?.url) {
      router.push(result.url)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@lotusassist.com.au"
          className="h-10"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10"
        />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Signing in...
          </span>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  )
}

export default function LoginPage(): React.JSX.Element {
  return (
    <div className="flex min-h-screen">
      {/* Brand Panel — Left */}
      <div className="hidden flex-col justify-between bg-[var(--brand-800)] p-10 text-white lg:flex lg:w-[480px]">
        <div>
          <div className="flex items-center gap-3">
            <LotusLogo className="h-9 w-9 text-emerald-300" />
            <span className="text-xl font-bold tracking-tight">Lotus PM</span>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            NDIS Plan Management,{' '}
            <span className="text-emerald-300">simplified.</span>
          </h1>
          <p className="text-base leading-relaxed text-white/70">
            Manage participants, process invoices, submit claims, and track budgets
            — all in one place built for Australian plan managers.
          </p>
        </div>
        <p className="text-xs text-white/40">
          Lotus Assist Pty Ltd
        </p>
      </div>

      {/* Form Panel — Right */}
      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LotusLogo className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold tracking-tight">Lotus PM</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your account to continue.
            </p>
          </div>

          <Suspense fallback={
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
