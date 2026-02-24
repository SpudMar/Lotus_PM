/**
 * Provider portal layout — public, no authentication required.
 * Uses a minimal layout without the main app sidebar.
 */

export default function ProviderPortalLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      {/* Portal header */}
      <header className="border-b border-emerald-100 bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
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
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        {children}
      </main>

      <footer className="border-t border-emerald-100 bg-white mt-10">
        <div className="mx-auto max-w-4xl px-4 py-4 text-center text-sm text-gray-500">
          Lotus Assist Pty Ltd · NDIS Plan Management ·{' '}
          <a href="mailto:support@lotusassist.com.au" className="text-emerald-600 hover:underline">
            support@lotusassist.com.au
          </a>
        </div>
      </footer>
    </div>
  )
}
