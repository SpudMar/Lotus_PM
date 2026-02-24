/**
 * Tests for ABN lookup service.
 * Mocks fetch — no real ABR calls.
 */

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

// ── Import after mock setup ───────────────────────────────────────────────────

import { lookupAbn } from '@/lib/modules/crm/abn-lookup'

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ABR_RESPONSE = `callback({
  "Abn": "51824753556",
  "AbnStatus": "Active",
  "EntityName": "SUNRISE SUPPORT SERVICES PTY LTD",
  "EntityType": {
    "EntityTypeCode": "PRV",
    "EntityTypeDescription": "Australian Private Company"
  },
  "Gst": "2010-07-01",
  "MainBusinessPhysicalAddress": {
    "StateCode": "NSW",
    "Postcode": "2000"
  }
})`

function mockFetchOk(body: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    text: () => Promise.resolve(body),
  })
}

function mockFetchError(): void {
  mockFetch.mockRejectedValueOnce(new Error('Network error'))
}

function mockFetchNotOk(): void {
  mockFetch.mockResolvedValueOnce({ ok: false })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('lookupAbn', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('returns null when ABR_GUID is not set', async () => {
    delete process.env['ABR_GUID']
    const result = await lookupAbn('51 824 753 556')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('parses a valid JSONP response correctly', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk(VALID_ABR_RESPONSE)

    const result = await lookupAbn('51 824 753 556')

    expect(result).not.toBeNull()
    expect(result?.abn).toBe('51824753556')
    expect(result?.abnStatus).toBe('Active')
    expect(result?.entityName).toBe('SUNRISE SUPPORT SERVICES PTY LTD')
    expect(result?.entityType).toBe('Australian Private Company')
    expect(result?.gstRegistered).toBe(true)
    expect(result?.postcode).toBe('2000')
    expect(result?.state).toBe('NSW')
  })

  test('strips spaces from ABN before sending to ABR', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk(VALID_ABR_RESPONSE)

    await lookupAbn('51 824 753 556')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('abn=51824753556'),
      expect.any(Object)
    )
  })

  test('returns null on fetch error (network down)', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchError()

    const result = await lookupAbn('51824753556')
    expect(result).toBeNull()
  })

  test('returns null when fetch response is not ok', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchNotOk()

    const result = await lookupAbn('51824753556')
    expect(result).toBeNull()
  })

  test('returns null when ABR response has no Abn field', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk('callback({"AbnStatus": "Not found", "Message": "No record found"})')

    const result = await lookupAbn('00000000000')
    expect(result).toBeNull()
  })

  test('returns null when JSONP wrapper is missing', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk('{"Abn": "51824753556"}') // plain JSON, not JSONP

    const result = await lookupAbn('51824753556')
    expect(result).toBeNull()
  })

  test('marks gstRegistered false when Gst date is 0001-01-01', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk(`callback({
      "Abn": "51824753556",
      "AbnStatus": "Active",
      "EntityName": "SOME SOLE TRADER",
      "EntityType": {"EntityTypeCode": "IND", "EntityTypeDescription": "Individual/Sole Trader"},
      "Gst": "0001-01-01",
      "MainBusinessPhysicalAddress": {"StateCode": "VIC", "Postcode": "3000"}
    })`)

    const result = await lookupAbn('51824753556')
    expect(result?.gstRegistered).toBe(false)
  })

  test('marks gstRegistered false when Gst field is empty string', async () => {
    process.env['ABR_GUID'] = 'test-guid-123'
    mockFetchOk(`callback({
      "Abn": "51824753556",
      "AbnStatus": "Active",
      "EntityName": "SOME SOLE TRADER",
      "EntityType": {"EntityTypeCode": "IND", "EntityTypeDescription": "Individual/Sole Trader"},
      "Gst": "",
      "MainBusinessPhysicalAddress": {"StateCode": "VIC", "Postcode": "3000"}
    })`)

    const result = await lookupAbn('51824753556')
    expect(result?.gstRegistered).toBe(false)
  })

  test('uses GUID from environment variable in URL', async () => {
    process.env['ABR_GUID'] = 'my-real-guid'
    mockFetchOk(VALID_ABR_RESPONSE)

    await lookupAbn('51824753556')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('guid=my-real-guid'),
      expect.any(Object)
    )
  })
})
