'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, Search, Save } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApprovedSupportRule {
  id: string
  participantId: string
  categoryCode: string
  restrictedMode: boolean
  allowedItemCodes: string[]
}

interface SupportItem {
  id: string
  itemNumber: string
  name: string
  categoryCode: string
}

// NDIS Support Categories
const NDIS_CATEGORIES = [
  { code: '01', name: 'Assistance with Daily Life' },
  { code: '02', name: 'Transport' },
  { code: '03', name: 'Consumables' },
  { code: '04', name: 'Assistance with Social & Community Participation' },
  { code: '05', name: 'Assistive Technology' },
  { code: '06', name: 'Home Modifications' },
  { code: '07', name: 'Coordination of Supports' },
  { code: '08', name: 'Improved Living Arrangements' },
  { code: '09', name: 'Increased Social & Community Participation' },
  { code: '10', name: 'Finding & Keeping a Job' },
  { code: '11', name: 'Improved Relationships' },
  { code: '12', name: 'Improved Health & Wellbeing' },
  { code: '13', name: 'Improved Learning' },
  { code: '14', name: 'Improved Life Choices' },
  { code: '15', name: 'Improved Daily Living' },
]

interface ApprovedSupportsTabProps {
  participantId: string
}

function CategoryRow({
  category,
  rule,
  participantId,
  onSaved,
}: {
  category: { code: string; name: string }
  rule: ApprovedSupportRule | null
  participantId: string
  onSaved: () => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [restricted, setRestricted] = useState(rule?.restrictedMode ?? false)
  const [allowedCodes, setAllowedCodes] = useState<string[]>(rule?.allowedItemCodes ?? [])
  const [items, setItems] = useState<SupportItem[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (expanded && items.length === 0) {
      void fetch(`/api/price-guide/items?categoryCode=${category.code}&pageSize=200`)
        .then((r) => r.json())
        .then((j: { data: SupportItem[] }) => setItems(j.data ?? []))
        .catch(() => null)
    }
  }, [expanded, category.code, items.length])

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/crm/approved-supports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId,
          categoryCode: category.code,
          restrictedMode: restricted,
          allowedItemCodes: allowedCodes,
        }),
      })
      setDirty(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const filteredItems = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.itemNumber.includes(search))
    : items

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono text-xs text-muted-foreground">{category.code}</span>
          <span className="text-sm font-medium">{category.name}</span>
        </div>
        <Badge variant={restricted ? 'secondary' : 'outline'}>
          {restricted ? `Restricted (${allowedCodes.length} items)` : 'All Allowed'}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={restricted}
              onCheckedChange={(v) => { setRestricted(v); setDirty(true) }}
              id={`restrict-${category.code}`}
            />
            <Label htmlFor={`restrict-${category.code}`} className="text-sm">
              Restrict to approved items only
            </Label>
          </div>

          {restricted && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search support items..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredItems.map((item) => {
                  const checked = allowedCodes.includes(item.itemNumber)
                  return (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setAllowedCodes((prev) =>
                            checked ? prev.filter((c) => c !== item.itemNumber) : [...prev, item.itemNumber]
                          )
                          setDirty(true)
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="font-mono text-xs text-muted-foreground">{item.itemNumber}</span>
                      <span>{item.name}</span>
                    </label>
                  )
                })}
                {filteredItems.length === 0 && items.length > 0 && (
                  <p className="text-sm text-muted-foreground py-2">No items match your search.</p>
                )}
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">Loading items...</p>
                )}
              </div>
            </div>
          )}

          {dirty && (
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              <Save className="mr-1 h-3 w-3" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ApprovedSupportsTab({ participantId }: ApprovedSupportsTabProps): React.JSX.Element {
  const [rules, setRules] = useState<ApprovedSupportRule[]>([])
  const [loading, setLoading] = useState(true)

  async function loadRules() {
    try {
      const res = await fetch(`/api/crm/approved-supports?participantId=${participantId}`)
      if (res.ok) {
        const json = await res.json()
        setRules(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [participantId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading approved supports...</div>
  }

  const rulesByCategory = new Map(rules.map((r) => [r.categoryCode, r]))

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-4">
        Control which support items this participant can be billed for, per category.
        By default, all items are allowed. Switch to &ldquo;Restricted&rdquo; to allow only specific items.
      </p>
      {NDIS_CATEGORIES.map((cat) => (
        <CategoryRow
          key={cat.code}
          category={cat}
          rule={rulesByCategory.get(cat.code) ?? null}
          participantId={participantId}
          onSaved={() => void loadRules()}
        />
      ))}
    </div>
  )
}
