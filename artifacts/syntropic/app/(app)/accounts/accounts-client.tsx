'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Landmark, Plus, Trash2, Pencil, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'

type Account = { id: string; name: string; type: string; institution: string | null; bsb: string | null; accountNumber: string | null; openingBalance: number; derivedBalance: number; notes: string | null }

const ACCOUNT_TYPES: { value: string; label: string; group: 'asset' | 'liability' }[] = [
  { value: 'transaction', label: 'Transaction / Everyday', group: 'asset' },
  { value: 'savings', label: 'Savings', group: 'asset' },
  { value: 'investment', label: 'Investment', group: 'asset' },
  { value: 'super', label: 'Superannuation', group: 'asset' },
  { value: 'ewallet', label: 'E-wallet', group: 'asset' },
  { value: 'credit', label: 'Credit Card', group: 'liability' },
  { value: 'loan', label: 'Personal Loan', group: 'liability' },
  { value: 'bnpl', label: 'BNPL', group: 'liability' },
  { value: 'tax', label: 'Tax Debt', group: 'liability' },
  { value: 'help', label: 'HELP Debt', group: 'liability' },
]

const groupOf = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.group ?? 'asset'
const labelOf = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type

const emptyForm = { name: '', type: 'transaction', institution: '', bsb: '', accountNumber: '', openingBalance: '', notes: '' }

export function AccountsClient() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      setAccounts(await res.json())
    } catch { toast.error('Failed to load accounts') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const openAdd = () => { setForm({ ...emptyForm }); setShowAdd(true) }
  const openEdit = (a: Account) => {
    setEditing(a)
    setForm({ name: a.name, type: a.type, institution: a.institution ?? '', bsb: a.bsb ?? '', accountNumber: a.accountNumber ?? '', openingBalance: String(a.openingBalance ?? 0), notes: a.notes ?? '' })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...form, openingBalance: form.openingBalance || '0' }
      const res = editing
        ? await fetch(`/api/accounts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Account updated' : 'Account added')
      setShowAdd(false); setEditing(null); setForm({ ...emptyForm })
      fetchAccounts()
    } catch { toast.error('Failed to save account') }
    finally { setSaving(false) }
  }

  const handleDelete = async (a: Account) => {
    if (!confirm(`Delete "${a.name}"? Its transactions will be kept but detached from the account.`)) return
    try {
      await fetch(`/api/accounts/${a.id}`, { method: 'DELETE' })
      toast.success('Account deleted')
      fetchAccounts()
    } catch { toast.error('Failed to delete') }
  }

  const assets = accounts.filter((a) => groupOf(a.type) === 'asset')
  const liabilities = accounts.filter((a) => groupOf(a.type) === 'liability')
  const assetTotal = assets.reduce((s, a) => s + (a.derivedBalance ?? 0), 0)
  const liabilityTotal = liabilities.reduce((s, a) => s + (a.derivedBalance ?? 0), 0)
  const netWorth = assetTotal + liabilityTotal

  const AccountRow = ({ a }: { a: Account }) => (
    <div className="flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-muted/50 group">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{a.name}</p>
        <p className="text-xs text-muted-foreground truncate">{labelOf(a.type)}{a.institution ? ` · ${a.institution}` : ''}</p>
      </div>
      <p className={`font-mono text-sm font-semibold ${(a.derivedBalance ?? 0) < 0 ? 'text-destructive' : ''}`}>
        <SafeNumber value={a.derivedBalance ?? 0} currency="AUD" />
      </p>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Landmark className="h-6 w-6" /> Accounts</h1>
            <p className="text-muted-foreground text-sm mt-1">Every account in one place. Balances are derived live from your transactions.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add account</Button>
        </div>
      </FadeIn>

      {/* Net worth summary */}
      <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-4 w-4" /> Total Assets</div>
            <p className="font-mono text-xl font-bold text-emerald-500"><SafeNumber value={assetTotal} currency="AUD" /></p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingDown className="h-4 w-4" /> Total Liabilities</div>
            <p className="font-mono text-xl font-bold text-destructive"><SafeNumber value={liabilityTotal} currency="AUD" /></p>
          </CardContent></Card>
        </StaggerItem>
        <StaggerItem>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Scale className="h-4 w-4" /> Net Worth</div>
            <p className={`font-mono text-xl font-bold ${netWorth < 0 ? 'text-destructive' : 'text-primary'}`}><SafeNumber value={netWorth} currency="AUD" /></p>
          </CardContent></Card>
        </StaggerItem>
      </Stagger>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <Landmark className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No accounts yet. Add your first account to start tracking balances.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FadeIn delay={0.1}>
            <Card><CardContent className="p-3">
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Assets</h2>
                <span className="text-xs text-muted-foreground">{assets.length}</span>
              </div>
              {assets.length === 0 ? <p className="text-xs text-muted-foreground px-2 py-6 text-center">No asset accounts</p> : assets.map((a) => <AccountRow key={a.id} a={a} />)}
            </CardContent></Card>
          </FadeIn>
          <FadeIn delay={0.15}>
            <Card><CardContent className="p-3">
              <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-border">
                <h2 className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-destructive" /> Liabilities</h2>
                <span className="text-xs text-muted-foreground">{liabilities.length}</span>
              </div>
              {liabilities.length === 0 ? <p className="text-xs text-muted-foreground px-2 py-6 text-center">No liability accounts</p> : liabilities.map((a) => <AccountRow key={a.id} a={a} />)}
            </CardContent></Card>
          </FadeIn>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={showAdd || !!editing} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditing(null) } }}>
        <DialogContent aria-describedby="account-dialog-description" className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit account' : 'Add account'}</DialogTitle></DialogHeader>
          <p id="account-dialog-description" className="sr-only">Add or edit an account and its details.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Everyday Account" /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">Tracked as {groupOf(form.type) === 'asset' ? 'an asset' : 'a liability'}</Badge>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Institution</Label><Input value={form.institution} onChange={(e: any) => setForm({ ...form, institution: e.target.value })} placeholder="e.g. CommBank" /></div>
              <div><Label>Opening balance</Label><Input type="number" step="0.01" value={form.openingBalance} onChange={(e: any) => setForm({ ...form, openingBalance: e.target.value })} placeholder="0.00" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>BSB</Label><Input value={form.bsb} onChange={(e: any) => setForm({ ...form, bsb: e.target.value })} placeholder="000-000" /></div>
              <div><Label>Account number</Label><Input value={form.accountNumber} onChange={(e: any) => setForm({ ...form, accountNumber: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
            <p className="text-xs text-muted-foreground">Live balance = opening balance + all transactions assigned to this account.</p>
            <Button onClick={handleSave} className="w-full" loading={saving}>{editing ? 'Save changes' : 'Add account'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
