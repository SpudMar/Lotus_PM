/**
 * Role-Based Access Control for Lotus PM.
 * REQ-017: RBAC with full audit logging.
 * REQ-025: Director, Plan Manager, Assistant, Participant roles.
 */

export const ROLES = {
  DIRECTOR: 'DIRECTOR',
  PLAN_MANAGER: 'PLAN_MANAGER',
  ASSISTANT: 'ASSISTANT',
  PARTICIPANT: 'PARTICIPANT',
} as const

export type Role = typeof ROLES[keyof typeof ROLES]

/**
 * Permissions matrix — what each role can do.
 *
 * Role summary:
 * - Director (Global Admin): Full system access including staff/settings management.
 * - Plan Manager: Full authority over invoicing, claims, payments, client/provider
 *   reviews. Some PMs also handle banking (ABA generation, reconciliation).
 * - Assistant: Data entry for participants, providers, plans. Can see flagged items
 *   and add comments, but cannot approve flagged items — PM or Director must approve.
 */
const PERMISSIONS = {
  // Participants — Assistants can create/edit (data entry)
  'participants:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'participants:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'participants:delete': [ROLES.DIRECTOR],

  // Providers — Assistants can create/edit (data entry)
  'providers:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'providers:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Plans & budgets — Assistants can create/edit plans (plan entry)
  'plans:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'plans:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Invoices — Assistants can upload/edit, only PM+ can approve/reject
  'invoices:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:approve': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'invoices:reject': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Claims — Assistants can view; PM+ can create, submit, record outcomes
  'claims:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'claims:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'claims:submit': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'claims:outcome': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Banking — PM+ can view and manage; PM+ can generate ABA and reconcile
  'banking:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'banking:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'banking:generate': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Flagged items — Assistants can view and comment; PM+ can approve/resolve
  'flags:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'flags:comment': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'flags:approve': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Reports
  'reports:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'reports:financial': [ROLES.DIRECTOR],

  // Staff management (Director only)
  'staff:read': [ROLES.DIRECTOR],
  'staff:write': [ROLES.DIRECTOR],

  // System settings (Director only)
  'settings:read': [ROLES.DIRECTOR],
  'settings:write': [ROLES.DIRECTOR],

  // Comms logging (all internal staff)
  'comms:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'comms:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],

  // Automation rules (Director manages, Plan Manager views)
  'automation:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'automation:write': [ROLES.DIRECTOR],

  // Notifications — all staff can read their own; Director/PM can send
  'notifications:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'notifications:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'notifications:send': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Documents (all staff can read/write; Director can delete)
  'documents:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'documents:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'documents:delete': [ROLES.DIRECTOR],
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
