/**
 * AI Invoice Processor — Bedrock Claude Integration
 *
 * Uses AWS Bedrock Claude Haiku (AU inference profile) for NDIS invoice
 * line-item code suggestion and structured data extraction.
 *
 * Model: au.anthropic.claude-haiku-4-5-20251001-v1:0 (ap-southeast-2)
 * REQ-011: Data never leaves Australia — AU-only inference profile.
 *
 * Exports:
 *   processWithAI(input) — main entry point, returns structured result or null on failure
 *   _setBedrockClientForTest() / _resetBedrockClient() — test helpers
 *   _testExports — internal functions exposed for unit testing
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ToolConfiguration,
  type ToolSpecification,
  type Message,
} from '@aws-sdk/client-bedrock-runtime'
import { prisma } from '@/lib/db'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIProcessingInput {
  extractedText: string
  invoiceId: string
  providerName: string | null
  providerAbn: string | null
  providerType: string | null
  participantName: string | null
  participantNdisNumber: string | null
  participantPlanCategories: string[]
  historicalPatterns: Array<{
    categoryCode: string
    itemNumber: string
    occurrences: number
  }>
}

export interface AILineItem {
  description: string
  suggestedNdisCode: string | null
  codeConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  codeReasoning: string
  serviceDate: string | null
  quantity: number
  unitPriceCents: number
  totalCents: number
  claimType: 'STANDARD' | 'TRAVEL' | 'NF2F' | 'CANCELLATION'
  dayType: 'WEEKDAY' | 'SATURDAY' | 'SUNDAY' | 'PUBLIC_HOLIDAY' | null
  gstApplicable: boolean
}

export interface AIProcessingResult {
  invoiceNumber: string | null
  invoiceDate: string | null
  providerAbn: string | null
  providerName: string | null
  participantNdisNumber: string | null
  participantName: string | null
  totalCents: number | null
  gstCents: number | null
  lineItems: AILineItem[]
  overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW'
  flags: string[]
}

// ── Bedrock Client ────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = 'au.anthropic.claude-haiku-4-5-20251001-v1:0'
const DEFAULT_REGION = 'ap-southeast-2'

let bedrockClient: BedrockRuntimeClient | null = null

function getBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) return bedrockClient
  bedrockClient = new BedrockRuntimeClient({
    region: process.env['AWS_REGION'] ?? DEFAULT_REGION,
  })
  return bedrockClient
}

/** Test helper: inject a mock Bedrock client */
export function _setBedrockClientForTest(client: BedrockRuntimeClient): void {
  bedrockClient = client
}

/** Test helper: reset to default Bedrock client */
export function _resetBedrockClient(): void {
  bedrockClient = null
}

// ── Tool Definition (strict structured output) ────────────────────────────────

const EXTRACT_TOOL: ToolSpecification = {
  name: 'extract_invoice_data',
  description: 'Extract structured data from an NDIS invoice including line items with suggested support codes.',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        invoiceNumber: { type: ['string', 'null'], description: 'Invoice number or reference' },
        invoiceDate: { type: ['string', 'null'], description: 'Invoice date in YYYY-MM-DD format' },
        providerAbn: { type: ['string', 'null'], description: 'Provider ABN (11 digits, no spaces)' },
        providerName: { type: ['string', 'null'], description: 'Provider business name' },
        participantNdisNumber: { type: ['string', 'null'], description: 'Participant NDIS number' },
        participantName: { type: ['string', 'null'], description: 'Participant full name' },
        totalCents: { type: ['integer', 'null'], description: 'Total amount in cents (e.g. 15000 = $150.00)' },
        gstCents: { type: ['integer', 'null'], description: 'GST amount in cents' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Service description from the invoice' },
              suggestedNdisCode: { type: ['string', 'null'], description: 'Suggested NDIS support item code (e.g. 15_042_0128_1_3)' },
              codeConfidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'], description: 'Confidence in the suggested code' },
              codeReasoning: { type: 'string', description: 'Reasoning for the code suggestion' },
              serviceDate: { type: ['string', 'null'], description: 'Service date in YYYY-MM-DD format' },
              quantity: { type: 'number', description: 'Quantity of service units' },
              unitPriceCents: { type: 'integer', description: 'Unit price in cents' },
              totalCents: { type: 'integer', description: 'Line total in cents' },
              claimType: { type: 'string', enum: ['STANDARD', 'TRAVEL', 'NF2F', 'CANCELLATION'], description: 'Claim type' },
              dayType: { type: ['string', 'null'], enum: ['WEEKDAY', 'SATURDAY', 'SUNDAY', 'PUBLIC_HOLIDAY', null], description: 'Day type for rate determination' },
              gstApplicable: { type: 'boolean', description: 'Whether GST applies to this line' },
            },
            required: ['description', 'suggestedNdisCode', 'codeConfidence', 'codeReasoning', 'serviceDate', 'quantity', 'unitPriceCents', 'totalCents', 'claimType', 'dayType', 'gstApplicable'],
          },
        },
        overallConfidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Overall confidence in the extraction' },
        flags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any warnings or flags about this invoice',
        },
      },
      required: ['invoiceNumber', 'invoiceDate', 'providerAbn', 'providerName', 'participantNdisNumber', 'participantName', 'totalCents', 'gstCents', 'lineItems', 'overallConfidence', 'flags'],
    },
  },
}

