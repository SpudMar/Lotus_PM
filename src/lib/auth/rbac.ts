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

/** Permissions matrix — what each role can do */
const PERMISSIONS = {
  // Participants
  'participants:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'participants:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'participants:delete': [ROLES.DIRECTOR],

  // Providers
  'providers:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'providers:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Plans & budgets
  'plans:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'plans:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Invoices
  'invoices:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER, ROLES.ASSISTANT],
  'invoices:approve': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'invoices:reject': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Claims
  'claims:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'claims:write': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'claims:submit': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'claims:outcome': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],

  // Banking
  'banking:read': [ROLES.DIRECTOR, ROLES.PLAN_MANAGER],
  'banking:write': [ROLES.DIRECTOR],
  'banking:generate': [ROLES.DIRECTOR],

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
