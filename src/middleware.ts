import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/participants/:path*',
    '/providers/:path*',
    '/plans/:path*',
    '/invoices/:path*',
    '/claims/:path*',
    '/banking/:path*',
    '/reports/:path*',
    '/documents/:path*',
    '/settings/:path*',
    '/coordinators/:path*',
    '/coordinator/:path*',
    '/service-agreements/:path*',
    // Public paths (NOT listed here -- no session required):
    //   /approval/:path*  -- public participant approval page (WS7)
    //   /api/invoices/approval/* -- public approval respond/status API (WS7)
  ],
}
