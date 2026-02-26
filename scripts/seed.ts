/**
 * Comprehensive sandbox seed for Lotus PM — all modules populated.
 * Run with: npm run db:seed
 *
 * Idempotent: safe to run multiple times.
 * All financial amounts in cents (Int) — never floats.
 * Fictional Australian data only — no real PII.
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Well-known ID for the system service account.
 * Mirrors the constant in src/lib/modules/invoices/email-ingest.ts.
 */
const SYSTEM_USER_ID = 'clsystem0000000000000001'

async function findOrCreateInvoice(
  data: Parameters<typeof prisma.invInvoice.create>[0]['data'],
): Promise<Prisma.InvInvoiceGetPayload<object>> {
  const existing = await prisma.invInvoice.findFirst({
    where: { invoiceNumber: data.invoiceNumber as string },
  })
  if (existing) return existing
  return prisma.invInvoice.create({ data })
}

async function main(): Promise<void> {
  console.log('🌱 Seeding Lotus PM sandbox database...')

  // ─── INNER HELPERS ───────────────────────────────────────────────────────
  type InvStatusString = 'RECEIVED' | 'PROCESSING' | 'PENDING_REVIEW' | 'PENDING_PARTICIPANT_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CLAIMED' | 'PAID'
  type InvHoldCategoryString = 'MISSING_NDIS_CODES' | 'INCORRECT_AMOUNT' | 'DUPLICATE_INVOICE' | 'PROVIDER_NOT_APPROVED' | 'BUDGET_EXCEEDED' | 'AWAITING_PARTICIPANT_APPROVAL' | 'AWAITING_PROVIDER_CORRECTION' | 'PLAN_BUDGET_EXCEEDED' | 'SYSTEM_HOLD' | 'OTHER'

  async function addStatusHistory(
    invoiceId: string,
    transitions: Array<{
      from?: string | null
      to: string
      at: Date
      durationMs?: number
      holdCategory?: string
      changedBy?: string
    }>,
  ): Promise<void> {
    for (const t of transitions) {
      await prisma.invStatusHistory.create({
        data: {
          invoiceId,
          fromStatus: (t.from ?? null) as InvStatusString | null,
          toStatus: t.to as InvStatusString,
          changedAt: t.at,
          changedBy: t.changedBy ?? null,
          holdCategory: (t.holdCategory ?? null) as InvHoldCategoryString | null,
          durationMs: t.durationMs ?? null,
        },
      })
    }
  }

  // ─── 1. USERS ─────────────────────────────────────────────────────────────
  console.log('  Creating users...')

  const director = await prisma.coreUser.upsert({
    where: { email: 'director@lotusassist.com.au' },
    update: {},
    create: {
      email: 'director@lotusassist.com.au',
      name: 'Nicole Marsh',
      role: 'GLOBAL_ADMIN',
      phone: '+61411941699',
      isActive: true,
      mfaEnabled: true,
    },
  })

  const planManager = await prisma.coreUser.upsert({
    where: { email: 'pm@lotusassist.com.au' },
    update: {},
    create: {
      email: 'pm@lotusassist.com.au',
      name: 'Sarah Chen',
      role: 'PLAN_MANAGER',
      phone: '+61422111222',
      isActive: true,
      mfaEnabled: false,
    },
  })

  const pm2 = await prisma.coreUser.upsert({
    where: { email: 'pm2@lotusassist.com.au' },
    update: {},
    create: {
      email: 'pm2@lotusassist.com.au',
      name: 'James Okafor',
      role: 'PLAN_MANAGER',
      phone: '+61433222333',
      isActive: true,
      mfaEnabled: false,
    },
  })

  const assistant = await prisma.coreUser.upsert({
    where: { email: 'assistant@lotusassist.com.au' },
    update: {},
    create: {
      email: 'assistant@lotusassist.com.au',
      name: 'Priya Nair',
      role: 'ASSISTANT',
      phone: '+61444333444',
      isActive: true,
      mfaEnabled: false,
    },
  })

  const coordinator = await prisma.coreUser.upsert({
    where: { email: 'coordinator@carepath.com.au' },
    update: {},
    create: {
      email: 'coordinator@carepath.com.au',
      name: 'David Tran',
      role: 'SUPPORT_COORDINATOR',
      phone: '+61455444555',
      isActive: true,
      mfaEnabled: false,
    },
  })

  const providerUser = await prisma.coreUser.upsert({
    where: { email: 'portal@sunrisetherapy.com.au' },
    update: {},
    create: {
      email: 'portal@sunrisetherapy.com.au',
      name: 'Sunrise Therapy Portal',
      role: 'PROVIDER',
      isActive: true,
      mfaEnabled: false,
    },
  })

  console.log('  ✓ 6 users created')

  // ─── 2. PROVIDERS ─────────────────────────────────────────────────────────
  console.log('  Creating providers...')

  const prov1 = await prisma.crmProvider.upsert({
    where: { abn: '12345678901' },
    update: {},
    create: {
      name: 'Sunrise Therapy Services',
      abn: '12345678901',
      email: 'accounts@sunrisetherapy.com.au',
      phone: '0298887700',
      address: '42 Pitt Street, Sydney NSW 2000',
      ndisRegistered: true,
      registrationNo: 'NDI4010001',
      bankBsb: '062000',
      bankAccount: '12345678',
      bankAccountName: 'Sunrise Therapy Services',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'Sunrise Therapy Services Pty Ltd',
      gstRegistered: true,
      portalUserId: providerUser.id,
    },
  })

  const prov2 = await prisma.crmProvider.upsert({
    where: { abn: '23456789012' },
    update: {},
    create: {
      name: 'Allied Health Partners',
      abn: '23456789012',
      email: 'invoices@alliedhealthpartners.com.au',
      phone: '0392223300',
      address: '18 Collins Street, Melbourne VIC 3000',
      ndisRegistered: true,
      registrationNo: 'NDI4020002',
      bankBsb: '033000',
      bankAccount: '23456789',
      bankAccountName: 'Allied Health Partners Pty Ltd',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'Allied Health Partners Pty Ltd',
      gstRegistered: true,
    },
  })

  const prov3 = await prisma.crmProvider.upsert({
    where: { abn: '34567890123' },
    update: {},
    create: {
      name: 'CareConnect Support Services',
      abn: '34567890123',
      email: 'billing@careconnect.com.au',
      phone: '0731112200',
      address: '55 Queen Street, Brisbane QLD 4000',
      ndisRegistered: true,
      registrationNo: 'NDI4030003',
      bankBsb: '124000',
      bankAccount: '34567890',
      bankAccountName: 'CareConnect Support Services',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'CareConnect Support Services Pty Ltd',
      gstRegistered: false,
    },
  })

  const prov4 = await prisma.crmProvider.upsert({
    where: { abn: '45678901234' },
    update: {},
    create: {
      name: 'Ability Plus OT',
      abn: '45678901234',
      email: 'admin@abilityplus.com.au',
      phone: '0894445500',
      address: '7 St Georges Terrace, Perth WA 6000',
      ndisRegistered: true,
      registrationNo: 'NDI4040004',
      bankBsb: '016000',
      bankAccount: '45678901',
      bankAccountName: 'Ability Plus Occupational Therapy',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'Ability Plus OT Pty Ltd',
      gstRegistered: true,
    },
  })

  const prov5 = await prisma.crmProvider.upsert({
    where: { abn: '56789012345' },
    update: {},
    create: {
      name: 'HorizonCare SIL',
      abn: '56789012345',
      email: 'accounts@horizoncaresil.com.au',
      phone: '0265556600',
      address: '120 Hunter Street, Newcastle NSW 2300',
      ndisRegistered: true,
      registrationNo: 'NDI4050005',
      bankBsb: '062100',
      bankAccount: '56789012',
      bankAccountName: 'HorizonCare SIL Pty Ltd',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'HorizonCare SIL Pty Ltd',
      gstRegistered: true,
    },
  })

  const prov6 = await prisma.crmProvider.upsert({
    where: { abn: '67890123456' },
    update: {},
    create: {
      name: 'Pathways Psychology',
      abn: '67890123456',
      email: 'billing@pathwayspsych.com.au',
      phone: '0356667700',
      address: '3 Exhibition Street, Melbourne VIC 3000',
      ndisRegistered: true,
      registrationNo: 'NDI4060006',
      bankBsb: '033100',
      bankAccount: '67890123',
      bankAccountName: 'Pathways Psychology Pty Ltd',
      providerStatus: 'ACTIVE',
      abnStatus: 'Active',
      abnRegisteredName: 'Pathways Psychology Pty Ltd',
      gstRegistered: true,
    },
  })

  const prov7 = await prisma.crmProvider.upsert({
    where: { abn: '78901234567' },
    update: {},
    create: {
      name: 'Fresh Start Support',
      abn: '78901234567',
      email: 'info@freshstartsupport.com.au',
      phone: '0278889900',
      address: '88 George Street, Parramatta NSW 2150',
      ndisRegistered: false,
      providerStatus: 'DRAFT',
      abnStatus: 'Active',
      gstRegistered: false,
    },
  })

  const prov8 = await prisma.crmProvider.upsert({
    where: { abn: '89012345678' },
    update: {},
    create: {
      name: 'BlueSky Community Care',
      abn: '89012345678',
      email: 'portal@blueskycare.com.au',
      phone: '0745550011',
      address: '200 Ann Street, Brisbane QLD 4000',
      ndisRegistered: true,
      providerStatus: 'INVITED',
      inviteToken: 'inv_bluesky_2026_token_abc123',
      inviteExpiresAt: new Date('2026-03-15'),
      abnStatus: 'Active',
      gstRegistered: true,
    },
  })

  const prov9 = await prisma.crmProvider.upsert({
    where: { abn: '90123456789' },
    update: {},
    create: {
      name: 'Steadfast Support Workers',
      abn: '90123456789',
      email: 'admin@steadfastsupport.com.au',
      phone: '0812223300',
      address: '45 Terrace Road, Perth WA 6004',
      ndisRegistered: true,
      registrationNo: 'NDI4090009',
      providerStatus: 'PENDING_APPROVAL',
      abnStatus: 'Active',
      gstRegistered: false,
    },
  })

  const prov10 = await prisma.crmProvider.upsert({
    where: { abn: '01234567890' },
    update: {},
    create: {
      name: 'Nexus Disability Services',
      abn: '01234567890',
      email: 'accounts@nexusdisability.com.au',
      phone: '0299998877',
      address: '1 Macquarie Street, Sydney NSW 2000',
      ndisRegistered: true,
      registrationNo: 'NDI4100010',
      bankBsb: '062200',
      bankAccount: '01234567',
      bankAccountName: 'Nexus Disability Services',
      providerStatus: 'SUSPENDED',
      abnStatus: 'Active',
      gstRegistered: true,
    },
  })

  // Provider emails for auto-matching
  const providerEmailsData = [
    { providerId: prov1.id, email: 'accounts@sunrisetherapy.com.au', isVerified: true },
    { providerId: prov1.id, email: 'invoices@sunrisetherapy.com.au', isVerified: true },
    { providerId: prov1.id, email: 'reception@sunrisetherapy.com.au', isVerified: false },
    { providerId: prov2.id, email: 'invoices@alliedhealthpartners.com.au', isVerified: true },
    { providerId: prov2.id, email: 'admin@alliedhealthpartners.com.au', isVerified: true },
    { providerId: prov2.id, email: 'billing@alliedhealthpartners.com.au', isVerified: false },
    { providerId: prov3.id, email: 'billing@careconnect.com.au', isVerified: true },
    { providerId: prov3.id, email: 'accounts@careconnect.com.au', isVerified: true },
    { providerId: prov3.id, email: 'support@careconnect.com.au', isVerified: false },
    { providerId: prov4.id, email: 'admin@abilityplus.com.au', isVerified: true },
    { providerId: prov4.id, email: 'invoices@abilityplus.com.au', isVerified: false },
    { providerId: prov5.id, email: 'accounts@horizoncaresil.com.au', isVerified: true },
    { providerId: prov5.id, email: 'finance@horizoncaresil.com.au', isVerified: true },
    { providerId: prov6.id, email: 'billing@pathwayspsych.com.au', isVerified: true },
    { providerId: prov6.id, email: 'admin@pathwayspsych.com.au', isVerified: false },
  ]

  for (const pe of providerEmailsData) {
    await prisma.crmProviderEmail.upsert({
      where: { email: pe.email },
      update: {},
      create: pe,
    })
  }

  console.log('  ✓ 10 providers + 15 provider emails created')

  // ─── 3. PARTICIPANTS ──────────────────────────────────────────────────────
  console.log('  Creating participants...')

  const p1 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000001' },
    update: {},
    create: {
      ndisNumber: '430000001',
      firstName: 'Oliver',
      lastName: 'Bennett',
      dateOfBirth: new Date('1985-03-15'),
      email: 'oliver.bennett@email.com.au',
      phone: '+61411100001',
      address: '12 Wattle Street',
      suburb: 'Ultimo',
      state: 'NSW',
      postcode: '2007',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Spinal cord injury — T4 complete',
      disabilityCategory: 'Physical',
      ndisRegistrationDate: new Date('2021-06-01'),
      emergencyContactName: 'Helen Bennett',
      emergencyContactPhone: '+61411100099',
      emergencyContactRel: 'Mother',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p2 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000002' },
    update: {},
    create: {
      ndisNumber: '430000002',
      firstName: 'Amara',
      lastName: 'Osei',
      dateOfBirth: new Date('1992-07-22'),
      email: 'amara.osei@hotmail.com',
      phone: '+61422200002',
      address: '7 Acacia Avenue',
      suburb: 'Chermside',
      state: 'QLD',
      postcode: '4032',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: 'EMAIL',
      gender: 'Female',
      disability: 'Autism Spectrum Disorder — Level 2',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2022-01-15'),
      emergencyContactName: 'Kofi Osei',
      emergencyContactPhone: '+61422200099',
      emergencyContactRel: 'Father',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p3 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000003' },
    update: {},
    create: {
      ndisNumber: '430000003',
      firstName: 'Liam',
      lastName: 'Fitzgerald',
      dateOfBirth: new Date('1978-11-08'),
      email: 'liam.fitz@gmail.com',
      phone: '+61433300003',
      address: '33 Elm Court',
      suburb: 'Fitzroy',
      state: 'VIC',
      postcode: '3065',
      assignedToId: pm2.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'MANUAL',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Acquired Brain Injury',
      disabilityCategory: 'Neurological',
      ndisRegistrationDate: new Date('2020-09-10'),
      emergencyContactName: 'Caitlin Fitzgerald',
      emergencyContactPhone: '+61433300099',
      emergencyContactRel: 'Spouse',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p4 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000004' },
    update: {},
    create: {
      ndisNumber: '430000004',
      firstName: 'Sophie',
      lastName: 'Nguyen',
      dateOfBirth: new Date('2001-04-30'),
      email: 'sophie.nguyen@outlook.com',
      phone: '+61444400004',
      address: '91 Kurrajong Road',
      suburb: 'Campbelltown',
      state: 'NSW',
      postcode: '2560',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: 'SMS',
      gender: 'Female',
      disability: 'Intellectual disability — Mild',
      disabilityCategory: 'Intellectual',
      ndisRegistrationDate: new Date('2023-02-20'),
      emergencyContactName: 'Minh Nguyen',
      emergencyContactPhone: '+61444400099',
      emergencyContactRel: 'Parent',
      statementFrequency: 'FORTNIGHTLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p5 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000005' },
    update: {},
    create: {
      ndisNumber: '430000005',
      firstName: 'Marcus',
      lastName: 'Hartley',
      dateOfBirth: new Date('1968-09-14'),
      email: 'marcus.hartley@bigpond.com',
      phone: '+61455500005',
      address: '4 Banksia Drive',
      suburb: 'Ballina',
      state: 'NSW',
      postcode: '2478',
      assignedToId: pm2.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'MANUAL',
      pricingRegion: 'REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Cerebral palsy — spastic diplegia',
      disabilityCategory: 'Physical',
      ndisRegistrationDate: new Date('2019-07-01'),
      emergencyContactName: 'Jill Hartley',
      emergencyContactPhone: '+61455500099',
      emergencyContactRel: 'Spouse',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'MAIL',
    },
  })

  const p6 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000006' },
    update: {},
    create: {
      ndisNumber: '430000006',
      firstName: 'Zara',
      lastName: 'Patel',
      dateOfBirth: new Date('1995-12-05'),
      email: 'zara.patel@gmail.com',
      phone: '+61466600006',
      address: '15 Jacaranda Place',
      suburb: 'Mount Gravatt',
      state: 'QLD',
      postcode: '4122',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Female',
      disability: 'Multiple sclerosis',
      disabilityCategory: 'Neurological',
      ndisRegistrationDate: new Date('2022-11-01'),
      emergencyContactName: 'Raj Patel',
      emergencyContactPhone: '+61466600099',
      emergencyContactRel: 'Father',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p7 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000007' },
    update: {},
    create: {
      ndisNumber: '430000007',
      firstName: 'Ethan',
      lastName: 'Kowalski',
      dateOfBirth: new Date('2005-02-18'),
      email: 'ethan.kowalski@icloud.com',
      phone: '+61477700007',
      address: '22 Eucalyptus Street',
      suburb: 'Dandenong',
      state: 'VIC',
      postcode: '3175',
      assignedToId: pm2.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Down syndrome',
      disabilityCategory: 'Intellectual',
      ndisRegistrationDate: new Date('2023-05-10'),
      emergencyContactName: 'Anna Kowalski',
      emergencyContactPhone: '+61477700099',
      emergencyContactRel: 'Mother',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p8 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000008' },
    update: {},
    create: {
      ndisNumber: '430000008',
      firstName: 'Isabel',
      lastName: 'Crawford',
      dateOfBirth: new Date('1989-06-27'),
      email: 'isabel.crawford@yahoo.com.au',
      phone: '+61488800008',
      address: '8 Wisteria Lane',
      suburb: 'Toowoomba',
      state: 'QLD',
      postcode: '4350',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'MANUAL',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Female',
      disability: 'PTSD and chronic anxiety',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2021-03-15'),
      emergencyContactName: 'Tom Crawford',
      emergencyContactPhone: '+61488800099',
      emergencyContactRel: 'Spouse',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p9 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000009' },
    update: {},
    create: {
      ndisNumber: '430000009',
      firstName: 'Noah',
      lastName: 'Andersen',
      dateOfBirth: new Date('1975-08-03'),
      email: 'noah.andersen@gmail.com',
      phone: '+61499900009',
      address: '55 Ironbark Close',
      suburb: 'Penrith',
      state: 'NSW',
      postcode: '2750',
      assignedToId: pm2.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Schizophrenia — treatment resistant',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2020-04-01'),
      emergencyContactName: 'Lars Andersen',
      emergencyContactPhone: '+61499900099',
      emergencyContactRel: 'Brother',
      statementFrequency: 'NONE',
      statementDelivery: 'EMAIL',
    },
  })

  const p10 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000010' },
    update: {},
    create: {
      ndisNumber: '430000010',
      firstName: 'Fatima',
      lastName: 'Hassan',
      dateOfBirth: new Date('2010-01-20'),
      email: 'fatima.family@gmail.com',
      phone: '+61400100010',
      address: '19 Rosewood Street',
      suburb: 'Auburn',
      state: 'NSW',
      postcode: '2144',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Female',
      disability: 'Autism Spectrum Disorder — Level 3',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2023-08-01'),
      emergencyContactName: 'Ahmed Hassan',
      emergencyContactPhone: '+61400100099',
      emergencyContactRel: 'Father',
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p11 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000011' },
    update: {},
    create: {
      ndisNumber: '430000011',
      firstName: 'Connor',
      lastName: 'Walsh',
      dateOfBirth: new Date('1983-05-11'),
      email: 'connor.walsh@gmail.com',
      phone: '+61400200011',
      address: '77 Grevillea Road',
      suburb: 'Epping',
      state: 'NSW',
      postcode: '2121',
      assignedToId: pm2.id,
      onboardingStatus: 'PENDING_PLAN',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Traumatic brain injury',
      disabilityCategory: 'Neurological',
      ndisRegistrationDate: new Date('2024-01-10'),
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p12 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000012' },
    update: {},
    create: {
      ndisNumber: '430000012',
      firstName: 'Grace',
      lastName: 'Yamamoto',
      dateOfBirth: new Date('1997-10-16'),
      email: 'grace.yamamoto@outlook.com',
      phone: '+61400300012',
      address: '6 Hakea Court',
      suburb: 'Sunshine',
      state: 'VIC',
      postcode: '3020',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'MANUAL',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: 'APP',
      gender: 'Female',
      disability: 'Rheumatoid arthritis — severe',
      disabilityCategory: 'Physical',
      ndisRegistrationDate: new Date('2022-06-01'),
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p13 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000013' },
    update: {},
    create: {
      ndisNumber: '430000013',
      firstName: 'Dylan',
      lastName: 'Nguyen',
      dateOfBirth: new Date('2008-07-04'),
      email: 'dylan.family@yahoo.com',
      phone: '+61400400013',
      address: '44 Bottlebrush Way',
      suburb: 'Logan',
      state: 'QLD',
      postcode: '4114',
      assignedToId: pm2.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'ADHD and sensory processing disorder',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2023-11-15'),
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  const p14 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000014' },
    update: {},
    create: {
      ndisNumber: '430000014',
      firstName: 'Margaret',
      lastName: 'Sullivan',
      dateOfBirth: new Date('1955-02-28'),
      email: 'margaret.sullivan@bigpond.com',
      phone: '+61400500014',
      address: '3 Grevillea Avenue',
      suburb: 'Alice Springs',
      state: 'NT',
      postcode: '0870',
      assignedToId: planManager.id,
      onboardingStatus: 'COMPLETE',
      ingestSource: 'MANUAL',
      pricingRegion: 'VERY_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Female',
      disability: 'Stroke — left hemiplegia',
      disabilityCategory: 'Neurological',
      ndisRegistrationDate: new Date('2020-12-01'),
      statementFrequency: 'MONTHLY',
      statementDelivery: 'MAIL',
    },
  })

  const p15 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: '430000015' },
    update: {},
    create: {
      ndisNumber: '430000015',
      firstName: 'Ryan',
      lastName: 'Blackwood',
      dateOfBirth: new Date('1990-09-09'),
      email: 'ryan.blackwood@gmail.com',
      phone: '+61400600015',
      address: '100 Warataah Street',
      suburb: 'Manly',
      state: 'NSW',
      postcode: '2095',
      assignedToId: pm2.id,
      onboardingStatus: 'DRAFT',
      ingestSource: 'WORDPRESS',
      pricingRegion: 'NON_REMOTE',
      invoiceApprovalEnabled: false,
      gender: 'Male',
      disability: 'Bipolar disorder — Type 1',
      disabilityCategory: 'Psychosocial',
      ndisRegistrationDate: new Date('2025-01-20'),
      statementFrequency: 'MONTHLY',
      statementDelivery: 'EMAIL',
    },
  })

  console.log('  ✓ 15 participants created')

  // ─── 4. NDIS PRICE GUIDE ──────────────────────────────────────────────────
  console.log('  Creating NDIS price guide...')

  const pgVersion = await prisma.ndisPriceGuideVersion.findFirst({
    where: { label: 'NDIS Price Guide 2025-26' },
  })
  const priceGuide =
    pgVersion ??
    (await prisma.ndisPriceGuideVersion.create({
      data: {
        label: 'NDIS Price Guide 2025-26',
        effectiveFrom: new Date('2025-07-01'),
        effectiveTo: new Date('2026-06-30'),
        importedById: director.id,
      },
    }))

  const supportItems = [
    // Category 01 — Daily Activities
    { itemNumber: '01_011_0107_1_1', name: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', categoryCodePace: '01', categoryName: 'Daily Activities', categoryNamePace: 'Assistance with Daily Life', registrationGroupNumber: '0107', registrationGroupName: 'Daily Activities', unitType: 'H', priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: true, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: '01_015_0107_1_1', name: 'Assistance With Self-Care Activities - Standard - Weekday Evening', categoryCode: '01', categoryCodePace: '01', categoryName: 'Daily Activities', categoryNamePace: 'Assistance with Daily Life', registrationGroupNumber: '0107', registrationGroupName: 'Daily Activities', unitType: 'H', priceStandardCents: 7210, priceRemoteCents: 10094, priceVeryRemoteCents: 12617, allowNonFaceToFace: false, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: '01_300_0104_1_1', name: 'Specialist Disability Accommodation - Fully Accessible', categoryCode: '01', categoryCodePace: '01', categoryName: 'Daily Activities', categoryNamePace: 'Assistance with Daily Life', registrationGroupNumber: '0104', registrationGroupName: 'High Intensity Daily Personal Activities', unitType: 'H', priceStandardCents: 10234, priceRemoteCents: 14328, priceVeryRemoteCents: 17909, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 02 — Transport
    { itemNumber: '02_051_0108_1_1', name: 'Transport - Non Labour', categoryCode: '02', categoryCodePace: '02', categoryName: 'Transport', categoryNamePace: 'Transport', registrationGroupNumber: '0108', registrationGroupName: 'Participation in Community, Social and Civic Activities', unitType: 'E', priceStandardCents: 2500, priceRemoteCents: 3500, priceVeryRemoteCents: 4375, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 04 — Assistance with Social, Economic and Community Participation
    { itemNumber: '04_104_0125_6_1', name: 'Access Community Social and Rec Activ - Standard - Weekday Daytime', categoryCode: '04', categoryCodePace: '04', categoryName: 'Social Participation', categoryNamePace: 'Assistance with Social, Economic and Community Participation', registrationGroupNumber: '0125', registrationGroupName: 'High Intensity Daily Personal Activities', unitType: 'H', priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: true, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: '04_210_0136_6_1', name: 'Group and Centre Based Activities - Standard - Weekday', categoryCode: '04', categoryCodePace: '04', categoryName: 'Social Participation', categoryNamePace: 'Assistance with Social, Economic and Community Participation', registrationGroupNumber: '0136', registrationGroupName: 'Group and Centre Based Activities', unitType: 'H', priceStandardCents: 1840, priceRemoteCents: 2576, priceVeryRemoteCents: 3220, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: true },
    // Category 07 — Support Coordination
    { itemNumber: '07_002_0106_8_3', name: 'Support Coordination', categoryCode: '07', categoryCodePace: '07', categoryName: 'Support Coordination', categoryNamePace: 'Support Coordination', registrationGroupNumber: '0106', registrationGroupName: 'Support Coordination', unitType: 'H', priceStandardCents: 10008, priceRemoteCents: 14011, priceVeryRemoteCents: 17514, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    { itemNumber: '07_004_0132_8_3', name: 'Specialist Support Coordination', categoryCode: '07', categoryCodePace: '07', categoryName: 'Support Coordination', categoryNamePace: 'Support Coordination', registrationGroupNumber: '0132', registrationGroupName: 'Specialist Support Coordination', unitType: 'H', priceStandardCents: 19005, priceRemoteCents: 26607, priceVeryRemoteCents: 33259, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 11 — Improved Living Arrangements
    { itemNumber: '11_022_0115_1_1', name: 'Assistance in Supported Independent Living', categoryCode: '11', categoryCodePace: '11', categoryName: 'Improved Living Arrangements', categoryNamePace: 'Improved Living Arrangements', registrationGroupNumber: '0115', registrationGroupName: 'Assistance in Supported Independent Living', unitType: 'H', priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: true },
    // Category 14 — Support Coordination (Plan Management)
    { itemNumber: '14_033_0127_8_3', name: 'Plan Management - Financial Administration', categoryCode: '14', categoryCodePace: '14', categoryName: 'Improved Life Choices', categoryNamePace: 'Improved Life Choices', registrationGroupNumber: '0127', registrationGroupName: 'Plan Management', unitType: 'MON', priceStandardCents: 15477, priceRemoteCents: 15477, priceVeryRemoteCents: 15477, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    { itemNumber: '14_034_0127_8_3', name: 'Plan Management - Setup', categoryCode: '14', categoryCodePace: '14', categoryName: 'Improved Life Choices', categoryNamePace: 'Improved Life Choices', registrationGroupNumber: '0127', registrationGroupName: 'Plan Management', unitType: 'E', priceStandardCents: 23310, priceRemoteCents: 23310, priceVeryRemoteCents: 23310, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 15 — Improved Daily Living
    { itemNumber: '15_037_0128_1_3', name: 'Physiotherapy', categoryCode: '15', categoryCodePace: '15', categoryName: 'Improved Daily Living', categoryNamePace: 'Improved Daily Living Skills', registrationGroupNumber: '0128', registrationGroupName: 'Therapeutic Supports', unitType: 'H', priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: '15_056_0128_1_3', name: 'Occupational Therapy', categoryCode: '15', categoryCodePace: '15', categoryName: 'Improved Daily Living', categoryNamePace: 'Improved Daily Living Skills', registrationGroupNumber: '0128', registrationGroupName: 'Therapeutic Supports', unitType: 'H', priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: '15_043_0128_1_3', name: 'Psychology Services', categoryCode: '15', categoryCodePace: '15', categoryName: 'Improved Daily Living', categoryNamePace: 'Improved Daily Living Skills', registrationGroupNumber: '0128', registrationGroupName: 'Therapeutic Supports', unitType: 'H', priceStandardCents: 23456, priceRemoteCents: 32838, priceVeryRemoteCents: 41048, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: '15_054_0128_1_3', name: 'Speech Pathology', categoryCode: '15', categoryCodePace: '15', categoryName: 'Improved Daily Living', categoryNamePace: 'Improved Daily Living Skills', registrationGroupNumber: '0128', registrationGroupName: 'Therapeutic Supports', unitType: 'H', priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
  ]

  for (const item of supportItems) {
    await prisma.ndisSupportItem.upsert({
      where: { versionId_itemNumber: { versionId: priceGuide.id, itemNumber: item.itemNumber } },
      update: {},
      create: { versionId: priceGuide.id, ...item },
    })
  }

  console.log('  ✓ 1 price guide version + 15 support items created')

  // ─── 5. PLANS ─────────────────────────────────────────────────────────────
  console.log('  Creating plans...')

  async function findOrCreatePlan(participantId: string, prodaPlanId: string, data: { startDate: Date; endDate: Date; reviewDate?: Date; status?: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'UNDER_REVIEW' | 'INACTIVE' }) {
    const existing = await prisma.planPlan.findFirst({ where: { participantId, prodaPlanId } })
    if (existing) return existing
    return prisma.planPlan.create({ data: { participantId, prodaPlanId, ...data } })
  }

  const plan1 = await findOrCreatePlan(p1.id, 'PRODA-P1-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    reviewDate: new Date('2026-05-01'),
    status: 'ACTIVE',
  })
  const plan2 = await findOrCreatePlan(p2.id, 'PRODA-P2-2025', {
    startDate: new Date('2025-09-01'),
    endDate: new Date('2026-08-31'),
    reviewDate: new Date('2026-07-01'),
    status: 'ACTIVE',
  })
  const plan3 = await findOrCreatePlan(p3.id, 'PRODA-P3-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'ACTIVE',
  })
  const plan4 = await findOrCreatePlan(p4.id, 'PRODA-P4-2025', {
    startDate: new Date('2025-10-01'),
    endDate: new Date('2026-09-30'),
    reviewDate: new Date('2026-08-15'),
    status: 'ACTIVE',
  })
  const plan5 = await findOrCreatePlan(p5.id, 'PRODA-P5-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'ACTIVE',
  })
  const plan6 = await findOrCreatePlan(p6.id, 'PRODA-P6-2025', {
    startDate: new Date('2025-08-01'),
    endDate: new Date('2026-07-31'),
    status: 'ACTIVE',
  })
  const plan7 = await findOrCreatePlan(p7.id, 'PRODA-P7-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'ACTIVE',
  })
  const plan8 = await findOrCreatePlan(p8.id, 'PRODA-P8-2025', {
    startDate: new Date('2025-11-01'),
    endDate: new Date('2026-10-31'),
    status: 'ACTIVE',
  })
  const plan9 = await findOrCreatePlan(p9.id, 'PRODA-P9-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'ACTIVE',
  })
  const plan10 = await findOrCreatePlan(p10.id, 'PRODA-P10-2025', {
    startDate: new Date('2025-09-01'),
    endDate: new Date('2026-08-31'),
    status: 'ACTIVE',
  })
  const plan11 = await findOrCreatePlan(p11.id, 'PRODA-P11-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2025-12-31'),
    status: 'EXPIRING_SOON',
  })
  const plan12 = await findOrCreatePlan(p12.id, 'PRODA-P12-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'ACTIVE',
  })
  const plan13 = await findOrCreatePlan(p13.id, 'PRODA-P13-2025', {
    startDate: new Date('2025-10-01'),
    endDate: new Date('2026-09-30'),
    status: 'ACTIVE',
  })
  const plan14 = await findOrCreatePlan(p14.id, 'PRODA-P14-2024', {
    startDate: new Date('2024-07-01'),
    endDate: new Date('2025-06-30'),
    status: 'EXPIRED',
  })
  const plan15 = await findOrCreatePlan(p15.id, 'PRODA-P15-2025', {
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-06-30'),
    status: 'UNDER_REVIEW',
  })

  // Budget lines
  async function upsertBudgetLine(planId: string, categoryCode: string, categoryName: string, allocatedCents: number, spentCents = 0) {
    return prisma.planBudgetLine.upsert({
      where: { planId_categoryCode: { planId, categoryCode } },
      update: {},
      create: { planId, categoryCode, categoryName, allocatedCents, spentCents },
    })
  }

  const bl1_01 = await upsertBudgetLine(plan1.id, '01', 'Daily Activities', 4800000, 1250000)
  const bl1_15 = await upsertBudgetLine(plan1.id, '15', 'Improved Daily Living', 1500000, 380000)
  const bl1_14 = await upsertBudgetLine(plan1.id, '14', 'Improved Life Choices', 375000, 93000)
  const bl1_04 = await upsertBudgetLine(plan1.id, '04', 'Social Participation', 900000, 120000)

  const bl2_01 = await upsertBudgetLine(plan2.id, '01', 'Daily Activities', 3600000, 890000)
  const bl2_15 = await upsertBudgetLine(plan2.id, '15', 'Improved Daily Living', 1200000, 450000)
  const bl2_14 = await upsertBudgetLine(plan2.id, '14', 'Improved Life Choices', 375000, 93000)

  const bl3_01 = await upsertBudgetLine(plan3.id, '01', 'Daily Activities', 5200000, 2100000)
  const bl3_11 = await upsertBudgetLine(plan3.id, '11', 'Improved Living Arrangements', 8000000, 3500000)
  const bl3_15 = await upsertBudgetLine(plan3.id, '15', 'Improved Daily Living', 800000, 210000)
  const bl3_14 = await upsertBudgetLine(plan3.id, '14', 'Improved Life Choices', 375000, 155000)

  const bl4_01 = await upsertBudgetLine(plan4.id, '01', 'Daily Activities', 2400000, 320000)
  const bl4_15 = await upsertBudgetLine(plan4.id, '15', 'Improved Daily Living', 2000000, 580000)
  const bl4_04 = await upsertBudgetLine(plan4.id, '04', 'Social Participation', 600000, 80000)
  const bl4_14 = await upsertBudgetLine(plan4.id, '14', 'Improved Life Choices', 375000, 93000)
  const bl4_07 = await upsertBudgetLine(plan4.id, '07', 'Support Coordination', 500000, 100000)

  const bl5_01 = await upsertBudgetLine(plan5.id, '01', 'Daily Activities', 6000000, 1800000)
  const bl5_04 = await upsertBudgetLine(plan5.id, '04', 'Social Participation', 1200000, 280000)
  const bl5_14 = await upsertBudgetLine(plan5.id, '14', 'Improved Life Choices', 375000, 93000)
  const bl5_02 = await upsertBudgetLine(plan5.id, '02', 'Transport', 300000, 65000)

  const bl6_15 = await upsertBudgetLine(plan6.id, '15', 'Improved Daily Living', 3000000, 920000)
  const bl6_01 = await upsertBudgetLine(plan6.id, '01', 'Daily Activities', 1800000, 450000)
  const bl6_14 = await upsertBudgetLine(plan6.id, '14', 'Improved Life Choices', 375000, 93000)

  const bl7_15 = await upsertBudgetLine(plan7.id, '15', 'Improved Daily Living', 2500000, 680000)
  const bl7_04 = await upsertBudgetLine(plan7.id, '04', 'Social Participation', 1000000, 210000)
  const bl7_14 = await upsertBudgetLine(plan7.id, '14', 'Improved Life Choices', 375000, 93000)

  const bl8_15 = await upsertBudgetLine(plan8.id, '15', 'Improved Daily Living', 4000000, 760000)
  const bl8_14 = await upsertBudgetLine(plan8.id, '14', 'Improved Life Choices', 375000, 93000)

  const bl9_01 = await upsertBudgetLine(plan9.id, '01', 'Daily Activities', 3200000, 1100000)
  const bl9_15 = await upsertBudgetLine(plan9.id, '15', 'Improved Daily Living', 1500000, 200000)
  const bl9_14 = await upsertBudgetLine(plan9.id, '14', 'Improved Life Choices', 375000, 93000)
  const bl9_04 = await upsertBudgetLine(plan9.id, '04', 'Social Participation', 800000, 150000)

  const bl10_15 = await upsertBudgetLine(plan10.id, '15', 'Improved Daily Living', 2800000, 300000)
  const bl10_01 = await upsertBudgetLine(plan10.id, '01', 'Daily Activities', 1600000, 200000)
  const bl10_14 = await upsertBudgetLine(plan10.id, '14', 'Improved Life Choices', 375000, 31000)

  await upsertBudgetLine(plan11.id, '01', 'Daily Activities', 2000000, 1900000)
  await upsertBudgetLine(plan11.id, '14', 'Improved Life Choices', 187500, 155000)

  const bl12_15 = await upsertBudgetLine(plan12.id, '15', 'Improved Daily Living', 2000000, 580000)
  const bl12_14 = await upsertBudgetLine(plan12.id, '14', 'Improved Life Choices', 375000, 93000)
  const bl12_04 = await upsertBudgetLine(plan12.id, '04', 'Social Participation', 500000, 60000)

  const bl13_15 = await upsertBudgetLine(plan13.id, '15', 'Improved Daily Living', 1800000, 200000)
  const bl13_01 = await upsertBudgetLine(plan13.id, '01', 'Daily Activities', 1200000, 150000)
  const bl13_14 = await upsertBudgetLine(plan13.id, '14', 'Improved Life Choices', 375000, 62000)

  await upsertBudgetLine(plan14.id, '01', 'Daily Activities', 4000000, 3900000)
  await upsertBudgetLine(plan14.id, '15', 'Improved Daily Living', 1200000, 1150000)
  await upsertBudgetLine(plan14.id, '14', 'Improved Life Choices', 375000, 370000)

  await upsertBudgetLine(plan15.id, '01', 'Daily Activities', 2400000, 0)
  await upsertBudgetLine(plan15.id, '15', 'Improved Daily Living', 1200000, 0)
  await upsertBudgetLine(plan15.id, '14', 'Improved Life Choices', 375000, 0)

  console.log('  ✓ 15 plans + budget lines created')

  // ─── 6. FUNDING PERIODS ───────────────────────────────────────────────────
  console.log('  Creating funding periods...')

  async function findOrCreateFundingPeriod(planId: string, label: string, startDate: Date, endDate: Date) {
    const existing = await prisma.planFundingPeriod.findFirst({ where: { planId, label } })
    if (existing) return existing
    return prisma.planFundingPeriod.create({ data: { planId, label, startDate, endDate } })
  }

  const fp1 = await findOrCreateFundingPeriod(plan1.id, 'Q1 Jul-Sep 2025', new Date('2025-07-01'), new Date('2025-09-30'))
  const fp2 = await findOrCreateFundingPeriod(plan1.id, 'Q2 Oct-Dec 2025', new Date('2025-10-01'), new Date('2025-12-31'))
  const fp3 = await findOrCreateFundingPeriod(plan4.id, 'H1 Oct 2025-Mar 2026', new Date('2025-10-01'), new Date('2026-03-31'))
  const fp4 = await findOrCreateFundingPeriod(plan4.id, 'H2 Apr-Sep 2026', new Date('2026-04-01'), new Date('2026-09-30'))

  // Period budgets for these funding periods
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp1.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { fundingPeriodId: fp1.id, budgetLineId: bl1_01.id, allocatedCents: 1200000 },
  })
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp2.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { fundingPeriodId: fp2.id, budgetLineId: bl1_01.id, allocatedCents: 1200000 },
  })
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp3.id, budgetLineId: bl4_01.id } },
    update: {},
    create: { fundingPeriodId: fp3.id, budgetLineId: bl4_01.id, allocatedCents: 1200000 },
  })
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp4.id, budgetLineId: bl4_01.id } },
    update: {},
    create: { fundingPeriodId: fp4.id, budgetLineId: bl4_01.id, allocatedCents: 1200000 },
  })

  console.log('  ✓ 4 funding periods + 4 period budgets created')

  // ─── 7. INVOICES ──────────────────────────────────────────────────────────
  console.log('  Creating invoices...')

  // INV-001: APPROVED — p1/prov1/plan1 daily activities
  const inv1 = await findOrCreateInvoice({
    participantId: p1.id, providerId: prov1.id, planId: plan1.id,
    invoiceNumber: 'STS-2026-0101', invoiceDate: new Date('2026-01-10'),
    receivedAt: new Date('2026-01-11T09:00:00Z'),
    subtotalCents: 65470, gstCents: 0, totalCents: 65470,
    status: 'APPROVED', ingestSource: 'EMAIL',
    sourceEmail: 'accounts@sunrisetherapy.com.au',
    matchConfidence: 0.98, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.95, aiExtractedAt: new Date('2026-01-11T09:05:00Z'),
    approvedById: planManager.id, approvedAt: new Date('2026-01-13T10:00:00Z'),
    firstApprovedAt: new Date('2026-01-13T10:00:00Z'),
    totalProcessingMs: 170000000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv1.id, budgetLineId: bl1_01.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2026-01-06'), quantity: 5, unitPriceCents: 6547, totalCents: 32735, isPriceGuideCompliant: true },
    { invoiceId: inv1.id, budgetLineId: bl1_01.id, supportItemCode: '01_015_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Evening', categoryCode: '01', serviceDate: new Date('2026-01-07'), quantity: 4.5, unitPriceCents: 7210, totalCents: 32445, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv1.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-11T09:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-11T09:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-11T09:05:00Z'), durationMs: 180000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-01-13T10:00:00Z'), durationMs: 168900000, changedBy: planManager.id },
  ])

  // INV-002: APPROVED — p2/prov2/plan2 OT
  const inv2 = await findOrCreateInvoice({
    participantId: p2.id, providerId: prov2.id, planId: plan2.id,
    invoiceNumber: 'AHP-INV-20260115', invoiceDate: new Date('2026-01-15'),
    receivedAt: new Date('2026-01-15T14:00:00Z'),
    subtotalCents: 116286, gstCents: 0, totalCents: 116286,
    status: 'APPROVED', ingestSource: 'EMAIL',
    sourceEmail: 'invoices@alliedhealthpartners.com.au',
    matchConfidence: 0.99, matchMethod: 'ABN_EXACT',
    aiConfidence: 0.97, aiExtractedAt: new Date('2026-01-15T14:10:00Z'),
    approvedById: planManager.id, approvedAt: new Date('2026-01-16T09:30:00Z'),
    firstApprovedAt: new Date('2026-01-16T09:30:00Z'),
    totalProcessingMs: 70200000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv2.id, budgetLineId: bl2_15.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-01-13'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true },
    { invoiceId: inv2.id, budgetLineId: bl2_15.id, supportItemCode: '15_037_0128_1_3', supportItemName: 'Physiotherapy', categoryCode: '15', serviceDate: new Date('2026-01-14'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv2.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-15T14:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-15T14:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-15T14:10:00Z'), durationMs: 480000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-01-16T09:30:00Z'), durationMs: 69600000, changedBy: planManager.id },
  ])

  // INV-003: CLAIMED — p3/prov5/plan3 SIL
  const inv3 = await findOrCreateInvoice({
    participantId: p3.id, providerId: prov5.id, planId: plan3.id,
    invoiceNumber: 'HCSIL-JAN-001', invoiceDate: new Date('2026-01-31'),
    receivedAt: new Date('2026-02-01T08:00:00Z'),
    subtotalCents: 261880, gstCents: 0, totalCents: 261880,
    status: 'CLAIMED', ingestSource: 'EMAIL',
    sourceEmail: 'accounts@horizoncaresil.com.au',
    matchConfidence: 1.0, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.93, aiExtractedAt: new Date('2026-02-01T08:10:00Z'),
    approvedById: pm2.id, approvedAt: new Date('2026-02-03T11:00:00Z'),
    firstApprovedAt: new Date('2026-02-03T11:00:00Z'),
    totalProcessingMs: 183600000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv3.id, budgetLineId: bl3_11.id, supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', categoryCode: '11', serviceDate: new Date('2026-01-15'), quantity: 20, unitPriceCents: 6547, totalCents: 130940, isPriceGuideCompliant: true },
    { invoiceId: inv3.id, budgetLineId: bl3_11.id, supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', categoryCode: '11', serviceDate: new Date('2026-01-22'), quantity: 20, unitPriceCents: 6547, totalCents: 130940, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv3.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-01T08:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-01T08:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-02-01T08:10:00Z'), durationMs: 480000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-02-03T11:00:00Z'), durationMs: 183000000, changedBy: pm2.id },
    { from: 'APPROVED', to: 'CLAIMED', at: new Date('2026-02-04T10:00:00Z'), durationMs: 82800000, changedBy: pm2.id },
  ])

  // INV-004: PAID — p1/prov1/plan1
  const inv4 = await findOrCreateInvoice({
    participantId: p1.id, providerId: prov1.id, planId: plan1.id,
    invoiceNumber: 'STS-2025-1201', invoiceDate: new Date('2025-12-10'),
    receivedAt: new Date('2025-12-11T09:00:00Z'),
    subtotalCents: 58923, gstCents: 0, totalCents: 58923,
    status: 'PAID', ingestSource: 'EMAIL',
    sourceEmail: 'accounts@sunrisetherapy.com.au',
    matchConfidence: 0.98, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.96, aiExtractedAt: new Date('2025-12-11T09:08:00Z'),
    approvedById: planManager.id, approvedAt: new Date('2025-12-12T10:00:00Z'),
    firstApprovedAt: new Date('2025-12-12T10:00:00Z'),
    totalProcessingMs: 90000000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv4.id, budgetLineId: bl1_01.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2025-12-05'), quantity: 9, unitPriceCents: 6547, totalCents: 58923, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv4.id, [
    { from: null, to: 'RECEIVED', at: new Date('2025-12-11T09:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2025-12-11T09:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2025-12-11T09:08:00Z'), durationMs: 360000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2025-12-12T10:00:00Z'), durationMs: 89520000, changedBy: planManager.id },
    { from: 'APPROVED', to: 'CLAIMED', at: new Date('2025-12-13T09:00:00Z'), durationMs: 82800000, changedBy: planManager.id },
    { from: 'CLAIMED', to: 'PAID', at: new Date('2025-12-20T12:00:00Z'), durationMs: 626400000, changedBy: planManager.id },
  ])

  // INV-005: REJECTED — p9/prov10 (suspended provider)
  const inv5 = await findOrCreateInvoice({
    participantId: p9.id, providerId: prov10.id, planId: plan9.id,
    invoiceNumber: 'NDS-2026-0101', invoiceDate: new Date('2026-01-05'),
    receivedAt: new Date('2026-01-06T10:00:00Z'),
    subtotalCents: 39282, gstCents: 0, totalCents: 39282,
    status: 'REJECTED', ingestSource: 'MANUAL',
    matchConfidence: 0.85, matchMethod: 'ABN_EXACT',
    aiConfidence: 0.88, aiExtractedAt: new Date('2026-01-06T10:10:00Z'),
    rejectedById: planManager.id, rejectedAt: new Date('2026-01-06T14:00:00Z'),
    rejectionReason: 'Provider is suspended — cannot process payments.',
    firstRejectedAt: new Date('2026-01-06T14:00:00Z'),
    totalProcessingMs: 14400000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv5.id, budgetLineId: bl9_01.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2026-01-03'), quantity: 6, unitPriceCents: 6547, totalCents: 39282, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv5.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-06T10:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-06T10:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-06T10:10:00Z'), durationMs: 480000 },
    { from: 'PENDING_REVIEW', to: 'REJECTED', at: new Date('2026-01-06T14:00:00Z'), durationMs: 13800000, changedBy: planManager.id },
  ])

  // INV-006: PENDING_REVIEW — p4/prov2 OT — has MISSING_NDIS_CODES hold
  const inv6 = await findOrCreateInvoice({
    participantId: p4.id, providerId: prov2.id, planId: plan4.id,
    invoiceNumber: 'AHP-INV-20260201', invoiceDate: new Date('2026-02-01'),
    receivedAt: new Date('2026-02-01T16:30:00Z'),
    subtotalCents: 38762, gstCents: 0, totalCents: 38762,
    status: 'PENDING_REVIEW', ingestSource: 'EMAIL',
    sourceEmail: 'invoices@alliedhealthpartners.com.au',
    matchConfidence: 0.95, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.72, aiExtractedAt: new Date('2026-02-01T16:40:00Z'),
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv6.id, budgetLineId: bl4_15.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-01-28'), quantity: 2, unitPriceCents: 19381, totalCents: 38762, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv6.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-01T16:30:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-01T16:32:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-02-01T16:40:00Z'), durationMs: 480000, holdCategory: 'MISSING_NDIS_CODES' },
  ])

  // INV-007: PROCESSING — p5/prov3 recently ingested
  const inv7 = await findOrCreateInvoice({
    participantId: p5.id, providerId: prov3.id, planId: plan5.id,
    invoiceNumber: 'CC-2026-0045', invoiceDate: new Date('2026-02-10'),
    receivedAt: new Date('2026-02-10T11:00:00Z'),
    subtotalCents: 32735, gstCents: 0, totalCents: 32735,
    status: 'PROCESSING', ingestSource: 'EMAIL',
    sourceEmail: 'billing@careconnect.com.au',
    matchConfidence: 0.90, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.80, aiExtractedAt: new Date('2026-02-10T11:05:00Z'),
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv7.id, budgetLineId: bl5_01.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2026-02-08'), quantity: 5, unitPriceCents: 6547, totalCents: 32735, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv7.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-10T11:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-10T11:02:00Z'), durationMs: 120000 },
  ])

  // INV-008: RECEIVED — just arrived
  const inv8 = await findOrCreateInvoice({
    participantId: p6.id, providerId: prov6.id, planId: plan6.id,
    invoiceNumber: 'PP-INV-2026-022', invoiceDate: new Date('2026-02-12'),
    receivedAt: new Date('2026-02-12T15:00:00Z'),
    subtotalCents: 46962, gstCents: 0, totalCents: 46962,
    status: 'RECEIVED', ingestSource: 'EMAIL',
    sourceEmail: 'billing@pathwayspsych.com.au',
    matchConfidence: 0.97, matchMethod: 'EMAIL_EXACT',
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv8.id, budgetLineId: bl6_15.id, supportItemCode: '15_043_0128_1_3', supportItemName: 'Psychology Services', categoryCode: '15', serviceDate: new Date('2026-02-10'), quantity: 2, unitPriceCents: 23456, totalCents: 46962, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv8.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-12T15:00:00Z') },
  ])

  // INV-009: PENDING_PARTICIPANT_APPROVAL — p2 has approval enabled
  const inv9 = await findOrCreateInvoice({
    participantId: p2.id, providerId: prov2.id, planId: plan2.id,
    invoiceNumber: 'AHP-INV-20260205', invoiceDate: new Date('2026-02-05'),
    receivedAt: new Date('2026-02-05T10:00:00Z'),
    subtotalCents: 58143, gstCents: 0, totalCents: 58143,
    status: 'PENDING_PARTICIPANT_APPROVAL', ingestSource: 'EMAIL',
    sourceEmail: 'invoices@alliedhealthpartners.com.au',
    matchConfidence: 0.99, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.94, aiExtractedAt: new Date('2026-02-05T10:10:00Z'),
    participantApprovalStatus: 'PENDING',
    approvalSentAt: new Date('2026-02-05T10:15:00Z'),
    approvalTokenExpiresAt: new Date('2026-02-12T10:15:00Z'),
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv9.id, budgetLineId: bl2_15.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-02-03'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv9.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-05T10:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-05T10:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_PARTICIPANT_APPROVAL', at: new Date('2026-02-05T10:15:00Z'), durationMs: 780000, holdCategory: 'AWAITING_PARTICIPANT_APPROVAL' },
  ])

  // INV-010: APPROVED — p7/prov2 speech pathology
  const inv10 = await findOrCreateInvoice({
    participantId: p7.id, providerId: prov2.id, planId: plan7.id,
    invoiceNumber: 'AHP-INV-20260118', invoiceDate: new Date('2026-01-18'),
    receivedAt: new Date('2026-01-19T09:00:00Z'),
    subtotalCents: 77524, gstCents: 0, totalCents: 77524,
    status: 'APPROVED', ingestSource: 'EMAIL',
    sourceEmail: 'admin@alliedhealthpartners.com.au',
    matchConfidence: 0.96, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.92, aiExtractedAt: new Date('2026-01-19T09:08:00Z'),
    approvedById: pm2.id, approvedAt: new Date('2026-01-20T14:00:00Z'),
    firstApprovedAt: new Date('2026-01-20T14:00:00Z'),
    totalProcessingMs: 104400000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv10.id, budgetLineId: bl7_15.id, supportItemCode: '15_054_0128_1_3', supportItemName: 'Speech Pathology', categoryCode: '15', serviceDate: new Date('2026-01-16'), quantity: 4, unitPriceCents: 19381, totalCents: 77524, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv10.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-19T09:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-19T09:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-19T09:08:00Z'), durationMs: 360000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-01-20T14:00:00Z'), durationMs: 104040000, changedBy: pm2.id },
  ])

  // INV-011: CLAIMED — p8/prov6 psychology
  const inv11 = await findOrCreateInvoice({
    participantId: p8.id, providerId: prov6.id, planId: plan8.id,
    invoiceNumber: 'PP-INV-2026-010', invoiceDate: new Date('2026-01-22'),
    receivedAt: new Date('2026-01-22T10:00:00Z'),
    subtotalCents: 117280, gstCents: 0, totalCents: 117280,
    status: 'CLAIMED', ingestSource: 'EMAIL',
    sourceEmail: 'billing@pathwayspsych.com.au',
    matchConfidence: 0.98, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.91, aiExtractedAt: new Date('2026-01-22T10:12:00Z'),
    approvedById: planManager.id, approvedAt: new Date('2026-01-23T09:00:00Z'),
    firstApprovedAt: new Date('2026-01-23T09:00:00Z'),
    totalProcessingMs: 82800000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv11.id, budgetLineId: bl8_15.id, supportItemCode: '15_043_0128_1_3', supportItemName: 'Psychology Services', categoryCode: '15', serviceDate: new Date('2026-01-20'), quantity: 5, unitPriceCents: 23456, totalCents: 117280, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv11.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-22T10:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-22T10:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-22T10:12:00Z'), durationMs: 600000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-01-23T09:00:00Z'), durationMs: 81480000, changedBy: planManager.id },
    { from: 'APPROVED', to: 'CLAIMED', at: new Date('2026-01-24T09:00:00Z'), durationMs: 86400000, changedBy: planManager.id },
  ])

  // INV-012: REJECTED — budget exceeded
  const inv12 = await findOrCreateInvoice({
    participantId: p3.id, providerId: prov5.id, planId: plan3.id,
    invoiceNumber: 'HCSIL-FEB-001', invoiceDate: new Date('2026-02-05'),
    receivedAt: new Date('2026-02-05T08:00:00Z'),
    subtotalCents: 850110, gstCents: 0, totalCents: 850110,
    status: 'REJECTED', ingestSource: 'EMAIL',
    sourceEmail: 'accounts@horizoncaresil.com.au',
    matchConfidence: 1.0, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.93, aiExtractedAt: new Date('2026-02-05T08:10:00Z'),
    rejectedById: pm2.id, rejectedAt: new Date('2026-02-05T16:00:00Z'),
    rejectionReason: 'Total exceeds remaining plan budget for Category 11.',
    firstRejectedAt: new Date('2026-02-05T16:00:00Z'),
    totalProcessingMs: 28800000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv12.id, budgetLineId: bl3_11.id, supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', categoryCode: '11', serviceDate: new Date('2026-02-01'), quantity: 130, unitPriceCents: 6547, totalCents: 850110, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv12.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-05T08:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-05T08:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-02-05T08:10:00Z'), durationMs: 480000, holdCategory: 'PLAN_BUDGET_EXCEEDED' },
    { from: 'PENDING_REVIEW', to: 'REJECTED', at: new Date('2026-02-05T16:00:00Z'), durationMs: 28200000, changedBy: pm2.id },
  ])

  // INV-013: PENDING_REVIEW — p10/prov2 OT for new participant
  const inv13 = await findOrCreateInvoice({
    participantId: p10.id, providerId: prov2.id, planId: plan10.id,
    invoiceNumber: 'AHP-INV-20260208', invoiceDate: new Date('2026-02-08'),
    receivedAt: new Date('2026-02-08T09:30:00Z'),
    subtotalCents: 58143, gstCents: 0, totalCents: 58143,
    status: 'PENDING_REVIEW', ingestSource: 'EMAIL',
    sourceEmail: 'billing@alliedhealthpartners.com.au',
    matchConfidence: 0.88, matchMethod: 'EMAIL_DOMAIN',
    aiConfidence: 0.85, aiExtractedAt: new Date('2026-02-08T09:40:00Z'),
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv13.id, budgetLineId: bl10_15.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-02-06'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv13.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-08T09:30:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-02-08T09:32:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-02-08T09:40:00Z'), durationMs: 480000 },
  ])

  // INV-014: APPROVED — p12/prov4 OT
  const inv14 = await findOrCreateInvoice({
    participantId: p12.id, providerId: prov4.id, planId: plan12.id,
    invoiceNumber: 'AP-OT-2026-0008', invoiceDate: new Date('2026-01-25'),
    receivedAt: new Date('2026-01-26T10:00:00Z'),
    subtotalCents: 77524, gstCents: 0, totalCents: 77524,
    status: 'APPROVED', ingestSource: 'EMAIL',
    sourceEmail: 'admin@abilityplus.com.au',
    matchConfidence: 0.97, matchMethod: 'EMAIL_EXACT',
    aiConfidence: 0.95, aiExtractedAt: new Date('2026-01-26T10:08:00Z'),
    approvedById: planManager.id, approvedAt: new Date('2026-01-27T11:00:00Z'),
    firstApprovedAt: new Date('2026-01-27T11:00:00Z'),
    totalProcessingMs: 90000000,
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv14.id, budgetLineId: bl12_15.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-01-23'), quantity: 4, unitPriceCents: 19381, totalCents: 77524, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv14.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-01-26T10:00:00Z') },
    { from: 'RECEIVED', to: 'PROCESSING', at: new Date('2026-01-26T10:02:00Z'), durationMs: 120000 },
    { from: 'PROCESSING', to: 'PENDING_REVIEW', at: new Date('2026-01-26T10:08:00Z'), durationMs: 360000 },
    { from: 'PENDING_REVIEW', to: 'APPROVED', at: new Date('2026-01-27T11:00:00Z'), durationMs: 89520000, changedBy: planManager.id },
  ])

  // INV-015: RECEIVED — p13/prov3 daily activities for young person
  const inv15 = await findOrCreateInvoice({
    participantId: p13.id, providerId: prov3.id, planId: plan13.id,
    invoiceNumber: 'CC-2026-0060', invoiceDate: new Date('2026-02-11'),
    receivedAt: new Date('2026-02-12T08:00:00Z'),
    subtotalCents: 22659, gstCents: 0, totalCents: 22659,
    status: 'RECEIVED', ingestSource: 'EMAIL',
    sourceEmail: 'billing@careconnect.com.au',
    matchConfidence: 0.92, matchMethod: 'EMAIL_EXACT',
  })
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv15.id, budgetLineId: bl13_01.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2026-02-10'), quantity: 3.46, unitPriceCents: 6547, totalCents: 22633, isPriceGuideCompliant: true },
  ]})
  await addStatusHistory(inv15.id, [
    { from: null, to: 'RECEIVED', at: new Date('2026-02-12T08:00:00Z') },
  ])

  console.log('  ✓ 15 invoices with status histories created')

  // ─── 8. CLAIMS ────────────────────────────────────────────────────────────
  console.log('  Creating claims...')

  // Batch 1 — Jan 2026
  const batch1 = await prisma.clmBatch.upsert({
    where: { batchNumber: 'BATCH-2026-01' },
    update: {},
    create: { batchNumber: 'BATCH-2026-01', status: 'SUBMITTED', claimCount: 3, totalCents: 324089, submittedById: planManager.id, submittedAt: new Date('2026-01-14T09:00:00Z') },
  })
  const batch2 = await prisma.clmBatch.upsert({
    where: { batchNumber: 'BATCH-2026-02' },
    update: {},
    create: { batchNumber: 'BATCH-2026-02', status: 'DRAFT', claimCount: 2, totalCents: 195427, submittedById: pm2.id },
  })

  type ClaimData = {
    invoiceId: string
    participantId?: string
    batchId?: string
    claimedCents: number
    approvedCents?: number
    status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'PAID' | 'CANCELLED'
    submittedById?: string
    submittedAt?: Date
    outcomeAt?: Date
    outcomeNotes?: string
  }
  async function findOrCreateClaim(claimReference: string, data: ClaimData) {
    const existing = await prisma.clmClaim.findFirst({ where: { claimReference } })
    if (existing) return existing
    return prisma.clmClaim.create({ data: { claimReference, ...data } })
  }

  const claim1 = await findOrCreateClaim('CLM-2026-0001', {
    invoiceId: inv1.id, participantId: p1.id, batchId: batch1.id,
    claimedCents: 65470, approvedCents: 65470,
    status: 'APPROVED', submittedById: planManager.id, submittedAt: new Date('2026-01-14T09:00:00Z'),
    outcomeAt: new Date('2026-01-17T10:00:00Z'), outcomeNotes: 'Approved by PRODA.',
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim1.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2026-01-06'), quantity: 5, unitPriceCents: 6547, totalCents: 32735, status: 'APPROVED', approvedCents: 32735 },
    { claimId: claim1.id, supportItemCode: '01_015_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Evening', categoryCode: '01', serviceDate: new Date('2026-01-07'), quantity: 4.5, unitPriceCents: 7210, totalCents: 32445, status: 'APPROVED', approvedCents: 32445 },
  ]})

  const claim2 = await findOrCreateClaim('CLM-2026-0002', {
    invoiceId: inv2.id, participantId: p2.id, batchId: batch1.id,
    claimedCents: 116286, approvedCents: 116286,
    status: 'APPROVED', submittedById: planManager.id, submittedAt: new Date('2026-01-17T09:00:00Z'),
    outcomeAt: new Date('2026-01-21T10:00:00Z'), outcomeNotes: 'Approved.',
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim2.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-01-13'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, status: 'APPROVED', approvedCents: 58143 },
    { claimId: claim2.id, supportItemCode: '15_037_0128_1_3', supportItemName: 'Physiotherapy', categoryCode: '15', serviceDate: new Date('2026-01-14'), quantity: 3, unitPriceCents: 19381, totalCents: 58143, status: 'APPROVED', approvedCents: 58143 },
  ]})

  const claim3 = await findOrCreateClaim('CLM-2026-0003', {
    invoiceId: inv4.id, participantId: p1.id, batchId: batch1.id,
    claimedCents: 58923, approvedCents: 58923,
    status: 'PAID', submittedById: planManager.id, submittedAt: new Date('2026-01-14T09:00:00Z'),
    outcomeAt: new Date('2026-01-18T10:00:00Z'), outcomeNotes: 'Paid.',
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim3.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2025-12-05'), quantity: 9, unitPriceCents: 6547, totalCents: 58923, status: 'APPROVED', approvedCents: 58923 },
  ]})

  const claim4 = await findOrCreateClaim('CLM-2026-0004', {
    invoiceId: inv3.id, participantId: p3.id, batchId: batch2.id,
    claimedCents: 261880, approvedCents: 0,
    status: 'SUBMITTED', submittedById: pm2.id, submittedAt: new Date('2026-02-04T10:00:00Z'),
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim4.id, supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', categoryCode: '11', serviceDate: new Date('2026-01-15'), quantity: 20, unitPriceCents: 6547, totalCents: 130940 },
    { claimId: claim4.id, supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', categoryCode: '11', serviceDate: new Date('2026-01-22'), quantity: 20, unitPriceCents: 6547, totalCents: 130940 },
  ]})

  const claim5 = await findOrCreateClaim('CLM-2026-0005', {
    invoiceId: inv11.id, participantId: p8.id,
    claimedCents: 117280, approvedCents: 0,
    status: 'PENDING', submittedById: planManager.id,
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim5.id, supportItemCode: '15_043_0128_1_3', supportItemName: 'Psychology Services', categoryCode: '15', serviceDate: new Date('2026-01-20'), quantity: 5, unitPriceCents: 23456, totalCents: 117280 },
  ]})

  const claim6 = await findOrCreateClaim('CLM-2026-0006', {
    invoiceId: inv10.id, participantId: p7.id,
    claimedCents: 77524, approvedCents: 77524,
    status: 'APPROVED', submittedById: pm2.id, submittedAt: new Date('2026-01-21T09:00:00Z'),
    outcomeAt: new Date('2026-01-24T10:00:00Z'), outcomeNotes: 'Approved.',
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim6.id, supportItemCode: '15_054_0128_1_3', supportItemName: 'Speech Pathology', categoryCode: '15', serviceDate: new Date('2026-01-16'), quantity: 4, unitPriceCents: 19381, totalCents: 77524, status: 'APPROVED', approvedCents: 77524 },
  ]})

  const claim7 = await findOrCreateClaim('CLM-2026-0007', {
    invoiceId: inv14.id, participantId: p12.id,
    claimedCents: 77524, approvedCents: 0,
    status: 'PENDING', submittedById: planManager.id,
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim7.id, supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', categoryCode: '15', serviceDate: new Date('2026-01-23'), quantity: 4, unitPriceCents: 19381, totalCents: 77524 },
  ]})

  const claim8 = await findOrCreateClaim('CLM-2025-0095', {
    invoiceId: inv4.id, participantId: p1.id,
    claimedCents: 58923, approvedCents: 58923,
    status: 'PAID', submittedById: planManager.id, submittedAt: new Date('2025-12-13T09:00:00Z'),
    outcomeAt: new Date('2025-12-19T10:00:00Z'), outcomeNotes: 'Paid via ABA file.',
  })
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim8.id, supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Standard - Weekday Daytime', categoryCode: '01', serviceDate: new Date('2025-12-05'), quantity: 9, unitPriceCents: 6547, totalCents: 58923, status: 'APPROVED', approvedCents: 58923 },
  ]})

  console.log('  ✓ 8 claims + 2 batches created')

  // ─── 9. PAYMENTS ──────────────────────────────────────────────────────────
  console.log('  Creating payments...')

  const abaFile1 = await prisma.bnkAbaFile.findFirst({ where: { filename: 'lotus-pm-aba-2026-01-20.aba' } })
  const abaFile = abaFile1 ?? await prisma.bnkAbaFile.create({
    data: {
      filename: 'lotus-pm-aba-2026-01-20.aba',
      s3Key: 'aba-files/2026/01/lotus-pm-aba-2026-01-20.aba',
      totalCents: 299709,
      paymentCount: 3,
      bankReference: 'CBA-20260120-001',
      submittedAt: new Date('2026-01-20T14:00:00Z'),
      clearedAt: new Date('2026-01-22T09:00:00Z'),
    },
  })

  const payBatch1 = await prisma.bnkPaymentBatch.findFirst({ where: { description: 'January 2026 Payment Run' } })
  const payBatch = payBatch1 ?? await prisma.bnkPaymentBatch.create({
    data: {
      description: 'January 2026 Payment Run',
      scheduledDate: new Date('2026-01-20'),
      generatedAt: new Date('2026-01-20T13:00:00Z'),
      uploadedAt: new Date('2026-01-20T14:00:00Z'),
      confirmedAt: new Date('2026-01-22T09:00:00Z'),
      createdById: planManager.id,
    },
  })

  const pay1 = await prisma.bnkPayment.findFirst({ where: { claimId: claim1.id } })
  if (!pay1) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim1.id, abaFileId: abaFile.id, batchId: payBatch.id,
      amountCents: 65470, bsb: '062000', accountNumber: '12345678', accountName: 'Sunrise Therapy Services',
      reference: 'CLM-2026-0001', status: 'CLEARED', processedAt: new Date('2026-01-22T09:00:00Z'),
    }})
  }
  const pay2 = await prisma.bnkPayment.findFirst({ where: { claimId: claim2.id } })
  if (!pay2) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim2.id, abaFileId: abaFile.id, batchId: payBatch.id,
      amountCents: 116286, bsb: '033000', accountNumber: '23456789', accountName: 'Allied Health Partners Pty Ltd',
      reference: 'CLM-2026-0002', status: 'CLEARED', processedAt: new Date('2026-01-22T09:00:00Z'),
    }})
  }
  const pay3 = await prisma.bnkPayment.findFirst({ where: { claimId: claim3.id } })
  if (!pay3) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim3.id, abaFileId: abaFile.id, batchId: payBatch.id,
      amountCents: 58923, bsb: '062000', accountNumber: '12345678', accountName: 'Sunrise Therapy Services',
      reference: 'CLM-2026-0003', status: 'CLEARED', processedAt: new Date('2026-01-22T09:00:00Z'),
    }})
  }
  const pay4 = await prisma.bnkPayment.findFirst({ where: { claimId: claim6.id } })
  if (!pay4) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim6.id, batchId: payBatch.id,
      amountCents: 77524, bsb: '062100', accountNumber: '56789012', accountName: 'HorizonCare SIL Pty Ltd',
      reference: 'CLM-2026-0006', status: 'SUBMITTED_TO_BANK', processedAt: new Date('2026-01-25T09:00:00Z'),
    }})
  }
  const pay5 = await prisma.bnkPayment.findFirst({ where: { claimId: claim5.id } })
  if (!pay5) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim5.id,
      amountCents: 117280, bsb: '033100', accountNumber: '67890123', accountName: 'Pathways Psychology Pty Ltd',
      reference: 'CLM-2026-0005', status: 'PENDING',
    }})
  }
  const pay6 = await prisma.bnkPayment.findFirst({ where: { claimId: claim7.id } })
  if (!pay6) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim7.id,
      amountCents: 77524, bsb: '016000', accountNumber: '45678901', accountName: 'Ability Plus Occupational Therapy',
      reference: 'CLM-2026-0007', status: 'PENDING',
    }})
  }
  const pay7 = await prisma.bnkPayment.findFirst({ where: { claimId: claim4.id } })
  if (!pay7) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim4.id,
      amountCents: 261880, bsb: '062100', accountNumber: '56789012', accountName: 'HorizonCare SIL Pty Ltd',
      reference: 'CLM-2026-0004', status: 'IN_ABA_FILE',
    }})
  }
  const pay8 = await prisma.bnkPayment.findFirst({ where: { claimId: claim8.id } })
  if (!pay8) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim8.id,
      amountCents: 58923, bsb: '062000', accountNumber: '12345678', accountName: 'Sunrise Therapy Services',
      reference: 'CLM-2025-0095', status: 'CLEARED', processedAt: new Date('2025-12-22T09:00:00Z'),
      holdReason: null,
    }})
  }

  console.log('  ✓ 1 ABA file + 1 payment batch + 8 payments created')

  // ─── 10. SERVICE AGREEMENTS ───────────────────────────────────────────────
  console.log('  Creating service agreements...')

  const sa1 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: 'SA-2025-0001' },
    update: {},
    create: {
      agreementRef: 'SA-2025-0001', participantId: p1.id, providerId: prov1.id,
      startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'),
      reviewDate: new Date('2026-01-01'), status: 'ACTIVE',
      notes: 'Standard daily care + therapy support.',
      managedById: planManager.id,
    },
  })
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa1.id, categoryCode: '01', categoryName: 'Daily Activities', supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Weekday Daytime', agreedRateCents: 6547, unitType: 'H' },
    { agreementId: sa1.id, categoryCode: '01', categoryName: 'Daily Activities', supportItemCode: '01_015_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Weekday Evening', agreedRateCents: 7210, unitType: 'H' },
  ]})

  const sa2 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: 'SA-2025-0002' },
    update: {},
    create: {
      agreementRef: 'SA-2025-0002', participantId: p2.id, providerId: prov2.id,
      startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31'),
      status: 'ACTIVE',
      notes: 'OT and physio sessions fortnightly.',
      managedById: planManager.id,
    },
  })
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa2.id, categoryCode: '15', categoryName: 'Improved Daily Living', supportItemCode: '15_056_0128_1_3', supportItemName: 'Occupational Therapy', agreedRateCents: 19381, unitType: 'H' },
    { agreementId: sa2.id, categoryCode: '15', categoryName: 'Improved Daily Living', supportItemCode: '15_037_0128_1_3', supportItemName: 'Physiotherapy', agreedRateCents: 19381, unitType: 'H' },
  ]})

  const sa3 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: 'SA-2025-0003' },
    update: {},
    create: {
      agreementRef: 'SA-2025-0003', participantId: p3.id, providerId: prov5.id,
      startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'),
      status: 'ACTIVE',
      notes: 'SIL — 20 hrs/week.',
      managedById: pm2.id,
    },
  })
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa3.id, categoryCode: '11', categoryName: 'Improved Living Arrangements', supportItemCode: '11_022_0115_1_1', supportItemName: 'Assistance in Supported Independent Living', agreedRateCents: 6547, unitType: 'H' },
  ]})

  const sa4 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: 'SA-2025-0004' },
    update: {},
    create: {
      agreementRef: 'SA-2025-0004', participantId: p6.id, providerId: prov6.id,
      startDate: new Date('2025-08-01'), endDate: new Date('2026-07-31'),
      status: 'ACTIVE',
      notes: 'Psychology sessions weekly.',
      managedById: planManager.id,
    },
  })
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa4.id, categoryCode: '15', categoryName: 'Improved Daily Living', supportItemCode: '15_043_0128_1_3', supportItemName: 'Psychology Services', agreedRateCents: 23456, unitType: 'H' },
  ]})

  const sa5 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: 'SA-2024-0021' },
    update: {},
    create: {
      agreementRef: 'SA-2024-0021', participantId: p14.id, providerId: prov3.id,
      startDate: new Date('2024-07-01'), endDate: new Date('2025-06-30'),
      status: 'EXPIRED',
      notes: 'Expired agreement — not renewed.',
      managedById: planManager.id,
    },
  })
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa5.id, categoryCode: '01', categoryName: 'Daily Activities', supportItemCode: '01_011_0107_1_1', supportItemName: 'Assistance With Self-Care Activities - Weekday Daytime', agreedRateCents: 6547, unitType: 'H' },
  ]})

  // SA Budget Allocations
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa1.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { serviceAgreementId: sa1.id, budgetLineId: bl1_01.id, allocatedCents: 3000000, note: 'Daily care allocation FY2025-26', createdById: planManager.id },
  })
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa2.id, budgetLineId: bl2_15.id } },
    update: {},
    create: { serviceAgreementId: sa2.id, budgetLineId: bl2_15.id, allocatedCents: 800000, note: 'Therapy sessions FY2025-26', createdById: planManager.id },
  })
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa3.id, budgetLineId: bl3_11.id } },
    update: {},
    create: { serviceAgreementId: sa3.id, budgetLineId: bl3_11.id, allocatedCents: 6800000, note: 'SIL full year allocation', createdById: pm2.id },
  })

  console.log('  ✓ 5 service agreements + 3 SA budget allocations created')

  // ─── 11. FUND QUARANTINES ─────────────────────────────────────────────────
  console.log('  Creating fund quarantines...')

  const q1Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl1_01.id, providerId: prov1.id, supportItemCode: '01_011_0107_1_1' } })
  if (!q1Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa1.id, budgetLineId: bl1_01.id, providerId: prov1.id,
      supportItemCode: '01_011_0107_1_1', quarantinedCents: 500000, usedCents: 130940,
      status: 'ACTIVE', limitType: 'SOFT',
      notes: 'Earmarked for Sunrise Therapy daily care.',
      createdById: planManager.id,
    }})
  }

  const q2Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl3_11.id, providerId: prov5.id, supportItemCode: '11_022_0115_1_1' } })
  if (!q2Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa3.id, budgetLineId: bl3_11.id, providerId: prov5.id,
      supportItemCode: '11_022_0115_1_1', quarantinedCents: 3000000, usedCents: 2615000,
      status: 'ACTIVE', limitType: 'HARD',
      notes: 'Hard limit — HorizonCare SIL weekly hours capped.',
      createdById: pm2.id,
    }})
  }

  const q3Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl2_15.id, providerId: prov2.id, supportItemCode: null } })
  if (!q3Existing) {
    await prisma.fqQuarantine.create({ data: {
      budgetLineId: bl2_15.id, providerId: prov2.id,
      quarantinedCents: 600000, usedCents: 600000,
      status: 'RELEASED', limitType: 'SOFT',
      notes: 'Released after SA review Dec 2025.',
      createdById: planManager.id,
    }})
  }

  const q4Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl6_15.id, providerId: prov6.id, supportItemCode: '15_043_0128_1_3' } })
  if (!q4Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa4.id, budgetLineId: bl6_15.id, providerId: prov6.id,
      supportItemCode: '15_043_0128_1_3', quarantinedCents: 1500000, usedCents: 0,
      status: 'ACTIVE', limitType: 'SOFT',
      notes: 'Psychology sessions year allocation.',
      createdById: planManager.id,
    }})
  }

  console.log('  ✓ 4 fund quarantines created')

  // ─── 12. DOCUMENTS ────────────────────────────────────────────────────────
  console.log('  Creating documents...')

  const docsData = [
    { participantId: p1.id, name: 'Oliver Bennett — NDIS Plan Letter Jul 2025', category: 'PLAN_LETTER' as const, mimeType: 'application/pdf', sizeBytes: 245000, s3Key: 'documents/p1/plan-letter-2025-07.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
    { participantId: p1.id, name: 'Sunrise Therapy Service Agreement Jul 2025', category: 'SERVICE_AGREEMENT' as const, mimeType: 'application/pdf', sizeBytes: 180000, s3Key: 'documents/p1/sa-sunrise-2025-07.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: sa1.id },
    { participantId: p2.id, name: 'Amara Osei — NDIS Plan Letter Sep 2025', category: 'PLAN_LETTER' as const, mimeType: 'application/pdf', sizeBytes: 220000, s3Key: 'documents/p2/plan-letter-2025-09.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
    { participantId: p3.id, name: 'Liam Fitzgerald — OT Assessment Report', category: 'ASSESSMENT' as const, mimeType: 'application/pdf', sizeBytes: 512000, s3Key: 'documents/p3/ot-assessment-2025.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
    { participantId: p3.id, name: 'HorizonCare SIL Agreement Jul 2025', category: 'SERVICE_AGREEMENT' as const, mimeType: 'application/pdf', sizeBytes: 320000, s3Key: 'documents/p3/sa-horizoncare-2025-07.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: sa3.id },
    { participantId: p5.id, name: 'Marcus Hartley — Functional Capacity Assessment', category: 'ASSESSMENT' as const, mimeType: 'application/pdf', sizeBytes: 680000, s3Key: 'documents/p5/fca-2025.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
    { participantId: p8.id, name: 'Isabel Crawford — Support Plan 2025-26', category: 'PLAN_LETTER' as const, mimeType: 'application/pdf', sizeBytes: 195000, s3Key: 'documents/p8/support-plan-2025.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
    { participantId: p10.id, name: 'Fatima Hassan — Welcome Pack', category: 'CORRESPONDENCE' as const, mimeType: 'application/pdf', sizeBytes: 150000, s3Key: 'documents/p10/welcome-pack-2025.pdf', s3Bucket: 'lotus-pm-documents', serviceAgreementId: null },
  ]

  for (const doc of docsData) {
    const existing = await prisma.docDocument.findFirst({ where: { participantId: doc.participantId, name: doc.name } })
    if (!existing) {
      await prisma.docDocument.create({ data: { ...doc, uploadedById: planManager.id } })
    }
  }

  console.log('  ✓ 8 documents created')

  // ─── 13. CRM FLAGS ────────────────────────────────────────────────────────
  console.log('  Creating CRM flags...')

  const flagsData = [
    { participantId: p9.id as string | undefined, providerId: undefined as string | undefined, severity: 'ADVISORY' as const, reason: 'Participant has expressed dissatisfaction with current support hours. Monitor closely.', createdById: planManager.id, resolvedAt: null as Date | null, resolvedById: null as string | null, resolveNote: null as string | null },
    { participantId: p3.id, providerId: undefined, severity: 'BLOCKING' as const, reason: 'Possible duplicate invoice detected — INV HCSIL-FEB-001 exceeds plan budget by $5,883. Do not approve without PM review.', createdById: pm2.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: undefined, providerId: prov10.id, severity: 'BLOCKING' as const, reason: 'Provider suspended by NDIS Commission effective 15 Jan 2026. Do not process any invoices.', createdById: director.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: undefined, providerId: prov3.id, severity: 'ADVISORY' as const, reason: 'New ABN registered — awaiting NDIS registration confirmation. Cross-check invoices carefully.', createdById: planManager.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: p5.id, providerId: undefined, severity: 'ADVISORY' as const, reason: 'Participant moving to regional area. Pricing region may need updating to REMOTE effective 1 Mar 2026.', createdById: pm2.id, resolvedAt: new Date('2026-02-01T10:00:00Z'), resolvedById: pm2.id, resolveNote: 'Pricing region updated to REMOTE.' },
    { participantId: undefined, providerId: prov2.id, severity: 'ADVISORY' as const, reason: 'Allied Health Partners changed bank account — verify new BSB/account on next invoice.', createdById: planManager.id, resolvedAt: new Date('2026-01-20T14:00:00Z'), resolvedById: planManager.id, resolveNote: 'Bank details verified and updated.' },
  ]

  for (const f of flagsData) {
    const existing = await prisma.crmFlag.findFirst({ where: { reason: f.reason } })
    if (!existing) {
      await prisma.crmFlag.create({ data: f })
    }
  }

  console.log('  ✓ 6 CRM flags created')

  // ─── 14. COORDINATOR ASSIGNMENTS ─────────────────────────────────────────
  console.log('  Creating coordinator assignments...')

  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p1.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p1.id, organisation: 'CarePath Support Services', assignedById: planManager.id, isActive: true },
  })
  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p3.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p3.id, organisation: 'CarePath Support Services', assignedById: pm2.id, isActive: true },
  })
  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p8.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p8.id, organisation: 'CarePath Support Services', assignedById: planManager.id, isActive: false, deactivatedAt: new Date('2026-01-15T00:00:00Z') },
  })

  console.log('  ✓ 3 coordinator assignments created')

  // ─── 15. PM FEE SCHEDULES ─────────────────────────────────────────────────
  console.log('  Creating PM fee schedules...')

  const feeSchedule1 = await prisma.pmFeeSchedule.findFirst({ where: { name: 'Monthly Plan Management Fee' } })
  const feeSchedMonthly = feeSchedule1 ?? await prisma.pmFeeSchedule.create({ data: {
    name: 'Monthly Plan Management Fee',
    supportItemCode: '14_033_0127_8_3',
    description: 'Standard monthly plan management fee per NDIS Price Guide 2025-26.',
    rateCents: 15477,
    frequency: 'MONTHLY',
    isActive: true,
  }})

  const feeSchedule2 = await prisma.pmFeeSchedule.findFirst({ where: { name: 'Plan Management Setup Fee' } })
  const feeSchedSetup = feeSchedule2 ?? await prisma.pmFeeSchedule.create({ data: {
    name: 'Plan Management Setup Fee',
    supportItemCode: '14_034_0127_8_3',
    description: 'One-off setup fee for new participants.',
    rateCents: 23310,
    frequency: 'ONE_OFF',
    isActive: true,
  }})

  // Fee overrides
  await prisma.pmFeeOverride.upsert({
    where: { feeScheduleId_participantId: { feeScheduleId: feeSchedMonthly.id, participantId: p5.id } },
    update: {},
    create: { feeScheduleId: feeSchedMonthly.id, participantId: p5.id, rateCents: 12000, notes: 'Negotiated reduced rate — remote participant.' },
  })
  await prisma.pmFeeOverride.upsert({
    where: { feeScheduleId_participantId: { feeScheduleId: feeSchedMonthly.id, participantId: p14.id } },
    update: {},
    create: { feeScheduleId: feeSchedMonthly.id, participantId: p14.id, rateCents: 12000, notes: 'Very remote — reduced rate.' },
  })

  // Fee charges
  const feeChargesData = [
    { feeScheduleId: feeSchedMonthly.id, participantId: p1.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), amountCents: 15477, status: 'CLAIMED' as const },
    { feeScheduleId: feeSchedMonthly.id, participantId: p2.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), amountCents: 15477, status: 'CLAIMED' as const },
    { feeScheduleId: feeSchedMonthly.id, participantId: p3.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), amountCents: 15477, status: 'PENDING' as const },
    { feeScheduleId: feeSchedMonthly.id, participantId: p1.id, periodStart: new Date('2026-02-01'), periodEnd: new Date('2026-02-28'), amountCents: 15477, status: 'PENDING' as const },
    { feeScheduleId: feeSchedSetup.id, participantId: p10.id, periodStart: new Date('2025-09-01'), periodEnd: new Date('2025-09-01'), amountCents: 23310, status: 'PAID' as const },
    { feeScheduleId: feeSchedSetup.id, participantId: p13.id, periodStart: new Date('2025-10-01'), periodEnd: new Date('2025-10-01'), amountCents: 23310, status: 'PAID' as const },
  ]
  for (const fc of feeChargesData) {
    await prisma.pmFeeCharge.upsert({
      where: { feeScheduleId_participantId_periodStart: { feeScheduleId: fc.feeScheduleId, participantId: fc.participantId, periodStart: fc.periodStart } },
      update: {},
      create: fc,
    })
  }

  console.log('  ✓ 2 fee schedules + 2 overrides + 6 charges created')

  // ─── 16. PARTICIPANT STATEMENTS ───────────────────────────────────────────
  console.log('  Creating participant statements...')

  const stmtsData = [
    { participantId: p1.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), deliveryMethod: 'EMAIL' as const, sentAt: new Date('2026-02-02T09:00:00Z'), s3Key: 'statements/p1/2026-01.pdf', totalInvoicedCents: 124393, totalClaimedCents: 124393, totalPaidCents: 58923, budgetRemainingCents: 3551607, lineItems: [] as unknown as Prisma.InputJsonValue, createdById: planManager.id },
    { participantId: p2.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), deliveryMethod: 'EMAIL' as const, sentAt: new Date('2026-02-02T09:00:00Z'), s3Key: 'statements/p2/2026-01.pdf', totalInvoicedCents: 116286, totalClaimedCents: 116286, totalPaidCents: 116286, budgetRemainingCents: 3483714, lineItems: [] as unknown as Prisma.InputJsonValue, createdById: planManager.id },
    { participantId: p3.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), deliveryMethod: 'EMAIL' as const, sentAt: null, s3Key: null, totalInvoicedCents: 261880, totalClaimedCents: 261880, totalPaidCents: 0, budgetRemainingCents: 5900000, lineItems: [] as unknown as Prisma.InputJsonValue, createdById: pm2.id },
    { participantId: p8.id, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-01-31'), deliveryMethod: 'EMAIL' as const, sentAt: new Date('2026-02-03T09:00:00Z'), s3Key: 'statements/p8/2026-01.pdf', totalInvoicedCents: 117280, totalClaimedCents: 117280, totalPaidCents: 0, budgetRemainingCents: 3882720, lineItems: [] as unknown as Prisma.InputJsonValue, createdById: planManager.id },
  ]

  for (const stmt of stmtsData) {
    const existing = await prisma.participantStatement.findFirst({ where: { participantId: stmt.participantId, periodStart: stmt.periodStart } })
    if (!existing) {
      await prisma.participantStatement.create({ data: stmt })
    }
  }

  console.log('  ✓ 4 participant statements created')

  // ─── 17. EMAIL TEMPLATES ──────────────────────────────────────────────────
  console.log('  Creating email templates...')

  const templatesData = [
    { name: 'Welcome Pack — Standard', type: 'WELCOME_PACK' as const, subject: 'Welcome to Lotus Plan Management — {{participantName}}', bodyHtml: '<h1>Welcome {{participantName}}</h1><p>We are delighted to support your NDIS journey.</p>', mergeFields: ['participantName', 'planManagerName'], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: 'Signed Service Agreement' },
    { name: 'Service Agreement — Standard', type: 'SERVICE_AGREEMENT' as const, subject: 'Your Service Agreement — {{providerName}}', bodyHtml: '<p>Please find attached your service agreement with {{providerName}}.</p>', mergeFields: ['participantName', 'providerName', 'agreementRef'], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: 'Service Agreement PDF' },
    { name: 'Invoice Received Notification', type: 'INVOICE_NOTIFICATION' as const, subject: 'Invoice {{invoiceNumber}} received from {{providerName}}', bodyHtml: '<p>We have received invoice {{invoiceNumber}} from {{providerName}} for ${{invoiceTotal}}.</p>', mergeFields: ['participantName', 'providerName', 'invoiceNumber', 'invoiceTotal'], isActive: true, supportsVariableAttachment: false },
    { name: 'Claim Status — Approved', type: 'CLAIM_STATUS' as const, subject: 'NDIS Claim {{claimRef}} Approved', bodyHtml: '<p>Your claim {{claimRef}} for ${{claimAmount}} has been approved by the NDIS.</p>', mergeFields: ['participantName', 'claimRef', 'claimAmount'], isActive: true, supportsVariableAttachment: false },
    { name: 'Monthly Budget Report', type: 'BUDGET_REPORT' as const, subject: 'Your Monthly Budget Report — {{month}} {{year}}', bodyHtml: '<p>Please find your budget utilisation report for {{month}} {{year}} attached.</p>', mergeFields: ['participantName', 'month', 'year'], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: 'Budget Report PDF' },
    { name: 'Invoice Approval Request', type: 'APPROVAL_REQUEST' as const, subject: 'Please approve invoice from {{providerName}} — action required', bodyHtml: '<p>Invoice {{invoiceNumber}} from {{providerName}} requires your approval. Click the link below to approve or reject.</p><p><a href="{{approvalLink}}">Review Invoice</a></p>', mergeFields: ['participantName', 'providerName', 'invoiceNumber', 'approvalLink'], isActive: true, includesFormLink: true, supportsVariableAttachment: false },
    { name: 'Custom Notice — Standard', type: 'CUSTOM' as const, subject: '{{subject}}', bodyHtml: '<p>{{body}}</p>', mergeFields: ['subject', 'body', 'recipientName'], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: 'Optional attachment' },
  ]

  for (const tmpl of templatesData) {
    await prisma.notifEmailTemplate.upsert({
      where: { name: tmpl.name },
      update: {},
      create: { ...tmpl, mergeFields: tmpl.mergeFields as unknown as Prisma.InputJsonValue, createdById: director.id },
    })
  }

  // Upsert the provider-facing invoice receipt acknowledgment template.
  // Idempotent — update: {} ensures customised versions are never overwritten.
  const ackBodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice Received — {companyName}</title>
