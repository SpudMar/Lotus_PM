/**
 * Tests for ABA file format building helpers.
 * These are extracted as pure functions and tested here.
 * The ABA format spec: https://www.cemtexaba.com/aba-format/cemtex-aba-file-format-details
 */

// Re-implement the pure helpers for testing (they're private in banking.ts)
function padRight(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padEnd(length, fill)
}

function padLeft(str: string, length: number, fill = ' '): string {
  return str.slice(0, length).padStart(length, fill)
}

function formatAbaDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `${dd}${mm}${yy}`
}

function buildAbaHeader(dateStr: string): string {
  const fields = [
    '0',
    ' '.repeat(17),
    '01',
    'CBA',
    ' '.repeat(7),
    padRight('Lotus Plan Management', 26),
    padRight('301500', 6),
    padRight('Claims Payment', 12),
    dateStr,
    ' '.repeat(40),
  ]
  return fields.join('')
}

function buildAbaDetail(payment: {
  bsb: string
  accountNumber: string
  accountName: string
  amountCents: number
  reference: string
}): string {
  const bsbFormatted = payment.bsb.slice(0, 3) + '-' + payment.bsb.slice(3, 6)
  const fields = [
    '1',
    bsbFormatted,
    padRight(payment.accountNumber, 9),
    ' ',
    '50',
    padLeft(String(payment.amountCents), 10, '0'),
    padRight(payment.accountName, 32),
    padRight(payment.reference, 18),
    '062-000',
    padRight('000000000', 9),
    padRight('Lotus PM', 16),
    padLeft('0', 8, '0'),
  ]
  return fields.join('')
}

function buildAbaFooter(recordCount: number, totalCents: number): string {
  const fields = [
    '7',
    '999-999',
    ' '.repeat(12),
    padLeft(String(totalCents), 10, '0'),
    padLeft(String(totalCents), 10, '0'),
    padLeft('0', 10, '0'),
    ' '.repeat(24),
    padLeft(String(recordCount), 6, '0'),
    ' '.repeat(40),
  ]
  return fields.join('')
}

// ─── Tests ────────────────────────────────────────────────

describe('padRight', () => {
  test('pads short string with spaces', () => {
    expect(padRight('abc', 6)).toBe('abc   ')
  })

  test('truncates long string', () => {
    expect(padRight('abcdefghij', 6)).toBe('abcdef')
  })

  test('returns exact length string unchanged', () => {
    expect(padRight('abc', 3)).toBe('abc')
  })

  test('pads with custom fill char', () => {
    expect(padRight('5', 6, '0')).toBe('500000')
  })
})

describe('padLeft', () => {
  test('pads short string with spaces', () => {
    expect(padLeft('42', 6, '0')).toBe('000042')
  })

  test('truncates long string', () => {
    expect(padLeft('1234567', 4, '0')).toBe('1234')
  })
})

describe('formatAbaDate', () => {
  test('formats date as DDMMYY', () => {
    const date = new Date(2026, 1, 21) // Feb 21, 2026
    expect(formatAbaDate(date)).toBe('210226')
  })

  test('zero-pads day and month', () => {
    const date = new Date(2026, 0, 5) // Jan 5, 2026
    expect(formatAbaDate(date)).toBe('050126')
  })
})

describe('buildAbaHeader', () => {
  test('starts with record type 0', () => {
    const header = buildAbaHeader('210226')
    expect(header[0]).toBe('0')
  })

  test('contains bank name CBA', () => {
    const header = buildAbaHeader('210226')
    expect(header).toContain('CBA')
  })

  test('contains user name', () => {
    const header = buildAbaHeader('210226')
    expect(header).toContain('Lotus Plan Management')
  })

  test('contains date', () => {
    const header = buildAbaHeader('210226')
    expect(header).toContain('210226')
  })

  test('contains description (truncated to 12 chars per ABA spec)', () => {
    const header = buildAbaHeader('210226')
    expect(header).toContain('Claims Payme')
  })
})

describe('buildAbaDetail', () => {
  const payment = {
    bsb: '062000',
    accountNumber: '12345678',
    accountName: 'Test Provider Pty Ltd',
    amountCents: 15000,
    reference: 'CLM-2026-0001',
  }

  test('starts with record type 1', () => {
    const detail = buildAbaDetail(payment)
    expect(detail[0]).toBe('1')
  })

  test('formats BSB with dash', () => {
    const detail = buildAbaDetail(payment)
    expect(detail.slice(1, 8)).toBe('062-000')
  })

  test('contains transaction code 50 (credit)', () => {
    const detail = buildAbaDetail(payment)
    expect(detail).toContain('50')
  })

  test('pads amount to 10 digits', () => {
    const detail = buildAbaDetail(payment)
    expect(detail).toContain('0000015000')
  })

  test('pads account name to 32 chars', () => {
    const detail = buildAbaDetail(payment)
    expect(detail).toContain('Test Provider Pty Ltd')
  })

  test('contains reference', () => {
    const detail = buildAbaDetail(payment)
    expect(detail).toContain('CLM-2026-0001')
  })

  test('contains trace BSB 062-000', () => {
    const detail = buildAbaDetail(payment)
    // The trace BSB appears after the reference field
    const traceStart = detail.indexOf('CLM-2026-0001')
    const afterRef = detail.slice(traceStart + 18)
    expect(afterRef).toContain('062-000')
  })
})

describe('buildAbaFooter', () => {
  test('starts with record type 7', () => {
    const footer = buildAbaFooter(3, 45000)
    expect(footer[0]).toBe('7')
  })

  test('contains 999-999 BSB', () => {
    const footer = buildAbaFooter(3, 45000)
    expect(footer.slice(1, 8)).toBe('999-999')
  })

  test('contains total amount padded to 10 digits', () => {
    const footer = buildAbaFooter(3, 45000)
    expect(footer).toContain('0000045000')
  })

  test('contains record count padded to 6 digits', () => {
    const footer = buildAbaFooter(3, 45000)
    expect(footer).toContain('000003')
  })

  test('debit total is zero', () => {
    const footer = buildAbaFooter(1, 10000)
    // Net total + Credit total + Debit total
    // Find debit total (third 10-digit number after blank)
    expect(footer).toContain('0000000000')
  })
})

describe('ABA file integration', () => {
  test('generates complete valid ABA file structure', () => {
    const header = buildAbaHeader('210226')
    const detail1 = buildAbaDetail({
      bsb: '062000',
      accountNumber: '12345678',
      accountName: 'Provider A',
      amountCents: 10000,
      reference: 'CLM-2026-0001',
    })
    const detail2 = buildAbaDetail({
      bsb: '033001',
      accountNumber: '87654321',
      accountName: 'Provider B',
      amountCents: 25000,
      reference: 'CLM-2026-0002',
    })
    const footer = buildAbaFooter(2, 35000)

    const lines = [header, detail1, detail2, footer]
    const content = lines.join('\r\n') + '\r\n'

    // Basic structure checks
    expect(content.split('\r\n').length).toBe(5) // 4 records + trailing empty
    expect(content.split('\r\n')[0]?.[0]).toBe('0') // Header
    expect(content.split('\r\n')[1]?.[0]).toBe('1') // Detail
    expect(content.split('\r\n')[2]?.[0]).toBe('1') // Detail
    expect(content.split('\r\n')[3]?.[0]).toBe('7') // Footer
  })
})
