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
  ],
}
