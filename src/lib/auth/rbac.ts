/**
 * Role-Based Access Control for Lotus PM.
 * REQ-017: RBAC with full audit logging.
 * REQ-025: Global Admin, Plan Manager, Assistant, Participant roles.
 */

export const ROLES = {
  GLOBAL_ADMIN: 'GLOBAL_ADMIN',
  PLAN_MANAGER: 'PLAN_MANAGER',
  ASSISTANT: 'ASSISTANT',
  PARTICIPANT: 'PARTICIPANT',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]

/**
 * Permissions matrix — what each role can do.
 *
 * Role summary:
 * - Global Admin: Everything a PM can do PLUS staff/user management. Acts as PM
 *   when needed (e.g. covering leave). The only extra privileges are staff:read/write.
 * - Plan Manager: The primary daily user. Full operational authority over all plan
 *   management tasks — invoicing, claims, payments, banking, reports, documents,
 *   automation, Xero, notifications. No restrictions on any operational feature.
 * - Assistant: Data entry for participants, providers, plans. Can see flagged items
 *   and add comments, but cannot approve flagged items — PM or Global Admin must approve.
 */
const PERMISSIONS = {
  // Participants — Assistants can create/edit (data entry); PM+ can soft-delete
  'participants:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'participants:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'participants:delete': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Providers — Assistants can create/edit (data entry)
  'providers:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'providers:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Plans & budgets — Assistants can create/edit plans (plan entry)
  'plans:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'plans:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Invoices — Assistants can upload/edit, only PM+ can approve/reject
  'invoices:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:approve': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'invoices:reject': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Claims — Assistants can view; PM+ can create, submit, record outcomes
  'claims:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'claims:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'claims:submit': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'claims:outcome': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Banking — PM+ can view, manage, generate ABA files, reconcile
  'banking:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'banking:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'banking:generate': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Flagged items — Assistants can view and comment; PM+ can approve/resolve
  'flags:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'flags:comment': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'flags:approve': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Reports — PM+ can see all reports including financial
  'reports:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'reports:financial': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Staff/user management (Global Admin only — the ONLY admin-exclusive permission)
  'staff:read': [ROLES.GLOBAL_ADMIN],
  'staff:write': [ROLES.GLOBAL_ADMIN],

  // System settings — PM+ can access (e.g. Xero config)
  'settings:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'settings:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Comms logging (all internal staff)
  'comms:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'comms:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Automation rules — PM+ can create, edit, test, manage
  'automation:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'automation:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Notifications — all staff can read their own; PM+ can send
  'notifications:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'notifications:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'notifications:send': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Documents — all staff can read; PM+ can upload/create and delete
  'documents:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'documents:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'documents:delete': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],

  // Xero integration — PM+ can connect, disconnect, sync (REQ-019/REQ-023)
  'xero:read': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'xero:write': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
  'xero:sync': [ROLES.GLOBAL_ADMIN, ROLES.PLAN_MANAGER],
} as const

export type Permission = keyof typeof PERMISSIONS

/** Check if a role has a specific permission */
export function hasPermission(role: Role, permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[]
  return allowed.includes(role)
}

/** Check if a role has ALL of the given permissions */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p))
}

/** Get all permissions for a role */
export function getPermissionsForRole(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter(p =>
    hasPermission(role, p)
  )
}