</head>
<body style="margin:0;padding:0;background-color:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fafaf9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#292524;padding:32px 40px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">{companyName}</p>
              <p style="margin:4px 0 0;color:#a8a29e;font-size:13px;">NDIS Plan Management</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;color:#292524;font-size:24px;font-weight:600;">Invoice Received</h1>
              <p style="margin:0 0 16px;color:#78716c;font-size:15px;line-height:1.6;">
                Thank you for submitting your invoice. We have received it and it is now being processed.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fafaf9;border:1px solid #e7e5e4;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Reference Number</p>
                    <p style="margin:0;color:#292524;font-size:15px;font-weight:600;font-family:monospace;">{invoiceNumber}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;color:#78716c;font-size:15px;line-height:1.6;">
                You can track the status of your invoice through the {companyName} provider portal.
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#292524;border-radius:6px;">
                    <a href="{invoicePortalLink}" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Track My Invoice</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#78716c;font-size:14px;line-height:1.6;">
                Processing typically takes up to 10 business days. We will contact you if we need any additional information.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e7e5e4;background-color:#fafaf9;">
              <p style="margin:0 0 4px;color:#78716c;font-size:13px;font-weight:600;">{companyName}</p>
              <p style="margin:0;color:#a8a29e;font-size:13px;">Phone: {companyPhone}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const ackBodyText = `Invoice Received — {companyName}

Thank you for submitting your invoice. We have received it and it is now being processed.

Your reference number is: {invoiceNumber}

You can track the status of your invoice through the {companyName} provider portal:
{invoicePortalLink}

Processing typically takes up to 10 business days. We will contact you if we need any additional information.

{companyName}
Phone: {companyPhone}`

  await prisma.notifEmailTemplate.upsert({
    where: { name: 'Invoice Received — Acknowledgment' },
    update: {},
    create: {
      name: 'Invoice Received — Acknowledgment',
      type: 'INVOICE_NOTIFICATION',
      subject: "We've received your invoice — {companyName}",
      bodyHtml: ackBodyHtml,
      bodyText: ackBodyText,
      mergeFields: ['invoiceNumber', 'invoicePortalLink', 'companyName', 'companyPhone', 'today'] as unknown as Prisma.InputJsonValue,
      isActive: true,
      supportsVariableAttachment: false,
      createdById: SYSTEM_USER_ID,
    },
  })

  console.log('  ✓ 8 email templates created')

  // ─── 18. AUTOMATION RULES ─────────────────────────────────────────────────
  console.log('  Creating automation rules...')

  const rulesData = [
    {
      name: 'Flag invoice when provider is suspended',
      description: 'Automatically flag for review when an invoice arrives from a suspended provider.',
      isActive: true,
      triggerType: 'EVENT' as const,
      triggerEvent: 'lotus-pm.invoices.received',
      conditions: [{ field: 'provider.providerStatus', operator: 'equals', value: 'SUSPENDED' }] as unknown as Prisma.InputJsonValue,
      actions: [{ type: 'flag', params: { severity: 'BLOCKING', reason: 'Invoice from suspended provider — requires review.' } }] as unknown as Prisma.InputJsonValue,
    },
    {
      name: 'Send SMS when invoice approved',
      description: 'Notify participant via SMS when their invoice is approved.',
      isActive: true,
      triggerType: 'EVENT' as const,
      triggerEvent: 'lotus-pm.invoices.approved',
      conditions: [{ field: 'participant.phone', operator: 'exists' }] as unknown as Prisma.InputJsonValue,
      actions: [{ type: 'sms', params: { message: 'Your invoice from {{providerName}} has been approved.' } }] as unknown as Prisma.InputJsonValue,
    },
    {
      name: 'Daily expiring plan alert',
      description: 'Send in-app notification to plan managers when plans are expiring within 60 days.',
      isActive: true,
      triggerType: 'SCHEDULE' as const,
      cronExpression: '0 8 * * *',
      conditions: [{ field: 'plan.daysUntilExpiry', operator: 'lessThan', value: 60 }] as unknown as Prisma.InputJsonValue,
      actions: [{ type: 'notification', params: { channel: 'IN_APP', message: 'Plan for {{participantName}} expires in {{daysUntilExpiry}} days.' } }] as unknown as Prisma.InputJsonValue,
    },
    {
      name: 'Weekly budget utilisation report',
      description: 'Generate weekly budget utilisation summary for plan managers.',
      isActive: false,
      triggerType: 'SCHEDULE' as const,
      cronExpression: '0 7 * * 1',
      conditions: [] as unknown as Prisma.InputJsonValue,
      actions: [{ type: 'report', params: { reportType: 'budget_utilisation', recipients: ['pm@lotusassist.com.au'] } }] as unknown as Prisma.InputJsonValue,
    },
  ]

  for (const rule of rulesData) {
    const existing = await prisma.autoRule.findFirst({ where: { name: rule.name } })
    if (!existing) {
      await prisma.autoRule.create({ data: rule })
    }
  }

  console.log('  ✓ 4 automation rules created')

  // ─── 19. NOTIFICATIONS ────────────────────────────────────────────────────
  console.log('  Creating notifications...')

  const notifsData = [
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Invoice STS-2026-0101 ready for review', message: 'Invoice STS-2026-0101 from Sunrise Therapy Services has been extracted and is ready for approval.', status: 'SENT' as const, userId: planManager.id, readAt: new Date('2026-01-11T10:00:00Z'), participantId: p1.id },
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Invoice AHP-INV-20260115 approved', message: 'Invoice AHP-INV-20260115 from Allied Health Partners has been approved. Claim CLM-2026-0002 created.', status: 'SENT' as const, userId: planManager.id, readAt: new Date('2026-01-16T09:35:00Z'), participantId: p2.id },
    { channel: 'IN_APP' as const, recipient: pm2.id, subject: 'Invoice HCSIL-FEB-001 rejected — budget exceeded', message: 'Invoice HCSIL-FEB-001 from HorizonCare SIL was rejected. Total exceeds Category 11 budget.', status: 'SENT' as const, userId: pm2.id, readAt: null, participantId: p3.id },
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Plan expiring soon — Oliver Bennett', message: 'Oliver Bennett\'s NDIS plan expires on 30 Jun 2026 — review date is 1 May 2026.', status: 'SENT' as const, userId: planManager.id, readAt: null, participantId: p1.id },
    { channel: 'IN_APP' as const, recipient: pm2.id, subject: 'New invoice AHP-INV-20260201 requires attention', message: 'Invoice AHP-INV-20260201 from Allied Health Partners is in PENDING_REVIEW — missing NDIS codes.', status: 'SENT' as const, userId: pm2.id, readAt: null, participantId: p4.id },
    { channel: 'IN_APP' as const, recipient: director.id, subject: 'Provider suspended — Nexus Disability Services', message: 'Nexus Disability Services (ABN 01234567890) has been suspended. All pending invoices have been flagged.', status: 'SENT' as const, userId: director.id, readAt: new Date('2026-01-15T11:00:00Z') },
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Claim CLM-2026-0001 approved by PRODA', message: 'Claim CLM-2026-0001 for Oliver Bennett ($654.70) has been approved by the NDIS portal.', status: 'SENT' as const, userId: planManager.id, readAt: new Date('2026-01-17T11:00:00Z'), participantId: p1.id },
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Participant approval request sent — Amara Osei', message: 'Invoice approval request for AHP-INV-20260205 has been sent to Amara Osei via email.', status: 'SENT' as const, userId: planManager.id, readAt: null, participantId: p2.id },
    { channel: 'IN_APP' as const, recipient: pm2.id, subject: 'Budget alert — Connor Walsh plan 95% utilised', message: 'Connor Walsh\'s NDIS plan budget is 95% utilised with 2 months remaining.', status: 'SENT' as const, userId: pm2.id, readAt: null, participantId: p11.id },
    { channel: 'IN_APP' as const, recipient: planManager.id, subject: 'Statement generated — 4 participants', message: 'January 2026 statements have been generated for 4 participants and are ready to send.', status: 'SENT' as const, userId: planManager.id, readAt: null },
    { channel: 'SMS' as const, recipient: '+61411100001', message: 'Lotus PM: Your invoice from Sunrise Therapy Services ($654.70) has been approved. Ref: CLM-2026-0001.', status: 'SENT' as const, sentAt: new Date('2026-01-13T10:05:00Z'), participantId: p1.id },
    { channel: 'SMS' as const, recipient: '+61422200002', message: 'Lotus PM: Invoice approval required. Please check your email for details. Ref: AHP-INV-20260205.', status: 'SENT' as const, sentAt: new Date('2026-02-05T10:15:00Z'), participantId: p2.id },
    { channel: 'SMS' as const, recipient: '+61400500014', message: 'Lotus PM: Your January 2026 budget statement is available. Contact your plan manager for details.', status: 'DELIVERED' as const, sentAt: new Date('2026-02-02T09:05:00Z'), participantId: p14.id },
    { channel: 'EMAIL' as const, recipient: 'oliver.bennett@email.com.au', subject: 'Your January 2026 Budget Statement', message: 'Please find your January 2026 budget statement attached.', status: 'SENT' as const, sentAt: new Date('2026-02-02T09:00:00Z'), participantId: p1.id },
    { channel: 'EMAIL' as const, recipient: 'amara.osei@hotmail.com', subject: 'Invoice Approval Required — AHP-INV-20260205', message: 'Invoice AHP-INV-20260205 from Allied Health Partners requires your approval.', status: 'SENT' as const, sentAt: new Date('2026-02-05T10:15:00Z'), participantId: p2.id },
  ]

  for (const n of notifsData) {
    const existing = await prisma.notifNotification.findFirst({ where: { recipient: n.recipient, message: n.message } })
    if (!existing) {
      await prisma.notifNotification.create({ data: n })
    }
  }

  console.log('  ✓ 15 notifications created')

  // ─── 20. COMM LOGS ────────────────────────────────────────────────────────
  console.log('  Creating comm logs...')

  const commLogsData = [
    { type: 'EMAIL' as const, direction: 'INBOUND' as const, subject: 'RE: Service Agreement renewal', body: 'Hi Sarah, yes we are happy to renew the service agreement for another 12 months.', participantId: p1.id, providerId: prov1.id, userId: planManager.id, occurredAt: new Date('2026-01-05T10:00:00Z') },
    { type: 'PHONE' as const, direction: 'OUTBOUND' as const, subject: 'Follow-up re invoice AHP-INV-20260201', body: 'Called Allied Health Partners re missing NDIS codes on invoice. They will resend with corrections.', participantId: p4.id, providerId: prov2.id, userId: planManager.id, occurredAt: new Date('2026-02-02T11:00:00Z') },
    { type: 'EMAIL' as const, direction: 'OUTBOUND' as const, subject: 'Welcome to Lotus Plan Management', body: 'Welcome pack sent to Fatima Hassan. Includes service guide, fee schedule, and contact details.', participantId: p10.id, userId: planManager.id, occurredAt: new Date('2025-09-05T09:00:00Z') },
    { type: 'SMS' as const, direction: 'OUTBOUND' as const, body: 'Hi Oliver, your invoice from Sunrise Therapy has been approved. Payment will be made within 2 business days.', participantId: p1.id, userId: planManager.id, occurredAt: new Date('2026-01-13T10:05:00Z') },
    { type: 'NOTE' as const, direction: 'INTERNAL' as const, subject: 'Participant capacity assessment required', body: 'Liam Fitzgerald requires updated functional capacity assessment before next plan review. Contact OT provider.', participantId: p3.id, userId: pm2.id, occurredAt: new Date('2026-01-20T14:00:00Z') },
    { type: 'EMAIL' as const, direction: 'INBOUND' as const, subject: 'Invoice CC-2026-0045 — January support hours', body: 'Please find attached our invoice for January support services for Marcus Hartley.', participantId: p5.id, providerId: prov3.id, userId: pm2.id, occurredAt: new Date('2026-02-10T11:00:00Z') },
    { type: 'PHONE' as const, direction: 'INBOUND' as const, subject: 'Query re payment timing', body: 'Provider HorizonCare called re payment timing for HCSIL-JAN-001. Advised payment within 5 business days of claim approval.', participantId: p3.id, providerId: prov5.id, userId: pm2.id, occurredAt: new Date('2026-02-05T09:30:00Z') },
    { type: 'EMAIL' as const, direction: 'OUTBOUND' as const, subject: 'Monthly budget utilisation — January 2026', body: 'Budget summary for January 2026 sent to Oliver Bennett at request.', participantId: p1.id, userId: planManager.id, occurredAt: new Date('2026-02-02T10:00:00Z') },
    { type: 'IN_PERSON' as const, direction: 'INBOUND' as const, subject: 'Annual review meeting', body: 'Met with Sophie Nguyen and family re plan review. Support hours to increase from 15 to 20 hrs/week.', participantId: p4.id, userId: planManager.id, occurredAt: new Date('2026-01-28T10:00:00Z') },
    { type: 'NOTE' as const, direction: 'INTERNAL' as const, subject: 'ABA file submitted — Jan run', body: 'ABA file lotus-pm-aba-2026-01-20.aba submitted to CBA CommBiz. Ref CBA-20260120-001. 3 payments totalling $2,997.09.', userId: planManager.id, occurredAt: new Date('2026-01-20T14:05:00Z') },
    { type: 'EMAIL' as const, direction: 'OUTBOUND' as const, subject: 'Invoice rejected — NDS-2026-0101', body: 'Invoice NDS-2026-0101 from Nexus Disability Services has been rejected. Provider is currently suspended.', participantId: p9.id, providerId: prov10.id, userId: planManager.id, occurredAt: new Date('2026-01-06T14:05:00Z') },
    { type: 'PORTAL_MESSAGE' as const, direction: 'INBOUND' as const, subject: 'Portal query re payment', body: 'Provider Sunrise Therapy asked via portal when CLM-2026-0001 payment will be processed.', providerId: prov1.id, userId: planManager.id, occurredAt: new Date('2026-01-18T09:00:00Z') },
    { type: 'SMS' as const, direction: 'OUTBOUND' as const, body: 'Lotus PM: Invoice from Allied Health Partners requires your approval. Check your email. Ref AHP-INV-20260205.', participantId: p2.id, userId: planManager.id, occurredAt: new Date('2026-02-05T10:15:00Z') },
    { type: 'NOTE' as const, direction: 'INTERNAL' as const, subject: 'Flag raised — provider suspended', body: 'Blocking flag raised on Nexus Disability Services following NDIS Commission suspension notice received 15 Jan 2026.', providerId: prov10.id, userId: director.id, occurredAt: new Date('2026-01-15T11:00:00Z') },
    { type: 'EMAIL' as const, direction: 'INBOUND' as const, subject: 'New bank details — Allied Health Partners', body: 'Please update our bank details: BSB 033-000, Acc 23456789, Allied Health Partners Pty Ltd.', providerId: prov2.id, userId: planManager.id, occurredAt: new Date('2026-01-19T09:00:00Z') },
    { type: 'PHONE' as const, direction: 'OUTBOUND' as const, subject: 'Verification call — bank details', body: 'Called Allied Health Partners to verify new bank account details. Confirmed — updated in system.', providerId: prov2.id, userId: planManager.id, occurredAt: new Date('2026-01-20T14:00:00Z') },
    { type: 'EMAIL' as const, direction: 'OUTBOUND' as const, subject: 'Service agreement renewal reminder', body: 'SA-2024-0021 for Margaret Sullivan expired 30 Jun 2025. Please contact provider re renewal.', participantId: p14.id, userId: planManager.id, occurredAt: new Date('2025-07-02T09:00:00Z') },
    { type: 'NOTE' as const, direction: 'INTERNAL' as const, subject: 'Remote pricing region — Marcus Hartley', body: 'Marcus Hartley confirmed move to remote area effective 1 Mar 2026. Pricing region to be updated.', participantId: p5.id, userId: pm2.id, occurredAt: new Date('2026-01-25T10:00:00Z') },
    { type: 'EMAIL' as const, direction: 'INBOUND' as const, subject: 'Query re statement', body: 'Oliver Bennett emailed asking for breakdown of January 2026 spending. Sent budget report.', participantId: p1.id, userId: planManager.id, occurredAt: new Date('2026-02-04T09:00:00Z') },
    { type: 'NOTE' as const, direction: 'INTERNAL' as const, subject: 'Onboarding completed — Fatima Hassan', body: 'Fatima Hassan onboarding complete. Plan active, welcome pack sent, service agreement with Allied Health Partners in place.', participantId: p10.id, userId: planManager.id, occurredAt: new Date('2025-09-10T10:00:00Z') },
  ]

  for (const cl of commLogsData) {
    const existing = await prisma.crmCommLog.findFirst({ where: { body: cl.body, occurredAt: cl.occurredAt } })
    if (!existing) {
      await prisma.crmCommLog.create({ data: cl })
    }
  }

  console.log('  ✓ 20 comm logs created')

  // ─── 21. CORRESPONDENCE ───────────────────────────────────────────────────
  console.log('  Creating correspondence...')

  const corrData = [
    { type: 'EMAIL_OUTBOUND' as const, subject: 'Welcome to Lotus Plan Management', body: 'Dear Oliver, welcome to Lotus Plan Management. We look forward to supporting your NDIS journey.', fromAddress: 'pm@lotusassist.com.au', toAddress: 'oliver.bennett@email.com.au', participantId: p1.id, createdById: planManager.id },
    { type: 'EMAIL_INBOUND' as const, subject: 'Invoice STS-2026-0101', body: 'Please find attached invoice STS-2026-0101 for support services provided in January 2026.', fromAddress: 'accounts@sunrisetherapy.com.au', toAddress: 'invoices@lotusassist.com.au', participantId: p1.id, providerId: prov1.id, createdById: planManager.id },
    { type: 'EMAIL_OUTBOUND' as const, subject: 'Claim approved — CLM-2026-0002', body: 'Dear Amara, your claim CLM-2026-0002 for $1,162.86 from Allied Health Partners has been approved by the NDIS.', fromAddress: 'pm@lotusassist.com.au', toAddress: 'amara.osei@hotmail.com', participantId: p2.id, createdById: planManager.id },
    { type: 'NOTE' as const, subject: 'Internal: Provider bank details updated', body: 'Allied Health Partners bank details verified and updated following phone call on 20 Jan 2026.', providerId: prov2.id, createdById: planManager.id },
    { type: 'EMAIL_OUTBOUND' as const, subject: 'Invoice rejected — budget exceeded', body: 'Dear HorizonCare SIL, invoice HCSIL-FEB-001 has been rejected as it exceeds the remaining Category 11 budget.', fromAddress: 'pm2@lotusassist.com.au', toAddress: 'accounts@horizoncaresil.com.au', participantId: p3.id, providerId: prov5.id, createdById: pm2.id },
    { type: 'SMS_OUTBOUND' as const, body: 'Lotus PM: Your invoice from Sunrise Therapy has been approved. Payment within 2 business days.', toAddress: '+61411100001', participantId: p1.id, createdById: planManager.id },
    { type: 'EMAIL_INBOUND' as const, subject: 'Query re missing invoice codes', body: 'Hi, we have resent invoice AHP-INV-20260201 with the correct NDIS support item codes.', fromAddress: 'admin@alliedhealthpartners.com.au', toAddress: 'invoices@lotusassist.com.au', participantId: p4.id, providerId: prov2.id, createdById: planManager.id },
    { type: 'PHONE_CALL' as const, subject: 'Annual review call — Liam Fitzgerald', body: 'Outbound call to Liam Fitzgerald re annual plan review. Discussed support hours, no changes requested.', participantId: p3.id, createdById: pm2.id },
    { type: 'EMAIL_OUTBOUND' as const, subject: 'January 2026 Statement', body: 'Dear Oliver, please find your January 2026 financial statement attached.', fromAddress: 'pm@lotusassist.com.au', toAddress: 'oliver.bennett@email.com.au', participantId: p1.id, createdById: planManager.id },
    { type: 'NOTE' as const, subject: 'Suspension notice — Nexus Disability Services', body: 'NDIS Commission suspension notice received for Nexus Disability Services. Blocking flag raised. All pending invoices on hold.', providerId: prov10.id, createdById: director.id },
  ]

  for (const c of corrData) {
    const existing = await prisma.crmCorrespondence.findFirst({ where: { body: c.body } })
    if (!existing) {
      await prisma.crmCorrespondence.create({ data: c })
    }
  }

  console.log('  ✓ 10 correspondence records created')

  // ─── 22. INVOICE ITEM PATTERNS ────────────────────────────────────────────
  console.log('  Creating invoice item patterns...')

  const patternsData = [
    { providerId: prov1.id, participantId: p1.id, categoryCode: '01', itemNumber: '01_011_0107_1_1', occurrences: 12, lastSeenAt: new Date('2026-01-11T09:05:00Z') },
    { providerId: prov1.id, participantId: p1.id, categoryCode: '01', itemNumber: '01_015_0107_1_1', occurrences: 8, lastSeenAt: new Date('2026-01-11T09:05:00Z') },
    { providerId: prov1.id, participantId: null, categoryCode: '01', itemNumber: '01_011_0107_1_1', occurrences: 45, lastSeenAt: new Date('2026-01-11T09:05:00Z') },
    { providerId: prov2.id, participantId: p2.id, categoryCode: '15', itemNumber: '15_056_0128_1_3', occurrences: 15, lastSeenAt: new Date('2026-02-05T10:10:00Z') },
    { providerId: prov2.id, participantId: p2.id, categoryCode: '15', itemNumber: '15_037_0128_1_3', occurrences: 10, lastSeenAt: new Date('2026-01-15T14:10:00Z') },
    { providerId: prov5.id, participantId: p3.id, categoryCode: '11', itemNumber: '11_022_0115_1_1', occurrences: 24, lastSeenAt: new Date('2026-02-01T08:10:00Z') },
    { providerId: prov6.id, participantId: p6.id, categoryCode: '15', itemNumber: '15_043_0128_1_3', occurrences: 18, lastSeenAt: new Date('2026-02-12T15:00:00Z') },
    { providerId: prov6.id, participantId: p8.id, categoryCode: '15', itemNumber: '15_043_0128_1_3', occurrences: 12, lastSeenAt: new Date('2026-01-22T10:12:00Z') },
  ]

  for (const pat of patternsData) {
    const existingPat = await prisma.invItemPattern.findFirst({
      where: { providerId: pat.providerId, participantId: pat.participantId ?? null, categoryCode: pat.categoryCode, itemNumber: pat.itemNumber },
    })
    if (!existingPat) {
      await prisma.invItemPattern.create({ data: pat })
    }
  }

  console.log('  ✓ 8 invoice item patterns created')

  // ─── 23. AUDIT LOG ────────────────────────────────────────────────────────
  console.log('  Creating audit log sample...')

  const auditExists = await prisma.coreAuditLog.findFirst({ where: { action: 'invoice.approved', resourceId: inv1.id } })
  if (!auditExists) {
    await prisma.coreAuditLog.create({ data: {
      userId: planManager.id,
      action: 'invoice.approved',
      resource: 'invoice',
      resourceId: inv1.id,
      before: { status: 'PENDING_REVIEW' } as unknown as Prisma.InputJsonValue,
      after: { status: 'APPROVED', approvedById: planManager.id } as unknown as Prisma.InputJsonValue,
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    }})
  }

  console.log('  ✓ 1 audit log entry created')

  // ─── DONE ─────────────────────────────────────────────────────────────────
  console.log('')
  console.log('✅ Seed complete!')
  console.log('   6 users | 10 providers | 15 participants | 15 plans')
  console.log('   15 invoices | 8 claims | 8 payments | 5 service agreements')
  console.log('   4 fund quarantines | 8 documents | 15 notifications | 20 comm logs')
  console.log('   10 correspondence | 6 flags | 3 coordinator assignments')
  console.log('   2 fee schedules | 4 participant statements | 8 email templates')
  console.log('   4 automation rules | 8 item patterns | 1 NDIS price guide (15 items)')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
