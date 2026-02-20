import { prisma } from '@/lib/db'

interface AuditLogInput {
  userId: string
  action: string
  resource: string
  resourceId: string
  before?: unknown
  after?: unknown
  ipAddress?: string
  userAgent?: string
}

/**
 * Write an entry to the audit log.
 * REQ-017: All mutations must be logged.
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.coreAuditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      before: input.before ? JSON.parse(JSON.stringify(input.before)) : undefined,
      after: input.after ? JSON.parse(JSON.stringify(input.after)) : undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  })
}

/** Query audit logs for a specific resource */
export async function getAuditLogs(resource: string, resourceId: string) {
  return prisma.coreAuditLog.findMany({
    where: { resource, resourceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
