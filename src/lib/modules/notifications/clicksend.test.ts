/**
 * Unit tests for the ClickSend SMS client.
 * Tests phone normalisation and API client behaviour using mocked fetch.
 */

import { normalisePhoneAu, sendSmsViaClickSend } from './clicksend'

// ─── normalisePhoneAu ────────────────────────────────────────────────────────

describe('normalisePhoneAu', () => {
  test('passes through valid E.164 numbers unchanged', () => {
    expect(normalisePhoneAu('+61412345678')).toBe('+61412345678')
    expect(normalisePhoneAu('+61298765432')).toBe('+61298765432')
    expect(normalisePhoneAu('+447911123456')).toBe('+447911123456')
  })

  test('converts Australian mobile 04XXXXXXXX to E.164', () => {
    expect(normalisePhoneAu('0412345678')).toBe('+61412345678')
    expect(normalisePhoneAu('0498765432')).toBe('+61498765432')
  })

  test('strips spaces and dashes before normalising', () => {
    expect(normalisePhoneAu('0412 345 678')).toBe('+61412345678')
    expect(normalisePhoneAu('04-12-345-678')).toBe('+61412345678')
    expect(normalisePhoneAu('(04) 1234 5678')).toBe('+61412345678')
  })

  test('converts 614XXXXXXXX (no +) to E.164', () => {
    expect(normalisePhoneAu('61412345678')).toBe('+61412345678')
  })

  test('converts Australian landline 02/03/07/08 XXXXXXXX to E.164', () => {
    expect(normalisePhoneAu('0298765432')).toBe('+61298765432')
    expect(normalisePhoneAu('0312345678')).toBe('+61312345678')
  })

  test('returns stripped number as-is when format is unrecognised', () => {
    // A short or unknown number — returned stripped but not modified
    expect(normalisePhoneAu('12345')).toBe('12345')
  })
})

// ─── sendSmsViaClickSend ─────────────────────────────────────────────────────

describe('sendSmsViaClickSend', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CLICKSEND_USERNAME: 'test@example.com',
      CLICKSEND_API_KEY: 'test-api-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  function buildSuccessResponse(overrides: Partial<{
    status: string
    message_id: string
    error_text: string
  }> = {}) {
    return {
      http_code: 200,
      response_code: 'SUCCESS',
      response_msg: 'Here are your data.',
      data: {
        messages: [
          {
            direction: 'out',
            to: '+61412345678',
            body: 'Test message',
            status: overrides.status ?? 'SUCCESS',
            message_id: overrides.message_id ?? 'msg-abc-123',
            error_text: overrides.error_text,
          },
        ],
      },
    }
  }

  test('returns success result when ClickSend responds with SUCCESS status', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildSuccessResponse({ message_id: 'msg-001' }),
    } as Response)

    const result = await sendSmsViaClickSend({
      to: '+61412345678',
      message: 'Test message',
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBe('msg-001')
    expect(result.errorMessage).toBeUndefined()
    expect(result.clickSendStatus).toBe('SUCCESS')
  })

  test('sends correct request to ClickSend API', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildSuccessResponse(),
    } as Response)
    global.fetch = mockFetch

    await sendSmsViaClickSend({ to: '0412345678', message: 'Hello' })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]

    expect(url).toBe('https://rest.clicksend.com/v3/sms/send')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' })

    // Verify Basic Auth header is present (base64 of username:apikey)
    const expectedToken = Buffer.from('test@example.com:test-api-key').toString('base64')
    expect((opts.headers as Record<string, string>)['Authorization']).toBe(`Basic ${expectedToken}`)

    // Verify body: phone normalised to E.164
    const body = JSON.parse(opts.body as string) as { messages: Array<{ to: string; body: string }> }
    expect(body.messages[0]?.to).toBe('+61412345678')
    expect(body.messages[0]?.body).toBe('Hello')
  })

  test('includes optional from field when provided', async () => {
    const mockFetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildSuccessResponse(),
    } as Response)
    global.fetch = mockFetch

    await sendSmsViaClickSend({ to: '+61412345678', message: 'Hi', from: 'LotusPM' })

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      messages: Array<{ from?: string }>
    }
    expect(body.messages[0]?.from).toBe('LotusPM')
  })

  test('returns failure when ClickSend message status is not SUCCESS', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () =>
        buildSuccessResponse({ status: 'INVALID_RECIPIENT', error_text: 'Invalid number' }),
    } as Response)

    const result = await sendSmsViaClickSend({
      to: '+61412345678',
      message: 'Test',
    })

    expect(result.success).toBe(false)
    expect(result.messageId).toBeUndefined()
    expect(result.errorMessage).toBe('Invalid number')
    expect(result.clickSendStatus).toBe('INVALID_RECIPIENT')
  })

  test('returns failure on HTTP error response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        http_code: 401,
        response_code: 'INVALID_CREDENTIALS',
        response_msg: 'Invalid username or api key.',
        data: null,
      }),
    } as Response)

    const result = await sendSmsViaClickSend({
      to: '+61412345678',
      message: 'Test',
    })

    expect(result.success).toBe(false)
    expect(result.errorMessage).toContain('Invalid username or api key')
  })

  test('returns failure on network error', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await sendSmsViaClickSend({
      to: '+61412345678',
      message: 'Test',
    })

    expect(result.success).toBe(false)
    expect(result.errorMessage).toContain('ECONNREFUSED')
  })

  test('throws when credentials are missing', async () => {
    delete process.env['CLICKSEND_USERNAME']

    await expect(
      sendSmsViaClickSend({ to: '+61412345678', message: 'Test' })
    ).rejects.toThrow('CLICKSEND_USERNAME and CLICKSEND_API_KEY must be set')
  })
})
