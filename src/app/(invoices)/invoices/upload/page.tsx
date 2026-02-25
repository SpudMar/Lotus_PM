'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Plus, Trash2, Upload, FileText, CheckCircle, AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { formatAUD, centsToDollars, dollarsToCents } from '@/lib/shared/currency'
import { PdfViewer } from '@/components/invoices/PdfViewer'
import { ParticipantCombobox } from '@/components/comboboxes/ParticipantCombobox'
import { ProviderCombobox } from '@/components/comboboxes/ProviderCombobox'
import { PlanCombobox } from '@/components/comboboxes/PlanCombobox'
import { SupportItemCombobox, type SupportItemResult } from '@/components/comboboxes/SupportItemCombobox'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BudgetLine {
  id: string
  categoryCode: string
  categoryName: string
  allocatedCents: number
  spentCents: number
  remainingCents: number
}

interface FormLine {
  supportItemCode: string
  supportItemName: string
  categoryCode: string
  serviceDate: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  gstCents: number
  budgetLineId: string
}

interface UploadResult {
  uploadUrl: string
  s3Key: string
  s3Bucket: string
  documentId: string
}

interface ApiError {
  error: string
  code: string
  details?: unknown
}

interface ExtractedLineItem {
  supportItemCode: string | null
  supportItemName: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  serviceDate: string | null
}

interface ExtractedInvoiceFields {
  s3Key: string | null
  s3Bucket: string | null
  providerName: string | null
  providerAbn: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  totalAmountCents: number | null
  lineItems: ExtractedLineItem[]
}

// ── Empty line template ────────────────────────────────────────────────────────

