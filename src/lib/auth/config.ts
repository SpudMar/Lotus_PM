import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import type { CoreRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: CoreRole
    }
  }
  interface User {
    role: CoreRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: CoreRole
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours — business day session
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    // Credentials provider for dev/initial setup.
    // Cognito OAuth provider added when COGNITO env vars are set.
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.coreUser.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.isActive || user.deletedAt) {
          return null
        }

        // Allow credentials login in dev, or when explicitly enabled via env var
        // (used for staging before Cognito OAuth is configured).
        // Production with Cognito will set ALLOW_CREDENTIALS_AUTH=false and
        // add the Cognito provider instead.
        const allowCredentials =
          process.env.NODE_ENV === 'development' ||
          process.env.ALLOW_CREDENTIALS_AUTH === 'true'

        if (allowCredentials) {
          await prisma.coreUser.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id
      session.user.role = token.role
      return session
    },
  },
}