const TOOL_CONFIG: ToolConfiguration = {
  tools: [{ toolSpec: EXTRACT_TOOL }],
  toolChoice: { tool: { name: 'extract_invoice_data' } },
}

// ── NDIS Catalogue Loading (with in-memory TTL cache) ────────────────────────

interface CatalogueItem {
  itemNumber: string
  name: string
  categoryCode: string
  categoryName: string
  unitType: string
  priceStandardCents: number | null
  gstCode: string | null
}

interface CatalogueCache {
  items: CatalogueItem[]
  catalogueText: string
  cachedAt: number
}

/** Cache TTL: 30 minutes. Price guide changes are rare (quarterly). */
const CATALOGUE_CACHE_TTL_MS = 30 * 60 * 1000
let catalogueCache: CatalogueCache | null = null

/** Test helper: clear the catalogue cache */
export function _clearCatalogueCache(): void {
  catalogueCache = null
}

/**
 * Load the active NDIS support catalogue from the database.
 * Active version is determined by effectiveFrom/effectiveTo date range (no isActive field).
 * Returns a compact text representation for the AI system prompt.
 *
 * Results are cached in-memory for 30 minutes to avoid redundant DB queries
 * when processing multiple invoices in quick succession.
 */
async function loadNdisCatalogue(): Promise<{ items: CatalogueItem[]; catalogueText: string }> {
  // Return cached result if still fresh
  if (catalogueCache && Date.now() - catalogueCache.cachedAt < CATALOGUE_CACHE_TTL_MS) {
    return { items: catalogueCache.items, catalogueText: catalogueCache.catalogueText }
  }

  const now = new Date()

  const activeVersion = await prisma.ndisPriceGuideVersion.findFirst({
    where: {
      effectiveFrom: { lte: now },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: now } },
      ],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true, label: true },
  })

  if (!activeVersion) {
    return { items: [], catalogueText: 'No active NDIS Price Guide available.' }
  }

  const supportItems = await prisma.ndisSupportItem.findMany({
    where: { versionId: activeVersion.id },
    select: {
      itemNumber: true,
      name: true,
      categoryCode: true,
      categoryName: true,
      unitType: true,
      priceStandardCents: true,
      gstCode: true,
    },
    orderBy: [{ categoryCode: 'asc' }, { itemNumber: 'asc' }],
  })

  const items: CatalogueItem[] = supportItems.map((si) => ({
    itemNumber: si.itemNumber,
    name: si.name,
    categoryCode: si.categoryCode,
    categoryName: si.categoryName,
    unitType: si.unitType,
    priceStandardCents: si.priceStandardCents,
    gstCode: si.gstCode,
  }))

  // Build compact text format for the system prompt
  const lines = items.map((i) => {
    const price = i.priceStandardCents !== null ? `$${(i.priceStandardCents / 100).toFixed(2)}` : 'Quote'
    return `${i.itemNumber} | ${i.name} | ${i.categoryCode} ${i.categoryName} | ${i.unitType} | ${price}`
  })

  const catalogueText = `NDIS Support Catalogue (${activeVersion.label}, ${items.length} items):\nCode | Description | Category | Unit | Price Cap\n${lines.join('\n')}`

  // Cache the result
  catalogueCache = { items, catalogueText, cachedAt: Date.now() }

  return { items, catalogueText }
}

