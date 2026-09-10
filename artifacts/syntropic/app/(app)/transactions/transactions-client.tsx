'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CreditCard, Plus, Upload, Trash2, Filter, Lock, LockOpen, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'
import { SafeNumber } from '@/components/safe-format'
import { parse } from 'csv/sync'

export function TransactionsClient() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coaCategories, setCoaCategories] = useState<any[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [filters, setFilters] = useState({ accountId: '', category: '', deductible: '', status: '', from: '', to: '' })
  const [form, setForm] = useState({ date: '', amount: '', currency: 'AUD', merchant: '', category: '', accountId: '', isDeductible: false, isTransfer: false, isDishonoured: false, notes: '' })

  // Set default date on client mount only (SSR-safe)
  useEffect(() => {
    setForm(prev => ({ ...prev, date: prev.date || new Date().toISOString().split('T')[0] }))
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filters.accountId) params.set('accountId', filters.accountId)
      if (filters.category) params.set('category', filters.category)
      if (filters.deductible) params.set('deductible', filters.deductible)
      if (filters.status) params.set('status', filters.status)
      if (showHidden) params.set('includeHidden', 'true')
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      params.set('limit', '50')
      const res = await fetch(`/api/transactions?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTransactions(data?.transactions ?? [])
      setTotal(data?.total ?? 0)
    } catch { toast.error('Failed to load transactions') }
    finally { setLoading(false) }
  }, [filters, showHidden])

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      setAccounts(await res.json())
    } catch { /* silent */ }
  }

  const fetchCoaCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      if (!res.ok) throw new Error()
      const all = await res.json()
      // Leaves = categories that are not a parent of any other category
      const parentIds = new Set((all ?? []).map((c: any) => c?.parentId).filter(Boolean))
      const leaves = (all ?? []).filter((c: any) => c?.isActive !== false && !parentIds.has(c?.id) && c?.kind !== 'transfer')
      setCoaCategories(leaves)
    } catch { /* silent */ }
  }

  useEffect(() => { fetchTransactions() }, [fetchTransactions])
  useEffect(() => { fetchAccounts(); fetchCoaCategories() }, [])

  const handleLifecycle = async (id: string, action: 'confirm' | 'unlock' | 'relock') => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'confirm' ? 'Transaction confirmed' : action === 'unlock' ? 'Unlocked for editing' : 'Re-locked')
      fetchTransactions()
    } catch { toast.error('Action failed') }
  }

  const handleAdd = async () => {
    if (!form.amount) { toast.error('Amount is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Transaction added')
      setShowAdd(false)
      setForm({ date: new Date().toISOString().split('T')[0], amount: '', currency: 'AUD', merchant: '', category: '', accountId: '', isDeductible: false, isTransfer: false, isDishonoured: false, notes: '' }) // safe: runs in event handler, not render
      fetchTransactions()
    } catch { toast.error('Failed to add transaction') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return
    try {
      await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      toast.success('Transaction deleted')
      fetchTransactions()
    } catch { toast.error('Failed to delete') }
  }

  // CSV import
  const [csvText, setCsvText] = useState('')
  const handleCsvImport = async () => {
    if (!csvText.trim()) { toast.error('Paste CSV data'); return }
    setSaving(true)
    try {
      const rows = parse(csvText, {
        columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: false,
      }) as Record<string, string>[]

      const res = await fetch('/api/csv-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, columnMap: { date: 'date', amount: 'amount', merchant: 'merchant', description: 'description', category: 'category' }, fileName: 'import.csv' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? 'Import failed')
      toast.success(`Imported ${data?.imported ?? 0} of ${data?.total ?? 0} transactions`)
      setShowImport(false)
      setCsvText('')
      fetchTransactions()
    } catch (e: any) { toast.error(e?.message ?? 'Import failed') }
    finally { setSaving(false) }
  }

  const categories = [...new Set((transactions ?? []).map((t: any) => t?.category).filter(Boolean))]
  const merchantOptions = [...new Set((transactions ?? []).map((t: any) => t?.merchant).filter(Boolean))].slice(0, 100)

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              <CreditCard className="h-6 w-6" /> Transactions
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Track income, expenses, and account balances.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}><Upload className="h-4 w-4 mr-2" /> Import CSV</Button>
            <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" /> Add</Button>
          </div>
        </div>
      </FadeIn>

      {/* Account summary cards */}
      {(accounts ?? []).length > 0 && (
        <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((acc: any) => (
            <StaggerItem key={acc?.id}>
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground truncate">{acc?.name ?? 'Account'}</p>
                  <p className={`font-mono font-bold text-lg ${((acc?.derivedBalance ?? acc?.balance) ?? 0) < 0 ? 'text-destructive' : ''}`}>
                    <SafeNumber value={(acc?.derivedBalance ?? acc?.balance) ?? 0} currency="AUD" />
                  </p>
                  <Badge variant="secondary" className="text-[10px] mt-1">{acc?.type ?? ''}</Badge>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* Filters */}
      <FadeIn delay={0.1}>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filters.accountId} onValueChange={(v: string) => setFilters({ ...filters, accountId: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All accounts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((a: any) => <SelectItem key={a?.id} value={a?.id ?? ''}>{a?.name ?? ''}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.category} onValueChange={(v: string) => setFilters({ ...filters, category: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v: string) => setFilters({ ...filters, status: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Any status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" className="w-36" value={filters.from} onChange={(e: any) => setFilters({ ...filters, from: e.target.value })} placeholder="From" />
              <Input type="date" className="w-36" value={filters.to} onChange={(e: any) => setFilters({ ...filters, to: e.target.value })} placeholder="To" />
              <div className="flex items-center gap-2 ml-auto">
                <Switch checked={showHidden} onCheckedChange={setShowHidden} id="show-hidden" />
                <Label htmlFor="show-hidden" className="text-xs whitespace-nowrap">Show transfers &amp; dishonoured</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Transactions table */}
      <FadeIn delay={0.2}>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions ?? []).map((t: any) => (
                    <TableRow key={t?.id}>
                      <TableCell className="text-sm"><SafeDate date={t?.date} options={{ dateStyle: 'short' }} /></TableCell>
                      <TableCell className="text-sm font-medium">{t?.merchant ?? t?.description ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {t?.category && <Badge variant="secondary" className="text-[10px]">{t.category}</Badge>}
                          {t?.isDeductible && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400">Tax</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t?.account?.name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {t?.locked ? (
                            <Badge className="text-[10px] bg-amber-500/20 text-amber-400 gap-1"><Lock className="h-2.5 w-2.5" /> Locked</Badge>
                          ) : t?.status === 'confirmed' ? (
                            <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400">Confirmed</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-slate-500/20 text-slate-300">Pending</Badge>
                          )}
                          {t?.isTransfer && <Badge variant="outline" className="text-[10px]">Transfer</Badge>}
                          {t?.isDishonoured && <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">Dishonoured</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${(t?.amount ?? 0) >= 0 ? 'text-emerald-500' : ''}`}>
                        <SafeNumber value={t?.amount ?? 0} currency={t?.currency ?? 'AUD'} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {t?.status !== 'confirmed' && (
                            <Button variant="ghost" size="icon-sm" onClick={() => handleLifecycle(t?.id, 'confirm')} title="Confirm" className="text-muted-foreground hover:text-emerald-500">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {t?.locked && (
                            <Button variant="ghost" size="icon-sm" onClick={() => handleLifecycle(t?.id, 'unlock')} title="Unlock to edit" className="text-muted-foreground hover:text-amber-500">
                              <LockOpen className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(t?.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(transactions ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No transactions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground text-right mt-1">Showing {(transactions ?? []).length} of {total} transactions</p>
      </FadeIn>

      {/* Add transaction dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Amount *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="-45.50" /></div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['AUD','USD','EUR','GBP','NZD','JPY','CAD','SGD'].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Merchant</Label><Input list="merchant-options" value={form.merchant} onChange={(e: any) => setForm({ ...form, merchant: e.target.value })} placeholder="Woolworths" /><datalist id="merchant-options">{merchantOptions.map((m: any) => <option key={m} value={m} />)}</datalist></div>
              <div>
                <Label>Category</Label>
                {coaCategories.length > 0 ? (
                  <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {coaCategories.map((c: any) => <SelectItem key={c?.id} value={c?.name ?? ''}>{c?.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={form.category} onChange={(e: any) => setForm({ ...form, category: e.target.value })} placeholder="Groceries" />
                )}
              </div>
            </div>
            <div>
              <Label>Account</Label>
              <Select value={form.accountId} onValueChange={(v: string) => setForm({ ...form, accountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => <SelectItem key={a?.id} value={a?.id ?? ''}>{a?.name ?? ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2"><Switch checked={form.isDeductible} onCheckedChange={(c: boolean) => setForm({ ...form, isDeductible: c })} /><Label>Tax deductible</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isTransfer} onCheckedChange={(c: boolean) => setForm({ ...form, isTransfer: c })} /><Label>Transfer</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isDishonoured} onCheckedChange={(c: boolean) => setForm({ ...form, isDishonoured: c })} /><Label>Dishonoured</Label></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
            <Button onClick={handleAdd} className="w-full" loading={saving}>Add Transaction</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Paste your CSV data below. Expected columns: date, amount, merchant, description, category</p>
            <textarea
              className="w-full h-40 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`date,amount,merchant,description,category\n2026-09-01,-45.50,Woolworths,Weekly shop,Groceries`}
            />
            <Button onClick={handleCsvImport} className="w-full" loading={saving}>Import</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
