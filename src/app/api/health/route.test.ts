import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.service).toBe('lotus-pm')
    expect(data.timestamp).toBeDefined()
  })
})
