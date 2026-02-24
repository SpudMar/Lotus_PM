/**
 * Provider session helper.
 * Retrieves the CrmProvider record linked to the authenticated portal user.
 * Used by all provider portal API routes and pages.
 */

import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import type { CrmProvider } from '@prisma/client'

export type PortalProvider = Pick<
  CrmProvider,
  | 'id'
  | 'name'
  | 'abn'
  | 'email'
  | 'phone'
  | 'address'
  | 'bankBsb'
  | 'bankAccount'
  | 'bankAccountName'
  | 'abnStatus'
  | 'abnRegisteredName'
  | 'gstRegistered'
  | 'providerStatus'
>

/**
 * Returns the ACTIVE CrmProvider linked to the given CoreUser ID.
 * Returns null if no active provider is linked.
 */
export async function getProviderForSession(userId: string): Promise<PortalProvider | null> {
  return prisma.crmProvider.findFirst({
    where: {
      portalUserId: userId,
      providerStatus: 'ACTIVE',
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      abn: true,
      email: true,
      phone: true,
      address: true,
      bankBsb: true,
      bankAccount: true,
      bankAccountName: true,
      abnStatus: true,
      abnRegisteredName: true,
      gstRegistered: true,
      providerStatus: true,
    },
  })
}

/**
 * Requires an authenticated session with PROVIDER role.
 * Returns the session and linked provider, or throws with an error code.
 *
 * Usage in API routes:
 *   const { session, provider } = await requireProviderSession()
 */
export async function requireProviderSession(): Promise<{
  session: { user: { id: string; email: string; name: string; role: string } }
  provider: PortalProvider
}> {
  const session = await getServerSession(authOptions)

  if (!session) {
    throw Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
  }

  if (session.user.role !== 'PROVIDER') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  const provider = await getProviderForSession(session.user.id)

  if (!provider) {
    throw Object.assign(new Error('Provider account not found'), { code: 'NOT_FOUND' })
  }

  return { session, provider }
}
