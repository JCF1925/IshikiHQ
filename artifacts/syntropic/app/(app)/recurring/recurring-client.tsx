'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Repeat, Plus, Trash2, Pencil, RefreshCw, ArrowDownCircle, ArrowUpCircle, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber, SafeDate } from '@/components/safe-format'

type Recurring = {
  id: string; name: string; kind: string; amount: number; currency: string; merchant: string | null
  category: string | null; subcategory: string | null; accountId: string | null; frequency: string; interval: number
  anchorDate: string; endDate: string | null; isBill: boolean; isDeductible: boolean; taxCategory: string | null
  isActive: boolean; lastGeneratedDate: string | null; notes: string | null
}
type Account = { id: string; name: string; type: string }
type Cat = { id: string; name: string; parentId: string | null; isActive: boolean; kind: string }

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]
const freqLabel = (f: string) => FREQUENCIES.find((x) => x.value === f)?.label ?? f

const emptyForm = {
  name: '', kind: 'expense', amount: '', currency: 'AUD', merchant: '', category: '', accountId: '',
  frequency: 'monthly', interval: '1', anchorDate: '', endDate: '', isBill: false, isDeductible: false, taxCategory: '', notes: '',
}

export function RecurringClient() {
  const [items, setItems] = useState<Recurring[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Recurring | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [effectiveDate, setEffectiveDate] = useState('')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/recurring')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(data.recurring ?? data ?? [])
    } catch { toast.error('Failed to load recurring items') }
    finally { setLoading(false) }
  }, [])

  const fetchAux = useCallback(async () => {
    try {
      const [ar, cr] = await Promise.all([fetch('/api/accounts'), fetch('/api/categories')])
      if (ar.ok) setAccounts(await ar.json())
      if (cr.ok) {
        const all = await cr.json()
        const parentIds = new Set((all ?? []).map((c: any) => c?.parentId).filter(Boolean))
        setCats((all ?? []).filter((c: any) => c?.isActive !== false && !parentIds.has(c?.id) && c?.kind !== 'transfer'))
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchItems(); fetchAux() }, [fetchItems, fetchAux])

  const openAdd = () => {
    setEditing(null); setEffectiveDate('')
    setForm({ ...emptyForm, anchorDate: new Date().toISOString().split('T')[0] })
    setShowAdd(true)
  }
  const openEdit = (r: Recurring) => {
    setEditing(r); setEffectiveDate('')
    setForm({
      name: r.name, kind: r.kind, amount: String(r.amount), currency: r.currency, merchant: r.merchant ?? '',
      category: r.category ?? '', accountId: r.accountId ?? '', frequency: r.frequency, interval: String(r.interval),
      anchorDate: r.anchorDate?.split('T')[0] ?? '', endDate: r.endDate?.split('T')[0] ?? '', isBill: r.isBill,
      isDeductible: r.isDeductible, taxCategory: r.taxCategory ?? '', notes: r.notes ?? '',
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const payload: any = {
        ...form, amount: Math.abs(parseFloat(form.amount)), interval: parseInt(form.interval) || 1,
        category: form.category || null, accountId: form.accountId || null, endDate: form.endDate || null,
      }
      if (editing && effectiveDate) payload.effectiveDate = effectiveDate
      const res = editing
        ? await fetch(`/api/recurring/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Recurring item updated' : 'Recurring item created')
      setShowAdd(false); setEditing(null)
      fetchItems()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (r: Recurring) => {
    if (!confirm(`Delete "${r.name}"? Upcoming forecast transactions will be removed; confirmed ones are kept.`)) return
    try {
      await fetch(`/api/recurring/${r.id}`, { method: 'DELETE' })
      toast.success('Deleted')
      fetchItems()
    } catch { toast.error('Failed to delete') }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/recurring/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(`${data.created ?? 0} forecast transaction${(data.created ?? 0) === 1 ? '' : 's'} generated`)
      fetchItems()
    } catch { toast.error('Failed to generate') }
    finally { setGenerating(false) }
  }

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—'

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Repeat className="h-6 w-6" /> Recurring</h1>
            <p className="text-muted-foreground text-sm mt-1">Templates that populate your forecast. Generate ahead to keep months rolling.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} loading={generating}><RefreshCw className="h-4 w-4 mr-2" /> Generate ahead</Button>
            <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add recurring</Button>
          </div>
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Repeat className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No recurring items yet. Add a salary, rent, subscription or bill to build your forecast.</p>
        </CardContent></Card>
      ) : (
        <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((r) => (
            <StaggerItem key={r.id}>
              <Card className={r.isActive ? '' : 'opacity-60'}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${r.kind === 'income' ? 'text-emerald-500' : 'text-primary'}`}>
                      {r.kind === 'income' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        {r.isBill && <Badge variant="outline" className="text-[10px] gap-1"><Receipt className="h-3 w-3" /> Bill</Badge>}
                        {!r.isActive && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
                        {r.isDeductible && <Badge variant="outline" className="text-[10px]">Deductible</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {freqLabel(r.frequency)}{r.interval > 1 ? ` ×${r.interval}` : ''}
                        {r.category ? ` · ${r.category}` : ''}
                        {r.accountId ? ` · ${accountName(r.accountId)}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From <SafeDate date={r.anchorDate} options={{ dateStyle: 'medium' }} />
                        {r.endDate ? <> · until <SafeDate date={r.endDate} options={{ dateStyle: 'medium' }} /></> : ' · ongoing'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-sm font-semibold ${r.kind === 'income' ? 'text-emerald-500' : ''}`}>
                        {r.kind === 'income' ? '+' : '−'}<SafeNumber value={r.amount} currency={r.currency} />
                      </p>
                      <div className="flex items-center gap-1 justify-end mt-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(r)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit recurring item' : 'Add recurring item'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rent" /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v: string) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={(e: any) => setForm({ ...form, currency: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={(v: string) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Every N (interval)</Label><Input type="number" min="1" value={form.interval} onChange={(e: any) => setForm({ ...form, interval: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Start / anchor date *</Label><Input type="date" value={form.anchorDate} onChange={(e: any) => setForm({ ...form, anchorDate: e.target.value })} /></div>
              <div><Label>End date</Label><Input type="date" value={form.endDate} onChange={(e: any) => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                {cats.length > 0 ? (
                  <Select value={form.category || 'none'} onValueChange={(v: string) => setForm({ ...form, category: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorised</SelectItem>
                      {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <Input value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Housing" />}
              </div>
              <div>
                <Label>Account</Label>
                <Select value={form.accountId || 'none'} onValueChange={(v: string) => setForm({ ...form, accountId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Merchant / payee</Label><Input value={form.merchant} onChange={(e: any) => setForm({ ...form, merchant: e.target.value })} placeholder="Optional" /></div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.isBill} onCheckedChange={(v: boolean) => setForm({ ...form, isBill: v })} /><Label className="cursor-pointer">Is a bill</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isDeductible} onCheckedChange={(v: boolean) => setForm({ ...form, isDeductible: v })} /><Label className="cursor-pointer">Tax deductible</Label></div>
            </div>
            {editing && (
              <div className="rounded-lg border border-border p-3 bg-muted/30">
                <Label>Effective date (optional)</Label>
                <Input type="date" value={effectiveDate} onChange={(e: any) => setEffectiveDate(e.target.value)} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">If set, only upcoming forecast transactions on or after this date are updated to the new amount/details. Past transactions stay unchanged.</p>
              </div>
            )}
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
            <Button onClick={handleSave} className="w-full" loading={saving}>{editing ? 'Save changes' : 'Create & forecast'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
