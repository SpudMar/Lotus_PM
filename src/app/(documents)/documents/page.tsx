'use client'

import { useEffect, useState, useCallback, useRef, type DragEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Trash2,
  FileText,
  Search,
  Download,
  Upload,
  X,
  FileImage,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'
import { hasPermission } from '@/lib/auth/rbac'
import type { Role } from '@/lib/auth/rbac'
import { PdfViewer } from '@/components/shared/PdfViewer'
import { ContextActionMenu, emailAction, navigateAction } from '@/components/shared/ContextActionMenu'
import { useContextEmail } from '@/hooks/useContextEmail'
import { EmailComposeModal } from '@/components/email/EmailComposeModal'

// ─── Types ───────────────────────────────────────────────────────────────────

const DOC_CATEGORIES = [
  'SERVICE_AGREEMENT',
  'PLAN_LETTER',
  'INVOICE',
  'ASSESSMENT',
  'CORRESPONDENCE',
  'OTHER',
] as const
type DocCategory = typeof DOC_CATEGORIES[number]

interface DocDocument {
  id: string
  name: string
  description: string | null
  category: DocCategory
  mimeType: string
  sizeBytes: number
  s3Key: string
  s3Bucket: string
  version: number
  uploadedById: string
  uploadedBy: { id: string; name: string; email: string } | null
  participantId: string | null
  participant: {
    firstName: string
    lastName: string
    ndisNumber: string
  } | null
  createdAt: string
}

interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface ParticipantOption {
  id: string
  firstName: string
  lastName: string
  ndisNumber: string
}

type UploadStage =
  | 'idle'
  | 'selected'
  | 'getting-url'
  | 'uploading-s3'
  | 'saving-metadata'
  | 'done'
  | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function categoryLabel(cat: DocCategory): string {
  switch (cat) {
    case 'SERVICE_AGREEMENT': return 'Service Agreement'
    case 'PLAN_LETTER': return 'Plan Letter'
    case 'INVOICE': return 'Invoice'
    case 'ASSESSMENT': return 'Assessment'
    case 'CORRESPONDENCE': return 'Correspondence'
    default: return 'Other'
  }
}

function categoryBadgeClass(cat: DocCategory): string {
  switch (cat) {
    case 'SERVICE_AGREEMENT': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'PLAN_LETTER': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'INVOICE': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'ASSESSMENT': return 'bg-green-100 text-green-700 border-green-200'
    case 'CORRESPONDENCE': return 'bg-rose-100 text-rose-700 border-rose-200'
    default: return 'bg-stone-100 text-stone-600 border-stone-200'
  }
}

function FileTypeIcon({ mimeType }: { mimeType: string }): React.JSX.Element {
  if (mimeType.includes('image')) {
    return <FileImage className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
}

function stageLabel(stage: UploadStage): string {
  switch (stage) {
    case 'getting-url': return 'Requesting upload URL…'
    case 'uploading-s3': return 'Uploading to storage…'
    case 'saving-metadata': return 'Saving document…'
    case 'done': return 'Upload complete!'
    case 'error': return 'Upload failed'
    default: return ''
  }
}

function stageProgress(stage: UploadStage): number {
  switch (stage) {
    case 'getting-url': return 20
    case 'uploading-s3': return 60
    case 'saving-metadata': return 85
    case 'done': return 100
    default: return 0
  }
}

function isPdfPreviewable(mimeType: string, name: string): boolean {
  if (mimeType === 'application/pdf') return true
  if (name.toLowerCase().endsWith('.pdf')) return true
  return false
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage(): React.JSX.Element {
  const { data: session } = useSession()
  const router = useRouter()
  const { emailState, openEmail, closeEmail } = useContextEmail()
  const userRole = session?.user?.role as Role | undefined

  const canWrite = userRole ? hasPermission(userRole, 'documents:write') : false
  const canDelete = userRole ? hasPermission(userRole, 'documents:delete') : false

  // List state
  const [documents, setDocuments] = useState<DocDocument[]>([])
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocCategory | 'all'>('all')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Preview state
  const [previewDocId, setPreviewDocId] = useState<string | null>(null)
  const previewDoc = previewDocId ? documents.find((d) => d.id === previewDocId) : null

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<DocDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Upload dialog
  const [showUpload, setShowUpload] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadCategory, setUploadCategory] = useState<DocCategory>('OTHER')
  const [uploadParticipantSearch, setUploadParticipantSearch] = useState('')
  const [uploadParticipantOptions, setUploadParticipantOptions] = useState<ParticipantOption[]>([])
  const [uploadParticipantId, setUploadParticipantId] = useState<string>('')
  const [uploadParticipantName, setUploadParticipantName] = useState<string>('')
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const participantSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Load documents ────────────────────────────────────────────────────────

  const loadDocuments = useCallback(async (
    q?: string,
    cat?: DocCategory | 'all',
    page?: number,
  ): Promise<void> => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page ?? 1),
        pageSize: '20',
      })
      if (q) params.set('search', q)
      if (cat && cat !== 'all') params.set('category', cat)
      const res = await fetch(`/api/documents?${params.toString()}`)
      if (res.ok) {
        const json = await res.json() as {
          data: DocDocument[]
          meta?: PaginationMeta
          pagination?: PaginationMeta
        }
        setDocuments(json.data)
        const meta = json.meta ?? json.pagination
        if (meta) {
          setPagination(meta)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  // ─── Search (debounced) ────────────────────────────────────────────────────

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value
    setSearch(val)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      void loadDocuments(val, categoryFilter, 1)
    }, 300)
  }

  function handleCategoryChange(val: string): void {
    const cat = val as DocCategory | 'all'
    setCategoryFilter(cat)
    void loadDocuments(search, cat, 1)
  }

  function handleResetFilters(): void {
    setSearch('')
    setCategoryFilter('all')
    void loadDocuments('', 'all', 1)
  }

  // ─── Pagination ────────────────────────────────────────────────────────────

  function handlePageChange(newPage: number): void {
    void loadDocuments(search, categoryFilter, newPage)
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  async function handleDownload(doc: DocDocument): Promise<void> {
    setDownloading(doc.id)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`)
      if (!res.ok) {
        const json = await res.json().catch(() => null) as { error?: string } | null
        setError(json?.error ?? 'Failed to download document')
        return
      }
      const json = await res.json() as { data: { downloadUrl: string; filename: string } }
      window.open(json.data.downloadUrl, '_blank', 'noreferrer')
    } catch {
      setError('Failed to download document')
    } finally {
      setDownloading(null)
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => null) as { error?: string } | null
        setError(json?.error ?? 'Failed to delete document')
        return
      }
      setDeleteTarget(null)
      void loadDocuments(search, categoryFilter, pagination.page)
    } catch {
      setError('Failed to delete document')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Participant search (debounced) ────────────────────────────────────────

  function handleParticipantSearch(val: string): void {
    setUploadParticipantSearch(val)
    if (participantSearchTimerRef.current) clearTimeout(participantSearchTimerRef.current)
    if (!val.trim()) {
      setUploadParticipantOptions([])
      return
    }
    participantSearchTimerRef.current = setTimeout(async () => {
      const res = await fetch(`/api/crm/participants?search=${encodeURIComponent(val)}&pageSize=10`)
      if (res.ok) {
        const json = await res.json() as { data: ParticipantOption[] }
        setUploadParticipantOptions(json.data)
      }
    }, 300)
  }

  function selectParticipant(p: ParticipantOption): void {
    setUploadParticipantId(p.id)
    setUploadParticipantName(`${p.firstName} ${p.lastName}`)
    setUploadParticipantSearch('')
    setUploadParticipantOptions([])
  }

  function clearParticipant(): void {
    setUploadParticipantId('')
    setUploadParticipantName('')
    setUploadParticipantSearch('')
    setUploadParticipantOptions([])
  }

  // ─── File selection ────────────────────────────────────────────────────────

  function handleFileSelected(file: File): void {
    setSelectedFile(file)
    setUploadName(file.name.replace(/\.[^.]+$/, ''))
    setUploadStage('selected')
    setUploadError(null)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelected(file)
  }

  // ─── Upload flow ───────────────────────────────────────────────────────────

  async function handleUpload(): Promise<void> {
    if (!selectedFile || !uploadName.trim()) return

    setUploadError(null)

    try {
      // Step 1: Get presigned upload URL
      setUploadStage('getting-url')
      const urlRes = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
          participantId: uploadParticipantId || undefined,
        }),
      })

      if (!urlRes.ok) {
        const err = await urlRes.json() as { error?: string }
        throw new Error(err.error ?? 'Failed to get upload URL')
      }

      const urlJson = await urlRes.json() as {
        data: { uploadUrl: string; s3Key: string; s3Bucket: string; documentId: string }
      }
      const { uploadUrl, s3Key, s3Bucket } = urlJson.data

      // Step 2: Upload file bytes directly to S3
      setUploadStage('uploading-s3')
      const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
      })

      if (!s3Res.ok) {
        throw new Error('Failed to upload file to storage')
      }

      // Step 3: Save document metadata
      setUploadStage('saving-metadata')
      const metaRes = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName.trim(),
          description: uploadDescription.trim() || undefined,
          category: uploadCategory,
          mimeType: selectedFile.type || 'application/octet-stream',
          sizeBytes: selectedFile.size,
          s3Key,
          s3Bucket,
          participantId: uploadParticipantId || undefined,
        }),
      })

      if (!metaRes.ok) {
        const err = await metaRes.json() as { error?: string }
        throw new Error(err.error ?? 'Failed to save document')
      }

      setUploadStage('done')

      // Refresh list and close dialog after a brief success state
      void loadDocuments(search, categoryFilter, pagination.page)
      setTimeout(() => {
        resetUploadDialog()
        setShowUpload(false)
      }, 1000)
    } catch (err) {
      setUploadStage('error')
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  function resetUploadDialog(): void {
    setSelectedFile(null)
    setUploadName('')
    setUploadDescription('')
    setUploadCategory('OTHER')
    setUploadParticipantId('')
    setUploadParticipantName('')
    setUploadParticipantSearch('')
    setUploadParticipantOptions([])
    setUploadStage('idle')
    setUploadError(null)
    setIsDragOver(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleCloseUploadDialog(): void {
    if (uploadStage === 'getting-url' || uploadStage === 'uploading-s3' || uploadStage === 'saving-metadata') {
      // Don't close while uploading
      return
    }
    resetUploadDialog()
    setShowUpload(false)
  }

  const isUploading = uploadStage === 'getting-url' || uploadStage === 'uploading-s3' || uploadStage === 'saving-metadata'
  const hasFilters = search !== '' || categoryFilter !== 'all'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="space-y-4">
        <PageHeader
          title="Documents"
          description="Manage participant documents, service agreements, plan letters, and files."
          actions={
            canWrite ? (
              <Button onClick={() => setShowUpload(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Upload document
              </Button>
            ) : undefined
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={handleSearchChange}
              className="pl-9"
              aria-label="Search documents"
            />
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-[200px]" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {DOC_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <X className="mr-1 h-3 w-3" aria-hidden="true" />
              Reset filters
            </Button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
            <span>{error}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setError(null)} aria-label="Dismiss error">
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-[130px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading documents…
                  </TableCell>
                </TableRow>
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {hasFilters
                      ? 'No documents match your filters.'
                      : 'No documents yet. Upload the first one.'}
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileTypeIcon mimeType={doc.mimeType} />
                        <div>
                          <div className="font-medium">{doc.name}</div>
                          {doc.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">{doc.description}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${categoryBadgeClass(doc.category)}`}
                      >
                        {categoryLabel(doc.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.participant ? (
                        <div>
                          <div className="text-sm">
                            {doc.participant.firstName} {doc.participant.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">{doc.participant.ndisNumber}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">General</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.uploadedBy?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateAU(new Date(doc.createdAt))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBytes(doc.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ContextActionMenu
                          groups={[
                            {
                              label: 'Email',
                              items: doc.participant ? [
                                emailAction('Email Participant', () => openEmail({
                                  recipientName: `${doc.participant!.firstName} ${doc.participant!.lastName}`,
                                  subject: `Document: ${doc.name}`,
                                  participantId: doc.participantId ?? undefined,
                                  documentId: doc.id,
                                })),
                              ] : [],
                            },
                            {
                              label: 'Navigate',
                              items: doc.participant ? [
                                navigateAction('View Participant', () => router.push(`/participants/${doc.participantId}`)),
                              ] : [],
                            },
                          ].filter((g) => g.items.length > 0)}
                        />
                        {isPdfPreviewable(doc.mimeType, doc.name) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPreviewDocId(doc.id)}
                            aria-label={`Preview ${doc.name}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void handleDownload(doc)}
                          disabled={downloading === doc.id}
                          aria-label={`Download ${doc.name}`}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(doc)}
                            aria-label={`Delete ${doc.name}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {((pagination.page - 1) * pagination.pageSize) + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} documents
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Button>
              <span className="tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={(open) => { if (!open) handleCloseUploadDialog() }}>
        <DialogContent className="max-w-lg" aria-describedby="upload-dialog-desc">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <p id="upload-dialog-desc" className="text-sm text-muted-foreground">
              Select a file and fill in the details to upload a document.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File drop zone */}
            {!selectedFile ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="File drop zone — click or drag a file here"
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer
                  ${isDragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
                  }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              >
                <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Drop a file here, or click to select</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, images supported</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={handleFileInputChange}
                  aria-label="File input"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <FileTypeIcon mimeType={selectedFile.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{selectedFile.name}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</div>
                </div>
                {!isUploading && uploadStage !== 'done' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => { setSelectedFile(null); setUploadStage('idle'); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    aria-label="Remove selected file"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}

            {/* Progress bar */}
            {(isUploading || uploadStage === 'done') && (
              <div className="space-y-1">
                <Progress value={stageProgress(uploadStage)} aria-label="Upload progress" />
                <p className="text-xs text-muted-foreground text-center">{stageLabel(uploadStage)}</p>
              </div>
            )}

            {/* Error message */}
            {uploadStage === 'error' && uploadError && (
              <p className="text-sm text-destructive" role="alert">{uploadError}</p>
            )}

            {/* Form fields — only show when a file is selected and not uploading/done */}
            {selectedFile && uploadStage !== 'done' && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="upload-name">Name <span aria-hidden="true">*</span></Label>
                  <Input
                    id="upload-name"
                    placeholder="Document name"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    disabled={isUploading}
                    aria-required="true"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="upload-description">Description</Label>
                  <Textarea
                    id="upload-description"
                    placeholder="Optional description"
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    disabled={isUploading}
                    rows={2}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="upload-category">Category</Label>
                  <Select
                    value={uploadCategory}
                    onValueChange={(val) => setUploadCategory(val as DocCategory)}
                    disabled={isUploading}
                  >
                    <SelectTrigger id="upload-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Participant selector */}
                <div className="space-y-1">
                  <Label htmlFor="upload-participant">Participant</Label>
                  {uploadParticipantId ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                      <span className="flex-1 text-sm">{uploadParticipantName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={clearParticipant}
                        disabled={isUploading}
                        aria-label="Clear participant"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input
                        id="upload-participant"
                        placeholder="Search by name or NDIS number (optional)"
                        value={uploadParticipantSearch}
                        onChange={(e) => handleParticipantSearch(e.target.value)}
                        disabled={isUploading}
                        className="pl-9"
                        autoComplete="off"
                      />
                      {uploadParticipantOptions.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                          {uploadParticipantOptions.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                              onClick={() => selectParticipant(p)}
                            >
                              <span className="font-medium">{p.firstName} {p.lastName}</span>
                              <span className="text-muted-foreground text-xs">{p.ndisNumber}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseUploadDialog}
              disabled={isUploading}
            >
              {uploadStage === 'done' ? 'Close' : 'Cancel'}
            </Button>
            {uploadStage !== 'done' && (
              <Button
                onClick={() => void handleUpload()}
                disabled={!selectedFile || !uploadName.trim() || isUploading}
              >
                {isUploading ? (
                  <>
                    <Upload className="mr-2 h-4 w-4 animate-bounce" aria-hidden="true" />
                    {stageLabel(uploadStage)}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                    Upload
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document preview dialog */}
      <Dialog open={!!previewDocId} onOpenChange={(open) => { if (!open) setPreviewDocId(null) }}>
        <DialogContent className="max-w-4xl h-[80vh]" aria-describedby="preview-dialog-desc">
          <DialogHeader>
            <DialogTitle>
              {previewDoc ? previewDoc.name : 'Document Preview'}
            </DialogTitle>
            <p id="preview-dialog-desc" className="text-sm text-muted-foreground">
              {previewDoc?.description ?? 'Viewing document PDF'}
            </p>
          </DialogHeader>
          {previewDocId && (
            <PdfViewer
              documentId={previewDocId}
              height="calc(80vh - 120px)"
              title={previewDoc ? `Preview of ${previewDoc.name}` : 'Document preview'}
            />
          )}
        </DialogContent>
      </Dialog>
      <EmailComposeModal
        open={emailState.open}
        onClose={closeEmail}
        onSent={closeEmail}
        recipientEmail={emailState.recipientEmail}
        recipientName={emailState.recipientName}
        subject={emailState.subject}
        body={emailState.body}
        participantId={emailState.participantId}
        documentId={emailState.documentId}
      />
    </DashboardShell>
  )
}
