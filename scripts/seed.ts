/**
 * Database seed script for Lotus PM development.
 * Run with: npm run db:seed
 *
 * Creates test users, participants, providers, plans, and invoices.
 * All data is fictional — no real PII.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('Seeding database...')

  // ── Users ──────────────────────────────────
  const director = await prisma.coreUser.upsert({
    where: { email: 'director@lotusassist.com.au' },
    update: {},
    create: {
      email: 'director@lotusassist.com.au',
      name: 'Sarah Mitchell',
      role: 'DIRECTOR',
      isActive: true,
    },
  })

  const planManager = await prisma.coreUser.upsert({
    where: { email: 'pm@lotusassist.com.au' },
    update: {},
    create: {
      email: 'pm@lotusassist.com.au',
      name: 'James Walker',
      role: 'PLAN_MANAGER',
      isActive: true,
    },
  })

  const assistant = await prisma.coreUser.upsert({
    where: { email: 'assistant@lotusassist.com.au' },
    update: {},
    create: {
      email: 'assistant@lotusassist.com.au',
      name: 'Emily Chen',
      role: 'ASSISTANT',
      isActive: true,
    },
  })

  console.log(`Created users: ${director.name}, ${planManager.name}, ${assistant.name}`)

  // ── Providers ──────────────────────────────
  const providers = await Promise.all([
    prisma.crmProvider.upsert({
      where: { abn: '51824753556' },
      update: {},
      create: {
        name: 'Sunrise Support Services',
        abn: '51824753556',
        email: 'accounts@sunrisesupport.com.au',
        phone: '02 9555 1234',
        address: '42 George Street, Sydney NSW 2000',
        ndisRegistered: true,
        registrationNo: 'NDIS-REG-001',
        bankBsb: '062000',
        bankAccount: '12345678',
        bankAccountName: 'Sunrise Support Services',
      },
    }),
    prisma.crmProvider.upsert({
      where: { abn: '33102417032' },
      update: {},
      create: {
        name: 'Blue Mountains Allied Health',
        abn: '33102417032',
        email: 'billing@bmah.com.au',
        phone: '02 4782 1111',
        address: '15 Station Street, Katoomba NSW 2780',
        ndisRegistered: true,
        registrationNo: 'NDIS-REG-002',
        bankBsb: '062001',
        bankAccount: '87654321',
        bankAccountName: 'BMAH PTY LTD',
      },
    }),
    prisma.crmProvider.upsert({
      where: { abn: '29002471932' },
      update: {},
      create: {
        name: 'Metro Transport Solutions',
        abn: '29002471932',
        email: 'invoices@metrotransport.com.au',
        phone: '1300 555 789',
        ndisRegistered: false,
        bankBsb: '032000',
        bankAccount: '11223344',
        bankAccountName: 'Metro Transport Pty Ltd',
      },
    }),
  ])

  console.log(`Created ${providers.length} providers`)

  // ── Participants ───────────────────────────
  const participants = await Promise.all([
    prisma.crmParticipant.upsert({
      where: { ndisNumber: '430123456' },
      update: {},
      create: {
        ndisNumber: '430123456',
        firstName: 'Michael',
        lastName: 'Thompson',
        dateOfBirth: new Date('1985-03-15'),
        email: 'michael.t@email.com',
        phone: '0412 345 678',
        address: '10 Park Avenue',
        suburb: 'Parramatta',
        state: 'NSW',
        postcode: '2150',
        assignedToId: planManager.id,
        emergencyContactName: 'Lisa Thompson',
        emergencyContactPhone: '0498 765 432',
        emergencyContactRel: 'Spouse',
      },
    }),
    prisma.crmParticipant.upsert({
      where: { ndisNumber: '430789012' },
      update: {},
      create: {
        ndisNumber: '430789012',
        firstName: 'Jessica',
        lastName: 'Nguyen',
        dateOfBirth: new Date('1992-07-22'),
        email: 'jess.nguyen@email.com',
        phone: '0423 456 789',
        address: '55 Market Street',
        suburb: 'Wollongong',
        state: 'NSW',
        postcode: '2500',
        assignedToId: planManager.id,
      },
    }),
    prisma.crmParticipant.upsert({
      where: { ndisNumber: '430345678' },
      update: {},
      create: {
        ndisNumber: '430345678',
        firstName: 'David',
        lastName: 'O\'Brien',
        dateOfBirth: new Date('1978-11-03'),
        phone: '0434 567 890',
        address: '78 High Street',
        suburb: 'Penrith',
        state: 'NSW',
        postcode: '2750',
        assignedToId: director.id,
      },
    }),
  ])

  console.log(`Created ${participants.length} participants`)

  // ── Plans ──────────────────────────────────
  const plan1 = await prisma.planPlan.create({
    data: {
      participantId: participants[0]!.id,
      startDate: new Date('2025-07-01'),
      endDate: new Date('2026-06-30'),
      reviewDate: new Date('2026-05-01'),
      status: 'ACTIVE',
      budgetLines: {
        create: [
          { categoryCode: '01', categoryName: 'Daily Activities', allocatedCents: 5000000, spentCents: 1250000 },
          { categoryCode: '04', categoryName: 'Social & Community Participation', allocatedCents: 2000000, spentCents: 800000 },
          { categoryCode: '07', categoryName: 'Support Coordination', allocatedCents: 1500000, spentCents: 375000 },
          { categoryCode: '14', categoryName: 'Improved Daily Living', allocatedCents: 3000000, spentCents: 600000 },
        ],
      },
    },
  })

  const plan2 = await prisma.planPlan.create({
    data: {
      participantId: participants[1]!.id,
      startDate: new Date('2025-10-01'),
      endDate: new Date('2026-09-30'),
      status: 'ACTIVE',
      budgetLines: {
        create: [
          { categoryCode: '01', categoryName: 'Daily Activities', allocatedCents: 3000000 },
          { categoryCode: '02', categoryName: 'Transport', allocatedCents: 500000 },
          { categoryCode: '11', categoryName: 'Health & Wellbeing', allocatedCents: 2000000 },
        ],
      },
    },
  })

  console.log(`Created plans for ${participants[0]!.firstName} and ${participants[1]!.firstName}`)

  // ── Invoices ───────────────────────────────
  const budgetLines = await prisma.planBudgetLine.findMany({ where: { planId: plan1.id } })
  const dailyBudget = budgetLines.find(b => b.categoryCode === '01')

  await prisma.invInvoice.createMany({
    data: [
      {
        participantId: participants[0]!.id,
        providerId: providers[0]!.id,
        planId: plan1.id,
        invoiceNumber: 'INV-2026-001',
        invoiceDate: new Date('2026-02-01'),
        subtotalCents: 125000,
        gstCents: 0,
        totalCents: 125000,
        status: 'APPROVED',
        approvedById: planManager.id,
        approvedAt: new Date('2026-02-03'),
      },
      {
        participantId: participants[0]!.id,
        providerId: providers[1]!.id,
        planId: plan1.id,
        invoiceNumber: 'INV-2026-002',
        invoiceDate: new Date('2026-02-10'),
        subtotalCents: 85000,
        gstCents: 0,
        totalCents: 85000,
        status: 'PENDING_REVIEW',
      },
      {
        participantId: participants[1]!.id,
        providerId: providers[0]!.id,
        planId: plan2.id,
        invoiceNumber: 'INV-2026-003',
        invoiceDate: new Date('2026-02-15'),
        subtotalCents: 220000,
        gstCents: 22000,
        totalCents: 242000,
        status: 'RECEIVED',
      },
      {
        participantId: participants[0]!.id,
        providerId: providers[2]!.id,
        invoiceNumber: 'INV-2026-004',
        invoiceDate: new Date('2026-02-18'),
        subtotalCents: 45000,
        gstCents: 4500,
        totalCents: 49500,
        status: 'REJECTED',
        rejectedById: director.id,
        rejectedAt: new Date('2026-02-19'),
        rejectionReason: 'Provider not NDIS registered. Transport needs pre-approval.',
      },
    ],
  })

  console.log('Created 4 sample invoices')

  // ── Comm Logs ──────────────────────────────
  await prisma.crmCommLog.createMany({
    data: [
      {
        type: 'PHONE',
        direction: 'INBOUND',
        subject: 'Plan review enquiry',
        body: 'Michael called to ask about his upcoming plan review date. Advised it is scheduled for 1 May 2026.',
        participantId: participants[0]!.id,
        userId: planManager.id,
      },
      {
        type: 'EMAIL',
        direction: 'OUTBOUND',
        subject: 'Invoice received confirmation',
        body: 'Sent confirmation to Sunrise Support that their invoice INV-2026-001 has been received and is being processed.',
        providerId: providers[0]!.id,
        userId: assistant.id,
      },
      {
        type: 'NOTE',
        direction: 'INTERNAL',
        subject: 'Transport provider issue',
        body: 'Metro Transport is not NDIS registered. Need to discuss with participant about alternative transport providers.',
        participantId: participants[0]!.id,
        userId: director.id,
      },
    ],
  })

  console.log('Created 3 communication logs')

  // ── Audit Log ──────────────────────────────
  await prisma.coreAuditLog.create({
    data: {
      userId: director.id,
      action: 'system.seeded',
      resource: 'system',
      resourceId: 'seed',
      after: { seedDate: new Date().toISOString() },
    },
  })

  console.log('\nSeed complete!')
  console.log('─────────────────────────────────')
  console.log('Login credentials (dev mode):')
  console.log('  Director:     director@lotusassist.com.au')
  console.log('  Plan Manager: pm@lotusassist.com.au')
  console.log('  Assistant:    assistant@lotusassist.com.au')
  console.log('  Password:     any (dev mode accepts any password)')
  console.log('─────────────────────────────────')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
