'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Plus, Trash2, Pencil, TrendingUp, Home, LineChart, Landmark, Coins, HandCoins, Package } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeNumber } from '@/components/safe-format'

type Asset = {
  id: string; name: string; assetType: string; currentValue: number; purchaseValue: number | null; purchaseDate: string | null
  growthRate: number; incomeRate: number; ongoingCostAnnual: number; quantity: number | null; unitCode: string | null
  isProvisional: boolean; acquisitionDate: string | null; upfrontCost: number; linkedLiabilityId: string | null
  linkedLiabilityName: string | null; linkedLiabilityBalance: number; equity: number; isActive: boolean; notes: string | null
}
type Summary = { totalValue: number; totalEquity: number; annualIncome: number; count: number }

const ASSET_TYPES = [
  { value: 'primary_residence', label: 'Primary Residence', icon: Home },
  { value: 'investment_property', label: 'Investment Property', icon: Building2 },
  { value: 'cash_account', label: 'Cash / Savings', icon: Landmark },
  { value: 'shares', label: 'Shares', icon: LineChart },
  { value: 'etf', label: 'ETF', icon: TrendingUp },
  { value: 'p2p_lending', label: 'P2P / Small Unit Investment', icon: HandCoins },
  { value: 'other', label: 'Other', icon: Package },
]
const typeMeta = (t: string) => ASSET_TYPES.find((x) => x.value === t) ?? ASSET_TYPES[6]
const isProperty = (t: string) => t === 'primary_residence' || t === 'investment_property'
const isMarket = (t: string) => t === 'shares' || t === 'etf'

const emptyForm = {
  name: '', assetType: 'cash_account', currentValue: '', purchaseValue: '', purchaseDate: '', growthRate: '',
  incomeRate: '', ongoingCostAnnual: '', quantity: '', unitCode: '', upfrontCost: '', notes: '', isProvisional: false, acquisitionDate: '',
  createLiability: false,
  liability: { name: '', liabilityType: 'mortgage', currentBalance: '', originalAmount: '', interestRate: '', termMonths: '', repaymentAmount: '', repaymentFrequency: 'monthly' },
}

