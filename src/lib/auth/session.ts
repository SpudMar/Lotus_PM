import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from './config'
import { hasPermission, type Permission, type Role } from './rbac'

export async function getSession() {
  return getServerSession(authOptions)
}

export async function requireSession() {
  const session = await getSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession()
  if (!hasPermission(session.user.role as Role, permission)) {
    throw new Error('Forbidden')
  }
  return session
}

export async function getParticipantScope(userId: string): Promise<string[]> {
  const assignments = await prisma.crmCoordinatorAssignment.findMany({
    where: { coordinatorId: userId, isActive: true },
    select: { participantId: true },
  })
  return assignments.map(a => a.participantId)
}
