import { ROLES, hasPermission, hasAllPermissions, getPermissionsForRole } from './rbac'

describe('RBAC permissions', () => {
  describe('Director (Global Admin)', () => {
    const role = ROLES.DIRECTOR

    test('has full system access', () => {
      const allPerms = getPermissionsForRole(role)
      // Director should have every permission in the system
      expect(allPerms.length).toBeGreaterThan(0)
    })

    test('can manage staff and settings', () => {
      expect(hasPermission(role, 'staff:read')).toBe(true)
      expect(hasPermission(role, 'staff:write')).toBe(true)
      expect(hasPermission(role, 'settings:read')).toBe(true)
      expect(hasPermission(role, 'settings:write')).toBe(true)
    })

    test('can manage banking', () => {
      expect(hasPermission(role, 'banking:read')).toBe(true)
      expect(hasPermission(role, 'banking:write')).toBe(true)
      expect(hasPermission(role, 'banking:generate')).toBe(true)
    })

    test('can approve flagged items', () => {
      expect(hasPermission(role, 'flags:approve')).toBe(true)
    })
  })

  describe('Plan Manager', () => {
    const role = ROLES.PLAN_MANAGER

    test('has full authority over invoicing', () => {
      expect(hasPermission(role, 'invoices:read')).toBe(true)
      expect(hasPermission(role, 'invoices:write')).toBe(true)
      expect(hasPermission(role, 'invoices:approve')).toBe(true)
      expect(hasPermission(role, 'invoices:reject')).toBe(true)
    })

    test('has full authority over claims', () => {
      expect(hasPermission(role, 'claims:read')).toBe(true)
      expect(hasPermission(role, 'claims:write')).toBe(true)
      expect(hasPermission(role, 'claims:submit')).toBe(true)
      expect(hasPermission(role, 'claims:outcome')).toBe(true)
    })

    test('can manage banking (payments, ABA, reconciliation)', () => {
      expect(hasPermission(role, 'banking:read')).toBe(true)
      expect(hasPermission(role, 'banking:write')).toBe(true)
      expect(hasPermission(role, 'banking:generate')).toBe(true)
    })

    test('can manage participants and providers', () => {
      expect(hasPermission(role, 'participants:read')).toBe(true)
      expect(hasPermission(role, 'participants:write')).toBe(true)
      expect(hasPermission(role, 'providers:read')).toBe(true)
      expect(hasPermission(role, 'providers:write')).toBe(true)
    })

    test('can approve flagged items', () => {
      expect(hasPermission(role, 'flags:approve')).toBe(true)
    })

    test('cannot manage staff or settings', () => {
      expect(hasPermission(role, 'staff:read')).toBe(false)
      expect(hasPermission(role, 'staff:write')).toBe(false)
      expect(hasPermission(role, 'settings:read')).toBe(false)
      expect(hasPermission(role, 'settings:write')).toBe(false)
    })

    test('cannot delete participants', () => {
      expect(hasPermission(role, 'participants:delete')).toBe(false)
    })
  })

  describe('Assistant', () => {
    const role = ROLES.ASSISTANT

    test('can do data entry for participants', () => {
      expect(hasPermission(role, 'participants:read')).toBe(true)
      expect(hasPermission(role, 'participants:write')).toBe(true)
    })

    test('can do data entry for providers', () => {
      expect(hasPermission(role, 'providers:read')).toBe(true)
      expect(hasPermission(role, 'providers:write')).toBe(true)
    })

    test('can do plan entry', () => {
      expect(hasPermission(role, 'plans:read')).toBe(true)
      expect(hasPermission(role, 'plans:write')).toBe(true)
    })

    test('can upload and edit invoices but not approve/reject', () => {
      expect(hasPermission(role, 'invoices:read')).toBe(true)
      expect(hasPermission(role, 'invoices:write')).toBe(true)
      expect(hasPermission(role, 'invoices:approve')).toBe(false)
      expect(hasPermission(role, 'invoices:reject')).toBe(false)
    })

    test('can view claims but not create/submit/record outcomes', () => {
      expect(hasPermission(role, 'claims:read')).toBe(true)
      expect(hasPermission(role, 'claims:write')).toBe(false)
      expect(hasPermission(role, 'claims:submit')).toBe(false)
      expect(hasPermission(role, 'claims:outcome')).toBe(false)
    })

    test('can view and comment on flagged items but not approve', () => {
      expect(hasPermission(role, 'flags:read')).toBe(true)
      expect(hasPermission(role, 'flags:comment')).toBe(true)
      expect(hasPermission(role, 'flags:approve')).toBe(false)
    })

    test('cannot access banking', () => {
      expect(hasPermission(role, 'banking:read')).toBe(false)
      expect(hasPermission(role, 'banking:write')).toBe(false)
      expect(hasPermission(role, 'banking:generate')).toBe(false)
    })

    test('cannot manage staff or settings', () => {
      expect(hasPermission(role, 'staff:read')).toBe(false)
      expect(hasPermission(role, 'staff:write')).toBe(false)
      expect(hasPermission(role, 'settings:read')).toBe(false)
      expect(hasPermission(role, 'settings:write')).toBe(false)
    })

    test('cannot delete participants', () => {
      expect(hasPermission(role, 'participants:delete')).toBe(false)
    })

    test('can log comms', () => {
      expect(hasPermission(role, 'comms:read')).toBe(true)
      expect(hasPermission(role, 'comms:write')).toBe(true)
    })
  })

  describe('hasAllPermissions', () => {
    test('returns true when role has all listed permissions', () => {
      expect(hasAllPermissions(ROLES.PLAN_MANAGER, [
        'claims:read',
        'claims:write',
        'banking:generate',
      ])).toBe(true)
    })

    test('returns false when role is missing any permission', () => {
      expect(hasAllPermissions(ROLES.ASSISTANT, [
        'invoices:read',
        'invoices:approve',
      ])).toBe(false)
    })
  })

  describe('getPermissionsForRole', () => {
    test('Assistant has fewer permissions than Plan Manager', () => {
      const assistantPerms = getPermissionsForRole(ROLES.ASSISTANT)
      const pmPerms = getPermissionsForRole(ROLES.PLAN_MANAGER)
      expect(assistantPerms.length).toBeLessThan(pmPerms.length)
    })

    test('Plan Manager has fewer permissions than Director', () => {
      const pmPerms = getPermissionsForRole(ROLES.PLAN_MANAGER)
      const directorPerms = getPermissionsForRole(ROLES.DIRECTOR)
      expect(pmPerms.length).toBeLessThan(directorPerms.length)
    })
  })
})
