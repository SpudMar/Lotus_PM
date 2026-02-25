"use strict";
var import_client = require("@prisma/client");
const prisma = new import_client.PrismaClient();
async function findOrCreateInvoice(data) {
  const existing = await prisma.invInvoice.findFirst({
    where: { invoiceNumber: data.invoiceNumber }
  });
  if (existing) return existing;
  return prisma.invInvoice.create({ data });
}
async function main() {
  console.log("\u{1F331} Seeding Lotus PM sandbox database...");
  async function addStatusHistory(invoiceId, transitions) {
    for (const t of transitions) {
      await prisma.invStatusHistory.create({
        data: {
          invoiceId,
          fromStatus: t.from ?? null,
          toStatus: t.to,
          changedAt: t.at,
          changedBy: t.changedBy ?? null,
          holdCategory: t.holdCategory ?? null,
          durationMs: t.durationMs ?? null
        }
      });
    }
  }
  console.log("  Creating users...");
  const director = await prisma.coreUser.upsert({
    where: { email: "director@lotusassist.com.au" },
    update: {},
    create: {
      email: "director@lotusassist.com.au",
      name: "Nicole Marsh",
      role: "GLOBAL_ADMIN",
      phone: "+61411941699",
      isActive: true,
      mfaEnabled: true
    }
  });
  const planManager = await prisma.coreUser.upsert({
    where: { email: "pm@lotusassist.com.au" },
    update: {},
    create: {
      email: "pm@lotusassist.com.au",
      name: "Sarah Chen",
      role: "PLAN_MANAGER",
      phone: "+61422111222",
      isActive: true,
      mfaEnabled: false
    }
  });
  const pm2 = await prisma.coreUser.upsert({
    where: { email: "pm2@lotusassist.com.au" },
    update: {},
    create: {
      email: "pm2@lotusassist.com.au",
      name: "James Okafor",
      role: "PLAN_MANAGER",
      phone: "+61433222333",
      isActive: true,
      mfaEnabled: false
    }
  });
  const assistant = await prisma.coreUser.upsert({
    where: { email: "assistant@lotusassist.com.au" },
    update: {},
    create: {
      email: "assistant@lotusassist.com.au",
      name: "Priya Nair",
      role: "ASSISTANT",
      phone: "+61444333444",
      isActive: true,
      mfaEnabled: false
    }
  });
  const coordinator = await prisma.coreUser.upsert({
    where: { email: "coordinator@carepath.com.au" },
    update: {},
    create: {
      email: "coordinator@carepath.com.au",
      name: "David Tran",
      role: "SUPPORT_COORDINATOR",
      phone: "+61455444555",
      isActive: true,
      mfaEnabled: false
    }
  });
  const providerUser = await prisma.coreUser.upsert({
    where: { email: "portal@sunrisetherapy.com.au" },
    update: {},
    create: {
      email: "portal@sunrisetherapy.com.au",
      name: "Sunrise Therapy Portal",
      role: "PROVIDER",
      isActive: true,
      mfaEnabled: false
    }
  });
  console.log("  \u2713 6 users created");
  console.log("  Creating providers...");
  const prov1 = await prisma.crmProvider.upsert({
    where: { abn: "12345678901" },
    update: {},
    create: {
      name: "Sunrise Therapy Services",
      abn: "12345678901",
      email: "accounts@sunrisetherapy.com.au",
      phone: "0298887700",
      address: "42 Pitt Street, Sydney NSW 2000",
      ndisRegistered: true,
      registrationNo: "NDI4010001",
      bankBsb: "062000",
      bankAccount: "12345678",
      bankAccountName: "Sunrise Therapy Services",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "Sunrise Therapy Services Pty Ltd",
      gstRegistered: true,
      portalUserId: providerUser.id
    }
  });
  const prov2 = await prisma.crmProvider.upsert({
    where: { abn: "23456789012" },
    update: {},
    create: {
      name: "Allied Health Partners",
      abn: "23456789012",
      email: "invoices@alliedhealthpartners.com.au",
      phone: "0392223300",
      address: "18 Collins Street, Melbourne VIC 3000",
      ndisRegistered: true,
      registrationNo: "NDI4020002",
      bankBsb: "033000",
      bankAccount: "23456789",
      bankAccountName: "Allied Health Partners Pty Ltd",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "Allied Health Partners Pty Ltd",
      gstRegistered: true
    }
  });
  const prov3 = await prisma.crmProvider.upsert({
    where: { abn: "34567890123" },
    update: {},
    create: {
      name: "CareConnect Support Services",
      abn: "34567890123",
      email: "billing@careconnect.com.au",
      phone: "0731112200",
      address: "55 Queen Street, Brisbane QLD 4000",
      ndisRegistered: true,
      registrationNo: "NDI4030003",
      bankBsb: "124000",
      bankAccount: "34567890",
      bankAccountName: "CareConnect Support Services",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "CareConnect Support Services Pty Ltd",
      gstRegistered: false
    }
  });
  const prov4 = await prisma.crmProvider.upsert({
    where: { abn: "45678901234" },
    update: {},
    create: {
      name: "Ability Plus OT",
      abn: "45678901234",
      email: "admin@abilityplus.com.au",
      phone: "0894445500",
      address: "7 St Georges Terrace, Perth WA 6000",
      ndisRegistered: true,
      registrationNo: "NDI4040004",
      bankBsb: "016000",
      bankAccount: "45678901",
      bankAccountName: "Ability Plus Occupational Therapy",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "Ability Plus OT Pty Ltd",
      gstRegistered: true
    }
  });
  const prov5 = await prisma.crmProvider.upsert({
    where: { abn: "56789012345" },
    update: {},
    create: {
      name: "HorizonCare SIL",
      abn: "56789012345",
      email: "accounts@horizoncaresil.com.au",
      phone: "0265556600",
      address: "120 Hunter Street, Newcastle NSW 2300",
      ndisRegistered: true,
      registrationNo: "NDI4050005",
      bankBsb: "062100",
      bankAccount: "56789012",
      bankAccountName: "HorizonCare SIL Pty Ltd",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "HorizonCare SIL Pty Ltd",
      gstRegistered: true
    }
  });
  const prov6 = await prisma.crmProvider.upsert({
    where: { abn: "67890123456" },
    update: {},
    create: {
      name: "Pathways Psychology",
      abn: "67890123456",
      email: "billing@pathwayspsych.com.au",
      phone: "0356667700",
      address: "3 Exhibition Street, Melbourne VIC 3000",
      ndisRegistered: true,
      registrationNo: "NDI4060006",
      bankBsb: "033100",
      bankAccount: "67890123",
      bankAccountName: "Pathways Psychology Pty Ltd",
      providerStatus: "ACTIVE",
      abnStatus: "Active",
      abnRegisteredName: "Pathways Psychology Pty Ltd",
      gstRegistered: true
    }
  });
  const prov7 = await prisma.crmProvider.upsert({
    where: { abn: "78901234567" },
    update: {},
    create: {
      name: "Fresh Start Support",
      abn: "78901234567",
      email: "info@freshstartsupport.com.au",
      phone: "0278889900",
      address: "88 George Street, Parramatta NSW 2150",
      ndisRegistered: false,
      providerStatus: "DRAFT",
      abnStatus: "Active",
      gstRegistered: false
    }
  });
  const prov8 = await prisma.crmProvider.upsert({
    where: { abn: "89012345678" },
    update: {},
    create: {
      name: "BlueSky Community Care",
      abn: "89012345678",
      email: "portal@blueskycare.com.au",
      phone: "0745550011",
      address: "200 Ann Street, Brisbane QLD 4000",
      ndisRegistered: true,
      providerStatus: "INVITED",
      inviteToken: "inv_bluesky_2026_token_abc123",
      inviteExpiresAt: /* @__PURE__ */ new Date("2026-03-15"),
      abnStatus: "Active",
      gstRegistered: true
    }
  });
  const prov9 = await prisma.crmProvider.upsert({
    where: { abn: "90123456789" },
    update: {},
    create: {
      name: "Steadfast Support Workers",
      abn: "90123456789",
      email: "admin@steadfastsupport.com.au",
      phone: "0812223300",
      address: "45 Terrace Road, Perth WA 6004",
      ndisRegistered: true,
      registrationNo: "NDI4090009",
      providerStatus: "PENDING_APPROVAL",
      abnStatus: "Active",
      gstRegistered: false
    }
  });
  const prov10 = await prisma.crmProvider.upsert({
    where: { abn: "01234567890" },
    update: {},
    create: {
      name: "Nexus Disability Services",
      abn: "01234567890",
      email: "accounts@nexusdisability.com.au",
      phone: "0299998877",
      address: "1 Macquarie Street, Sydney NSW 2000",
      ndisRegistered: true,
      registrationNo: "NDI4100010",
      bankBsb: "062200",
      bankAccount: "01234567",
      bankAccountName: "Nexus Disability Services",
      providerStatus: "SUSPENDED",
      abnStatus: "Active",
      gstRegistered: true
    }
  });
  const providerEmailsData = [
    { providerId: prov1.id, email: "accounts@sunrisetherapy.com.au", isVerified: true },
    { providerId: prov1.id, email: "invoices@sunrisetherapy.com.au", isVerified: true },
    { providerId: prov1.id, email: "reception@sunrisetherapy.com.au", isVerified: false },
    { providerId: prov2.id, email: "invoices@alliedhealthpartners.com.au", isVerified: true },
    { providerId: prov2.id, email: "admin@alliedhealthpartners.com.au", isVerified: true },
    { providerId: prov2.id, email: "billing@alliedhealthpartners.com.au", isVerified: false },
    { providerId: prov3.id, email: "billing@careconnect.com.au", isVerified: true },
    { providerId: prov3.id, email: "accounts@careconnect.com.au", isVerified: true },
    { providerId: prov3.id, email: "support@careconnect.com.au", isVerified: false },
    { providerId: prov4.id, email: "admin@abilityplus.com.au", isVerified: true },
    { providerId: prov4.id, email: "invoices@abilityplus.com.au", isVerified: false },
    { providerId: prov5.id, email: "accounts@horizoncaresil.com.au", isVerified: true },
    { providerId: prov5.id, email: "finance@horizoncaresil.com.au", isVerified: true },
    { providerId: prov6.id, email: "billing@pathwayspsych.com.au", isVerified: true },
    { providerId: prov6.id, email: "admin@pathwayspsych.com.au", isVerified: false }
  ];
  for (const pe of providerEmailsData) {
    await prisma.crmProviderEmail.upsert({
      where: { email: pe.email },
      update: {},
      create: pe
    });
  }
  console.log("  \u2713 10 providers + 15 provider emails created");
  console.log("  Creating participants...");
  const p1 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000001" },
    update: {},
    create: {
      ndisNumber: "430000001",
      firstName: "Oliver",
      lastName: "Bennett",
      dateOfBirth: /* @__PURE__ */ new Date("1985-03-15"),
      email: "oliver.bennett@email.com.au",
      phone: "+61411100001",
      address: "12 Wattle Street",
      suburb: "Ultimo",
      state: "NSW",
      postcode: "2007",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Spinal cord injury \u2014 T4 complete",
      disabilityCategory: "Physical",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2021-06-01"),
      emergencyContactName: "Helen Bennett",
      emergencyContactPhone: "+61411100099",
      emergencyContactRel: "Mother",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p2 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000002" },
    update: {},
    create: {
      ndisNumber: "430000002",
      firstName: "Amara",
      lastName: "Osei",
      dateOfBirth: /* @__PURE__ */ new Date("1992-07-22"),
      email: "amara.osei@hotmail.com",
      phone: "+61422200002",
      address: "7 Acacia Avenue",
      suburb: "Chermside",
      state: "QLD",
      postcode: "4032",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: "EMAIL",
      gender: "Female",
      disability: "Autism Spectrum Disorder \u2014 Level 2",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2022-01-15"),
      emergencyContactName: "Kofi Osei",
      emergencyContactPhone: "+61422200099",
      emergencyContactRel: "Father",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p3 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000003" },
    update: {},
    create: {
      ndisNumber: "430000003",
      firstName: "Liam",
      lastName: "Fitzgerald",
      dateOfBirth: /* @__PURE__ */ new Date("1978-11-08"),
      email: "liam.fitz@gmail.com",
      phone: "+61433300003",
      address: "33 Elm Court",
      suburb: "Fitzroy",
      state: "VIC",
      postcode: "3065",
      assignedToId: pm2.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "MANUAL",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Acquired Brain Injury",
      disabilityCategory: "Neurological",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2020-09-10"),
      emergencyContactName: "Caitlin Fitzgerald",
      emergencyContactPhone: "+61433300099",
      emergencyContactRel: "Spouse",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p4 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000004" },
    update: {},
    create: {
      ndisNumber: "430000004",
      firstName: "Sophie",
      lastName: "Nguyen",
      dateOfBirth: /* @__PURE__ */ new Date("2001-04-30"),
      email: "sophie.nguyen@outlook.com",
      phone: "+61444400004",
      address: "91 Kurrajong Road",
      suburb: "Campbelltown",
      state: "NSW",
      postcode: "2560",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: "SMS",
      gender: "Female",
      disability: "Intellectual disability \u2014 Mild",
      disabilityCategory: "Intellectual",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2023-02-20"),
      emergencyContactName: "Minh Nguyen",
      emergencyContactPhone: "+61444400099",
      emergencyContactRel: "Parent",
      statementFrequency: "FORTNIGHTLY",
      statementDelivery: "EMAIL"
    }
  });
  const p5 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000005" },
    update: {},
    create: {
      ndisNumber: "430000005",
      firstName: "Marcus",
      lastName: "Hartley",
      dateOfBirth: /* @__PURE__ */ new Date("1968-09-14"),
      email: "marcus.hartley@bigpond.com",
      phone: "+61455500005",
      address: "4 Banksia Drive",
      suburb: "Ballina",
      state: "NSW",
      postcode: "2478",
      assignedToId: pm2.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "MANUAL",
      pricingRegion: "REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Cerebral palsy \u2014 spastic diplegia",
      disabilityCategory: "Physical",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2019-07-01"),
      emergencyContactName: "Jill Hartley",
      emergencyContactPhone: "+61455500099",
      emergencyContactRel: "Spouse",
      statementFrequency: "MONTHLY",
      statementDelivery: "MAIL"
    }
  });
  const p6 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000006" },
    update: {},
    create: {
      ndisNumber: "430000006",
      firstName: "Zara",
      lastName: "Patel",
      dateOfBirth: /* @__PURE__ */ new Date("1995-12-05"),
      email: "zara.patel@gmail.com",
      phone: "+61466600006",
      address: "15 Jacaranda Place",
      suburb: "Mount Gravatt",
      state: "QLD",
      postcode: "4122",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Female",
      disability: "Multiple sclerosis",
      disabilityCategory: "Neurological",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2022-11-01"),
      emergencyContactName: "Raj Patel",
      emergencyContactPhone: "+61466600099",
      emergencyContactRel: "Father",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p7 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000007" },
    update: {},
    create: {
      ndisNumber: "430000007",
      firstName: "Ethan",
      lastName: "Kowalski",
      dateOfBirth: /* @__PURE__ */ new Date("2005-02-18"),
      email: "ethan.kowalski@icloud.com",
      phone: "+61477700007",
      address: "22 Eucalyptus Street",
      suburb: "Dandenong",
      state: "VIC",
      postcode: "3175",
      assignedToId: pm2.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Down syndrome",
      disabilityCategory: "Intellectual",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2023-05-10"),
      emergencyContactName: "Anna Kowalski",
      emergencyContactPhone: "+61477700099",
      emergencyContactRel: "Mother",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p8 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000008" },
    update: {},
    create: {
      ndisNumber: "430000008",
      firstName: "Isabel",
      lastName: "Crawford",
      dateOfBirth: /* @__PURE__ */ new Date("1989-06-27"),
      email: "isabel.crawford@yahoo.com.au",
      phone: "+61488800008",
      address: "8 Wisteria Lane",
      suburb: "Toowoomba",
      state: "QLD",
      postcode: "4350",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "MANUAL",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Female",
      disability: "PTSD and chronic anxiety",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2021-03-15"),
      emergencyContactName: "Tom Crawford",
      emergencyContactPhone: "+61488800099",
      emergencyContactRel: "Spouse",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p9 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000009" },
    update: {},
    create: {
      ndisNumber: "430000009",
      firstName: "Noah",
      lastName: "Andersen",
      dateOfBirth: /* @__PURE__ */ new Date("1975-08-03"),
      email: "noah.andersen@gmail.com",
      phone: "+61499900009",
      address: "55 Ironbark Close",
      suburb: "Penrith",
      state: "NSW",
      postcode: "2750",
      assignedToId: pm2.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Schizophrenia \u2014 treatment resistant",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2020-04-01"),
      emergencyContactName: "Lars Andersen",
      emergencyContactPhone: "+61499900099",
      emergencyContactRel: "Brother",
      statementFrequency: "NONE",
      statementDelivery: "EMAIL"
    }
  });
  const p10 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000010" },
    update: {},
    create: {
      ndisNumber: "430000010",
      firstName: "Fatima",
      lastName: "Hassan",
      dateOfBirth: /* @__PURE__ */ new Date("2010-01-20"),
      email: "fatima.family@gmail.com",
      phone: "+61400100010",
      address: "19 Rosewood Street",
      suburb: "Auburn",
      state: "NSW",
      postcode: "2144",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Female",
      disability: "Autism Spectrum Disorder \u2014 Level 3",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2023-08-01"),
      emergencyContactName: "Ahmed Hassan",
      emergencyContactPhone: "+61400100099",
      emergencyContactRel: "Father",
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p11 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000011" },
    update: {},
    create: {
      ndisNumber: "430000011",
      firstName: "Connor",
      lastName: "Walsh",
      dateOfBirth: /* @__PURE__ */ new Date("1983-05-11"),
      email: "connor.walsh@gmail.com",
      phone: "+61400200011",
      address: "77 Grevillea Road",
      suburb: "Epping",
      state: "NSW",
      postcode: "2121",
      assignedToId: pm2.id,
      onboardingStatus: "PENDING_PLAN",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Traumatic brain injury",
      disabilityCategory: "Neurological",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2024-01-10"),
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p12 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000012" },
    update: {},
    create: {
      ndisNumber: "430000012",
      firstName: "Grace",
      lastName: "Yamamoto",
      dateOfBirth: /* @__PURE__ */ new Date("1997-10-16"),
      email: "grace.yamamoto@outlook.com",
      phone: "+61400300012",
      address: "6 Hakea Court",
      suburb: "Sunshine",
      state: "VIC",
      postcode: "3020",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "MANUAL",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: true,
      invoiceApprovalMethod: "APP",
      gender: "Female",
      disability: "Rheumatoid arthritis \u2014 severe",
      disabilityCategory: "Physical",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2022-06-01"),
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p13 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000013" },
    update: {},
    create: {
      ndisNumber: "430000013",
      firstName: "Dylan",
      lastName: "Nguyen",
      dateOfBirth: /* @__PURE__ */ new Date("2008-07-04"),
      email: "dylan.family@yahoo.com",
      phone: "+61400400013",
      address: "44 Bottlebrush Way",
      suburb: "Logan",
      state: "QLD",
      postcode: "4114",
      assignedToId: pm2.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "ADHD and sensory processing disorder",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2023-11-15"),
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  const p14 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000014" },
    update: {},
    create: {
      ndisNumber: "430000014",
      firstName: "Margaret",
      lastName: "Sullivan",
      dateOfBirth: /* @__PURE__ */ new Date("1955-02-28"),
      email: "margaret.sullivan@bigpond.com",
      phone: "+61400500014",
      address: "3 Grevillea Avenue",
      suburb: "Alice Springs",
      state: "NT",
      postcode: "0870",
      assignedToId: planManager.id,
      onboardingStatus: "COMPLETE",
      ingestSource: "MANUAL",
      pricingRegion: "VERY_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Female",
      disability: "Stroke \u2014 left hemiplegia",
      disabilityCategory: "Neurological",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2020-12-01"),
      statementFrequency: "MONTHLY",
      statementDelivery: "MAIL"
    }
  });
  const p15 = await prisma.crmParticipant.upsert({
    where: { ndisNumber: "430000015" },
    update: {},
    create: {
      ndisNumber: "430000015",
      firstName: "Ryan",
      lastName: "Blackwood",
      dateOfBirth: /* @__PURE__ */ new Date("1990-09-09"),
      email: "ryan.blackwood@gmail.com",
      phone: "+61400600015",
      address: "100 Warataah Street",
      suburb: "Manly",
      state: "NSW",
      postcode: "2095",
      assignedToId: pm2.id,
      onboardingStatus: "DRAFT",
      ingestSource: "WORDPRESS",
      pricingRegion: "NON_REMOTE",
      invoiceApprovalEnabled: false,
      gender: "Male",
      disability: "Bipolar disorder \u2014 Type 1",
      disabilityCategory: "Psychosocial",
      ndisRegistrationDate: /* @__PURE__ */ new Date("2025-01-20"),
      statementFrequency: "MONTHLY",
      statementDelivery: "EMAIL"
    }
  });
  console.log("  \u2713 15 participants created");
  console.log("  Creating NDIS price guide...");
  const pgVersion = await prisma.ndisPriceGuideVersion.findFirst({
    where: { label: "NDIS Price Guide 2025-26" }
  });
  const priceGuide = pgVersion ?? await prisma.ndisPriceGuideVersion.create({
    data: {
      label: "NDIS Price Guide 2025-26",
      effectiveFrom: /* @__PURE__ */ new Date("2025-07-01"),
      effectiveTo: /* @__PURE__ */ new Date("2026-06-30"),
      importedById: director.id
    }
  });
  const supportItems = [
    // Category 01 — Daily Activities
    { itemNumber: "01_011_0107_1_1", name: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", categoryCodePace: "01", categoryName: "Daily Activities", categoryNamePace: "Assistance with Daily Life", registrationGroupNumber: "0107", registrationGroupName: "Daily Activities", unitType: "H", priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: true, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: "01_015_0107_1_1", name: "Assistance With Self-Care Activities - Standard - Weekday Evening", categoryCode: "01", categoryCodePace: "01", categoryName: "Daily Activities", categoryNamePace: "Assistance with Daily Life", registrationGroupNumber: "0107", registrationGroupName: "Daily Activities", unitType: "H", priceStandardCents: 7210, priceRemoteCents: 10094, priceVeryRemoteCents: 12617, allowNonFaceToFace: false, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: "01_300_0104_1_1", name: "Specialist Disability Accommodation - Fully Accessible", categoryCode: "01", categoryCodePace: "01", categoryName: "Daily Activities", categoryNamePace: "Assistance with Daily Life", registrationGroupNumber: "0104", registrationGroupName: "High Intensity Daily Personal Activities", unitType: "H", priceStandardCents: 10234, priceRemoteCents: 14328, priceVeryRemoteCents: 17909, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 02 — Transport
    { itemNumber: "02_051_0108_1_1", name: "Transport - Non Labour", categoryCode: "02", categoryCodePace: "02", categoryName: "Transport", categoryNamePace: "Transport", registrationGroupNumber: "0108", registrationGroupName: "Participation in Community, Social and Civic Activities", unitType: "E", priceStandardCents: 2500, priceRemoteCents: 3500, priceVeryRemoteCents: 4375, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 04 — Assistance with Social, Economic and Community Participation
    { itemNumber: "04_104_0125_6_1", name: "Access Community Social and Rec Activ - Standard - Weekday Daytime", categoryCode: "04", categoryCodePace: "04", categoryName: "Social Participation", categoryNamePace: "Assistance with Social, Economic and Community Participation", registrationGroupNumber: "0125", registrationGroupName: "High Intensity Daily Personal Activities", unitType: "H", priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: true, allowProviderTravel: true, allowShortNoticeCancel: true },
    { itemNumber: "04_210_0136_6_1", name: "Group and Centre Based Activities - Standard - Weekday", categoryCode: "04", categoryCodePace: "04", categoryName: "Social Participation", categoryNamePace: "Assistance with Social, Economic and Community Participation", registrationGroupNumber: "0136", registrationGroupName: "Group and Centre Based Activities", unitType: "H", priceStandardCents: 1840, priceRemoteCents: 2576, priceVeryRemoteCents: 3220, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: true },
    // Category 07 — Support Coordination
    { itemNumber: "07_002_0106_8_3", name: "Support Coordination", categoryCode: "07", categoryCodePace: "07", categoryName: "Support Coordination", categoryNamePace: "Support Coordination", registrationGroupNumber: "0106", registrationGroupName: "Support Coordination", unitType: "H", priceStandardCents: 10008, priceRemoteCents: 14011, priceVeryRemoteCents: 17514, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    { itemNumber: "07_004_0132_8_3", name: "Specialist Support Coordination", categoryCode: "07", categoryCodePace: "07", categoryName: "Support Coordination", categoryNamePace: "Support Coordination", registrationGroupNumber: "0132", registrationGroupName: "Specialist Support Coordination", unitType: "H", priceStandardCents: 19005, priceRemoteCents: 26607, priceVeryRemoteCents: 33259, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 11 — Improved Living Arrangements
    { itemNumber: "11_022_0115_1_1", name: "Assistance in Supported Independent Living", categoryCode: "11", categoryCodePace: "11", categoryName: "Improved Living Arrangements", categoryNamePace: "Improved Living Arrangements", registrationGroupNumber: "0115", registrationGroupName: "Assistance in Supported Independent Living", unitType: "H", priceStandardCents: 6547, priceRemoteCents: 9165, priceVeryRemoteCents: 11457, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: true },
    // Category 14 — Support Coordination (Plan Management)
    { itemNumber: "14_033_0127_8_3", name: "Plan Management - Financial Administration", categoryCode: "14", categoryCodePace: "14", categoryName: "Improved Life Choices", categoryNamePace: "Improved Life Choices", registrationGroupNumber: "0127", registrationGroupName: "Plan Management", unitType: "MON", priceStandardCents: 15477, priceRemoteCents: 15477, priceVeryRemoteCents: 15477, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: false },
    { itemNumber: "14_034_0127_8_3", name: "Plan Management - Setup", categoryCode: "14", categoryCodePace: "14", categoryName: "Improved Life Choices", categoryNamePace: "Improved Life Choices", registrationGroupNumber: "0127", registrationGroupName: "Plan Management", unitType: "E", priceStandardCents: 23310, priceRemoteCents: 23310, priceVeryRemoteCents: 23310, allowNonFaceToFace: false, allowProviderTravel: false, allowShortNoticeCancel: false },
    // Category 15 — Improved Daily Living
    { itemNumber: "15_037_0128_1_3", name: "Physiotherapy", categoryCode: "15", categoryCodePace: "15", categoryName: "Improved Daily Living", categoryNamePace: "Improved Daily Living Skills", registrationGroupNumber: "0128", registrationGroupName: "Therapeutic Supports", unitType: "H", priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: "15_056_0128_1_3", name: "Occupational Therapy", categoryCode: "15", categoryCodePace: "15", categoryName: "Improved Daily Living", categoryNamePace: "Improved Daily Living Skills", registrationGroupNumber: "0128", registrationGroupName: "Therapeutic Supports", unitType: "H", priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: "15_043_0128_1_3", name: "Psychology Services", categoryCode: "15", categoryCodePace: "15", categoryName: "Improved Daily Living", categoryNamePace: "Improved Daily Living Skills", registrationGroupNumber: "0128", registrationGroupName: "Therapeutic Supports", unitType: "H", priceStandardCents: 23456, priceRemoteCents: 32838, priceVeryRemoteCents: 41048, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true },
    { itemNumber: "15_054_0128_1_3", name: "Speech Pathology", categoryCode: "15", categoryCodePace: "15", categoryName: "Improved Daily Living", categoryNamePace: "Improved Daily Living Skills", registrationGroupNumber: "0128", registrationGroupName: "Therapeutic Supports", unitType: "H", priceStandardCents: 19381, priceRemoteCents: 27133, priceVeryRemoteCents: 33917, allowNonFaceToFace: true, allowProviderTravel: false, allowShortNoticeCancel: true }
  ];
  for (const item of supportItems) {
    await prisma.ndisSupportItem.upsert({
      where: { versionId_itemNumber: { versionId: priceGuide.id, itemNumber: item.itemNumber } },
      update: {},
      create: { versionId: priceGuide.id, ...item }
    });
  }
  console.log("  \u2713 1 price guide version + 15 support items created");
  console.log("  Creating plans...");
  async function findOrCreatePlan(participantId, prodaPlanId, data) {
    const existing = await prisma.planPlan.findFirst({ where: { participantId, prodaPlanId } });
    if (existing) return existing;
    return prisma.planPlan.create({ data: { participantId, prodaPlanId, ...data } });
  }
  const plan1 = await findOrCreatePlan(p1.id, "PRODA-P1-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    reviewDate: /* @__PURE__ */ new Date("2026-05-01"),
    status: "ACTIVE"
  });
  const plan2 = await findOrCreatePlan(p2.id, "PRODA-P2-2025", {
    startDate: /* @__PURE__ */ new Date("2025-09-01"),
    endDate: /* @__PURE__ */ new Date("2026-08-31"),
    reviewDate: /* @__PURE__ */ new Date("2026-07-01"),
    status: "ACTIVE"
  });
  const plan3 = await findOrCreatePlan(p3.id, "PRODA-P3-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "ACTIVE"
  });
  const plan4 = await findOrCreatePlan(p4.id, "PRODA-P4-2025", {
    startDate: /* @__PURE__ */ new Date("2025-10-01"),
    endDate: /* @__PURE__ */ new Date("2026-09-30"),
    reviewDate: /* @__PURE__ */ new Date("2026-08-15"),
    status: "ACTIVE"
  });
  const plan5 = await findOrCreatePlan(p5.id, "PRODA-P5-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "ACTIVE"
  });
  const plan6 = await findOrCreatePlan(p6.id, "PRODA-P6-2025", {
    startDate: /* @__PURE__ */ new Date("2025-08-01"),
    endDate: /* @__PURE__ */ new Date("2026-07-31"),
    status: "ACTIVE"
  });
  const plan7 = await findOrCreatePlan(p7.id, "PRODA-P7-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "ACTIVE"
  });
  const plan8 = await findOrCreatePlan(p8.id, "PRODA-P8-2025", {
    startDate: /* @__PURE__ */ new Date("2025-11-01"),
    endDate: /* @__PURE__ */ new Date("2026-10-31"),
    status: "ACTIVE"
  });
  const plan9 = await findOrCreatePlan(p9.id, "PRODA-P9-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "ACTIVE"
  });
  const plan10 = await findOrCreatePlan(p10.id, "PRODA-P10-2025", {
    startDate: /* @__PURE__ */ new Date("2025-09-01"),
    endDate: /* @__PURE__ */ new Date("2026-08-31"),
    status: "ACTIVE"
  });
  const plan11 = await findOrCreatePlan(p11.id, "PRODA-P11-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2025-12-31"),
    status: "EXPIRING_SOON"
  });
  const plan12 = await findOrCreatePlan(p12.id, "PRODA-P12-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "ACTIVE"
  });
  const plan13 = await findOrCreatePlan(p13.id, "PRODA-P13-2025", {
    startDate: /* @__PURE__ */ new Date("2025-10-01"),
    endDate: /* @__PURE__ */ new Date("2026-09-30"),
    status: "ACTIVE"
  });
  const plan14 = await findOrCreatePlan(p14.id, "PRODA-P14-2024", {
    startDate: /* @__PURE__ */ new Date("2024-07-01"),
    endDate: /* @__PURE__ */ new Date("2025-06-30"),
    status: "EXPIRED"
  });
  const plan15 = await findOrCreatePlan(p15.id, "PRODA-P15-2025", {
    startDate: /* @__PURE__ */ new Date("2025-07-01"),
    endDate: /* @__PURE__ */ new Date("2026-06-30"),
    status: "UNDER_REVIEW"
  });
  async function upsertBudgetLine(planId, categoryCode, categoryName, allocatedCents, spentCents = 0) {
    return prisma.planBudgetLine.upsert({
      where: { planId_categoryCode: { planId, categoryCode } },
      update: {},
      create: { planId, categoryCode, categoryName, allocatedCents, spentCents }
    });
  }
  const bl1_01 = await upsertBudgetLine(plan1.id, "01", "Daily Activities", 48e5, 125e4);
  const bl1_15 = await upsertBudgetLine(plan1.id, "15", "Improved Daily Living", 15e5, 38e4);
  const bl1_14 = await upsertBudgetLine(plan1.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl1_04 = await upsertBudgetLine(plan1.id, "04", "Social Participation", 9e5, 12e4);
  const bl2_01 = await upsertBudgetLine(plan2.id, "01", "Daily Activities", 36e5, 89e4);
  const bl2_15 = await upsertBudgetLine(plan2.id, "15", "Improved Daily Living", 12e5, 45e4);
  const bl2_14 = await upsertBudgetLine(plan2.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl3_01 = await upsertBudgetLine(plan3.id, "01", "Daily Activities", 52e5, 21e5);
  const bl3_11 = await upsertBudgetLine(plan3.id, "11", "Improved Living Arrangements", 8e6, 35e5);
  const bl3_15 = await upsertBudgetLine(plan3.id, "15", "Improved Daily Living", 8e5, 21e4);
  const bl3_14 = await upsertBudgetLine(plan3.id, "14", "Improved Life Choices", 375e3, 155e3);
  const bl4_01 = await upsertBudgetLine(plan4.id, "01", "Daily Activities", 24e5, 32e4);
  const bl4_15 = await upsertBudgetLine(plan4.id, "15", "Improved Daily Living", 2e6, 58e4);
  const bl4_04 = await upsertBudgetLine(plan4.id, "04", "Social Participation", 6e5, 8e4);
  const bl4_14 = await upsertBudgetLine(plan4.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl4_07 = await upsertBudgetLine(plan4.id, "07", "Support Coordination", 5e5, 1e5);
  const bl5_01 = await upsertBudgetLine(plan5.id, "01", "Daily Activities", 6e6, 18e5);
  const bl5_04 = await upsertBudgetLine(plan5.id, "04", "Social Participation", 12e5, 28e4);
  const bl5_14 = await upsertBudgetLine(plan5.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl5_02 = await upsertBudgetLine(plan5.id, "02", "Transport", 3e5, 65e3);
  const bl6_15 = await upsertBudgetLine(plan6.id, "15", "Improved Daily Living", 3e6, 92e4);
  const bl6_01 = await upsertBudgetLine(plan6.id, "01", "Daily Activities", 18e5, 45e4);
  const bl6_14 = await upsertBudgetLine(plan6.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl7_15 = await upsertBudgetLine(plan7.id, "15", "Improved Daily Living", 25e5, 68e4);
  const bl7_04 = await upsertBudgetLine(plan7.id, "04", "Social Participation", 1e6, 21e4);
  const bl7_14 = await upsertBudgetLine(plan7.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl8_15 = await upsertBudgetLine(plan8.id, "15", "Improved Daily Living", 4e6, 76e4);
  const bl8_14 = await upsertBudgetLine(plan8.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl9_01 = await upsertBudgetLine(plan9.id, "01", "Daily Activities", 32e5, 11e5);
  const bl9_15 = await upsertBudgetLine(plan9.id, "15", "Improved Daily Living", 15e5, 2e5);
  const bl9_14 = await upsertBudgetLine(plan9.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl9_04 = await upsertBudgetLine(plan9.id, "04", "Social Participation", 8e5, 15e4);
  const bl10_15 = await upsertBudgetLine(plan10.id, "15", "Improved Daily Living", 28e5, 3e5);
  const bl10_01 = await upsertBudgetLine(plan10.id, "01", "Daily Activities", 16e5, 2e5);
  const bl10_14 = await upsertBudgetLine(plan10.id, "14", "Improved Life Choices", 375e3, 31e3);
  await upsertBudgetLine(plan11.id, "01", "Daily Activities", 2e6, 19e5);
  await upsertBudgetLine(plan11.id, "14", "Improved Life Choices", 187500, 155e3);
  const bl12_15 = await upsertBudgetLine(plan12.id, "15", "Improved Daily Living", 2e6, 58e4);
  const bl12_14 = await upsertBudgetLine(plan12.id, "14", "Improved Life Choices", 375e3, 93e3);
  const bl12_04 = await upsertBudgetLine(plan12.id, "04", "Social Participation", 5e5, 6e4);
  const bl13_15 = await upsertBudgetLine(plan13.id, "15", "Improved Daily Living", 18e5, 2e5);
  const bl13_01 = await upsertBudgetLine(plan13.id, "01", "Daily Activities", 12e5, 15e4);
  const bl13_14 = await upsertBudgetLine(plan13.id, "14", "Improved Life Choices", 375e3, 62e3);
  await upsertBudgetLine(plan14.id, "01", "Daily Activities", 4e6, 39e5);
  await upsertBudgetLine(plan14.id, "15", "Improved Daily Living", 12e5, 115e4);
  await upsertBudgetLine(plan14.id, "14", "Improved Life Choices", 375e3, 37e4);
  await upsertBudgetLine(plan15.id, "01", "Daily Activities", 24e5, 0);
  await upsertBudgetLine(plan15.id, "15", "Improved Daily Living", 12e5, 0);
  await upsertBudgetLine(plan15.id, "14", "Improved Life Choices", 375e3, 0);
  console.log("  \u2713 15 plans + budget lines created");
  console.log("  Creating funding periods...");
  async function findOrCreateFundingPeriod(planId, label, startDate, endDate) {
    const existing = await prisma.planFundingPeriod.findFirst({ where: { planId, label } });
    if (existing) return existing;
    return prisma.planFundingPeriod.create({ data: { planId, label, startDate, endDate } });
  }
  const fp1 = await findOrCreateFundingPeriod(plan1.id, "Q1 Jul-Sep 2025", /* @__PURE__ */ new Date("2025-07-01"), /* @__PURE__ */ new Date("2025-09-30"));
  const fp2 = await findOrCreateFundingPeriod(plan1.id, "Q2 Oct-Dec 2025", /* @__PURE__ */ new Date("2025-10-01"), /* @__PURE__ */ new Date("2025-12-31"));
  const fp3 = await findOrCreateFundingPeriod(plan4.id, "H1 Oct 2025-Mar 2026", /* @__PURE__ */ new Date("2025-10-01"), /* @__PURE__ */ new Date("2026-03-31"));
  const fp4 = await findOrCreateFundingPeriod(plan4.id, "H2 Apr-Sep 2026", /* @__PURE__ */ new Date("2026-04-01"), /* @__PURE__ */ new Date("2026-09-30"));
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp1.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { fundingPeriodId: fp1.id, budgetLineId: bl1_01.id, allocatedCents: 12e5 }
  });
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp2.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { fundingPeriodId: fp2.id, budgetLineId: bl1_01.id, allocatedCents: 12e5 }
  });
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp3.id, budgetLineId: bl4_01.id } },
    update: {},
    create: { fundingPeriodId: fp3.id, budgetLineId: bl4_01.id, allocatedCents: 12e5 }
  });
  await prisma.planPeriodBudget.upsert({
    where: { fundingPeriodId_budgetLineId: { fundingPeriodId: fp4.id, budgetLineId: bl4_01.id } },
    update: {},
    create: { fundingPeriodId: fp4.id, budgetLineId: bl4_01.id, allocatedCents: 12e5 }
  });
  console.log("  \u2713 4 funding periods + 4 period budgets created");
  console.log("  Creating invoices...");
  const inv1 = await findOrCreateInvoice({
    participantId: p1.id,
    providerId: prov1.id,
    planId: plan1.id,
    invoiceNumber: "STS-2026-0101",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-10"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-11T09:00:00Z"),
    subtotalCents: 65470,
    gstCents: 0,
    totalCents: 65470,
    status: "APPROVED",
    ingestSource: "EMAIL",
    sourceEmail: "accounts@sunrisetherapy.com.au",
    matchConfidence: 0.98,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.95,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-11T09:05:00Z"),
    approvedById: planManager.id,
    approvedAt: /* @__PURE__ */ new Date("2026-01-13T10:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-01-13T10:00:00Z"),
    totalProcessingMs: 17e7
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv1.id, budgetLineId: bl1_01.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-01-06"), quantity: 5, unitPriceCents: 6547, totalCents: 32735, isPriceGuideCompliant: true },
    { invoiceId: inv1.id, budgetLineId: bl1_01.id, supportItemCode: "01_015_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Evening", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-01-07"), quantity: 4.5, unitPriceCents: 7210, totalCents: 32445, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv1.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-11T09:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-11T09:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-11T09:05:00Z"), durationMs: 18e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-01-13T10:00:00Z"), durationMs: 1689e5, changedBy: planManager.id }
  ]);
  const inv2 = await findOrCreateInvoice({
    participantId: p2.id,
    providerId: prov2.id,
    planId: plan2.id,
    invoiceNumber: "AHP-INV-20260115",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-15"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-15T14:00:00Z"),
    subtotalCents: 116286,
    gstCents: 0,
    totalCents: 116286,
    status: "APPROVED",
    ingestSource: "EMAIL",
    sourceEmail: "invoices@alliedhealthpartners.com.au",
    matchConfidence: 0.99,
    matchMethod: "ABN_EXACT",
    aiConfidence: 0.97,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-15T14:10:00Z"),
    approvedById: planManager.id,
    approvedAt: /* @__PURE__ */ new Date("2026-01-16T09:30:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-01-16T09:30:00Z"),
    totalProcessingMs: 702e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv2.id, budgetLineId: bl2_15.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-13"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true },
    { invoiceId: inv2.id, budgetLineId: bl2_15.id, supportItemCode: "15_037_0128_1_3", supportItemName: "Physiotherapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-14"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv2.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-15T14:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-15T14:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-15T14:10:00Z"), durationMs: 48e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-01-16T09:30:00Z"), durationMs: 696e5, changedBy: planManager.id }
  ]);
  const inv3 = await findOrCreateInvoice({
    participantId: p3.id,
    providerId: prov5.id,
    planId: plan3.id,
    invoiceNumber: "HCSIL-JAN-001",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-31"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-01T08:00:00Z"),
    subtotalCents: 261880,
    gstCents: 0,
    totalCents: 261880,
    status: "CLAIMED",
    ingestSource: "EMAIL",
    sourceEmail: "accounts@horizoncaresil.com.au",
    matchConfidence: 1,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.93,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-01T08:10:00Z"),
    approvedById: pm2.id,
    approvedAt: /* @__PURE__ */ new Date("2026-02-03T11:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-02-03T11:00:00Z"),
    totalProcessingMs: 1836e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv3.id, budgetLineId: bl3_11.id, supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", categoryCode: "11", serviceDate: /* @__PURE__ */ new Date("2026-01-15"), quantity: 20, unitPriceCents: 6547, totalCents: 130940, isPriceGuideCompliant: true },
    { invoiceId: inv3.id, budgetLineId: bl3_11.id, supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", categoryCode: "11", serviceDate: /* @__PURE__ */ new Date("2026-01-22"), quantity: 20, unitPriceCents: 6547, totalCents: 130940, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv3.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-01T08:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-01T08:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-02-01T08:10:00Z"), durationMs: 48e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-02-03T11:00:00Z"), durationMs: 183e6, changedBy: pm2.id },
    { from: "APPROVED", to: "CLAIMED", at: /* @__PURE__ */ new Date("2026-02-04T10:00:00Z"), durationMs: 828e5, changedBy: pm2.id }
  ]);
  const inv4 = await findOrCreateInvoice({
    participantId: p1.id,
    providerId: prov1.id,
    planId: plan1.id,
    invoiceNumber: "STS-2025-1201",
    invoiceDate: /* @__PURE__ */ new Date("2025-12-10"),
    receivedAt: /* @__PURE__ */ new Date("2025-12-11T09:00:00Z"),
    subtotalCents: 58923,
    gstCents: 0,
    totalCents: 58923,
    status: "PAID",
    ingestSource: "EMAIL",
    sourceEmail: "accounts@sunrisetherapy.com.au",
    matchConfidence: 0.98,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.96,
    aiExtractedAt: /* @__PURE__ */ new Date("2025-12-11T09:08:00Z"),
    approvedById: planManager.id,
    approvedAt: /* @__PURE__ */ new Date("2025-12-12T10:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2025-12-12T10:00:00Z"),
    totalProcessingMs: 9e7
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv4.id, budgetLineId: bl1_01.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2025-12-05"), quantity: 9, unitPriceCents: 6547, totalCents: 58923, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv4.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2025-12-11T09:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2025-12-11T09:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2025-12-11T09:08:00Z"), durationMs: 36e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2025-12-12T10:00:00Z"), durationMs: 8952e4, changedBy: planManager.id },
    { from: "APPROVED", to: "CLAIMED", at: /* @__PURE__ */ new Date("2025-12-13T09:00:00Z"), durationMs: 828e5, changedBy: planManager.id },
    { from: "CLAIMED", to: "PAID", at: /* @__PURE__ */ new Date("2025-12-20T12:00:00Z"), durationMs: 6264e5, changedBy: planManager.id }
  ]);
  const inv5 = await findOrCreateInvoice({
    participantId: p9.id,
    providerId: prov10.id,
    planId: plan9.id,
    invoiceNumber: "NDS-2026-0101",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-05"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-06T10:00:00Z"),
    subtotalCents: 39282,
    gstCents: 0,
    totalCents: 39282,
    status: "REJECTED",
    ingestSource: "MANUAL",
    matchConfidence: 0.85,
    matchMethod: "ABN_EXACT",
    aiConfidence: 0.88,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-06T10:10:00Z"),
    rejectedById: planManager.id,
    rejectedAt: /* @__PURE__ */ new Date("2026-01-06T14:00:00Z"),
    rejectionReason: "Provider is suspended \u2014 cannot process payments.",
    firstRejectedAt: /* @__PURE__ */ new Date("2026-01-06T14:00:00Z"),
    totalProcessingMs: 144e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv5.id, budgetLineId: bl9_01.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-01-03"), quantity: 6, unitPriceCents: 6547, totalCents: 39282, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv5.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-06T10:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-06T10:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-06T10:10:00Z"), durationMs: 48e4 },
    { from: "PENDING_REVIEW", to: "REJECTED", at: /* @__PURE__ */ new Date("2026-01-06T14:00:00Z"), durationMs: 138e5, changedBy: planManager.id }
  ]);
  const inv6 = await findOrCreateInvoice({
    participantId: p4.id,
    providerId: prov2.id,
    planId: plan4.id,
    invoiceNumber: "AHP-INV-20260201",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-01"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-01T16:30:00Z"),
    subtotalCents: 38762,
    gstCents: 0,
    totalCents: 38762,
    status: "PENDING_REVIEW",
    ingestSource: "EMAIL",
    sourceEmail: "invoices@alliedhealthpartners.com.au",
    matchConfidence: 0.95,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.72,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-01T16:40:00Z")
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv6.id, budgetLineId: bl4_15.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-28"), quantity: 2, unitPriceCents: 19381, totalCents: 38762, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv6.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-01T16:30:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-01T16:32:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-02-01T16:40:00Z"), durationMs: 48e4, holdCategory: "MISSING_NDIS_CODES" }
  ]);
  const inv7 = await findOrCreateInvoice({
    participantId: p5.id,
    providerId: prov3.id,
    planId: plan5.id,
    invoiceNumber: "CC-2026-0045",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-10"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-10T11:00:00Z"),
    subtotalCents: 32735,
    gstCents: 0,
    totalCents: 32735,
    status: "PROCESSING",
    ingestSource: "EMAIL",
    sourceEmail: "billing@careconnect.com.au",
    matchConfidence: 0.9,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.8,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-10T11:05:00Z")
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv7.id, budgetLineId: bl5_01.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-02-08"), quantity: 5, unitPriceCents: 6547, totalCents: 32735, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv7.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-10T11:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-10T11:02:00Z"), durationMs: 12e4 }
  ]);
  const inv8 = await findOrCreateInvoice({
    participantId: p6.id,
    providerId: prov6.id,
    planId: plan6.id,
    invoiceNumber: "PP-INV-2026-022",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-12"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-12T15:00:00Z"),
    subtotalCents: 46962,
    gstCents: 0,
    totalCents: 46962,
    status: "RECEIVED",
    ingestSource: "EMAIL",
    sourceEmail: "billing@pathwayspsych.com.au",
    matchConfidence: 0.97,
    matchMethod: "EMAIL_EXACT"
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv8.id, budgetLineId: bl6_15.id, supportItemCode: "15_043_0128_1_3", supportItemName: "Psychology Services", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-02-10"), quantity: 2, unitPriceCents: 23456, totalCents: 46962, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv8.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-12T15:00:00Z") }
  ]);
  const inv9 = await findOrCreateInvoice({
    participantId: p2.id,
    providerId: prov2.id,
    planId: plan2.id,
    invoiceNumber: "AHP-INV-20260205",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-05"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-05T10:00:00Z"),
    subtotalCents: 58143,
    gstCents: 0,
    totalCents: 58143,
    status: "PENDING_PARTICIPANT_APPROVAL",
    ingestSource: "EMAIL",
    sourceEmail: "invoices@alliedhealthpartners.com.au",
    matchConfidence: 0.99,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.94,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-05T10:10:00Z"),
    participantApprovalStatus: "PENDING",
    approvalSentAt: /* @__PURE__ */ new Date("2026-02-05T10:15:00Z"),
    approvalTokenExpiresAt: /* @__PURE__ */ new Date("2026-02-12T10:15:00Z")
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv9.id, budgetLineId: bl2_15.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-02-03"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv9.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-05T10:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-05T10:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_PARTICIPANT_APPROVAL", at: /* @__PURE__ */ new Date("2026-02-05T10:15:00Z"), durationMs: 78e4, holdCategory: "AWAITING_PARTICIPANT_APPROVAL" }
  ]);
  const inv10 = await findOrCreateInvoice({
    participantId: p7.id,
    providerId: prov2.id,
    planId: plan7.id,
    invoiceNumber: "AHP-INV-20260118",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-18"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-19T09:00:00Z"),
    subtotalCents: 77524,
    gstCents: 0,
    totalCents: 77524,
    status: "APPROVED",
    ingestSource: "EMAIL",
    sourceEmail: "admin@alliedhealthpartners.com.au",
    matchConfidence: 0.96,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.92,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-19T09:08:00Z"),
    approvedById: pm2.id,
    approvedAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"),
    totalProcessingMs: 1044e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv10.id, budgetLineId: bl7_15.id, supportItemCode: "15_054_0128_1_3", supportItemName: "Speech Pathology", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-16"), quantity: 4, unitPriceCents: 19381, totalCents: 77524, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv10.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-19T09:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-19T09:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-19T09:08:00Z"), durationMs: 36e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"), durationMs: 10404e4, changedBy: pm2.id }
  ]);
  const inv11 = await findOrCreateInvoice({
    participantId: p8.id,
    providerId: prov6.id,
    planId: plan8.id,
    invoiceNumber: "PP-INV-2026-010",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-22"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-22T10:00:00Z"),
    subtotalCents: 117280,
    gstCents: 0,
    totalCents: 117280,
    status: "CLAIMED",
    ingestSource: "EMAIL",
    sourceEmail: "billing@pathwayspsych.com.au",
    matchConfidence: 0.98,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.91,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-22T10:12:00Z"),
    approvedById: planManager.id,
    approvedAt: /* @__PURE__ */ new Date("2026-01-23T09:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-01-23T09:00:00Z"),
    totalProcessingMs: 828e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv11.id, budgetLineId: bl8_15.id, supportItemCode: "15_043_0128_1_3", supportItemName: "Psychology Services", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-20"), quantity: 5, unitPriceCents: 23456, totalCents: 117280, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv11.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-22T10:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-22T10:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-22T10:12:00Z"), durationMs: 6e5 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-01-23T09:00:00Z"), durationMs: 8148e4, changedBy: planManager.id },
    { from: "APPROVED", to: "CLAIMED", at: /* @__PURE__ */ new Date("2026-01-24T09:00:00Z"), durationMs: 864e5, changedBy: planManager.id }
  ]);
  const inv12 = await findOrCreateInvoice({
    participantId: p3.id,
    providerId: prov5.id,
    planId: plan3.id,
    invoiceNumber: "HCSIL-FEB-001",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-05"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-05T08:00:00Z"),
    subtotalCents: 850110,
    gstCents: 0,
    totalCents: 850110,
    status: "REJECTED",
    ingestSource: "EMAIL",
    sourceEmail: "accounts@horizoncaresil.com.au",
    matchConfidence: 1,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.93,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-05T08:10:00Z"),
    rejectedById: pm2.id,
    rejectedAt: /* @__PURE__ */ new Date("2026-02-05T16:00:00Z"),
    rejectionReason: "Total exceeds remaining plan budget for Category 11.",
    firstRejectedAt: /* @__PURE__ */ new Date("2026-02-05T16:00:00Z"),
    totalProcessingMs: 288e5
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv12.id, budgetLineId: bl3_11.id, supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", categoryCode: "11", serviceDate: /* @__PURE__ */ new Date("2026-02-01"), quantity: 130, unitPriceCents: 6547, totalCents: 850110, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv12.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-05T08:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-05T08:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-02-05T08:10:00Z"), durationMs: 48e4, holdCategory: "PLAN_BUDGET_EXCEEDED" },
    { from: "PENDING_REVIEW", to: "REJECTED", at: /* @__PURE__ */ new Date("2026-02-05T16:00:00Z"), durationMs: 282e5, changedBy: pm2.id }
  ]);
  const inv13 = await findOrCreateInvoice({
    participantId: p10.id,
    providerId: prov2.id,
    planId: plan10.id,
    invoiceNumber: "AHP-INV-20260208",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-08"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-08T09:30:00Z"),
    subtotalCents: 58143,
    gstCents: 0,
    totalCents: 58143,
    status: "PENDING_REVIEW",
    ingestSource: "EMAIL",
    sourceEmail: "billing@alliedhealthpartners.com.au",
    matchConfidence: 0.88,
    matchMethod: "EMAIL_DOMAIN",
    aiConfidence: 0.85,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-02-08T09:40:00Z")
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv13.id, budgetLineId: bl10_15.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-02-06"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv13.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-08T09:30:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-02-08T09:32:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-02-08T09:40:00Z"), durationMs: 48e4 }
  ]);
  const inv14 = await findOrCreateInvoice({
    participantId: p12.id,
    providerId: prov4.id,
    planId: plan12.id,
    invoiceNumber: "AP-OT-2026-0008",
    invoiceDate: /* @__PURE__ */ new Date("2026-01-25"),
    receivedAt: /* @__PURE__ */ new Date("2026-01-26T10:00:00Z"),
    subtotalCents: 77524,
    gstCents: 0,
    totalCents: 77524,
    status: "APPROVED",
    ingestSource: "EMAIL",
    sourceEmail: "admin@abilityplus.com.au",
    matchConfidence: 0.97,
    matchMethod: "EMAIL_EXACT",
    aiConfidence: 0.95,
    aiExtractedAt: /* @__PURE__ */ new Date("2026-01-26T10:08:00Z"),
    approvedById: planManager.id,
    approvedAt: /* @__PURE__ */ new Date("2026-01-27T11:00:00Z"),
    firstApprovedAt: /* @__PURE__ */ new Date("2026-01-27T11:00:00Z"),
    totalProcessingMs: 9e7
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv14.id, budgetLineId: bl12_15.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-23"), quantity: 4, unitPriceCents: 19381, totalCents: 77524, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv14.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-01-26T10:00:00Z") },
    { from: "RECEIVED", to: "PROCESSING", at: /* @__PURE__ */ new Date("2026-01-26T10:02:00Z"), durationMs: 12e4 },
    { from: "PROCESSING", to: "PENDING_REVIEW", at: /* @__PURE__ */ new Date("2026-01-26T10:08:00Z"), durationMs: 36e4 },
    { from: "PENDING_REVIEW", to: "APPROVED", at: /* @__PURE__ */ new Date("2026-01-27T11:00:00Z"), durationMs: 8952e4, changedBy: planManager.id }
  ]);
  const inv15 = await findOrCreateInvoice({
    participantId: p13.id,
    providerId: prov3.id,
    planId: plan13.id,
    invoiceNumber: "CC-2026-0060",
    invoiceDate: /* @__PURE__ */ new Date("2026-02-11"),
    receivedAt: /* @__PURE__ */ new Date("2026-02-12T08:00:00Z"),
    subtotalCents: 22659,
    gstCents: 0,
    totalCents: 22659,
    status: "RECEIVED",
    ingestSource: "EMAIL",
    sourceEmail: "billing@careconnect.com.au",
    matchConfidence: 0.92,
    matchMethod: "EMAIL_EXACT"
  });
  await prisma.invInvoiceLine.createMany({ skipDuplicates: true, data: [
    { invoiceId: inv15.id, budgetLineId: bl13_01.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-02-10"), quantity: 3.46, unitPriceCents: 6547, totalCents: 22633, isPriceGuideCompliant: true }
  ] });
  await addStatusHistory(inv15.id, [
    { from: null, to: "RECEIVED", at: /* @__PURE__ */ new Date("2026-02-12T08:00:00Z") }
  ]);
  console.log("  \u2713 15 invoices with status histories created");
  console.log("  Creating claims...");
  const batch1 = await prisma.clmBatch.upsert({
    where: { batchNumber: "BATCH-2026-01" },
    update: {},
    create: { batchNumber: "BATCH-2026-01", status: "SUBMITTED", claimCount: 3, totalCents: 324089, submittedById: planManager.id, submittedAt: /* @__PURE__ */ new Date("2026-01-14T09:00:00Z") }
  });
  const batch2 = await prisma.clmBatch.upsert({
    where: { batchNumber: "BATCH-2026-02" },
    update: {},
    create: { batchNumber: "BATCH-2026-02", status: "DRAFT", claimCount: 2, totalCents: 195427, submittedById: pm2.id }
  });
  async function findOrCreateClaim(claimReference, data) {
    const existing = await prisma.clmClaim.findFirst({ where: { claimReference } });
    if (existing) return existing;
    return prisma.clmClaim.create({ data: { claimReference, ...data } });
  }
  const claim1 = await findOrCreateClaim("CLM-2026-0001", {
    invoiceId: inv1.id,
    participantId: p1.id,
    batchId: batch1.id,
    claimedCents: 65470,
    approvedCents: 65470,
    status: "APPROVED",
    submittedById: planManager.id,
    submittedAt: /* @__PURE__ */ new Date("2026-01-14T09:00:00Z"),
    outcomeAt: /* @__PURE__ */ new Date("2026-01-17T10:00:00Z"),
    outcomeNotes: "Approved by PRODA."
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim1.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-01-06"), quantity: 5, unitPriceCents: 6547, totalCents: 32735, status: "APPROVED", approvedCents: 32735 },
    { claimId: claim1.id, supportItemCode: "01_015_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Evening", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2026-01-07"), quantity: 4.5, unitPriceCents: 7210, totalCents: 32445, status: "APPROVED", approvedCents: 32445 }
  ] });
  const claim2 = await findOrCreateClaim("CLM-2026-0002", {
    invoiceId: inv2.id,
    participantId: p2.id,
    batchId: batch1.id,
    claimedCents: 116286,
    approvedCents: 116286,
    status: "APPROVED",
    submittedById: planManager.id,
    submittedAt: /* @__PURE__ */ new Date("2026-01-17T09:00:00Z"),
    outcomeAt: /* @__PURE__ */ new Date("2026-01-21T10:00:00Z"),
    outcomeNotes: "Approved."
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim2.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-13"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, status: "APPROVED", approvedCents: 58143 },
    { claimId: claim2.id, supportItemCode: "15_037_0128_1_3", supportItemName: "Physiotherapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-14"), quantity: 3, unitPriceCents: 19381, totalCents: 58143, status: "APPROVED", approvedCents: 58143 }
  ] });
  const claim3 = await findOrCreateClaim("CLM-2026-0003", {
    invoiceId: inv4.id,
    participantId: p1.id,
    batchId: batch1.id,
    claimedCents: 58923,
    approvedCents: 58923,
    status: "PAID",
    submittedById: planManager.id,
    submittedAt: /* @__PURE__ */ new Date("2026-01-14T09:00:00Z"),
    outcomeAt: /* @__PURE__ */ new Date("2026-01-18T10:00:00Z"),
    outcomeNotes: "Paid."
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim3.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2025-12-05"), quantity: 9, unitPriceCents: 6547, totalCents: 58923, status: "APPROVED", approvedCents: 58923 }
  ] });
  const claim4 = await findOrCreateClaim("CLM-2026-0004", {
    invoiceId: inv3.id,
    participantId: p3.id,
    batchId: batch2.id,
    claimedCents: 261880,
    approvedCents: 0,
    status: "SUBMITTED",
    submittedById: pm2.id,
    submittedAt: /* @__PURE__ */ new Date("2026-02-04T10:00:00Z")
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim4.id, supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", categoryCode: "11", serviceDate: /* @__PURE__ */ new Date("2026-01-15"), quantity: 20, unitPriceCents: 6547, totalCents: 130940 },
    { claimId: claim4.id, supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", categoryCode: "11", serviceDate: /* @__PURE__ */ new Date("2026-01-22"), quantity: 20, unitPriceCents: 6547, totalCents: 130940 }
  ] });
  const claim5 = await findOrCreateClaim("CLM-2026-0005", {
    invoiceId: inv11.id,
    participantId: p8.id,
    claimedCents: 117280,
    approvedCents: 0,
    status: "PENDING",
    submittedById: planManager.id
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim5.id, supportItemCode: "15_043_0128_1_3", supportItemName: "Psychology Services", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-20"), quantity: 5, unitPriceCents: 23456, totalCents: 117280 }
  ] });
  const claim6 = await findOrCreateClaim("CLM-2026-0006", {
    invoiceId: inv10.id,
    participantId: p7.id,
    claimedCents: 77524,
    approvedCents: 77524,
    status: "APPROVED",
    submittedById: pm2.id,
    submittedAt: /* @__PURE__ */ new Date("2026-01-21T09:00:00Z"),
    outcomeAt: /* @__PURE__ */ new Date("2026-01-24T10:00:00Z"),
    outcomeNotes: "Approved."
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim6.id, supportItemCode: "15_054_0128_1_3", supportItemName: "Speech Pathology", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-16"), quantity: 4, unitPriceCents: 19381, totalCents: 77524, status: "APPROVED", approvedCents: 77524 }
  ] });
  const claim7 = await findOrCreateClaim("CLM-2026-0007", {
    invoiceId: inv14.id,
    participantId: p12.id,
    claimedCents: 77524,
    approvedCents: 0,
    status: "PENDING",
    submittedById: planManager.id
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim7.id, supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", categoryCode: "15", serviceDate: /* @__PURE__ */ new Date("2026-01-23"), quantity: 4, unitPriceCents: 19381, totalCents: 77524 }
  ] });
  const claim8 = await findOrCreateClaim("CLM-2025-0095", {
    invoiceId: inv4.id,
    participantId: p1.id,
    claimedCents: 58923,
    approvedCents: 58923,
    status: "PAID",
    submittedById: planManager.id,
    submittedAt: /* @__PURE__ */ new Date("2025-12-13T09:00:00Z"),
    outcomeAt: /* @__PURE__ */ new Date("2025-12-19T10:00:00Z"),
    outcomeNotes: "Paid via ABA file."
  });
  await prisma.clmClaimLine.createMany({ skipDuplicates: true, data: [
    { claimId: claim8.id, supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Standard - Weekday Daytime", categoryCode: "01", serviceDate: /* @__PURE__ */ new Date("2025-12-05"), quantity: 9, unitPriceCents: 6547, totalCents: 58923, status: "APPROVED", approvedCents: 58923 }
  ] });
  console.log("  \u2713 8 claims + 2 batches created");
  console.log("  Creating payments...");
  const abaFile1 = await prisma.bnkAbaFile.findFirst({ where: { filename: "lotus-pm-aba-2026-01-20.aba" } });
  const abaFile = abaFile1 ?? await prisma.bnkAbaFile.create({
    data: {
      filename: "lotus-pm-aba-2026-01-20.aba",
      s3Key: "aba-files/2026/01/lotus-pm-aba-2026-01-20.aba",
      totalCents: 299709,
      paymentCount: 3,
      bankReference: "CBA-20260120-001",
      submittedAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"),
      clearedAt: /* @__PURE__ */ new Date("2026-01-22T09:00:00Z")
    }
  });
  const payBatch1 = await prisma.bnkPaymentBatch.findFirst({ where: { description: "January 2026 Payment Run" } });
  const payBatch = payBatch1 ?? await prisma.bnkPaymentBatch.create({
    data: {
      description: "January 2026 Payment Run",
      scheduledDate: /* @__PURE__ */ new Date("2026-01-20"),
      generatedAt: /* @__PURE__ */ new Date("2026-01-20T13:00:00Z"),
      uploadedAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"),
      confirmedAt: /* @__PURE__ */ new Date("2026-01-22T09:00:00Z"),
      createdById: planManager.id
    }
  });
  const pay1 = await prisma.bnkPayment.findFirst({ where: { claimId: claim1.id } });
  if (!pay1) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim1.id,
      abaFileId: abaFile.id,
      batchId: payBatch.id,
      amountCents: 65470,
      bsb: "062000",
      accountNumber: "12345678",
      accountName: "Sunrise Therapy Services",
      reference: "CLM-2026-0001",
      status: "CLEARED",
      processedAt: /* @__PURE__ */ new Date("2026-01-22T09:00:00Z")
    } });
  }
  const pay2 = await prisma.bnkPayment.findFirst({ where: { claimId: claim2.id } });
  if (!pay2) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim2.id,
      abaFileId: abaFile.id,
      batchId: payBatch.id,
      amountCents: 116286,
      bsb: "033000",
      accountNumber: "23456789",
      accountName: "Allied Health Partners Pty Ltd",
      reference: "CLM-2026-0002",
      status: "CLEARED",
      processedAt: /* @__PURE__ */ new Date("2026-01-22T09:00:00Z")
    } });
  }
  const pay3 = await prisma.bnkPayment.findFirst({ where: { claimId: claim3.id } });
  if (!pay3) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim3.id,
      abaFileId: abaFile.id,
      batchId: payBatch.id,
      amountCents: 58923,
      bsb: "062000",
      accountNumber: "12345678",
      accountName: "Sunrise Therapy Services",
      reference: "CLM-2026-0003",
      status: "CLEARED",
      processedAt: /* @__PURE__ */ new Date("2026-01-22T09:00:00Z")
    } });
  }
  const pay4 = await prisma.bnkPayment.findFirst({ where: { claimId: claim6.id } });
  if (!pay4) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim6.id,
      batchId: payBatch.id,
      amountCents: 77524,
      bsb: "062100",
      accountNumber: "56789012",
      accountName: "HorizonCare SIL Pty Ltd",
      reference: "CLM-2026-0006",
      status: "SUBMITTED_TO_BANK",
      processedAt: /* @__PURE__ */ new Date("2026-01-25T09:00:00Z")
    } });
  }
  const pay5 = await prisma.bnkPayment.findFirst({ where: { claimId: claim5.id } });
  if (!pay5) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim5.id,
      amountCents: 117280,
      bsb: "033100",
      accountNumber: "67890123",
      accountName: "Pathways Psychology Pty Ltd",
      reference: "CLM-2026-0005",
      status: "PENDING"
    } });
  }
  const pay6 = await prisma.bnkPayment.findFirst({ where: { claimId: claim7.id } });
  if (!pay6) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim7.id,
      amountCents: 77524,
      bsb: "016000",
      accountNumber: "45678901",
      accountName: "Ability Plus Occupational Therapy",
      reference: "CLM-2026-0007",
      status: "PENDING"
    } });
  }
  const pay7 = await prisma.bnkPayment.findFirst({ where: { claimId: claim4.id } });
  if (!pay7) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim4.id,
      amountCents: 261880,
      bsb: "062100",
      accountNumber: "56789012",
      accountName: "HorizonCare SIL Pty Ltd",
      reference: "CLM-2026-0004",
      status: "IN_ABA_FILE"
    } });
  }
  const pay8 = await prisma.bnkPayment.findFirst({ where: { claimId: claim8.id } });
  if (!pay8) {
    await prisma.bnkPayment.create({ data: {
      claimId: claim8.id,
      amountCents: 58923,
      bsb: "062000",
      accountNumber: "12345678",
      accountName: "Sunrise Therapy Services",
      reference: "CLM-2025-0095",
      status: "CLEARED",
      processedAt: /* @__PURE__ */ new Date("2025-12-22T09:00:00Z"),
      holdReason: null
    } });
  }
  console.log("  \u2713 1 ABA file + 1 payment batch + 8 payments created");
  console.log("  Creating service agreements...");
  const sa1 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: "SA-2025-0001" },
    update: {},
    create: {
      agreementRef: "SA-2025-0001",
      participantId: p1.id,
      providerId: prov1.id,
      startDate: /* @__PURE__ */ new Date("2025-07-01"),
      endDate: /* @__PURE__ */ new Date("2026-06-30"),
      reviewDate: /* @__PURE__ */ new Date("2026-01-01"),
      status: "ACTIVE",
      notes: "Standard daily care + therapy support.",
      managedById: planManager.id
    }
  });
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa1.id, categoryCode: "01", categoryName: "Daily Activities", supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Weekday Daytime", agreedRateCents: 6547, unitType: "H" },
    { agreementId: sa1.id, categoryCode: "01", categoryName: "Daily Activities", supportItemCode: "01_015_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Weekday Evening", agreedRateCents: 7210, unitType: "H" }
  ] });
  const sa2 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: "SA-2025-0002" },
    update: {},
    create: {
      agreementRef: "SA-2025-0002",
      participantId: p2.id,
      providerId: prov2.id,
      startDate: /* @__PURE__ */ new Date("2025-09-01"),
      endDate: /* @__PURE__ */ new Date("2026-08-31"),
      status: "ACTIVE",
      notes: "OT and physio sessions fortnightly.",
      managedById: planManager.id
    }
  });
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa2.id, categoryCode: "15", categoryName: "Improved Daily Living", supportItemCode: "15_056_0128_1_3", supportItemName: "Occupational Therapy", agreedRateCents: 19381, unitType: "H" },
    { agreementId: sa2.id, categoryCode: "15", categoryName: "Improved Daily Living", supportItemCode: "15_037_0128_1_3", supportItemName: "Physiotherapy", agreedRateCents: 19381, unitType: "H" }
  ] });
  const sa3 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: "SA-2025-0003" },
    update: {},
    create: {
      agreementRef: "SA-2025-0003",
      participantId: p3.id,
      providerId: prov5.id,
      startDate: /* @__PURE__ */ new Date("2025-07-01"),
      endDate: /* @__PURE__ */ new Date("2026-06-30"),
      status: "ACTIVE",
      notes: "SIL \u2014 20 hrs/week.",
      managedById: pm2.id
    }
  });
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa3.id, categoryCode: "11", categoryName: "Improved Living Arrangements", supportItemCode: "11_022_0115_1_1", supportItemName: "Assistance in Supported Independent Living", agreedRateCents: 6547, unitType: "H" }
  ] });
  const sa4 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: "SA-2025-0004" },
    update: {},
    create: {
      agreementRef: "SA-2025-0004",
      participantId: p6.id,
      providerId: prov6.id,
      startDate: /* @__PURE__ */ new Date("2025-08-01"),
      endDate: /* @__PURE__ */ new Date("2026-07-31"),
      status: "ACTIVE",
      notes: "Psychology sessions weekly.",
      managedById: planManager.id
    }
  });
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa4.id, categoryCode: "15", categoryName: "Improved Daily Living", supportItemCode: "15_043_0128_1_3", supportItemName: "Psychology Services", agreedRateCents: 23456, unitType: "H" }
  ] });
  const sa5 = await prisma.saServiceAgreement.upsert({
    where: { agreementRef: "SA-2024-0021" },
    update: {},
    create: {
      agreementRef: "SA-2024-0021",
      participantId: p14.id,
      providerId: prov3.id,
      startDate: /* @__PURE__ */ new Date("2024-07-01"),
      endDate: /* @__PURE__ */ new Date("2025-06-30"),
      status: "EXPIRED",
      notes: "Expired agreement \u2014 not renewed.",
      managedById: planManager.id
    }
  });
  await prisma.saRateLine.createMany({ skipDuplicates: true, data: [
    { agreementId: sa5.id, categoryCode: "01", categoryName: "Daily Activities", supportItemCode: "01_011_0107_1_1", supportItemName: "Assistance With Self-Care Activities - Weekday Daytime", agreedRateCents: 6547, unitType: "H" }
  ] });
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa1.id, budgetLineId: bl1_01.id } },
    update: {},
    create: { serviceAgreementId: sa1.id, budgetLineId: bl1_01.id, allocatedCents: 3e6, note: "Daily care allocation FY2025-26", createdById: planManager.id }
  });
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa2.id, budgetLineId: bl2_15.id } },
    update: {},
    create: { serviceAgreementId: sa2.id, budgetLineId: bl2_15.id, allocatedCents: 8e5, note: "Therapy sessions FY2025-26", createdById: planManager.id }
  });
  await prisma.saBudgetAllocation.upsert({
    where: { serviceAgreementId_budgetLineId: { serviceAgreementId: sa3.id, budgetLineId: bl3_11.id } },
    update: {},
    create: { serviceAgreementId: sa3.id, budgetLineId: bl3_11.id, allocatedCents: 68e5, note: "SIL full year allocation", createdById: pm2.id }
  });
  console.log("  \u2713 5 service agreements + 3 SA budget allocations created");
  console.log("  Creating fund quarantines...");
  const q1Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl1_01.id, providerId: prov1.id, supportItemCode: "01_011_0107_1_1" } });
  if (!q1Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa1.id,
      budgetLineId: bl1_01.id,
      providerId: prov1.id,
      supportItemCode: "01_011_0107_1_1",
      quarantinedCents: 5e5,
      usedCents: 130940,
      status: "ACTIVE",
      limitType: "SOFT",
      notes: "Earmarked for Sunrise Therapy daily care.",
      createdById: planManager.id
    } });
  }
  const q2Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl3_11.id, providerId: prov5.id, supportItemCode: "11_022_0115_1_1" } });
  if (!q2Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa3.id,
      budgetLineId: bl3_11.id,
      providerId: prov5.id,
      supportItemCode: "11_022_0115_1_1",
      quarantinedCents: 3e6,
      usedCents: 2615e3,
      status: "ACTIVE",
      limitType: "HARD",
      notes: "Hard limit \u2014 HorizonCare SIL weekly hours capped.",
      createdById: pm2.id
    } });
  }
  const q3Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl2_15.id, providerId: prov2.id, supportItemCode: null } });
  if (!q3Existing) {
    await prisma.fqQuarantine.create({ data: {
      budgetLineId: bl2_15.id,
      providerId: prov2.id,
      quarantinedCents: 6e5,
      usedCents: 6e5,
      status: "RELEASED",
      limitType: "SOFT",
      notes: "Released after SA review Dec 2025.",
      createdById: planManager.id
    } });
  }
  const q4Existing = await prisma.fqQuarantine.findFirst({ where: { budgetLineId: bl6_15.id, providerId: prov6.id, supportItemCode: "15_043_0128_1_3" } });
  if (!q4Existing) {
    await prisma.fqQuarantine.create({ data: {
      serviceAgreementId: sa4.id,
      budgetLineId: bl6_15.id,
      providerId: prov6.id,
      supportItemCode: "15_043_0128_1_3",
      quarantinedCents: 15e5,
      usedCents: 0,
      status: "ACTIVE",
      limitType: "SOFT",
      notes: "Psychology sessions year allocation.",
      createdById: planManager.id
    } });
  }
  console.log("  \u2713 4 fund quarantines created");
  console.log("  Creating documents...");
  const docsData = [
    { participantId: p1.id, name: "Oliver Bennett \u2014 NDIS Plan Letter Jul 2025", category: "PLAN_LETTER", mimeType: "application/pdf", sizeBytes: 245e3, s3Key: "documents/p1/plan-letter-2025-07.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null },
    { participantId: p1.id, name: "Sunrise Therapy Service Agreement Jul 2025", category: "SERVICE_AGREEMENT", mimeType: "application/pdf", sizeBytes: 18e4, s3Key: "documents/p1/sa-sunrise-2025-07.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: sa1.id },
    { participantId: p2.id, name: "Amara Osei \u2014 NDIS Plan Letter Sep 2025", category: "PLAN_LETTER", mimeType: "application/pdf", sizeBytes: 22e4, s3Key: "documents/p2/plan-letter-2025-09.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null },
    { participantId: p3.id, name: "Liam Fitzgerald \u2014 OT Assessment Report", category: "ASSESSMENT", mimeType: "application/pdf", sizeBytes: 512e3, s3Key: "documents/p3/ot-assessment-2025.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null },
    { participantId: p3.id, name: "HorizonCare SIL Agreement Jul 2025", category: "SERVICE_AGREEMENT", mimeType: "application/pdf", sizeBytes: 32e4, s3Key: "documents/p3/sa-horizoncare-2025-07.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: sa3.id },
    { participantId: p5.id, name: "Marcus Hartley \u2014 Functional Capacity Assessment", category: "ASSESSMENT", mimeType: "application/pdf", sizeBytes: 68e4, s3Key: "documents/p5/fca-2025.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null },
    { participantId: p8.id, name: "Isabel Crawford \u2014 Support Plan 2025-26", category: "PLAN_LETTER", mimeType: "application/pdf", sizeBytes: 195e3, s3Key: "documents/p8/support-plan-2025.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null },
    { participantId: p10.id, name: "Fatima Hassan \u2014 Welcome Pack", category: "CORRESPONDENCE", mimeType: "application/pdf", sizeBytes: 15e4, s3Key: "documents/p10/welcome-pack-2025.pdf", s3Bucket: "lotus-pm-documents", serviceAgreementId: null }
  ];
  for (const doc of docsData) {
    const existing = await prisma.docDocument.findFirst({ where: { participantId: doc.participantId, name: doc.name } });
    if (!existing) {
      await prisma.docDocument.create({ data: { ...doc, uploadedById: planManager.id } });
    }
  }
  console.log("  \u2713 8 documents created");
  console.log("  Creating CRM flags...");
  const flagsData = [
    { participantId: p9.id, providerId: void 0, severity: "ADVISORY", reason: "Participant has expressed dissatisfaction with current support hours. Monitor closely.", createdById: planManager.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: p3.id, providerId: void 0, severity: "BLOCKING", reason: "Possible duplicate invoice detected \u2014 INV HCSIL-FEB-001 exceeds plan budget by $5,883. Do not approve without PM review.", createdById: pm2.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: void 0, providerId: prov10.id, severity: "BLOCKING", reason: "Provider suspended by NDIS Commission effective 15 Jan 2026. Do not process any invoices.", createdById: director.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: void 0, providerId: prov3.id, severity: "ADVISORY", reason: "New ABN registered \u2014 awaiting NDIS registration confirmation. Cross-check invoices carefully.", createdById: planManager.id, resolvedAt: null, resolvedById: null, resolveNote: null },
    { participantId: p5.id, providerId: void 0, severity: "ADVISORY", reason: "Participant moving to regional area. Pricing region may need updating to REMOTE effective 1 Mar 2026.", createdById: pm2.id, resolvedAt: /* @__PURE__ */ new Date("2026-02-01T10:00:00Z"), resolvedById: pm2.id, resolveNote: "Pricing region updated to REMOTE." },
    { participantId: void 0, providerId: prov2.id, severity: "ADVISORY", reason: "Allied Health Partners changed bank account \u2014 verify new BSB/account on next invoice.", createdById: planManager.id, resolvedAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z"), resolvedById: planManager.id, resolveNote: "Bank details verified and updated." }
  ];
  for (const f of flagsData) {
    const existing = await prisma.crmFlag.findFirst({ where: { reason: f.reason } });
    if (!existing) {
      await prisma.crmFlag.create({ data: f });
    }
  }
  console.log("  \u2713 6 CRM flags created");
  console.log("  Creating coordinator assignments...");
  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p1.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p1.id, organisation: "CarePath Support Services", assignedById: planManager.id, isActive: true }
  });
  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p3.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p3.id, organisation: "CarePath Support Services", assignedById: pm2.id, isActive: true }
  });
  await prisma.crmCoordinatorAssignment.upsert({
    where: { coordinatorId_participantId: { coordinatorId: coordinator.id, participantId: p8.id } },
    update: {},
    create: { coordinatorId: coordinator.id, participantId: p8.id, organisation: "CarePath Support Services", assignedById: planManager.id, isActive: false, deactivatedAt: /* @__PURE__ */ new Date("2026-01-15T00:00:00Z") }
  });
  console.log("  \u2713 3 coordinator assignments created");
  console.log("  Creating PM fee schedules...");
  const feeSchedule1 = await prisma.pmFeeSchedule.findFirst({ where: { name: "Monthly Plan Management Fee" } });
  const feeSchedMonthly = feeSchedule1 ?? await prisma.pmFeeSchedule.create({ data: {
    name: "Monthly Plan Management Fee",
    supportItemCode: "14_033_0127_8_3",
    description: "Standard monthly plan management fee per NDIS Price Guide 2025-26.",
    rateCents: 15477,
    frequency: "MONTHLY",
    isActive: true
  } });
  const feeSchedule2 = await prisma.pmFeeSchedule.findFirst({ where: { name: "Plan Management Setup Fee" } });
  const feeSchedSetup = feeSchedule2 ?? await prisma.pmFeeSchedule.create({ data: {
    name: "Plan Management Setup Fee",
    supportItemCode: "14_034_0127_8_3",
    description: "One-off setup fee for new participants.",
    rateCents: 23310,
    frequency: "ONE_OFF",
    isActive: true
  } });
  await prisma.pmFeeOverride.upsert({
    where: { feeScheduleId_participantId: { feeScheduleId: feeSchedMonthly.id, participantId: p5.id } },
    update: {},
    create: { feeScheduleId: feeSchedMonthly.id, participantId: p5.id, rateCents: 12e3, notes: "Negotiated reduced rate \u2014 remote participant." }
  });
  await prisma.pmFeeOverride.upsert({
    where: { feeScheduleId_participantId: { feeScheduleId: feeSchedMonthly.id, participantId: p14.id } },
    update: {},
    create: { feeScheduleId: feeSchedMonthly.id, participantId: p14.id, rateCents: 12e3, notes: "Very remote \u2014 reduced rate." }
  });
  const feeChargesData = [
    { feeScheduleId: feeSchedMonthly.id, participantId: p1.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), amountCents: 15477, status: "CLAIMED" },
    { feeScheduleId: feeSchedMonthly.id, participantId: p2.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), amountCents: 15477, status: "CLAIMED" },
    { feeScheduleId: feeSchedMonthly.id, participantId: p3.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), amountCents: 15477, status: "PENDING" },
    { feeScheduleId: feeSchedMonthly.id, participantId: p1.id, periodStart: /* @__PURE__ */ new Date("2026-02-01"), periodEnd: /* @__PURE__ */ new Date("2026-02-28"), amountCents: 15477, status: "PENDING" },
    { feeScheduleId: feeSchedSetup.id, participantId: p10.id, periodStart: /* @__PURE__ */ new Date("2025-09-01"), periodEnd: /* @__PURE__ */ new Date("2025-09-01"), amountCents: 23310, status: "PAID" },
    { feeScheduleId: feeSchedSetup.id, participantId: p13.id, periodStart: /* @__PURE__ */ new Date("2025-10-01"), periodEnd: /* @__PURE__ */ new Date("2025-10-01"), amountCents: 23310, status: "PAID" }
  ];
  for (const fc of feeChargesData) {
    await prisma.pmFeeCharge.upsert({
      where: { feeScheduleId_participantId_periodStart: { feeScheduleId: fc.feeScheduleId, participantId: fc.participantId, periodStart: fc.periodStart } },
      update: {},
      create: fc
    });
  }
  console.log("  \u2713 2 fee schedules + 2 overrides + 6 charges created");
  console.log("  Creating participant statements...");
  const stmtsData = [
    { participantId: p1.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), deliveryMethod: "EMAIL", sentAt: /* @__PURE__ */ new Date("2026-02-02T09:00:00Z"), s3Key: "statements/p1/2026-01.pdf", totalInvoicedCents: 124393, totalClaimedCents: 124393, totalPaidCents: 58923, budgetRemainingCents: 3551607, lineItems: [], createdById: planManager.id },
    { participantId: p2.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), deliveryMethod: "EMAIL", sentAt: /* @__PURE__ */ new Date("2026-02-02T09:00:00Z"), s3Key: "statements/p2/2026-01.pdf", totalInvoicedCents: 116286, totalClaimedCents: 116286, totalPaidCents: 116286, budgetRemainingCents: 3483714, lineItems: [], createdById: planManager.id },
    { participantId: p3.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), deliveryMethod: "EMAIL", sentAt: null, s3Key: null, totalInvoicedCents: 261880, totalClaimedCents: 261880, totalPaidCents: 0, budgetRemainingCents: 59e5, lineItems: [], createdById: pm2.id },
    { participantId: p8.id, periodStart: /* @__PURE__ */ new Date("2026-01-01"), periodEnd: /* @__PURE__ */ new Date("2026-01-31"), deliveryMethod: "EMAIL", sentAt: /* @__PURE__ */ new Date("2026-02-03T09:00:00Z"), s3Key: "statements/p8/2026-01.pdf", totalInvoicedCents: 117280, totalClaimedCents: 117280, totalPaidCents: 0, budgetRemainingCents: 3882720, lineItems: [], createdById: planManager.id }
  ];
  for (const stmt of stmtsData) {
    const existing = await prisma.participantStatement.findFirst({ where: { participantId: stmt.participantId, periodStart: stmt.periodStart } });
    if (!existing) {
      await prisma.participantStatement.create({ data: stmt });
    }
  }
  console.log("  \u2713 4 participant statements created");
  console.log("  Creating email templates...");
  const templatesData = [
    { name: "Welcome Pack \u2014 Standard", type: "WELCOME_PACK", subject: "Welcome to Lotus Plan Management \u2014 {{participantName}}", bodyHtml: "<h1>Welcome {{participantName}}</h1><p>We are delighted to support your NDIS journey.</p>", mergeFields: ["participantName", "planManagerName"], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: "Signed Service Agreement" },
    { name: "Service Agreement \u2014 Standard", type: "SERVICE_AGREEMENT", subject: "Your Service Agreement \u2014 {{providerName}}", bodyHtml: "<p>Please find attached your service agreement with {{providerName}}.</p>", mergeFields: ["participantName", "providerName", "agreementRef"], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: "Service Agreement PDF" },
    { name: "Invoice Received Notification", type: "INVOICE_NOTIFICATION", subject: "Invoice {{invoiceNumber}} received from {{providerName}}", bodyHtml: "<p>We have received invoice {{invoiceNumber}} from {{providerName}} for ${{invoiceTotal}}.</p>", mergeFields: ["participantName", "providerName", "invoiceNumber", "invoiceTotal"], isActive: true, supportsVariableAttachment: false },
    { name: "Claim Status \u2014 Approved", type: "CLAIM_STATUS", subject: "NDIS Claim {{claimRef}} Approved", bodyHtml: "<p>Your claim {{claimRef}} for ${{claimAmount}} has been approved by the NDIS.</p>", mergeFields: ["participantName", "claimRef", "claimAmount"], isActive: true, supportsVariableAttachment: false },
    { name: "Monthly Budget Report", type: "BUDGET_REPORT", subject: "Your Monthly Budget Report \u2014 {{month}} {{year}}", bodyHtml: "<p>Please find your budget utilisation report for {{month}} {{year}} attached.</p>", mergeFields: ["participantName", "month", "year"], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: "Budget Report PDF" },
    { name: "Invoice Approval Request", type: "APPROVAL_REQUEST", subject: "Please approve invoice from {{providerName}} \u2014 action required", bodyHtml: '<p>Invoice {{invoiceNumber}} from {{providerName}} requires your approval. Click the link below to approve or reject.</p><p><a href="{{approvalLink}}">Review Invoice</a></p>', mergeFields: ["participantName", "providerName", "invoiceNumber", "approvalLink"], isActive: true, includesFormLink: true, supportsVariableAttachment: false },
    { name: "Custom Notice \u2014 Standard", type: "CUSTOM", subject: "{{subject}}", bodyHtml: "<p>{{body}}</p>", mergeFields: ["subject", "body", "recipientName"], isActive: true, supportsVariableAttachment: true, variableAttachmentDescription: "Optional attachment" }
  ];
  for (const tmpl of templatesData) {
    await prisma.notifEmailTemplate.upsert({
      where: { name: tmpl.name },
      update: {},
      create: { ...tmpl, mergeFields: tmpl.mergeFields, createdById: director.id }
    });
  }
  console.log("  \u2713 7 email templates created");
  console.log("  Creating automation rules...");
  const rulesData = [
    {
      name: "Flag invoice when provider is suspended",
      description: "Automatically flag for review when an invoice arrives from a suspended provider.",
      isActive: true,
      triggerType: "EVENT",
      triggerEvent: "lotus-pm.invoices.received",
      conditions: [{ field: "provider.providerStatus", operator: "equals", value: "SUSPENDED" }],
      actions: [{ type: "flag", params: { severity: "BLOCKING", reason: "Invoice from suspended provider \u2014 requires review." } }]
    },
    {
      name: "Send SMS when invoice approved",
      description: "Notify participant via SMS when their invoice is approved.",
      isActive: true,
      triggerType: "EVENT",
      triggerEvent: "lotus-pm.invoices.approved",
      conditions: [{ field: "participant.phone", operator: "exists" }],
      actions: [{ type: "sms", params: { message: "Your invoice from {{providerName}} has been approved." } }]
    },
    {
      name: "Daily expiring plan alert",
      description: "Send in-app notification to plan managers when plans are expiring within 60 days.",
      isActive: true,
      triggerType: "SCHEDULE",
      cronExpression: "0 8 * * *",
      conditions: [{ field: "plan.daysUntilExpiry", operator: "lessThan", value: 60 }],
      actions: [{ type: "notification", params: { channel: "IN_APP", message: "Plan for {{participantName}} expires in {{daysUntilExpiry}} days." } }]
    },
    {
      name: "Weekly budget utilisation report",
      description: "Generate weekly budget utilisation summary for plan managers.",
      isActive: false,
      triggerType: "SCHEDULE",
      cronExpression: "0 7 * * 1",
      conditions: [],
      actions: [{ type: "report", params: { reportType: "budget_utilisation", recipients: ["pm@lotusassist.com.au"] } }]
    }
  ];
  for (const rule of rulesData) {
    const existing = await prisma.autoRule.findFirst({ where: { name: rule.name } });
    if (!existing) {
      await prisma.autoRule.create({ data: rule });
    }
  }
  console.log("  \u2713 4 automation rules created");
  console.log("  Creating notifications...");
  const notifsData = [
    { channel: "IN_APP", recipient: planManager.id, subject: "Invoice STS-2026-0101 ready for review", message: "Invoice STS-2026-0101 from Sunrise Therapy Services has been extracted and is ready for approval.", status: "SENT", userId: planManager.id, readAt: /* @__PURE__ */ new Date("2026-01-11T10:00:00Z"), participantId: p1.id },
    { channel: "IN_APP", recipient: planManager.id, subject: "Invoice AHP-INV-20260115 approved", message: "Invoice AHP-INV-20260115 from Allied Health Partners has been approved. Claim CLM-2026-0002 created.", status: "SENT", userId: planManager.id, readAt: /* @__PURE__ */ new Date("2026-01-16T09:35:00Z"), participantId: p2.id },
    { channel: "IN_APP", recipient: pm2.id, subject: "Invoice HCSIL-FEB-001 rejected \u2014 budget exceeded", message: "Invoice HCSIL-FEB-001 from HorizonCare SIL was rejected. Total exceeds Category 11 budget.", status: "SENT", userId: pm2.id, readAt: null, participantId: p3.id },
    { channel: "IN_APP", recipient: planManager.id, subject: "Plan expiring soon \u2014 Oliver Bennett", message: "Oliver Bennett's NDIS plan expires on 30 Jun 2026 \u2014 review date is 1 May 2026.", status: "SENT", userId: planManager.id, readAt: null, participantId: p1.id },
    { channel: "IN_APP", recipient: pm2.id, subject: "New invoice AHP-INV-20260201 requires attention", message: "Invoice AHP-INV-20260201 from Allied Health Partners is in PENDING_REVIEW \u2014 missing NDIS codes.", status: "SENT", userId: pm2.id, readAt: null, participantId: p4.id },
    { channel: "IN_APP", recipient: director.id, subject: "Provider suspended \u2014 Nexus Disability Services", message: "Nexus Disability Services (ABN 01234567890) has been suspended. All pending invoices have been flagged.", status: "SENT", userId: director.id, readAt: /* @__PURE__ */ new Date("2026-01-15T11:00:00Z") },
    { channel: "IN_APP", recipient: planManager.id, subject: "Claim CLM-2026-0001 approved by PRODA", message: "Claim CLM-2026-0001 for Oliver Bennett ($654.70) has been approved by the NDIS portal.", status: "SENT", userId: planManager.id, readAt: /* @__PURE__ */ new Date("2026-01-17T11:00:00Z"), participantId: p1.id },
    { channel: "IN_APP", recipient: planManager.id, subject: "Participant approval request sent \u2014 Amara Osei", message: "Invoice approval request for AHP-INV-20260205 has been sent to Amara Osei via email.", status: "SENT", userId: planManager.id, readAt: null, participantId: p2.id },
    { channel: "IN_APP", recipient: pm2.id, subject: "Budget alert \u2014 Connor Walsh plan 95% utilised", message: "Connor Walsh's NDIS plan budget is 95% utilised with 2 months remaining.", status: "SENT", userId: pm2.id, readAt: null, participantId: p11.id },
    { channel: "IN_APP", recipient: planManager.id, subject: "Statement generated \u2014 4 participants", message: "January 2026 statements have been generated for 4 participants and are ready to send.", status: "SENT", userId: planManager.id, readAt: null },
    { channel: "SMS", recipient: "+61411100001", message: "Lotus PM: Your invoice from Sunrise Therapy Services ($654.70) has been approved. Ref: CLM-2026-0001.", status: "SENT", sentAt: /* @__PURE__ */ new Date("2026-01-13T10:05:00Z"), participantId: p1.id },
    { channel: "SMS", recipient: "+61422200002", message: "Lotus PM: Invoice approval required. Please check your email for details. Ref: AHP-INV-20260205.", status: "SENT", sentAt: /* @__PURE__ */ new Date("2026-02-05T10:15:00Z"), participantId: p2.id },
    { channel: "SMS", recipient: "+61400500014", message: "Lotus PM: Your January 2026 budget statement is available. Contact your plan manager for details.", status: "DELIVERED", sentAt: /* @__PURE__ */ new Date("2026-02-02T09:05:00Z"), participantId: p14.id },
    { channel: "EMAIL", recipient: "oliver.bennett@email.com.au", subject: "Your January 2026 Budget Statement", message: "Please find your January 2026 budget statement attached.", status: "SENT", sentAt: /* @__PURE__ */ new Date("2026-02-02T09:00:00Z"), participantId: p1.id },
    { channel: "EMAIL", recipient: "amara.osei@hotmail.com", subject: "Invoice Approval Required \u2014 AHP-INV-20260205", message: "Invoice AHP-INV-20260205 from Allied Health Partners requires your approval.", status: "SENT", sentAt: /* @__PURE__ */ new Date("2026-02-05T10:15:00Z"), participantId: p2.id }
  ];
  for (const n of notifsData) {
    const existing = await prisma.notifNotification.findFirst({ where: { recipient: n.recipient, message: n.message } });
    if (!existing) {
      await prisma.notifNotification.create({ data: n });
    }
  }
  console.log("  \u2713 15 notifications created");
  console.log("  Creating comm logs...");
  const commLogsData = [
    { type: "EMAIL", direction: "INBOUND", subject: "RE: Service Agreement renewal", body: "Hi Sarah, yes we are happy to renew the service agreement for another 12 months.", participantId: p1.id, providerId: prov1.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-05T10:00:00Z") },
    { type: "PHONE", direction: "OUTBOUND", subject: "Follow-up re invoice AHP-INV-20260201", body: "Called Allied Health Partners re missing NDIS codes on invoice. They will resend with corrections.", participantId: p4.id, providerId: prov2.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-02-02T11:00:00Z") },
    { type: "EMAIL", direction: "OUTBOUND", subject: "Welcome to Lotus Plan Management", body: "Welcome pack sent to Fatima Hassan. Includes service guide, fee schedule, and contact details.", participantId: p10.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2025-09-05T09:00:00Z") },
    { type: "SMS", direction: "OUTBOUND", body: "Hi Oliver, your invoice from Sunrise Therapy has been approved. Payment will be made within 2 business days.", participantId: p1.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-13T10:05:00Z") },
    { type: "NOTE", direction: "INTERNAL", subject: "Participant capacity assessment required", body: "Liam Fitzgerald requires updated functional capacity assessment before next plan review. Contact OT provider.", participantId: p3.id, userId: pm2.id, occurredAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z") },
    { type: "EMAIL", direction: "INBOUND", subject: "Invoice CC-2026-0045 \u2014 January support hours", body: "Please find attached our invoice for January support services for Marcus Hartley.", participantId: p5.id, providerId: prov3.id, userId: pm2.id, occurredAt: /* @__PURE__ */ new Date("2026-02-10T11:00:00Z") },
    { type: "PHONE", direction: "INBOUND", subject: "Query re payment timing", body: "Provider HorizonCare called re payment timing for HCSIL-JAN-001. Advised payment within 5 business days of claim approval.", participantId: p3.id, providerId: prov5.id, userId: pm2.id, occurredAt: /* @__PURE__ */ new Date("2026-02-05T09:30:00Z") },
    { type: "EMAIL", direction: "OUTBOUND", subject: "Monthly budget utilisation \u2014 January 2026", body: "Budget summary for January 2026 sent to Oliver Bennett at request.", participantId: p1.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-02-02T10:00:00Z") },
    { type: "IN_PERSON", direction: "INBOUND", subject: "Annual review meeting", body: "Met with Sophie Nguyen and family re plan review. Support hours to increase from 15 to 20 hrs/week.", participantId: p4.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-28T10:00:00Z") },
    { type: "NOTE", direction: "INTERNAL", subject: "ABA file submitted \u2014 Jan run", body: "ABA file lotus-pm-aba-2026-01-20.aba submitted to CBA CommBiz. Ref CBA-20260120-001. 3 payments totalling $2,997.09.", userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-20T14:05:00Z") },
    { type: "EMAIL", direction: "OUTBOUND", subject: "Invoice rejected \u2014 NDS-2026-0101", body: "Invoice NDS-2026-0101 from Nexus Disability Services has been rejected. Provider is currently suspended.", participantId: p9.id, providerId: prov10.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-06T14:05:00Z") },
    { type: "PORTAL_MESSAGE", direction: "INBOUND", subject: "Portal query re payment", body: "Provider Sunrise Therapy asked via portal when CLM-2026-0001 payment will be processed.", providerId: prov1.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-18T09:00:00Z") },
    { type: "SMS", direction: "OUTBOUND", body: "Lotus PM: Invoice from Allied Health Partners requires your approval. Check your email. Ref AHP-INV-20260205.", participantId: p2.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-02-05T10:15:00Z") },
    { type: "NOTE", direction: "INTERNAL", subject: "Flag raised \u2014 provider suspended", body: "Blocking flag raised on Nexus Disability Services following NDIS Commission suspension notice received 15 Jan 2026.", providerId: prov10.id, userId: director.id, occurredAt: /* @__PURE__ */ new Date("2026-01-15T11:00:00Z") },
    { type: "EMAIL", direction: "INBOUND", subject: "New bank details \u2014 Allied Health Partners", body: "Please update our bank details: BSB 033-000, Acc 23456789, Allied Health Partners Pty Ltd.", providerId: prov2.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-19T09:00:00Z") },
    { type: "PHONE", direction: "OUTBOUND", subject: "Verification call \u2014 bank details", body: "Called Allied Health Partners to verify new bank account details. Confirmed \u2014 updated in system.", providerId: prov2.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-01-20T14:00:00Z") },
    { type: "EMAIL", direction: "OUTBOUND", subject: "Service agreement renewal reminder", body: "SA-2024-0021 for Margaret Sullivan expired 30 Jun 2025. Please contact provider re renewal.", participantId: p14.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2025-07-02T09:00:00Z") },
    { type: "NOTE", direction: "INTERNAL", subject: "Remote pricing region \u2014 Marcus Hartley", body: "Marcus Hartley confirmed move to remote area effective 1 Mar 2026. Pricing region to be updated.", participantId: p5.id, userId: pm2.id, occurredAt: /* @__PURE__ */ new Date("2026-01-25T10:00:00Z") },
    { type: "EMAIL", direction: "INBOUND", subject: "Query re statement", body: "Oliver Bennett emailed asking for breakdown of January 2026 spending. Sent budget report.", participantId: p1.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2026-02-04T09:00:00Z") },
    { type: "NOTE", direction: "INTERNAL", subject: "Onboarding completed \u2014 Fatima Hassan", body: "Fatima Hassan onboarding complete. Plan active, welcome pack sent, service agreement with Allied Health Partners in place.", participantId: p10.id, userId: planManager.id, occurredAt: /* @__PURE__ */ new Date("2025-09-10T10:00:00Z") }
  ];
  for (const cl of commLogsData) {
    const existing = await prisma.crmCommLog.findFirst({ where: { body: cl.body, occurredAt: cl.occurredAt } });
    if (!existing) {
      await prisma.crmCommLog.create({ data: cl });
    }
  }
  console.log("  \u2713 20 comm logs created");
  console.log("  Creating correspondence...");
  const corrData = [
    { type: "EMAIL_OUTBOUND", subject: "Welcome to Lotus Plan Management", body: "Dear Oliver, welcome to Lotus Plan Management. We look forward to supporting your NDIS journey.", fromAddress: "pm@lotusassist.com.au", toAddress: "oliver.bennett@email.com.au", participantId: p1.id, createdById: planManager.id },
    { type: "EMAIL_INBOUND", subject: "Invoice STS-2026-0101", body: "Please find attached invoice STS-2026-0101 for support services provided in January 2026.", fromAddress: "accounts@sunrisetherapy.com.au", toAddress: "invoices@lotusassist.com.au", participantId: p1.id, providerId: prov1.id, createdById: planManager.id },
    { type: "EMAIL_OUTBOUND", subject: "Claim approved \u2014 CLM-2026-0002", body: "Dear Amara, your claim CLM-2026-0002 for $1,162.86 from Allied Health Partners has been approved by the NDIS.", fromAddress: "pm@lotusassist.com.au", toAddress: "amara.osei@hotmail.com", participantId: p2.id, createdById: planManager.id },
    { type: "NOTE", subject: "Internal: Provider bank details updated", body: "Allied Health Partners bank details verified and updated following phone call on 20 Jan 2026.", providerId: prov2.id, createdById: planManager.id },
    { type: "EMAIL_OUTBOUND", subject: "Invoice rejected \u2014 budget exceeded", body: "Dear HorizonCare SIL, invoice HCSIL-FEB-001 has been rejected as it exceeds the remaining Category 11 budget.", fromAddress: "pm2@lotusassist.com.au", toAddress: "accounts@horizoncaresil.com.au", participantId: p3.id, providerId: prov5.id, createdById: pm2.id },
    { type: "SMS_OUTBOUND", body: "Lotus PM: Your invoice from Sunrise Therapy has been approved. Payment within 2 business days.", toAddress: "+61411100001", participantId: p1.id, createdById: planManager.id },
    { type: "EMAIL_INBOUND", subject: "Query re missing invoice codes", body: "Hi, we have resent invoice AHP-INV-20260201 with the correct NDIS support item codes.", fromAddress: "admin@alliedhealthpartners.com.au", toAddress: "invoices@lotusassist.com.au", participantId: p4.id, providerId: prov2.id, createdById: planManager.id },
    { type: "PHONE_CALL", subject: "Annual review call \u2014 Liam Fitzgerald", body: "Outbound call to Liam Fitzgerald re annual plan review. Discussed support hours, no changes requested.", participantId: p3.id, createdById: pm2.id },
    { type: "EMAIL_OUTBOUND", subject: "January 2026 Statement", body: "Dear Oliver, please find your January 2026 financial statement attached.", fromAddress: "pm@lotusassist.com.au", toAddress: "oliver.bennett@email.com.au", participantId: p1.id, createdById: planManager.id },
    { type: "NOTE", subject: "Suspension notice \u2014 Nexus Disability Services", body: "NDIS Commission suspension notice received for Nexus Disability Services. Blocking flag raised. All pending invoices on hold.", providerId: prov10.id, createdById: director.id }
  ];
  for (const c of corrData) {
    const existing = await prisma.crmCorrespondence.findFirst({ where: { body: c.body } });
    if (!existing) {
      await prisma.crmCorrespondence.create({ data: c });
    }
  }
  console.log("  \u2713 10 correspondence records created");
  console.log("  Creating invoice item patterns...");
  const patternsData = [
    { providerId: prov1.id, participantId: p1.id, categoryCode: "01", itemNumber: "01_011_0107_1_1", occurrences: 12, lastSeenAt: /* @__PURE__ */ new Date("2026-01-11T09:05:00Z") },
    { providerId: prov1.id, participantId: p1.id, categoryCode: "01", itemNumber: "01_015_0107_1_1", occurrences: 8, lastSeenAt: /* @__PURE__ */ new Date("2026-01-11T09:05:00Z") },
    { providerId: prov1.id, participantId: null, categoryCode: "01", itemNumber: "01_011_0107_1_1", occurrences: 45, lastSeenAt: /* @__PURE__ */ new Date("2026-01-11T09:05:00Z") },
    { providerId: prov2.id, participantId: p2.id, categoryCode: "15", itemNumber: "15_056_0128_1_3", occurrences: 15, lastSeenAt: /* @__PURE__ */ new Date("2026-02-05T10:10:00Z") },
    { providerId: prov2.id, participantId: p2.id, categoryCode: "15", itemNumber: "15_037_0128_1_3", occurrences: 10, lastSeenAt: /* @__PURE__ */ new Date("2026-01-15T14:10:00Z") },
    { providerId: prov5.id, participantId: p3.id, categoryCode: "11", itemNumber: "11_022_0115_1_1", occurrences: 24, lastSeenAt: /* @__PURE__ */ new Date("2026-02-01T08:10:00Z") },
    { providerId: prov6.id, participantId: p6.id, categoryCode: "15", itemNumber: "15_043_0128_1_3", occurrences: 18, lastSeenAt: /* @__PURE__ */ new Date("2026-02-12T15:00:00Z") },
    { providerId: prov6.id, participantId: p8.id, categoryCode: "15", itemNumber: "15_043_0128_1_3", occurrences: 12, lastSeenAt: /* @__PURE__ */ new Date("2026-01-22T10:12:00Z") }
  ];
  for (const pat of patternsData) {
    const existingPat = await prisma.invItemPattern.findFirst({
      where: { providerId: pat.providerId, participantId: pat.participantId ?? null, categoryCode: pat.categoryCode, itemNumber: pat.itemNumber }
    });
    if (!existingPat) {
      await prisma.invItemPattern.create({ data: pat });
    }
  }
  console.log("  \u2713 8 invoice item patterns created");
  console.log("  Creating audit log sample...");
  const auditExists = await prisma.coreAuditLog.findFirst({ where: { action: "invoice.approved", resourceId: inv1.id } });
  if (!auditExists) {
    await prisma.coreAuditLog.create({ data: {
      userId: planManager.id,
      action: "invoice.approved",
      resource: "invoice",
      resourceId: inv1.id,
      before: { status: "PENDING_REVIEW" },
      after: { status: "APPROVED", approvedById: planManager.id },
      ipAddress: "203.0.113.1",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    } });
  }
  console.log("  \u2713 1 audit log entry created");
  console.log("");
  console.log("\u2705 Seed complete!");
  console.log("   6 users | 10 providers | 15 participants | 15 plans");
  console.log("   15 invoices | 8 claims | 8 payments | 5 service agreements");
  console.log("   4 fund quarantines | 8 documents | 15 notifications | 20 comm logs");
  console.log("   10 correspondence | 6 flags | 3 coordinator assignments");
  console.log("   2 fee schedules | 4 participant statements | 7 email templates");
  console.log("   4 automation rules | 8 item patterns | 1 NDIS price guide (15 items)");
}
main().catch((e) => {
  console.error("\u274C Seed failed:", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
