/**
 * Date utilities for Lotus PM.
 * All dates stored as UTC. Displayed in AEST/AEDT (Australia/Sydney).
 */

const AU_TIMEZONE = 'Australia/Sydney'

/** Format a date for Australian display: 15/02/2026 */
export function formatDateAU(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: AU_TIMEZONE,
  }).format(date)
}

/** Format a date with time: 15/02/2026 10:32 AM */
export function formatDateTimeAU(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: AU_TIMEZONE,
  }).format(date)
}

/** Get business days between two dates (Mon-Fri, excl. AU public holidays not yet implemented) */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

/** Returns true if invoice is within the 5 business day NDIS processing requirement */
export function isWithinNdisProcessingWindow(receivedAt: Date): boolean {
  const now = new Date()
  return businessDaysBetween(receivedAt, now) <= 5
}

/** Days until a date (negative = overdue) */
export function daysUntil(date: Date): number {
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
