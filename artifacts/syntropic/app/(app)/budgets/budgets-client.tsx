'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Wallet, Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'

type Budget = {
  id: string; name: string; period: string; category: string | null; allocatedAmount: number
  startDate: string; endDate: string | null; isActive: boolean
  actual: number; committed: number; remaining: number; pctUsed: number
}
type Cat = { id: string; name: string; parentId: string | null; isActive: boolean; kind: string }

const PERIODS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
  { value: 'oneoff', label: 'One-off' },
]
const periodLabel = (p: string) => PERIODS.find((x) => x.value === p)?.label ?? p

const emptyForm = { name: '', period: 'monthly', category: '', allocatedAmount: '', startDate: '', endDate: '', isActive: true }

export function BudgetsClient() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch('/api/budgets')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setBudgets(data.budgets ?? [])
    } catch { toast.error('Failed to load budgets') }
    finally { setLoading(false) }
  }, [])
  const fetchCats = useCallback(async () => {
    try {
      const r = await fetch('/api/categories')
      if (r.ok) {
        const all = await r.json()
        const parentIds = new Set((all ?? []).map((c: any) => c?.parentId).filter(Boolean))
        setCats((all ?? []).filter((c: any) => c?.isActive !== false && !parentIds.has(c?.id) && c?.kind !== 'transfer'))
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchBudgets(); fetchCats() }, [fetchBudgets, fetchCats])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, startDate: new Date().toISOString().split('T')[0] }); setShowAdd(true) }
  const openEdit = (b: Budget) => {
    setEditing(b)
    setForm({ name: b.name, period: b.period, category: b.category ?? '', allocatedAmount: String(b.allocatedAmount), startDate: b.startDate?.split('T')[0] ?? '', endDate: b.endDate?.split('T')[0] ?? '', isActive: b.isActive })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...form, allocatedAmount: parseFloat(form.allocatedAmount) || 0, category: form.category || null, endDate: form.period === 'oneoff' ? (form.endDate || null) : null }
      const res = editing
        ? await fetch(`/api/budgets/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Budget updated' : 'Budget created')
      setShowAdd(false); setEditing(null)
      fetchBudgets()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async (b: Budget) => {
    if (!confirm(`Delete budget "${b.name}"?`)) return
    try { await fetch(`/api/budgets/${b.id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchBudgets() }
    catch { toast.error('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-6 w-6" /> Budgets</h1>
            <p className="text-muted-foreground text-sm mt-1">Dynamic budgets track spend against your allocation — including committed forecast spend.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add budget</Button>
        </div>
      </FadeIn>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : budgets.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No budgets yet. Create one per category to track your spending against a target.</p>
        </CardContent></Card>
      ) : (
        <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {budgets.map((b) => {
            const spent = b.actual + b.committed
            const over = spent > b.allocatedAmount && b.allocatedAmount > 0
            const pct = Math.min(100, b.pctUsed)
            return (
              <StaggerItem key={b.id}>
                <Card className={b.isActive ? '' : 'opacity-60'}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{b.name}</p>
                          <Badge variant="outline" className="text-[10px]">{periodLabel(b.period)}</Badge>
                          {b.category && <Badge variant="secondary" className="text-[10px]">{b.category}</Badge>}
                          {!b.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(b)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={pct} className={`h-2.5 ${over ? '[&>div]:bg-destructive' : ''}`} />
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground"><SafeNumber value={spent} currency="AUD" /></span> of <SafeNumber value={b.allocatedAmount} currency="AUD" />
                        </span>
                        <span className={`font-mono font-medium ${b.remaining < 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                          {b.remaining < 0 ? 'over by ' : ''}<SafeNumber value={Math.abs(b.remaining)} currency="AUD" />{b.remaining >= 0 ? ' left' : ''}
                        </span>
                      </div>
                      {b.committed > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">Includes <SafeNumber value={b.committed} currency="AUD" /> committed (forecast &amp; recurring)</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null) } }}>
        <DialogContent aria-describedby="budget-dialog-description" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit budget' : 'Add budget'}</DialogTitle></DialogHeader>
          <p id="budget-dialog-description" className="sr-only">Add or edit a budget and its limits.</p>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Groceries" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Period</Label>
                <Select value={form.period} onValueChange={(v: string) => setForm({ ...form, period: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Allocated amount</Label><Input type="number" step="0.01" value={form.allocatedAmount} onChange={(e: any) => setForm({ ...form, allocatedAmount: e.target.value })} placeholder="0.00" /></div>
            </div>
            <div>
              <Label>Category</Label>
              {cats.length > 0 ? (
                <Select value={form.category || 'all'} onValueChange={(v: string) => setForm({ ...form, category: v === 'all' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="All spending" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All spending</SelectItem>
                    {cats.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : <Input value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })} placeholder="Leave blank for all spending" />}
            </div>
            <div className={form.period === 'oneoff' ? 'grid grid-cols-2 gap-4' : ''}>
              <div><Label>Start date</Label><Input type="date" value={form.startDate} onChange={(e: any) => setForm({ ...form, startDate: e.target.value })} /></div>
              {form.period === 'oneoff' && <div><Label>End date</Label><Input type="date" value={form.endDate} onChange={(e: any) => setForm({ ...form, endDate: e.target.value })} /></div>}
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v: boolean) => setForm({ ...form, isActive: v })} /><Label className="cursor-pointer">Active</Label></div>
            <Button onClick={handleSave} className="w-full" loading={saving}>{editing ? 'Save changes' : 'Create budget'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
