/**
 * NDIS utilities for Lotus PM.
 * NDIS Price Guide 2025-26, PACE support categories.
 * REQ-014: NDIS Price Guide 2025-26 compliance.
 */

/** All 15 PACE support categories with their codes and names */
export const SUPPORT_CATEGORIES = [
  { code: '01', name: 'Daily Activities', shortName: 'Daily Activities' },
  { code: '02', name: 'Transport', shortName: 'Transport' },
  { code: '03', name: 'Consumables', shortName: 'Consumables' },
  { code: '04', name: 'Assistance with Social, Economic and Community Participation', shortName: 'Social & Community' },
  { code: '05', name: 'Assistive Technology', shortName: 'Assistive Technology' },
  { code: '06', name: 'Home Modifications', shortName: 'Home Mods' },
  { code: '07', name: 'Support Coordination', shortName: 'Support Coordination' },
  { code: '08', name: 'Improved Living Arrangements', shortName: 'Living Arrangements' },
  { code: '09', name: 'Increased Social and Community Participation', shortName: 'Community Participation' },
  { code: '10', name: 'Finding and Keeping a Job', shortName: 'Employment' },
  { code: '11', name: 'Improved Health and Wellbeing', shortName: 'Health & Wellbeing' },
  { code: '12', name: 'Improved Learning', shortName: 'Learning' },
  { code: '13', name: 'Improved Life Choices', shortName: 'Life Choices' },
  { code: '14', name: 'Improved Daily Living', shortName: 'Daily Living' },
  { code: '15', name: 'Improved Relationships', shortName: 'Relationships' },
] as const

export type SupportCategoryCode = typeof SUPPORT_CATEGORIES[number]['code']

/** Validate NDIS participant number format (9 digits) */
export function isValidNdisNumber(ndisNumber: string): boolean {
  return /^\d{9}$/.test(ndisNumber.replace(/\s/g, ''))
}

/** Format NDIS number for display: 430 123 456 */
export function formatNdisNumber(ndisNumber: string): string {
  const clean = ndisNumber.replace(/\s/g, '')
  if (clean.length !== 9) return ndisNumber
  return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`
}

/** Validate Australian Business Number (ABN) using official checksum */
export function isValidABN(abn: string): boolean {
  const clean = abn.replace(/\s/g, '')
  if (!/^\d{11}$/.test(clean)) return false
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const digits = clean.split('').map(Number)
  digits[0] = (digits[0] ?? 0) - 1
  const sum = digits.reduce((acc, digit, i) => acc + (digit * (weights[i] ?? 0)), 0)
  return sum % 89 === 0
}

/** Format ABN for display: 12 345 678 901 */
export function formatABN(abn: string): string {
  const clean = abn.replace(/\s/g, '')
  if (clean.length !== 11) return abn
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8)}`
}

/** NDIS support category by code */
export function getSupportCategory(code: string) {
  return SUPPORT_CATEGORIES.find(c => c.code === code)
}
