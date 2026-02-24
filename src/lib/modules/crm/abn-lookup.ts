/**
 * ABN lookup via Australian Business Register (ABR) API.
 * Requires ABR_GUID environment variable.
 * Register free at: https://abr.business.gov.au/json/AbnDetails.aspx
 *
 * Returns null gracefully when ABR_GUID is not configured — callers
 * should treat null as "unknown / unenriched" rather than an error.
 */

export interface AbnLookupResult {
  abn: string
  abnStatus: 'Active' | 'Cancelled' | string
  entityName: string
  entityType: string
  gstRegistered: boolean
  postcode?: string
  state?: string
}

/**
 * Look up an ABN against the Australian Business Register.
 * Returns null when:
 *   - ABR_GUID env var is not set
 *   - The ABN is not found
 *   - The ABR API is unavailable or returns a bad response
 */
export async function lookupAbn(abn: string): Promise<AbnLookupResult | null> {
  const guid = process.env['ABR_GUID']
  if (!guid) return null // Graceful — don't crash if env not set

  // Strip spaces/formatting from ABN
  const cleanAbn = abn.replace(/\s/g, '')

  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${cleanAbn}&guid=${guid}`
    const fetchOptions: RequestInit = {
      headers: { Accept: 'application/json' },
    }
    // AbortSignal.timeout is Node 18.9+ / browser native; guard for envs without it
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchOptions.signal = AbortSignal.timeout(5000)
    }
    const res = await fetch(url, fetchOptions)

    if (!res.ok) return null

    // ABR returns JSONP-style: "callback({...})" — need to strip the wrapper
    const text = await res.text()
    // Note: use [\s\S]+ instead of . with /s flag to support ES2017 target
    const jsonMatch = text.match(/callback\(([\s\S]+)\)/)
    if (!jsonMatch?.[1]) return null

    const data = JSON.parse(jsonMatch[1]) as Record<string, unknown>

    if (!data['Abn']) return null

    const gstDate = data['Gst'] as string

    return {
      abn: data['Abn'] as string,
      abnStatus: data['AbnStatus'] as string,
      entityName:
        (data['EntityName'] as string) || (data['BusinessName'] as string) || '',
      entityType:
        (data['EntityType'] as Record<string, string>)?.['EntityTypeDescription'] ?? '',
      gstRegistered: !!gstDate && gstDate !== '0001-01-01',
      postcode: (data['MainBusinessPhysicalAddress'] as Record<string, string>)?.[
        'Postcode'
      ],
      state: (data['MainBusinessPhysicalAddress'] as Record<string, string>)?.[
        'StateCode'
      ],
    }
  } catch {
    return null
  }
}
