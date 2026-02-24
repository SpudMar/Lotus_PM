/**
 * GET  /api/provider-portal/profile — get own provider profile
 * PATCH /api/provider-portal/profile — update contact/bank details
 *
 * Non-editable fields (read-only): abn, abnRegisteredName, gstRegistered, providerStatus
 * Editable fields: name, phone, address, bankBsb, bankAccount, bankAccountName
 * Email changes are not allowed here (email is the login identifier).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireProviderSession } from '@/lib/modules/crm/provider-session'
import { createAuditLog } from '@/lib/modules/core/audit'

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  bankBsb: z.string().regex(/^\d{3}-\d{3}$|^\d{6}$/, 'BSB must be 6 digits (xxx-xxx)').nullable().optional(),
  bankAccount: z.string().max(20).nullable().optional(),
  bankAccountName: z.string().max(100).nullable().optional(),
})

export async function GET(): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireProviderSession>>['session']
  let provider: Awaited<ReturnType<typeof requireProviderSession>>['provider']

  try {
    const result = await requireProviderSession()
    session = result.session
    provider = result.provider
  } catch (err) {
    const error = err as { code?: string; message: string }
    if (error.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Provider account not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  void session

  return NextResponse.json({ provider })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireProviderSession>>['session']
  let provider: Awaited<ReturnType<typeof requireProviderSession>>['provider']

  try {
    const result = await requireProviderSession()
    session = result.session
    provider = result.provider
  } catch (err) {
    const error = err as { code?: string; message: string }
    if (error.code === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    if (error.code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
    }
    return NextResponse.json(
      { error: 'Provider account not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid input', code: 'INVALID_INPUT' },
      { status: 400 }
    )
  }

  const updates = parsed.data
  const before = {
    name: provider.name,
    phone: provider.phone,
    address: provider.address,
    bankBsb: provider.bankBsb,
    bankAccount: provider.bankAccount,
    bankAccountName: provider.bankAccountName,
  }

  const updated = await prisma.crmProvider.update({
    where: { id: provider.id },
    data: {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.phone !== undefined && { phone: updates.phone }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.bankBsb !== undefined && { bankBsb: updates.bankBsb }),
      ...(updates.bankAccount !== undefined && { bankAccount: updates.bankAccount }),
      ...(updates.bankAccountName !== undefined && { bankAccountName: updates.bankAccountName }),
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

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resource: 'CrmProvider',
    resourceId: provider.id,
    before,
    after: updates,
  })

  return NextResponse.json({ provider: updated })
}
