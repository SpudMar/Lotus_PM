'use client'

/**
 * PdfViewer — renders a PDF in an iframe using a presigned S3 URL.
 *
 * Four modes:
 *   1. invoiceId provided → fetches presigned URL from GET /api/invoices/[id]/pdf
 *   2. s3Key + s3Bucket provided (upload page, pre-save) → fetches from
 *      GET /api/invoices/extract-pdf/preview-url?s3Key=...&s3Bucket=...
 *   3. documentId provided → fetches presigned URL from GET /api/documents/[id]/preview
 *   4. pdfUrl provided → renders directly (for public pages with pre-fetched URLs)
 *
 * Shows a skeleton while loading, "No PDF attached" if no key is present.
 */

import { useEffect, useState } from 'react'
import { FileWarning, Loader2 } from 'lucide-react'

export interface PdfViewerProps {
  /** Invoice ID — used to fetch presigned URL from /api/invoices/[id]/pdf */
  invoiceId?: string | null
  /** Document ID — used to fetch presigned URL from /api/documents/[id]/preview */
  documentId?: string | null
  /** S3 key — used for preview before the invoice is saved (upload page) */
  s3Key?: string | null
  /** S3 bucket — required when s3Key is provided */
  s3Bucket?: string | null
  /** Direct presigned URL — renders immediately without fetching (for public pages) */
  pdfUrl?: string | null
  /** Height of the iframe. Defaults to 700px. */
  height?: string | number
  /** Optional CSS class names for the outer wrapper */
  className?: string
  /** Optional title for the iframe. Defaults to "Document PDF preview". */
  title?: string
}

type FetchState = 'idle' | 'loading' | 'ready' | 'error' | 'no-document'

export function PdfViewer({
  invoiceId,
  documentId,
  s3Key,
  s3Bucket,
  pdfUrl,
  height = 700,
  className = '',
  title = 'Document PDF preview',
}: PdfViewerProps): React.JSX.Element {
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null)
  const [state, setState] = useState<FetchState>('idle')

  useEffect(() => {
    let cancelled = false

    async function loadPdf(): Promise<void> {
      // Reset when props change
      setPresignedUrl(null)

      // Mode 0: direct URL provided
      if (pdfUrl) {
        setPresignedUrl(pdfUrl)
        setState('ready')
        return
      }

      // Mode 1: fetch by invoice ID
      if (invoiceId) {
        setState('loading')
        try {
          const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
          if (cancelled) return
          if (res.status === 404) {
            setState('no-document')
            return
          }
          if (!res.ok) {
            setState('error')
            return
          }
          const json = (await res.json()) as { data: { url: string } }
          if (!cancelled) {
            setPresignedUrl(json.data.url)
            setState('ready')
          }
        } catch {
          if (!cancelled) setState('error')
        }
        return
      }

      // Mode 2: fetch by document ID
      if (documentId) {
        setState('loading')
        try {
          const res = await fetch(`/api/documents/${documentId}/preview`)
          if (cancelled) return
          if (res.status === 404) {
            setState('no-document')
            return
          }
          if (!res.ok) {
            setState('error')
            return
          }
          const json = (await res.json()) as { data: { url: string } }
          if (!cancelled) {
            setPresignedUrl(json.data.url)
            setState('ready')
          }
        } catch {
          if (!cancelled) setState('error')
        }
        return
      }

      // Mode 3: fetch by s3Key + s3Bucket (upload page, before save)
      if (s3Key && s3Bucket) {
        setState('loading')
        try {
          const params = new URLSearchParams({ s3Key, s3Bucket })
          const res = await fetch(`/api/invoices/extract-pdf/preview-url?${params.toString()}`)
          if (cancelled) return
          if (!res.ok) {
            setState('error')
            return
          }
          const json = (await res.json()) as { data: { url: string } }
          if (!cancelled) {
            setPresignedUrl(json.data.url)
            setState('ready')
          }
        } catch {
          if (!cancelled) setState('error')
        }
        return
      }

      // No source provided
      setState('no-document')
    }

    void loadPdf()
    return () => { cancelled = true }
  }, [invoiceId, documentId, s3Key, s3Bucket, pdfUrl])

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
          title={title}
          className="h-full w-full flex-1"
          aria-label={title}
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
