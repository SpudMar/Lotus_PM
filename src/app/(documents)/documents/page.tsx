'use client'

import { useEffect, useState, useCallback } from 'react'
import { DashboardShell } from '@/components/layout/dashboard-shell'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, FileText, Search, Download } from 'lucide-react'
import { formatDateAU } from '@/lib/shared/dates'

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

interface UploadForm {
  name: string
  description: string
  category: DocCategory
  participantId: string
  mimeType: string
  sizeBytes: string
  s3Key: string
  s3Bucket: string
}

const EMPTY_FORM: UploadForm = {
  name: '',
  description: '',
  category: 'OTHER',
  participantId: '',
  mimeType: 'application/pdf',
  sizeBytes: '0',
  s3Key: '',
  s3Bucket: process.env['NEXT_PUBLIC_S3_BUCKET'] ?? 'lotus-pm-dev-uploads',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = sizes[i]
  if (!size) return `${bytes} B`
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${size}`
}

function mimeTypeBadge(mimeType: string): React.JSX.Element {
  if (mimeType.includes('pdf')) return <Badge variant="destructive" className="text-xs">PDF</Badge>
  if (mimeType.includes('image')) return <Badge variant="secondary" className="text-xs">Image</Badge>
  if (mimeType.includes('word') || mimeType.includes('document')) return <Badge className="text-xs">Word</Badge>
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <Badge variant="outline" className="text-xs">Excel</Badge>
  return <Badge variant="outline" className="text-xs">File</Badge>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage(): React.JSX.Element {
  const [documents, setDocuments] = useState<DocDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<DocCategory | 'all'>('all')
  const [showUpload, setShowUpload] = useState(false)
  const [form, setForm] = useState<UploadForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const loadDocuments = useCallback(async (q?: string, cat?: DocCategory | 'all'): Promise<void> => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (q) params.set('search', q)
      if (cat && cat !== 'all') params.set('category', cat)
      const res = await fetch(`/api/documents?${params.toString()}`)
      if (res.ok) {
        const json = await res.json() as { data: DocDocument[] }
        setDocuments(json.data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value
    setSearch(val)
    void loadDocuments(val, categoryFilter)
  }

  function handleCategoryFilterChange(val: string): void {
    const cat = val as DocCategory | 'all'
    setCategoryFilter(cat)
    void loadDocuments(search, cat)
  }

  async function handleUpload(): Promise<void> {
    if (!form.name || !form.s3Key) return
    setSaving(true)
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        participantId: form.participantId || undefined,
        mimeType: form.mimeType,
        sizeBytes: Number(form.sizeBytes) || 0,
        s3Key: form.s3Key,
        s3Bucket: form.s3Bucket,
      }
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setShowUpload(false)
        setForm(EMPTY_FORM)
        void loadDocuments(search, categoryFilter)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload(doc: DocDocument): Promise<void> {
    setDownloading(doc.id)
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`)
      if (res.ok) {
        const json = await res.json() as { data: { downloadUrl: string; filename: string } }
        // Open in a new tab — browser handles the download
        window.open(json.data.downloadUrl, '_blank', 'noreferrer')
      }
    } finally {
      setDownloading(null)
    }
  }

  async function handleDelete(doc: DocDocument): Promise<void> {
    if (!confirm(`Delete "${doc.name}"? This action cannot be undone.`)) return
    await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
    void loadDocuments(search, categoryFilter)
  }

  return (
    <DashboardShell>
      <PageHeader
        title="Documents"
        description="Manage participant documents, service agreements, plan letters, and files."
        actions={
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Upload document
          </Button>
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
        <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
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
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Participant</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-[100px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Loading documents…
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  {search || categoryFilter !== 'all'
                    ? 'No documents match your filters.'
                    : 'No documents yet. Upload the first one.'}
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <div className="font-medium">{doc.name}</div>
                        {doc.description && (
                          <div className="text-xs text-muted-foreground">{doc.description}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{categoryLabel(doc.category)}</Badge>
                  </TableCell>
                  <TableCell>{mimeTypeBadge(doc.mimeType)}</TableCell>
                  <TableCell>
                    {doc.participant ? (
                      <div>
                        <div className="text-sm">
                          {doc.participant.firstName} {doc.participant.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">{doc.participant.ndisNumber}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatBytes(doc.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.uploadedBy?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateAU(new Date(doc.createdAt))}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDownload(doc)}
                        disabled={downloading === doc.id}
                        aria-label={`Download ${doc.name}`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleDelete(doc)}
                        aria-label={`Delete document ${doc.name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Upload dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent aria-describedby="upload-desc">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <p id="upload-desc" className="text-sm text-muted-foreground">
              Register a document record. Use the S3 upload endpoint to obtain the S3 key first.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="doc-name">Name <span aria-hidden="true">*</span></Label>
              <Input
                id="doc-name"
                placeholder="e.g. Support Plan 2025–26"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-required="true"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="doc-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(val) => setForm({ ...form, category: val as DocCategory })}
              >
                <SelectTrigger id="doc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="doc-description">Description</Label>
              <Input
                id="doc-description"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="doc-participant">Participant ID</Label>
              <Input
                id="doc-participant"
                placeholder="Optional — link to a participant"
                value={form.participantId}
                onChange={(e) => setForm({ ...form, participantId: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="doc-mime">MIME type</Label>
                <Input
                  id="doc-mime"
                  placeholder="application/pdf"
                  value={form.mimeType}
                  onChange={(e) => setForm({ ...form, mimeType: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-size">Size (bytes)</Label>
                <Input
                  id="doc-size"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.sizeBytes}
                  onChange={(e) => setForm({ ...form, sizeBytes: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="doc-s3key">S3 key <span aria-hidden="true">*</span></Label>
              <Input
                id="doc-s3key"
                placeholder="documents/general/{id}/filename.pdf"
                value={form.s3Key}
                onChange={(e) => setForm({ ...form, s3Key: e.target.value })}
                aria-required="true"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleUpload()}
              disabled={saving || !form.name || !form.s3Key}
            >
              {saving ? 'Saving…' : 'Save document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
