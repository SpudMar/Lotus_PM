'use client'

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, CreditCard, User, LogOut } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/provider-portal/dashboard', label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/provider-portal/invoices',  label: 'My Invoices', icon: FileText },
  { href: '/provider-portal/payments',  label: 'Payments',    icon: CreditCard },
  { href: '/provider-portal/profile',   label: 'My Profile',  icon: User },
]

export function PortalNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const providerName = session?.user?.name ?? ''

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1 flex-1 justify-center" aria-label="Provider portal navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>
      {/* Desktop right */}
      <div className="hidden md:flex items-center gap-3 shrink-0">
        {providerName && (
          <span className="text-sm text-stone-500 font-medium max-w-[160px] truncate">{providerName}</span>
        )}
        <button
          onClick={() => void signOut({ callbackUrl: '/provider-portal/login' })}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-stone-200 flex"
        aria-label="Mobile provider portal navigation"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                active ? 'text-emerald-600' : 'text-stone-400'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-stone-400'}`} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
        <button
          onClick={() => void signOut({ callbackUrl: '/provider-portal/login' })}
          className="flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium text-stone-400"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5 text-stone-400" aria-hidden="true" />
          Sign out
        </button>
      </nav>
    </>
  )
}
