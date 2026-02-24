/**
 * Provider portal layout.
 *
 * Public pages (register, complete-profile, login, auth/*):
 *   Simple header + footer, no authentication check.
 *
 * Protected pages (dashboard, invoices, payments, profile):
 *   Rendered server-side — session validation happens in the individual
 *   page components via requireProviderSession(). This layout provides
 *   the authenticated navigation shell.
 *
 * The layout does NOT redirect unauthenticated users — each protected page
 * does its own session check and redirects to /provider-portal/login if needed.
 * This keeps the layout stateless and avoids double-fetching the session.
 */

import Link from 'next/link'

export default function ProviderPortalLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Portal header */}
      <header className="border-b border-emerald-100 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-emerald-600"
              aria-hidden="true"
            >
              <path d="M16 4C16 4 12 10 12 16C12 22 16 26 16 26C16 26 20 22 20 16C20 10 16 4 16 4Z" fill="currentColor" opacity="0.9" />
              <path d="M8 10C8 10 6 16 8 20C10 24 14 26 14 26C14 26 12 20 12 16C12 12 8 10 8 10Z" fill="currentColor" opacity="0.6" />
              <path d="M24 10C24 10 26 16 24 20C22 24 18 26 18 26C18 26 20 20 20 16C20 12 24 10 24 10Z" fill="currentColor" opacity="0.6" />
            </svg>
            <div>
              <p className="font-bold text-gray-900">Lotus Assist</p>
              <p className="text-xs text-gray-500">Provider Portal</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/provider-portal/dashboard" className="text-gray-600 hover:text-emerald-700 font-medium">
              Dashboard
            </Link>
            <Link href="/provider-portal/invoices" className="text-gray-600 hover:text-emerald-700 font-medium">
              My Invoices
            </Link>
            <Link href="/provider-portal/payments" className="text-gray-600 hover:text-emerald-700 font-medium">
              Payments
            </Link>
            <Link href="/provider-portal/profile" className="text-gray-600 hover:text-emerald-700 font-medium">
              Profile
            </Link>
            <Link
              href="/api/auth/signout"
              className="text-gray-500 hover:text-red-600 font-medium"
            >
              Sign Out
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-emerald-100 bg-white mt-10">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-sm text-gray-500">
          Lotus Assist Pty Ltd · NDIS Plan Management ·{' '}
          <a href="mailto:support@lotusassist.com.au" className="text-emerald-600 hover:underline">
            support@lotusassist.com.au
          </a>
        </div>
      </footer>
    </div>
  )
}