export function AssetsClient() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form, setForm] = useState<any>({ ...emptyForm })

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/assets')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAssets(data.assets); setSummary(data.summary)
    } catch { toast.error('Failed to load assets') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, liability: { ...emptyForm.liability } }); setShowAdd(true) }
  const openEdit = (a: Asset) => {
    setEditing(a)
    setForm({
      ...emptyForm,
      name: a.name, assetType: a.assetType, currentValue: String(a.currentValue ?? ''), purchaseValue: a.purchaseValue != null ? String(a.purchaseValue) : '',
      purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '', growthRate: String(a.growthRate ?? ''), incomeRate: String(a.incomeRate ?? ''),
      ongoingCostAnnual: String(a.ongoingCostAnnual ?? ''), quantity: a.quantity != null ? String(a.quantity) : '', unitCode: a.unitCode ?? '',
      upfrontCost: String(a.upfrontCost ?? ''), notes: a.notes ?? '', isProvisional: a.isProvisional, acquisitionDate: a.acquisitionDate ? a.acquisitionDate.slice(0, 10) : '',
      liability: { ...emptyForm.liability },
    })
    setShowAdd(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = editing
        ? await fetch(`/api/assets/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        : await fetch('/api/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      toast.success(editing ? 'Asset updated' : 'Asset added')
      setShowAdd(false); setEditing(null); fetchData()
    } catch { toast.error('Failed to save asset') }
    finally { setSaving(false) }
  }

  const handleDelete = async (a: Asset) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    try { await fetch(`/api/assets/${a.id}`, { method: 'DELETE' }); toast.success('Asset deleted'); fetchData() }
    catch { toast.error('Failed to delete') }
  }

  const current = assets.filter((a) => !a.isProvisional)
  const provisional = assets.filter((a) => a.isProvisional)

  const AssetCard = ({ a }: { a: Asset }) => {
    const Icon = typeMeta(a.assetType).icon
    return (
      <Card className="group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{a.name}</p>
                {a.isProvisional && <Badge variant="secondary" className="text-xs">Planned</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{typeMeta(a.assetType).label}{a.unitCode ? ` · ${a.unitCode}` : ''}{a.quantity ? ` · ${a.quantity} units` : ''}</p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(a)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div><p className="text-[11px] text-muted-foreground">Value</p><p className="font-mono text-sm font-semibold"><SafeNumber value={a.currentValue} currency="AUD" /></p></div>
            <div><p className="text-[11px] text-muted-foreground">Debt</p><p className="font-mono text-sm font-semibold text-destructive">{a.linkedLiabilityBalance ? <SafeNumber value={a.linkedLiabilityBalance} currency="AUD" /> : '–'}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Equity</p><p className="font-mono text-sm font-semibold text-primary"><SafeNumber value={a.equity} currency="AUD" /></p></div>
          </div>
          {(a.growthRate > 0 || a.incomeRate > 0) && (
            <div className="flex gap-3 mt-3 text-[11px] text-muted-foreground">
              {a.growthRate > 0 && <span>Growth {a.growthRate}% p.a.</span>}
              {a.incomeRate > 0 && <span>Income {a.incomeRate}% p.a.</span>}
              {a.linkedLiabilityName && <span className="truncate">Loan: {a.linkedLiabilityName}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Building2 className="h-6 w-6" /> Assets</h1>
            <p className="text-muted-foreground text-sm mt-1">Property, shares, ETFs and investments — with the debt behind them.</p>
          </div>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add asset</Button>
        </div>
      </FadeIn>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <>
          <Stagger className="grid gap-4 sm:grid-cols-3">
            <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total asset value</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={summary?.totalValue ?? 0} currency="AUD" /></p></CardContent></Card></StaggerItem>
            <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total equity</p><p className="font-mono text-2xl font-bold mt-1 text-primary"><SafeNumber value={summary?.totalEquity ?? 0} currency="AUD" /></p></CardContent></Card></StaggerItem>
            <StaggerItem><Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Est. income p.a.</p><p className="font-mono text-2xl font-bold mt-1"><SafeNumber value={summary?.annualIncome ?? 0} currency="AUD" /></p></CardContent></Card></StaggerItem>
          </Stagger>

          {current.length === 0 && provisional.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-muted-foreground"><Coins className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No assets yet. Add your home, shares or investments to build your net-worth picture.</p></CardContent></Card>
          ) : (
            <>
              {current.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{current.map((a) => <AssetCard key={a.id} a={a} />)}</div>}
              {provisional.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground mb-3 mt-2">Planned / future assets</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{provisional.map((a) => <AssetCard key={a.id} a={a} />)}</div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent aria-describedby="asset-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit asset' : 'Add asset'}</DialogTitle></DialogHeader>
          <p id="asset-dialog-description" className="sr-only">Add or edit an asset and its details.</p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 12 Smith St" /></div>
              <div className="space-y-1.5"><Label>Type</Label>
                <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Current value (A$)</Label><Input type="number" value={form.currentValue} onChange={(e) => setForm({ ...form, currentValue: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Purchase value (A$)</Label><Input type="number" value={form.purchaseValue} onChange={(e) => setForm({ ...form, purchaseValue: e.target.value })} /></div>
            </div>
            {isMarket(form.assetType) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Ticker / code</Label><Input value={form.unitCode} onChange={(e) => setForm({ ...form, unitCode: e.target.value })} placeholder="e.g. VAS" /></div>
                <div className="space-y-1.5"><Label>Quantity (units)</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Growth % p.a.</Label><Input type="number" value={form.growthRate} onChange={(e) => setForm({ ...form, growthRate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{isProperty(form.assetType) ? 'Rent yield %' : 'Income % p.a.'}</Label><Input type="number" value={form.incomeRate} onChange={(e) => setForm({ ...form, incomeRate: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Costs p.a. (A$)</Label><Input type="number" value={form.ongoingCostAnnual} onChange={(e) => setForm({ ...form, ongoingCostAnnual: e.target.value })} /></div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><Label>Planned / future asset</Label><p className="text-xs text-muted-foreground">Model an asset you intend to acquire</p></div>
              <Switch checked={form.isProvisional} onCheckedChange={(v) => setForm({ ...form, isProvisional: v })} />
            </div>
            {form.isProvisional && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Acquisition date</Label><Input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Upfront cost (A$)</Label><Input type="number" value={form.upfrontCost} onChange={(e) => setForm({ ...form, upfrontCost: e.target.value })} placeholder="stamp duty, fees" /></div>
              </div>
            )}

            {!editing && (
              <>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div><Label>Add associated liability</Label><p className="text-xs text-muted-foreground">Create a mortgage/loan linked to this asset</p></div>
                  <Switch checked={form.createLiability} onCheckedChange={(v) => setForm({ ...form, createLiability: v })} />
                </div>
                {form.createLiability && (
                  <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><Label>Loan name</Label><Input value={form.liability.name} onChange={(e) => setForm({ ...form, liability: { ...form.liability, name: e.target.value } })} placeholder="Home loan" /></div>
                      <div className="space-y-1.5"><Label>Balance (A$)</Label><Input type="number" value={form.liability.currentBalance} onChange={(e) => setForm({ ...form, liability: { ...form.liability, currentBalance: e.target.value } })} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5"><Label>Rate %</Label><Input type="number" value={form.liability.interestRate} onChange={(e) => setForm({ ...form, liability: { ...form.liability, interestRate: e.target.value } })} /></div>
                      <div className="space-y-1.5"><Label>Term (mo)</Label><Input type="number" value={form.liability.termMonths} onChange={(e) => setForm({ ...form, liability: { ...form.liability, termMonths: e.target.value } })} /></div>
                      <div className="space-y-1.5"><Label>Repayment</Label><Input type="number" value={form.liability.repaymentAmount} onChange={(e) => setForm({ ...form, liability: { ...form.liability, repaymentAmount: e.target.value } })} /></div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save' : 'Add asset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
