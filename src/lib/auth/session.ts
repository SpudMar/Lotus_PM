import { getServerSession } from 'next-auth'
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
