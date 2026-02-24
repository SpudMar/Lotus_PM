/**
 * Provider portal layout — "Considered Clarity" premium redesign.
 * Sticky top bar with Bricolage Grotesque display font.
 * PortalNav handles desktop nav + mobile bottom tab bar.
 */

import { Bricolage_Grotesque } from 'next/font/google'
import type { ReactNode } from 'react'
import { PortalNav } from '@/components/provider-portal/portal-nav'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700', '800'],
})

export default function ProviderPortalLayout({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className={`${bricolage.variable} min-h-screen bg-stone-50 flex flex-col`}>
      <header className="sticky top-0 z-30 bg-white border-b border-stone-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3C12 3 5 8 5 14a7 7 0 0014 0c0-6-7-11-7-11z" fill="white" opacity="0.9"/>
                <path d="M12 3C12 3 12 10 12 17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <span className="font-display font-bold text-stone-900 text-lg leading-none tracking-tight">Lotus Assist</span>
              <span className="block text-[10px] text-emerald-600 font-semibold uppercase tracking-[0.12em] leading-none mt-0.5">Provider Portal</span>
            </div>
          </div>
          {/* Desktop nav + mobile bottom tab bar */}
          <PortalNav />
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 pb-24 md:pb-8">
        {children}
      </main>
      <footer className="text-center text-xs text-stone-400 py-5 border-t border-stone-100">
        Lotus Assist Pty Ltd · NDIS Plan Management · Questions?{' '}
        <a href="mailto:support@lotusassist.com.au" className="underline hover:text-stone-600">
          support@lotusassist.com.au
        </a>
      </footer>
    </div>
  )
}