// ── Prompt Building ───────────────────────────────────────────────────────────

function buildSystemPrompt(catalogueText: string): string {
  return `You are an NDIS invoice processing specialist for an Australian plan management company.

Your task: Given extracted text from an NDIS provider invoice, extract all structured fields and suggest the correct NDIS support item code for each line item.

${catalogueText}

Rules:
- Match codes based on: service description, provider type, day of week, claim type
- Weekday = Mon-Fri, Saturday, Sunday, Public Holiday each have different codes
- Allied health: separate face-to-face, travel (50% of rate), non-face-to-face
- Support workers: rate varies by day/time -- use correct code
- Most NDIS services are GST-free (GST code "P1" means exempt; "P2" means taxable)
- If unsure about a code, set confidence to LOW or NONE
- All monetary amounts must be in cents (e.g. $150.00 = 15000)
- Dates must be in YYYY-MM-DD format
- ABNs should be 11 digits with no spaces

Output: Use the extract_invoice_data tool with the required schema.`
}

function buildUserPrompt(input: AIProcessingInput): string {
  const providerContext = input.providerName
    ? `Provider: ${input.providerName}${input.providerAbn ? ` (ABN: ${input.providerAbn})` : ''}${input.providerType ? `, Type: ${input.providerType}` : ''}`
    : 'Provider: Unknown'

  const participantContext = input.participantName
    ? `Participant: ${input.participantName}${input.participantNdisNumber ? ` (NDIS#: ${input.participantNdisNumber})` : ''}`
    : 'Participant: Unknown'

  const planCategories = input.participantPlanCategories.length > 0
    ? `Funded categories: ${input.participantPlanCategories.join(', ')}`
    : 'Funded categories: Unknown'

  let patternsContext = ''
  if (input.historicalPatterns.length > 0) {
    const patternLines = input.historicalPatterns.map(
      (p) => `  ${p.categoryCode} -> ${p.itemNumber} (${p.occurrences} times)`
    )
    patternsContext = `\nHistorical code patterns for this provider:\n${patternLines.join('\n')}`
  }

  return `Extract all data from this NDIS invoice.

${providerContext}
${participantContext}
${planCategories}${patternsContext}

Invoice text:
---
${input.extractedText}
---`
}

// ── Response Parsing ──────────────────────────────────────────────────────────

function parseToolUseResponse(content: ContentBlock[]): AIProcessingResult | null {
  for (const block of content) {
    if ('toolUse' in block && block.toolUse?.name === 'extract_invoice_data') {
      const input = block.toolUse.input as Record<string, unknown>
      return validateAndCoerceResult(input)
    }
  }
  return null
}

function validateAndCoerceResult(raw: Record<string, unknown>): AIProcessingResult | null {
  try {
    const lineItems = Array.isArray(raw['lineItems'])
      ? (raw['lineItems'] as Record<string, unknown>[]).map(coerceLineItem)
      : []

    const confidence = raw['overallConfidence']
    const validConfidence = confidence === 'HIGH' || confidence === 'MEDIUM' || confidence === 'LOW'
      ? confidence as 'HIGH' | 'MEDIUM' | 'LOW'
      : 'LOW'

    const flags = Array.isArray(raw['flags'])
      ? (raw['flags'] as unknown[]).filter((f): f is string => typeof f === 'string')
      : []

    return {
      invoiceNumber: typeof raw['invoiceNumber'] === 'string' ? raw['invoiceNumber'] : null,
      invoiceDate: typeof raw['invoiceDate'] === 'string' ? raw['invoiceDate'] : null,
      providerAbn: typeof raw['providerAbn'] === 'string' ? raw['providerAbn'] : null,
      providerName: typeof raw['providerName'] === 'string' ? raw['providerName'] : null,
      participantNdisNumber: typeof raw['participantNdisNumber'] === 'string' ? raw['participantNdisNumber'] : null,
      participantName: typeof raw['participantName'] === 'string' ? raw['participantName'] : null,
      totalCents: typeof raw['totalCents'] === 'number' ? Math.round(raw['totalCents']) : null,
      gstCents: typeof raw['gstCents'] === 'number' ? Math.round(raw['gstCents']) : null,
      lineItems,
      overallConfidence: validConfidence,
      flags,
    }
  } catch {
    return null
  }
}

function coerceLineItem(raw: Record<string, unknown>): AILineItem {
  const validConfidence = ['HIGH', 'MEDIUM', 'LOW', 'NONE']
  const validClaimType = ['STANDARD', 'TRAVEL', 'NF2F', 'CANCELLATION']
  const validDayType = ['WEEKDAY', 'SATURDAY', 'SUNDAY', 'PUBLIC_HOLIDAY']

  const conf = typeof raw['codeConfidence'] === 'string' && validConfidence.includes(raw['codeConfidence'])
    ? raw['codeConfidence'] as AILineItem['codeConfidence']
    : 'NONE'

  const claimType = typeof raw['claimType'] === 'string' && validClaimType.includes(raw['claimType'])
    ? raw['claimType'] as AILineItem['claimType']
    : 'STANDARD'

  const dayType = typeof raw['dayType'] === 'string' && validDayType.includes(raw['dayType'])
    ? raw['dayType'] as AILineItem['dayType']
    : null

  return {
    description: typeof raw['description'] === 'string' ? raw['description'] : 'Unknown',
    suggestedNdisCode: typeof raw['suggestedNdisCode'] === 'string' ? raw['suggestedNdisCode'] : null,
    codeConfidence: conf,
    codeReasoning: typeof raw['codeReasoning'] === 'string' ? raw['codeReasoning'] : '',
    serviceDate: typeof raw['serviceDate'] === 'string' ? raw['serviceDate'] : null,
    quantity: typeof raw['quantity'] === 'number' ? raw['quantity'] : 1,
    unitPriceCents: typeof raw['unitPriceCents'] === 'number' ? Math.round(raw['unitPriceCents']) : 0,
    totalCents: typeof raw['totalCents'] === 'number' ? Math.round(raw['totalCents']) : 0,
    claimType,
    dayType,
    gstApplicable: typeof raw['gstApplicable'] === 'boolean' ? raw['gstApplicable'] : false,
  }
}

// ── Main Export ───────────────────────────────────────────────────────────────

/**
 * Process an invoice with AWS Bedrock Claude.
 * Returns structured AI processing result, or null on any failure.
 * Never throws — all failures are gracefully handled.
 */
export async function processWithAI(input: AIProcessingInput): Promise<AIProcessingResult | null> {
  try {
    const { catalogueText } = await loadNdisCatalogue()
    const systemPrompt = buildSystemPrompt(catalogueText)
    const userPrompt = buildUserPrompt(input)

    const client = getBedrockClient()
    const modelId = process.env['BEDROCK_MODEL_ID'] ?? DEFAULT_MODEL_ID

    const messages: Message[] = [
      {
        role: 'user',
        content: [{ text: userPrompt }],
      },
    ]

    const command = new ConverseCommand({
      modelId,
      system: [
        { text: systemPrompt },
        // Bedrock prompt caching: cache the system prompt (NDIS catalogue)
        // to reduce latency and cost by ~90% on subsequent calls within 5 min
        { cachePoint: { type: 'default' } },
      ],
      messages,
      toolConfig: TOOL_CONFIG,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0,
      },
    })

    const response = await client.send(command)

    if (!response.output?.message?.content) {
      return null
    }

    return parseToolUseResponse(response.output.message.content)
  } catch (err) {
    // Graceful degradation — return null on any Bedrock failure
    // Caller (processing-engine) will fall back to NEEDS_REVIEW
    console.error('[ai-processor] Bedrock call failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ── Test Exports ──────────────────────────────────────────────────────────────

export const _testExports = {
  buildSystemPrompt,
  buildUserPrompt,
  parseToolUseResponse,
  validateAndCoerceResult,
  coerceLineItem,
  loadNdisCatalogue,
  EXTRACT_TOOL,
  TOOL_CONFIG,
}
