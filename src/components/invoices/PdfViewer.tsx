'use client'

/**
 * PdfViewer — renders an invoice PDF in an iframe using a presigned S3 URL.
 *
 * Two modes:
 *   1. invoiceId provided → fetches presigned URL from GET /api/invoices/[id]/pdf
 *   2. s3Key + s3Bucket provided (upload page, pre-save) → fetches from
 *      GET /api/invoices/extract-pdf/preview-url?s3Key=...&s3Bucket=...
 *
 * Shows a skeleton while loading, "No PDF attached" if no key is present.
 */

import { useEffect, useState } from 'react'
import { FileWarning, Loader2 } from 'lucide-react'

export interface PdfViewerProps {
  /** Invoice ID — used to fetch presigned URL from /api/invoices/[id]/pdf */
  invoiceId?: string | null
  /** S3 key — used for preview before the invoice is saved (upload page) */
  s3Key?: string | null
  /** S3 bucket — required when s3Key is provided */
  s3Bucket?: string | null
  /** Height of the iframe. Defaults to 700px. */
  height?: string | number
  /** Optional CSS class names for the outer wrapper */
  className?: string
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error' | 'no-document'

export function PdfViewer({
  invoiceId,
  s3Key,
  s3Bucket,
  height = 700,
  className = '',
}: PdfViewerProps): React.JSX.Element {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null)
  const [state, setState] = useState<FetchState>('idle')

  useEffect(() => {
    // Reset when props change
    setPresignedUrl(null)
    setState('idle')

    // Mode 1: fetch by invoice ID
    if (invoiceId) {
      setState('loading')
      fetch(`/api/invoices/${invoiceId}/pdf`)
        .then(async (res) => {
          if (res.status === 404) {
            setState('no-document')
            return
          }
          if (!res.ok) {
            setState('error')
            return
          }
          const json = (await res.json()) as { data: { url: string } }
          setPresignedUrl(json.data.url)
          setState('ready')
        })
        .catch(() => setState('error'))
      return
    }

    // Mode 2: fetch by s3Key + s3Bucket (upload page, before save)
    if (s3Key && s3Bucket) {
      setState('loading')
      const params = new URLSearchParams({ s3Key, s3Bucket })
      fetch(`/api/invoices/extract-pdf/preview-url?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) {
            setState('error')
            return
          }
          const json = (await res.json()) as { data: { url: string } }
          setPresignedUrl(json.data.url)
          setState('ready')
        })
        .catch(() => setState('error'))
      return
    }

    // No source provided
    setState('no-document')
  }, [invoiceId, s3Key, s3Bucket])

  const heightStyle = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`rounded-lg border bg-muted/30 overflow-hidden flex flex-col ${className}`}
      style={{ height: heightStyle }}
    >
      {state === 'loading' && (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading PDF...
        </div>
      )}

      {state === 'ready' && presignedUrl && (
        <iframe
          src={presignedUrl}
          title="Invoice PDF"
          className="h-full w-full flex-1"
          aria-label="Invoice PDF preview"
        />
      )}

      {(state === 'no-document' || state === 'idle') && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <FileWarning className="h-8 w-8 opacity-40" aria-hidden="true" />
          <span>No PDF attached</span>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <FileWarning className="h-8 w-8 opacity-40" aria-hidden="true" />
          <span>Could not load PDF</span>
        </div>
      )}
    </div>
  )
}
