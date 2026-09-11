'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Plus, Search, ArrowDownLeft, ArrowUpRight, History, Percent, ExternalLink, RefreshCw, Upload, FileText } from 'lucide-react'
import { SafeDate, SafeNumber } from '@/components/safe-format'
import { FadeIn } from '@/components/ui/animate'
import { toast } from 'sonner'

type Debt = { id: string; personId: string; direction: 'they_owe_me' | 'i_owe_them'; principalAmount: number; currency: string; startDate: string; dueDate?: string | null; householdId?: string | null; householdMembershipId?: string | null; interestAnnualRate?: number | null; interestStartDate?: string | null; notes?: string | null; person?: any; household?: any }
type Movement = { id: string; type: string; amount: number; effectiveAt: string; note?: string | null; transaction?: any; householdExpense?: any; householdSettlement?: any }
type Form = { personId: string; direction: string; principalAmount: string; currency: string; startDate: string; dueDate: string; householdId: string; householdMembershipId: string; interestAnnualRate: string; interestStartDate: string; notes: string }
const blank: Form = { personId: '', direction: 'they_owe_me', principalAmount: '', currency: 'AUD', startDate: '', dueDate: '', householdId: '', householdMembershipId: '', interestAnnualRate: '', interestStartDate: '', notes: '' }

const nameOf = (x: any) => x?.name ?? x?.fullName ?? x?.displayName ?? 'Unknown person'
const errorText = async (r: Response) => { try { const x = await r.json(); return x?.error?.message ?? x?.error ?? 'Request failed' } catch { return 'Request failed' } }

