import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardCheck, Edit2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export function StockTab({ variant, data, onRefetch }: any) {
  const { stockTxns, stockLevel } = data
  const historicalMismatchesById = new Map<string, {
    recordedBalanceAfter: number
    ledgerBalance: number
    resolution?: { reason: string }
  }>(
    (stockLevel?.historicalMismatches ?? []).map((mismatch: any) => [
      mismatch.id,
      {
        recordedBalanceAfter: mismatch.recordedBalanceAfter,
        ledgerBalance: mismatch.ledgerBalance,
        resolution: mismatch.resolution,
      },
    ]),
  )
  const [showAdjust, setShowAdjust] = useState(false)
  const [showStocktake, setShowStocktake] = useState(false)
  const [showThreshold, setShowThreshold] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const [showResolveHistory, setShowResolveHistory] = useState(false)
  const [selectedMismatch, setSelectedMismatch] = useState<any>(null)
  const [form, setForm] = useState({ amount: '', isAdd: true, notes: '' })
  const [countedQuantity, setCountedQuantity] = useState('')
  const [threshold, setThreshold] = useState(String(stockLevel?.reorderThreshold ?? 5))
  const [resolutionReason, setResolutionReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdjust = async () => {
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    
    setSaving(true)
    try {
      const res = await fetch('/api/stock-transactions', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          medicationId: variant.id, 
          type: form.isAdd ? 'adjustment' : 'consume', 
          quantityChange: form.isAdd ? amt : -amt, 
          notes: form.notes || (form.isAdd ? 'Manual addition' : 'Manual consumption') 
        }) 
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to adjust stock')
      }
      toast.success('Stock adjusted')
      setShowAdjust(false)
      setForm({ amount: '', isAdd: true, notes: '' })
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to adjust stock')
    } finally {
      setSaving(false)
    }
  }

  const handleStocktake = async () => {
    const counted = parseFloat(countedQuantity)
    if (isNaN(counted) || counted < 0) return toast.error('Enter a valid counted quantity')
    setSaving(true)
    try {
      const res = await fetch('/api/stock-transactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicationId: variant.id, type: 'stocktake', countedQuantity: counted, notes: 'Stocktake' }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || err.message || 'Failed to record stocktake') }
      toast.success('Stocktake recorded')
      setShowStocktake(false); setCountedQuantity(''); onRefetch()
    } catch (e: any) { toast.error(e.message || 'Failed to record stocktake') }
    finally { setSaving(false) }
  }

  const handleThreshold = async () => {
    const reorderThreshold = parseFloat(threshold)
    if (isNaN(reorderThreshold) || reorderThreshold < 0) return toast.error('Enter a valid reorder threshold')
    if (!stockLevel?.id) return toast.error('Stock level was not found')
    setSaving(true)
    try {
      const res = await fetch('/api/stock-levels', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stockLevel.id, reorderThreshold }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || err.message || 'Failed to update reorder threshold') }
      toast.success('Reorder threshold updated')
      setShowThreshold(false); onRefetch()
    } catch (e: any) { toast.error(e.message || 'Failed to update reorder threshold') }
    finally { setSaving(false) }
  }

  const handleReconcile = async () => {
    if (!stockLevel?.id || !stockLevel?.hasMismatch || stockLevel?.hasHistoricalInconsistency) return
    setSaving(true)
    try {
      const res = await fetch('/api/stock-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reconcile',
          id: stockLevel.id,
          expectedCurrentQuantity: stockLevel.currentQuantity,
          expectedLedgerQuantity: stockLevel.ledgerQuantity,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to reconcile stock')
      }
      toast.success('Historical stock mismatch reconciled and recorded')
      setShowReconcile(false)
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to reconcile stock')
    } finally {
      setSaving(false)
    }
  }

  const handleResolveHistory = async () => {
    if (!stockLevel?.id || !selectedMismatch) return
    const reason = resolutionReason.trim()
    if (!reason) return toast.error('Enter a reason for this review')
    setSaving(true)
    try {
      const res = await fetch('/api/stock-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_mismatch',
          id: stockLevel.id,
          mismatchId: selectedMismatch.id,
          expectedRecordedBalance: selectedMismatch.recordedBalanceAfter,
          expectedLedgerBalance: selectedMismatch.ledgerBalance,
          reason,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (res.status === 409 && err.diagnostic) {
          setShowResolveHistory(false)
          setSelectedMismatch(null)
          setResolutionReason('')
          await onRefetch()
        }
        throw new Error(err.error || err.message || 'Failed to record stock history review')
      }
      toast.success('Stock history review recorded')
      setShowResolveHistory(false)
      setSelectedMismatch(null)
      setResolutionReason('')
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record stock history review')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/50 bg-card p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Current Stock</div>
          <div className="text-5xl font-display font-semibold text-foreground tracking-tight">{stockLevel?.currentQuantity || 0}</div>
          <div className="text-sm text-muted-foreground mt-2">Low stock alert at {stockLevel?.reorderThreshold || 5}</div>
          {stockLevel?.hasHistoricalInconsistency ? (
            <>
              <div className="mt-4 flex max-w-lg min-w-0 items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  Stock history needs review: {stockLevel.historicalBalanceMismatchCount} historical balance snapshot{stockLevel.historicalBalanceMismatchCount === 1 ? '' : 's'} do not match the cumulative ledger changes.
                  Do not reconcile this stock level until the history has been reviewed.
                </span>
              </div>
              <div className="mt-3 max-w-lg min-w-0 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm">
                <div className="mb-2 font-medium text-red-100">Entries needing review</div>
                <div className="min-w-0 space-y-2">
                   {stockLevel.historicalMismatches.filter((mismatch: any) => !mismatch.resolution).map((mismatch: any) => (
                    <div key={mismatch.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-red-100/90">
                       <span>{format(new Date(mismatch.date), "d MMM yyyy, HH:mm")}</span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span>Recorded: <strong>{mismatch.recordedBalanceAfter}</strong></span>
                        <span>Ledger: <strong>{mismatch.ledgerBalance}</strong></span>
                         <Button
                           variant="outline"
                           size="sm"
                           className="h-7 w-full border-red-500/40 text-red-200 hover:bg-red-500/10 sm:w-auto"
                           onClick={() => {
                             setSelectedMismatch(mismatch)
                             setResolutionReason('')
                             setShowResolveHistory(true)
                           }}
                         >
                           Review entry
                         </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : stockLevel?.hasMismatch && (
            <div className="mt-4 flex max-w-lg min-w-0 items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">
                Historical ledger mismatch: the ledger totals {stockLevel.ledgerQuantity}, while current stock is {stockLevel.currentQuantity}.
                Review and reconcile only if this ledger balance is correct.
              </span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => { setThreshold(String(stockLevel?.reorderThreshold ?? 5)); setShowThreshold(true) }}>
            <Edit2 className="w-4 h-4 mr-2" /> Alert threshold
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setShowStocktake(true)}>
            <ClipboardCheck className="w-4 h-4 mr-2" /> Stocktake
          </Button>
          <Button onClick={() => setShowAdjust(true)} className="w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto">
            <Edit2 className="w-4 h-4 mr-2" /> Adjust stock
          </Button>
          {stockLevel?.hasMismatch && !stockLevel?.hasHistoricalInconsistency && (
            <Button variant="outline" onClick={() => setShowReconcile(true)} className="w-full border-amber-500/40 text-amber-200 hover:bg-amber-500/10 sm:w-auto">
              <AlertTriangle className="w-4 h-4 mr-2" /> Review mismatch
            </Button>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Adjustment History</h4>
        {stockTxns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock history recorded.</p>
        ) : (
          <div className="space-y-3">
            {stockTxns.map((tx: any) => {
              const isPositive = tx.quantityChange >= 0
              const historicalMismatch = historicalMismatchesById.get(tx.id)
              return (
                <div key={tx.id} className="border border-border/50 rounded-xl p-4 flex items-center justify-between bg-card">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {isPositive ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`font-semibold text-lg ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {isPositive ? '+' : ''}{tx.quantityChange}
                        </span>
                        <Badge variant="secondary" className="bg-violet-500/10 text-violet-300 font-normal capitalize">
                          {tx.type}
                        </Badge>
                         {historicalMismatch && !historicalMismatch.resolution && (
                          <Badge variant="outline" className="border-red-500/40 text-red-300 font-normal">
                            Needs review
                          </Badge>
                        )}
                         {historicalMismatch?.resolution && (
                           <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 font-normal">
                             Reviewed
                           </Badge>
                         )}
                        <span className="text-muted-foreground text-sm flex items-center gap-2">
                          <span className="text-border">→</span> {tx.balanceAfter} in stock
                        </span>
                      </div>
                      {historicalMismatch && (
                        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-red-300">
                          <span>Recorded balance: <strong>{historicalMismatch.recordedBalanceAfter}</strong></span>
                          <span>Ledger balance: <strong>{historicalMismatch.ledgerBalance}</strong></span>
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        {format(new Date(tx.date), "d MMM yyyy, HH:mm")}
                        {tx.notes && <><span className="w-1 h-1 rounded-full bg-border" /> <span>{tx.notes}</span></>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={showAdjust} onOpenChange={setShowAdjust}>
        <DialogContent aria-describedby="adjust-stock-description" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <p id="adjust-stock-description" className="text-sm text-muted-foreground">Add or use stock and record the change in the ledger.</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button 
                variant="ghost" 
                size="sm" 
                className={`flex-1 ${form.isAdd ? 'bg-background shadow-sm' : ''}`}
                onClick={() => setForm({ ...form, isAdd: true })}
              >
                Add Stock
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className={`flex-1 ${!form.isAdd ? 'bg-background shadow-sm' : ''}`}
                onClick={() => setForm({ ...form, isAdd: false })}
              >
                Use Stock
              </Button>
            </div>
            
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input 
                type="number" 
                value={form.amount} 
                onChange={e => setForm({...form, amount: e.target.value})} 
                placeholder={form.isAdd ? "e.g. 30" : "e.g. 1"} 
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input 
                value={form.notes} 
                onChange={e => setForm({...form, notes: e.target.value})} 
                placeholder={form.isAdd ? "Refill from pharmacy" : "Taken early"} 
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">Save adjustment</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showStocktake} onOpenChange={setShowStocktake}>
        <DialogContent aria-describedby="stocktake-description" className="max-w-sm">
          <DialogHeader><DialogTitle>Record stocktake</DialogTitle><p id="stocktake-description" className="text-sm text-muted-foreground">Set stock to the quantity you physically counted.</p></DialogHeader>
          <div className="space-y-2 py-2"><Label>Counted quantity</Label><Input type="number" min="0" value={countedQuantity} onChange={e => setCountedQuantity(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowStocktake(false)}>Cancel</Button><Button disabled={saving} onClick={handleStocktake} className="bg-violet-600 hover:bg-violet-700 text-white">Save stocktake</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={showThreshold} onOpenChange={setShowThreshold}>
        <DialogContent aria-describedby="threshold-description" className="max-w-sm">
          <DialogHeader><DialogTitle>Reorder threshold</DialogTitle><p id="threshold-description" className="text-sm text-muted-foreground">Get a low-stock alert at this quantity.</p></DialogHeader>
          <div className="space-y-2 py-2"><Label>Quantity</Label><Input type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} /></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowThreshold(false)}>Cancel</Button><Button disabled={saving} onClick={handleThreshold} className="bg-violet-600 hover:bg-violet-700 text-white">Save threshold</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={showReconcile} onOpenChange={setShowReconcile}>
        <DialogContent aria-describedby="reconcile-stock-description" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review stock mismatch</DialogTitle>
            <p id="reconcile-stock-description" className="text-sm text-muted-foreground">
              This will not delete or rewrite history. It will set current stock to the ledger total and append an audited adjustment entry.
            </p>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Current stock</span><strong>{stockLevel?.currentQuantity}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Ledger total</span><strong>{stockLevel?.ledgerQuantity}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Adjustment to record</span><strong>{stockLevel && stockLevel.mismatchQuantity >= 0 ? '+' : ''}{stockLevel?.mismatchQuantity}</strong></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowReconcile(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleReconcile} className="bg-violet-600 hover:bg-violet-700 text-white">Confirm reconciliation</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showResolveHistory} onOpenChange={setShowResolveHistory}>
        <DialogContent aria-describedby="resolve-stock-history-description" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review historical entry</DialogTitle>
            <p id="resolve-stock-history-description" className="text-sm text-muted-foreground">
              This keeps the original transaction unchanged and appends an auditable review entry.
            </p>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Entry date</span><strong>{selectedMismatch && format(new Date(selectedMismatch.date), "d MMM yyyy, HH:mm")}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Recorded balance</span><strong>{selectedMismatch?.recordedBalanceAfter}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Ledger balance</span><strong>{selectedMismatch?.ledgerBalance}</strong></div>
          </div>
          <div className="space-y-2 py-2">
            <Label htmlFor="stock-history-resolution-reason">Reason for review</Label>
            <Textarea
              id="stock-history-resolution-reason"
              value={resolutionReason}
              onChange={event => setResolutionReason(event.target.value)}
              placeholder="Explain why the ledger balance is the reviewed value."
              maxLength={2000}
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowResolveHistory(false)}>Cancel</Button>
            <Button disabled={saving} onClick={handleResolveHistory} className="bg-violet-600 hover:bg-violet-700 text-white">Save review</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