function emptyLine(): FormLine {
  return {
    supportItemCode: '',
    supportItemName: '',
    categoryCode: '01',
    serviceDate: new Date().toISOString().split('T')[0] ?? '',
    quantity: 1,
    unitPriceCents: 0,
    totalCents: 0,
    gstCents: 0,
    budgetLineId: '',
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvoiceUploadPage(): React.JSX.Element {
  const router = useRouter()

  // ── Form state ────────────────────────────────────────────────────────────

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0] ?? '')
  const [subtotalStr, setSubtotalStr] = useState('')
  const [gstStr, setGstStr] = useState('0.00')
  const [totalStr, setTotalStr] = useState('')
  const [totalManuallyEdited, setTotalManuallyEdited] = useState(false)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<FormLine[]>([emptyLine()])

  // ── Selectors ──────────────────────────────────────────────────────────────

  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [selectedPlanId, setSelectedPlanId] = useState('')

  // ── Dropdown data (budget lines still loaded traditionally) ────────────────

  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([])

  // ── PDF upload ────────────────────────────────────────────────────────────

  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadedS3Key, setUploadedS3Key] = useState<string | null>(null)
  const [uploadedS3Bucket, setUploadedS3Bucket] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ── PDF extraction state ──────────────────────────────────────────────────

  const [extracting, setExtracting] = useState(false)
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null)
  const [fieldsAutoPopulated, setFieldsAutoPopulated] = useState(false)

  // ── Submission state ──────────────────────────────────────────────────────

  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [apiError, setApiError] = useState<string | null>(null)

  // ── Auto-calculate total ──────────────────────────────────────────────────

  useEffect(() => {
    if (!totalManuallyEdited) {
      const subtotal = parseFloat(subtotalStr) || 0
      const gst = parseFloat(gstStr) || 0
      setTotalStr((subtotal + gst).toFixed(2))
    }
  }, [subtotalStr, gstStr, totalManuallyEdited])

  // ── Data loading (plans and budget lines still traditional) ────────────────

  // Load budget lines filtered by selected plan
  useEffect(() => {
    if (!selectedPlanId) {
      setBudgetLines([])
      return
    }
    void fetch(`/api/plans/${selectedPlanId}/budget-lines`)
      .then((r) => r.json())
      .then((j: { data: BudgetLine[] }) => setBudgetLines(j.data))
      .catch(() => null)
  }, [selectedPlanId])

  // Reset plan when participant changes
  useEffect(() => {
    setSelectedPlanId('')
  }, [selectedParticipantId])

  // ── PDF extraction handler ────────────────────────────────────────────────

  /**
   * Send the PDF to /api/invoices/extract-pdf and auto-populate form fields
   * with the returned data. Non-blocking: failures show a warning but do not
   * prevent the PM from continuing with manual entry.
   */
  const handleExtractPdf = useCallback(async (file: File): Promise<void> => {
    setExtracting(true)
    setExtractionWarning(null)
    setFieldsAutoPopulated(false)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/invoices/extract-pdf', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const err = (await res.json()) as ApiError
        setExtractionWarning(
          err.error || 'Could not extract data from the PDF. Please fill in the fields manually.',
        )
        return
      }

      const json = (await res.json()) as { data: ExtractedInvoiceFields }
      const extracted = json.data

      // Capture S3 location returned by the extraction endpoint
      if (extracted.s3Key && extracted.s3Bucket) {
        setUploadedS3Key(extracted.s3Key)
        setUploadedS3Bucket(extracted.s3Bucket)
      }

      // Auto-populate invoice header fields
      if (extracted.invoiceNumber) {
        setInvoiceNumber(extracted.invoiceNumber)
      }
      if (extracted.invoiceDate) {
        setInvoiceDate(extracted.invoiceDate)
      }
      if (extracted.totalAmountCents != null) {
        const dollars = (extracted.totalAmountCents / 100).toFixed(2)
        setTotalStr(dollars)
        setTotalManuallyEdited(true)
      }

      // Auto-populate line items if AI found any
      if (extracted.lineItems.length > 0) {
        const populatedLines: FormLine[] = extracted.lineItems.map((item) => ({
          supportItemCode: item.supportItemCode ?? '',
          supportItemName: item.supportItemName,
          categoryCode: item.supportItemCode ? item.supportItemCode.slice(0, 2) : '01',
          serviceDate: item.serviceDate ?? new Date().toISOString().split('T')[0] ?? '',
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
          gstCents: 0,
          budgetLineId: '',
        }))
        setLines(populatedLines)
      }

      // Auto-select provider by ABN if present — search via API
      if (extracted.providerAbn) {
        const abn = extracted.providerAbn.replace(/\s/g, '')
        try {
          const provRes = await fetch(`/api/crm/providers/search?q=${encodeURIComponent(abn)}&limit=1`)
          if (provRes.ok) {
            const provJson = (await provRes.json()) as { data: Array<{ id: string; abn: string }> }
            const match = provJson.data.find((p) => p.abn.replace(/\s/g, '') === abn)
            if (match) {
              setSelectedProviderId(match.id)
            }
          }
        } catch {
          // Non-fatal: provider auto-match is best-effort
        }
      }

      setFieldsAutoPopulated(true)
    } catch {
      setExtractionWarning(
        'Could not extract data from the PDF. Please fill in the fields manually.',
      )
    } finally {
      setExtracting(false)
    }
  }, [])

  // ── PDF file selection + extraction trigger ────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('File must be under 20 MB.')
      return
    }

    setPdfFile(file)
    setUploadError(null)
    setUploadedS3Key(null)
    setUploadedS3Bucket(null)
    setFieldsAutoPopulated(false)

    // Trigger extraction immediately on file selection
    void handleExtractPdf(file)
  }, [handleExtractPdf])

  const uploadPdf = useCallback(async (): Promise<{ s3Key: string; s3Bucket: string } | null> => {
    if (!pdfFile) return null
    if (uploadedS3Key && uploadedS3Bucket) {
      return { s3Key: uploadedS3Key, s3Bucket: uploadedS3Bucket }
    }

    setUploadProgress(0)
    setUploadError(null)

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: pdfFile.name,
          mimeType: pdfFile.type,
          sizeBytes: pdfFile.size,
          participantId: selectedParticipantId || undefined,
        }),
      })

      if (!presignRes.ok) {
        const err = (await presignRes.json()) as ApiError
        throw new Error(err.error || 'Failed to get upload URL')
      }

      const { data } = (await presignRes.json()) as { data: UploadResult }
      setUploadProgress(30)

      // Step 2: PUT file to S3 presigned URL
      const putRes = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': pdfFile.type },
        body: pdfFile,
      })

      if (!putRes.ok) {
        throw new Error('Failed to upload file to storage')
      }

      setUploadProgress(100)
      setUploadedS3Key(data.s3Key)
      setUploadedS3Bucket(data.s3Bucket)

      return { s3Key: data.s3Key, s3Bucket: data.s3Bucket }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(message)
      setUploadProgress(null)
      return null
    }
  }, [pdfFile, uploadedS3Key, uploadedS3Bucket, selectedParticipantId])

  // ── Line item helpers ───────────────────────────────────────────────────────

  function updateLine(idx: number, field: keyof FormLine, value: string | number): void {
    setLines((prev) => {
      const updated = [...prev]
      const line = { ...(updated[idx] as FormLine) }
      if (field === 'quantity') {
        line.quantity = typeof value === 'string' ? parseFloat(value) || 0 : value
      } else if (field === 'unitPriceCents') {
        line.unitPriceCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (field === 'totalCents') {
        line.totalCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (field === 'gstCents') {
        line.gstCents = Math.round(typeof value === 'string' ? parseFloat(value) || 0 : value)
      } else if (
        field === 'supportItemCode' ||
        field === 'supportItemName' ||
        field === 'categoryCode' ||
        field === 'serviceDate' ||
        field === 'budgetLineId'
      ) {
        line[field] = String(value)
      }
      // Auto-calculate total from qty x unit price
      if (field === 'quantity' || field === 'unitPriceCents') {
        line.totalCents = Math.round(line.quantity * line.unitPriceCents)
      }
      updated[idx] = line
      return updated
    })
  }

  function handleSupportItemSelect(idx: number, item: SupportItemResult): void {
    setLines((prev) => {
      const updated = [...prev]
      const line = { ...(updated[idx] as FormLine) }
      line.supportItemCode = item.itemNumber
      line.supportItemName = item.name
      line.categoryCode = item.categoryCode.slice(0, 2)
      line.unitPriceCents = item.unitPriceCents
      // Recalculate total
      line.totalCents = Math.round(line.quantity * line.unitPriceCents)
      updated[idx] = line
      return updated
    })
  }

  function addLine(): void {
    setLines((prev) => [...prev, emptyLine()])
  }

  function removeLine(idx: number): void {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Line items total ──────────────────────────────────────────────────────

  const linesTotalCents = useMemo(
    () => lines.reduce((sum, l) => sum + l.totalCents, 0),
    [lines]
  )

  // ── Validation ────────────────────────────────────────────────────────────

  function validateForm(): string[] {
    const errors: string[] = []

    if (!invoiceNumber.trim()) errors.push('Invoice number is required.')
    if (!invoiceDate) errors.push('Invoice date is required.')
    if (!selectedParticipantId) errors.push('Participant is required.')
    if (!selectedProviderId) errors.push('Provider is required.')

    const subtotal = parseFloat(subtotalStr) || 0
    const total = parseFloat(totalStr) || 0

    if (subtotal < 0) errors.push('Subtotal cannot be negative.')
    if (total <= 0) errors.push('Total must be greater than zero.')

    // Validate lines that have any content
    const nonEmptyLines = lines.filter(
      (l) => l.supportItemCode || l.supportItemName || l.unitPriceCents > 0
    )
    for (let i = 0; i < nonEmptyLines.length; i++) {
      const line = nonEmptyLines[i] as FormLine
      if (!line.supportItemCode) errors.push(`Line ${i + 1}: Support item code is required.`)
      if (!line.supportItemName) errors.push(`Line ${i + 1}: Description is required.`)
      if (!line.serviceDate) errors.push(`Line ${i + 1}: Service date is required.`)
      if (line.categoryCode.length !== 2) errors.push(`Line ${i + 1}: Category code must be 2 characters.`)
    }

    return errors
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(status: 'RECEIVED' | 'PENDING_REVIEW'): Promise<void> {
    setFormErrors([])
    setApiError(null)

    const errors = validateForm()
    if (errors.length > 0) {
      setFormErrors(errors)
      return
    }

    setSaving(true)

    try {
      // Upload PDF first if selected
      let s3Data: { s3Key: string; s3Bucket: string } | null = null
      if (pdfFile) {
        s3Data = await uploadPdf()
        if (!s3Data && pdfFile) {
          // Upload failed — uploadError already set
          setSaving(false)
          return
        }
      }

      // Filter out completely empty lines
      const validLines = lines.filter(
        (l) => l.supportItemCode && l.supportItemName
      )

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        participantId: selectedParticipantId,
        providerId: selectedProviderId,
        planId: selectedPlanId || undefined,
        subtotalCents: dollarsToCents(parseFloat(subtotalStr) || 0),
        gstCents: dollarsToCents(parseFloat(gstStr) || 0),
        totalCents: dollarsToCents(parseFloat(totalStr) || 0),
        ingestSource: 'MANUAL' as const,
        status,
        ...(s3Data ? { s3Key: s3Data.s3Key, s3Bucket: s3Data.s3Bucket } : {}),
        ...(validLines.length > 0
          ? {
              lines: validLines.map((l) => ({
                supportItemCode: l.supportItemCode,
                supportItemName: l.supportItemName,
                categoryCode: l.categoryCode,
                serviceDate: l.serviceDate,
                quantity: l.quantity,
                unitPriceCents: l.unitPriceCents,
                totalCents: l.totalCents,
                gstCents: l.gstCents,
                budgetLineId: l.budgetLineId || undefined,
              })),
            }
          : {}),
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = (await res.json()) as ApiError
        setApiError(err.error || 'Failed to create invoice')
        return
      }

      // If notes provided, create a correspondence note linked to the invoice
      const json = (await res.json()) as { data: { id: string } }
      if (notes.trim()) {
        await fetch('/api/crm/correspondence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'NOTE',
            subject: `Manual upload note: ${invoiceNumber}`,
            body: notes.trim(),
            invoiceId: json.data.id,
            participantId: selectedParticipantId || undefined,
            providerId: selectedProviderId || undefined,
          }),
        }).catch(() => {
          // Non-blocking: note creation failure should not block the redirect
        })
      }

      router.push(`/invoices/review/${json.data.id}`)
    } catch {
      setApiError('An unexpected error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="space-y-6">
        <PageHeader
          title="Upload Invoice"
          description="Manually enter an invoice for processing."
          actions={
            <Button variant="outline" asChild>
              <Link href="/invoices">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to Invoices
              </Link>
            </Button>
          }
        />

        {/* ── Validation errors ──────────────────────────────────────────── */}
        {formErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Please fix the following errors</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc list-inside space-y-1">
                {formErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {apiError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{apiError}</AlertDescription>
          </Alert>
        )}

        {fieldsAutoPopulated && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
            <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <AlertTitle className="text-emerald-800">Fields auto-populated from PDF</AlertTitle>
            <AlertDescription className="text-emerald-700">
              Invoice fields have been extracted from your PDF. Please review all values before saving.
            </AlertDescription>
          </Alert>
        )}

        {extractionWarning && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <AlertTitle className="text-amber-800">PDF extraction incomplete</AlertTitle>
            <AlertDescription className="text-amber-700">{extractionWarning}</AlertDescription>
          </Alert>
        )}

        <div className={`grid grid-cols-1 gap-6 ${uploadedS3Key && uploadedS3Bucket ? 'lg:grid-cols-2' : ''}`}>
          {/* ── Left column: PDF viewer (shown after extraction) ────────── */}
          {uploadedS3Key && uploadedS3Bucket && (
            <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Invoice Document
              </h2>
              <PdfViewer
                s3Key={uploadedS3Key}
                s3Bucket={uploadedS3Bucket}
                height="80vh"
              />
            </div>
          )}

          {/* ── Form column ──────────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* PDF attach + extract — shown at top to trigger auto-populate */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Attach Invoice PDF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Attach the invoice PDF and fields will be automatically extracted using AI.
                  You can still edit any field before saving.
                </p>
                <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center">
                  {pdfFile ? (
                    <>
                      <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(pdfFile.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      {extracting && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Extracting invoice details...
                        </div>
                      )}
                      {!extracting && fieldsAutoPopulated && (
                        <div className="flex items-center gap-1 text-sm text-emerald-600">
                          <CheckCircle className="h-4 w-4" aria-hidden="true" />
                          Extraction complete
                        </div>
                      )}
                      {!extracting && extractionWarning && (
                        <div className="flex items-center gap-1 text-sm text-amber-600">
                          <AlertCircle className="h-4 w-4" aria-hidden="true" />
                          Extraction failed — enter fields manually
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPdfFile(null)
                          setUploadedS3Key(null)
                          setUploadedS3Bucket(null)
                          setUploadProgress(null)
                          setUploadError(null)
                          setFieldsAutoPopulated(false)
                          setExtractionWarning(null)
                        }}
                      >
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Select a PDF to extract invoice data
                        </p>
                        <p className="text-xs text-muted-foreground">Max 20 MB</p>
                      </div>
                    </>
                  )}
                  <Input
                    id="pdf-file-extract"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                    disabled={extracting}
                    aria-label="Attach invoice PDF for extraction"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Invoice details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Invoice Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="inv-number">
                      Invoice number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="inv-number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-2026-001"
                      aria-required="true"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="inv-date">
                      Invoice date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="inv-date"
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      aria-required="true"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="inv-subtotal">Subtotal ($)</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="inv-subtotal"
                        type="number"
                        min="0"
                        step="0.01"
                        value={subtotalStr}
                        onChange={(e) => setSubtotalStr(e.target.value)}
                        className="pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="inv-gst">GST ($)</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="inv-gst"
                        type="number"
                        min="0"
                        step="0.01"
                        value={gstStr}
                        onChange={(e) => setGstStr(e.target.value)}
                        className="pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="inv-total">
                      Total ($) <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        id="inv-total"
                        type="number"
                        min="0"
                        step="0.01"
                        value={totalStr}
                        onChange={(e) => {
                          setTotalStr(e.target.value)
                          setTotalManuallyEdited(true)
                        }}
                        className="pl-7"
                        placeholder="0.00"
                        aria-required="true"
                      />
                    </div>
                    {!totalManuallyEdited && (
                      <p className="text-[11px] text-muted-foreground">Auto-calculated from subtotal + GST</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Assignment: Participant, Provider, Plan */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>
                      Participant <span className="text-destructive">*</span>
                    </Label>
                    <ParticipantCombobox
                      value={selectedParticipantId}
                      onValueChange={(id) => {
                        setSelectedParticipantId(id)
                        setSelectedPlanId('')
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>
                      Provider <span className="text-destructive">*</span>
                    </Label>
                    <ProviderCombobox
                      value={selectedProviderId}
                      onValueChange={setSelectedProviderId}
                    />
                  </div>
                </div>

                {selectedParticipantId && (
                  <div className="space-y-1">
                    <Label>Plan</Label>
                    <PlanCombobox
                      value={selectedPlanId}
                      onValueChange={setSelectedPlanId}
                      participantId={selectedParticipantId}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Line items */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Support Items</CardTitle>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                  Add line
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Support code</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        <TableHead className="text-xs">Unit price</TableHead>
                        <TableHead className="text-xs">Total</TableHead>
                        {budgetLines.length > 0 && (
                          <TableHead className="text-xs">Budget line</TableHead>
                        )}
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={budgetLines.length > 0 ? 9 : 8}
                            className="py-4 text-center text-sm text-muted-foreground"
                          >
                            No line items. Click &quot;Add line&quot; to begin.
                          </TableCell>
                        </TableRow>
                      ) : (
                        lines.map((line, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="p-1">
                              <SupportItemCombobox
                                value={line.supportItemCode}
                                onValueChange={(item) => handleSupportItemSelect(idx, item)}
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                value={line.supportItemName}
                                onChange={(e) => updateLine(idx, 'supportItemName', e.target.value)}
                                className="h-7 text-xs w-44"
                                placeholder="Description"
                                aria-label="Support item name"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                value={line.categoryCode}
                                onChange={(e) => updateLine(idx, 'categoryCode', e.target.value)}
                                className="h-7 text-xs font-mono w-14"
                                placeholder="01"
                                maxLength={2}
                                aria-label="Category code"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="date"
                                value={line.serviceDate}
                                onChange={(e) => updateLine(idx, 'serviceDate', e.target.value)}
                                className="h-7 text-xs w-32"
                                aria-label="Service date"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                                className="h-7 text-xs w-16"
                                min="0"
                                step="0.5"
                                aria-label="Quantity"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-1.5 text-[10px] text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  type="number"
                                  value={centsToDollars(line.unitPriceCents).toFixed(2)}
                                  onChange={(e) =>
                                    updateLine(idx, 'unitPriceCents', dollarsToCents(parseFloat(e.target.value) || 0))
                                  }
                                  className="h-7 text-xs w-24 pl-4"
                                  min="0"
                                  step="0.01"
                                  aria-label="Unit price"
                                />
                              </div>
                            </TableCell>
                            <TableCell className="p-1 text-xs font-mono whitespace-nowrap">
                              {formatAUD(line.totalCents)}
                            </TableCell>
                            {budgetLines.length > 0 && (
                              <TableCell className="p-1">
                                <Select
                                  value={line.budgetLineId}
                                  onValueChange={(val) => updateLine(idx, 'budgetLineId', val)}
                                >
                                  <SelectTrigger className="h-7 text-xs w-36">
                                    <SelectValue placeholder="Select..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {budgetLines.map((bl) => (
                                      <SelectItem key={bl.id} value={bl.id}>
                                        {bl.categoryCode} — {bl.categoryName} ({formatAUD(bl.remainingCents)} left)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            )}
                            <TableCell className="p-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => removeLine(idx)}
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {lines.length > 0 && linesTotalCents > 0 && (
                  <div className="border-t px-4 py-2 text-right text-sm font-medium">
                    Line items total: {formatAUD(linesTotalCents)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="inv-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional notes about this invoice..."
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saved as a correspondence note linked to the invoice.
                </p>
              </CardContent>
            </Card>

            {/* PDF status (shown only when a file is selected) */}
            {pdfFile && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">PDF Attachment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(pdfFile.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  {extracting && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Extracting invoice details...
                    </div>
                  )}
                  {!extracting && fieldsAutoPopulated && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Fields auto-populated — review before saving
                    </div>
                  )}
                  {uploadedS3Key && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle className="h-3 w-3" aria-hidden="true" />
                      PDF uploaded to storage
                    </div>
                  )}
                  {uploadProgress !== null && !uploadedS3Key && (
                    <div className="space-y-1">
                      <Progress value={uploadProgress} className="h-1.5" />
                      <p className="text-xs text-muted-foreground">Uploading to storage...</p>
                    </div>
                  )}
                  {uploadError && (
                    <p className="text-xs text-destructive">{uploadError}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => void handleSubmit('RECEIVED')}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button
                  onClick={() => void handleSubmit('PENDING_REVIEW')}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save for Review'}
                </Button>
                <Button
                  variant="ghost"
                  asChild
                >
                  <Link href="/invoices">Cancel</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
