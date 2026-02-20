import { NextResponse } from 'next/server'

/**
 * Health check endpoint — Phase 0 smoke test.
 * GET /api/health
 * Returns 200 if the app is running.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'lotus-pm',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'unknown',
    version: process.env.npm_package_version ?? '0.1.0',
  })
}