export function DebtsClient() {
  const [debts, setDebts] = useState<Debt[]>([]); const [people, setPeople] = useState<any[]>([]); const [households, setHouseholds] = useState<any[]>([]); const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true); const [query, setQuery] = useState(''); const [error, setError] = useState('')
  const [form, setForm] = useState<Form>({ ...blank }); const [createOpen, setCreateOpen] = useState(false); const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Debt | null>(null); const [detail, setDetail] = useState<any>(null); const [movementOpen, setMovementOpen] = useState(false)
  const [movement, setMovement] = useState({ type: 'repayment', amount: '', effectiveAt: '', note: '', transactionId: '' })
  const [interestOpen, setInterestOpen] = useState(false); const [throughDate, setThroughDate] = useState(''); const [preview, setPreview] = useState<any>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const r = await fetch(`/api/debts?search=${encodeURIComponent(query)}`); if (!r.ok) throw new Error(await errorText(r)); const d = await r.json(); setDebts(d.debts ?? []); setPeople(d.people ?? []); setHouseholds(d.households ?? []); setTransactions(d.transactions ?? []) }
    catch (e: any) { setError(e.message ?? 'Unable to load shared debts'); toast.error(e.message ?? 'Unable to load shared debts') } finally { setLoading(false) }
  }, [query])
  useEffect(() => { void load() }, [load])
  const openDetail = async (d: Debt) => { setSelected(d); setDetail(null); try { const r = await fetch(`/api/debts/${d.id}`); if (!r.ok) throw new Error(await errorText(r)); setDetail(await r.json()) } catch { toast.error('Unable to load debt history') } }
  const saveDebt = async () => {
    if (!form.personId || !form.principalAmount || !form.startDate) { toast.error('Person, amount and start date are required'); return }
    setSaving(true); try { const payload: any = { ...form, principalAmount: Number(form.principalAmount), direction: form.direction }; Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k] }); const r = await fetch('/api/debts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!r.ok) throw new Error(await errorText(r)); toast.success('Shared debt added'); setCreateOpen(false); setForm({ ...blank }); void load() } catch (e: any) { toast.error(e.message ?? 'Unable to add debt') } finally { setSaving(false) }
  }
  const saveMovement = async () => {
    if (!selected || !movement.amount || !movement.effectiveAt) { toast.error('Amount and effective date are required'); return }
    setSaving(true); try { const payload: any = { ...movement, amount: Number(movement.amount) }; if (!payload.transactionId) delete payload.transactionId; const r = await fetch(`/api/debts/${selected.id}/movements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!r.ok) throw new Error(await errorText(r)); toast.success('Movement recorded'); setMovementOpen(false); setMovement({ type: 'repayment', amount: '', effectiveAt: '', note: '', transactionId: '' }); await load(); await openDetail(selected) } catch (e: any) { toast.error(e.message ?? 'Unable to record movement') } finally { setSaving(false) }
  }
  const previewInterest = async () => { if (!selected || !throughDate) return; try { const r = await fetch(`/api/debts/${selected.id}/interest/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ throughDate }) }); if (!r.ok) throw new Error(await errorText(r)); setPreview(await r.json()) } catch (e: any) { toast.error(e.message ?? 'Unable to preview interest') } }
  const confirmInterest = async () => { if (!selected || !preview?.previewToken) return; setSaving(true); try { const r = await fetch(`/api/debts/${selected.id}/interest/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewToken: preview.previewToken }) }); if (!r.ok) throw new Error(await errorText(r)); toast.success('Interest confirmed'); setInterestOpen(false); setPreview(null); await load(); await openDetail(selected) } catch (e: any) { toast.error(e.message ?? 'Unable to confirm interest') } finally { setSaving(false) } }
  const openReceipt = async (movementId: string) => {
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    try {
      const r = await fetch(`/api/debts/${selected?.id}/receipts/${movementId}`)
      if (!r.ok) throw new Error(await errorText(r))
      const data = await r.json()
      if (!data.url) throw new Error('Receipt is no longer available')
      if (popup) popup.location.href = data.url
      else window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      popup?.close()
      toast.error(e.message ?? 'Receipt is no longer available')
    }
  }
  const uploadReceipt = async (movementId: string, file: File) => {
    if (!selected) return
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Choose a PDF, PNG, JPEG, or WebP receipt')
      return
    }
    setUploadingReceipt(movementId)
    try {
      const bytes = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const prepare = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, byteSize: file.size, sha256, isPublic: false }),
      })
      if (!prepare.ok) throw new Error(await errorText(prepare))
      const upload = await prepare.json()
      const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.uploadHeaders, body: file })
      if (!put.ok) throw new Error('Private receipt upload failed')
      const attach = await fetch(`/api/debts/${selected.id}/receipts/${movementId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: upload.uploadId }),
      })
      if (!attach.ok) throw new Error(await errorText(attach))
      toast.success('Receipt attached privately')
      await openDetail(selected)
    } catch (e: any) {
      toast.error(e.message ?? 'Unable to attach receipt')
    } finally {
      setUploadingReceipt(null)
    }
  }
  const person = (d: Debt) => d.person ?? people.find(p => p.id === d.personId)
  const household = (d: Debt) => d.household ?? households.find(h => h.id === d.householdId)
  const movementTransaction = (m: Movement) => m.transaction ?? m.householdExpense?.linkedTransaction

  return <div className="space-y-6">
    <FadeIn><div className="flex items-center justify-between flex-wrap gap-4"><div><h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> Shared debts</h1><p className="text-muted-foreground text-sm mt-1">A clear record of money shared with people and households.</p></div><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add shared debt</Button></div></FadeIn>
    <div className="flex gap-2"><div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search shared debts" className="pl-9" placeholder="Search people or households…" value={query} onChange={e => setQuery(e.target.value)} /></div><Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh debts"><RefreshCw className="h-4 w-4" /></Button></div>
    {error && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
    {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-44" />)}</div> : debts.length === 0 ? <Card><CardContent className="p-12 text-center text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-3 opacity-40" /><p>No shared debts recorded yet.</p><Button className="mt-4" onClick={() => setCreateOpen(true)}>Add your first debt</Button></CardContent></Card> :
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{debts.map(d => <Card key={d.id} className="group cursor-pointer hover:border-primary/50" onClick={() => void openDetail(d)}><CardContent className="p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-medium truncate">{nameOf(person(d))}</p><p className="text-xs text-muted-foreground">{household(d) ? nameOf(household(d)) : 'Personal'}</p></div><Badge variant={d.direction === 'they_owe_me' ? 'default' : 'secondary'}>{d.direction === 'they_owe_me' ? <ArrowDownLeft className="h-3 w-3 mr-1" /> : <ArrowUpRight className="h-3 w-3 mr-1" />}{d.direction === 'they_owe_me' ? 'They owe me' : 'I owe them'}</Badge></div><p className="font-mono text-2xl font-bold mt-5"><SafeNumber value={d.principalAmount} currency={d.currency} /></p><p className="text-xs text-muted-foreground mt-2">Started <SafeDate date={d.startDate} options={{ dateStyle: 'medium' }} />{d.dueDate && <> · due <SafeDate date={d.dueDate} options={{ dateStyle: 'medium' }} /></>}</p>{d.interestAnnualRate != null && <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Percent className="h-3 w-3" /> Interest is manual · {d.interestAnnualRate}% p.a.</p>}</CardContent></Card>)}</div>}

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent aria-describedby="create-debt-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Add shared debt</DialogTitle></DialogHeader><p id="create-debt-dialog-description" className="sr-only">Add a shared debt and its terms.</p><div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><div><Label>Person *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.personId} onChange={e => setForm({ ...form, personId: e.target.value })}><option value="">Select person</option>{people.map(p => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select></div><div><Label>Direction *</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="they_owe_me">They owe me</option><option value="i_owe_them">I owe them</option></select></div></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>Principal amount *</Label><Input type="number" min="0" step="0.01" value={form.principalAmount} onChange={e => setForm({ ...form, principalAmount: e.target.value })} /></div><div><Label>Currency</Label><Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>Start date *</Label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div><div><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></div></div>
      <div><Label>Household</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.householdId} onChange={e => setForm({ ...form, householdId: e.target.value })}><option value="">Personal</option>{households.map(h => <option key={h.id} value={h.id}>{nameOf(h)}</option>)}</select></div>
      <div className="rounded-lg border p-3 space-y-3"><p className="text-xs font-medium">Optional interest (never applied automatically)</p><div className="grid grid-cols-2 gap-3"><div><Label>Annual rate %</Label><Input type="number" min="0" step="0.01" value={form.interestAnnualRate} onChange={e => setForm({ ...form, interestAnnualRate: e.target.value })} /></div><div><Label>Interest starts</Label><Input type="date" value={form.interestStartDate} onChange={e => setForm({ ...form, interestStartDate: e.target.value })} /></div></div></div><div><Label>Notes</Label><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => void saveDebt()} loading={saving}>Add debt</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
      <DialogContent aria-describedby="debt-detail-dialog-description" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{selected && nameOf(person(selected))}</DialogTitle></DialogHeader>
        <p id="debt-detail-dialog-description" className="sr-only">View and manage this person’s shared debt.</p>
        {selected && (
          <div className="space-y-4">
            {!detail ? <Skeleton className="h-40" /> : (
              <>
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">Current balance</p>
                  <p className="font-mono text-2xl font-bold"><SafeNumber value={detail.balance ?? selected.principalAmount} currency={selected.currency} /></p>
                  <p className="text-xs text-muted-foreground mt-2">{detail.explanation ?? 'Balance based on recorded movements.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setMovementOpen(true)}><History className="h-4 w-4 mr-1" /> Record movement</Button>
                  {selected.interestAnnualRate != null && <Button size="sm" variant="outline" onClick={() => { setThroughDate(''); setPreview(null); setInterestOpen(true) }}><Percent className="h-4 w-4 mr-1" /> Preview interest</Button>}
                </div>
                <div>
                  <h3 className="font-medium mb-2">History</h3>
                  {(detail.movements ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No movements recorded.</p> : (
                    <div className="space-y-2">{detail.movements.map((m: Movement) => (
                      <div key={m.id} className="flex justify-between gap-3 border-b pb-2 text-sm">
                         <div><Badge variant="outline" className="mr-2 capitalize">{m.type}</Badge>{m.note ?? ''}
                            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><SafeDate date={m.effectiveAt} options={{ dateStyle: 'medium' }} />{movementTransaction(m)?.receiptPath && <button type="button" className="text-primary hover:underline inline-flex items-center gap-1" onClick={() => void openReceipt(m.id)}>View receipt <ExternalLink className="h-3 w-3" /></button>}{movementTransaction(m) && !movementTransaction(m)?.receiptPath && <><label htmlFor={`receipt-${m.id}`} className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1"><Upload className="h-3 w-3" />{uploadingReceipt === m.id ? 'Uploading…' : 'Upload receipt'}</label><input id={`receipt-${m.id}`} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" disabled={uploadingReceipt !== null} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadReceipt(m.id, file) }} /></>}{!movementTransaction(m) && <span className="text-muted-foreground inline-flex items-center gap-1"><FileText className="h-3 w-3" /> No linked transaction</span>}{m.householdSettlement?.id && <span className="ml-2 text-muted-foreground">Household settlement linked</span>}</p>
                        </div>
                        <span className="font-mono"><SafeNumber value={m.amount} currency={selected.currency} /></span>
                      </div>
                    ))}</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

     <Dialog open={movementOpen} onOpenChange={setMovementOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Record movement</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Type</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={movement.type} onChange={e => setMovement({ ...movement, type: e.target.value })}><option value="advance">Advance</option><option value="repayment">Repayment</option><option value="adjustment">Adjustment</option></select></div><div><Label>Amount</Label><Input type="number" min="0" step="0.01" value={movement.amount} onChange={e => setMovement({ ...movement, amount: e.target.value })} /></div><div><Label>Effective date *</Label><Input type="date" value={movement.effectiveAt} onChange={e => setMovement({ ...movement, effectiveAt: e.target.value })} /></div><div><Label>Source transaction / receipt</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={movement.transactionId} onChange={e => setMovement({ ...movement, transactionId: e.target.value })}><option value="">None</option>{transactions.map(t => <option key={t.id} value={t.id}>{t.date?.slice(0, 10)} · {t.merchant ?? t.description ?? 'Transaction'} · {t.amount}</option>)}</select><p className="text-xs text-muted-foreground mt-1">Link an existing transaction to keep its receipt evidence with this movement.</p></div><div><Label>Note</Label><Input value={movement.note} onChange={e => setMovement({ ...movement, note: e.target.value })} /></div></div><DialogFooter><Button onClick={() => void saveMovement()} loading={saving}>Record</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={interestOpen} onOpenChange={setInterestOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Preview interest</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">Interest is only added after you review and explicitly confirm this preview.</p><div><Label>Calculate through</Label><Input type="date" value={throughDate} onChange={e => setThroughDate(e.target.value)} /></div>{preview && <div className="rounded-lg border p-3 text-sm"><p>Preview amount</p><p className="font-mono text-xl font-bold"><SafeNumber value={preview.amount ?? preview.interestAmount ?? 0} currency={selected?.currency ?? 'AUD'} /></p><p className="text-xs text-muted-foreground mt-1">{preview.explanation ?? 'Calculated from the debt terms.'}</p></div>}</div><DialogFooter><Button variant="outline" onClick={() => void previewInterest()}>Preview</Button>{preview && <Button onClick={() => void confirmInterest()} loading={saving}>Confirm interest</Button>}</DialogFooter></DialogContent></Dialog>
  </div>
}