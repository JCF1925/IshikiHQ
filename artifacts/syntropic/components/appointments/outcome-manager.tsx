import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileEdit, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export function OutcomeManager({ appointment, careData, open, onOpenChange, onRefresh }: any) {
  // Find current outcome (one that is not superseded by another)
  const outcomes = careData?.outcomes?.filter((o: any) => o.appointmentId === appointment?.id) || []
  const currentOutcome = outcomes.find((o: any) => !outcomes.some((other: any) => other.supersedesId === o.id))
  
  const [form, setForm] = useState({
    outcome: '', followUp: '', discussedItems: [] as string[],
    referrals: [] as string[], pathologyRequests: [] as string[], medicationChanges: [] as string[], futureTasks: [] as string[],
    payment: { status: '', amount: '', method: '' },
  })
  
  const [newItem, setNewItem] = useState({ discussed: '', referral: '', pathology: '', med: '', task: '' })
  const [saving, setSaving] = useState(false)

  // Reset form when opened or when currentOutcome changes
  useEffect(() => {
    if (open) {
      if (currentOutcome) {
        setForm({
          outcome: currentOutcome.outcome || '',
          followUp: currentOutcome.followUp || '',
          discussedItems: currentOutcome.discussedItems || [],
          referrals: currentOutcome.referrals || [],
          pathologyRequests: currentOutcome.pathologyRequests || [],
          medicationChanges: currentOutcome.medicationChanges || [],
          futureTasks: currentOutcome.futureTasks || [],
          payment: {
            status: currentOutcome.payment?.status || '',
            amount: currentOutcome.payment?.amount != null ? String(currentOutcome.payment.amount) : '',
            method: currentOutcome.payment?.method || '',
          },
        })
      } else {
        setForm({ outcome: '', followUp: '', discussedItems: [], referrals: [], pathologyRequests: [], medicationChanges: [], futureTasks: [], payment: { status: '', amount: '', method: '' } })
      }
      setNewItem({ discussed: '', referral: '', pathology: '', med: '', task: '' })
    }
  }, [open, currentOutcome])

  if (!appointment) return null

  const formatRecordedAt = (recordedAt: string | null | undefined) => {
    if (!recordedAt) return 'Date not recorded'
    const date = new Date(recordedAt)
    return Number.isNaN(date.getTime())
      ? 'Date not recorded'
      : date.toLocaleDateString('en-AU', { dateStyle: 'medium', timeZone: 'UTC' })
  }

  const renderHistoryList = (label: string, values: unknown) => {
    if (!Array.isArray(values) || values.length === 0) return null
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}:</span> {values.join(', ')}
      </p>
    )
  }

  const saveOutcome = async () => {
    if (!form.outcome.trim()) return toast.error('Outcome summary is required')
    setSaving(true)
    try {
      const res = await fetch('/api/appointment-care/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          outcome: form.outcome,
          followUp: form.followUp,
          discussedItems: form.discussedItems,
           payment: form.payment.status || form.payment.amount || form.payment.method ? { ...form.payment, amount: form.payment.amount ? Number(form.payment.amount) : null } : null,
          referrals: form.referrals,
           pathologyRequests: form.pathologyRequests,
          medicationChanges: form.medicationChanges,
          futureTasks: form.futureTasks,
          supersedesId: currentOutcome?.id || undefined
        })
      })
      if (!res.ok) throw new Error()
      toast.success(currentOutcome ? 'Outcome corrected' : 'Outcome recorded')
      onRefresh()
      onOpenChange(false)
    } catch {
      toast.error('Failed to save outcome')
    } finally {
      setSaving(false)
    }
  }

  const addToList = (field: keyof typeof form, itemField: keyof typeof newItem) => {
    const val = newItem[itemField].trim()
    if (!val) return
    setForm(prev => ({ ...prev, [field]: [...(prev[field] as string[]), val] }))
    setNewItem(prev => ({ ...prev, [itemField]: '' }))
  }

  const removeFromList = (field: keyof typeof form, index: number) => {
    setForm(prev => {
      const copy = [...(prev[field] as string[])]
      copy.splice(index, 1)
      return { ...prev, [field]: copy }
    })
  }

  const renderListEditor = (label: string, field: keyof typeof form, itemField: keyof typeof newItem, placeholder: string) => (
    <div className="space-y-2 bg-muted/20 p-4 rounded-lg border border-border">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="flex gap-2">
        <Input 
          value={newItem[itemField]} 
          onChange={e => setNewItem({ ...newItem, [itemField]: e.target.value })} 
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addToList(field, itemField) } }}
          placeholder={placeholder} 
          className="bg-background"
        />
        <Button type="button" variant="secondary" onClick={() => addToList(field, itemField)}><Plus className="h-4 w-4" /></Button>
      </div>
      {(form[field] as string[]).length > 0 && (
        <ul className="space-y-1.5 mt-3">
          {(form[field] as string[]).map((val, idx) => (
            <li key={idx} className="flex justify-between items-start text-sm bg-background p-2.5 rounded-md border border-border shadow-sm gap-2">
              <span className="leading-snug">{val}</span>
              <button type="button" onClick={() => removeFromList(field, idx)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileEdit className="h-5 w-5 text-primary" />
            {currentOutcome ? 'Correct Outcome' : 'Record Outcome'}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Capture structured details and follow-up tasks from your visit.</p>
        </DialogHeader>
        
        <div className="space-y-6 py-2">
          {outcomes.length > 0 && (
            <section aria-labelledby="outcome-history-heading" className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div>
                <h3 id="outcome-history-heading" className="text-sm font-semibold">Outcome history</h3>
                <p className="text-xs text-muted-foreground mt-1">Corrections are appended and keep the earlier record for audit.</p>
              </div>
              <div className="space-y-3">
                {outcomes.map((outcome: any) => {
                  const isCurrent = outcome.id === currentOutcome?.id
                  return (
                    <article key={outcome.id} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-muted-foreground">
                          {isCurrent ? 'Current record' : 'Superseded record'}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatRecordedAt(outcome.recordedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium whitespace-pre-wrap">{outcome.outcome}</p>
                      {outcome.followUp && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Follow-up:</span> {outcome.followUp}</p>}
                      {outcome.payment && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Payment:</span>{' '}
                          {[outcome.payment.status, outcome.payment.amount != null ? `$${outcome.payment.amount}` : null, outcome.payment.method]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      <div className="mt-1 space-y-0.5">
                        {renderHistoryList('Discussed', outcome.discussedItems)}
                        {renderHistoryList('Medication changes', outcome.medicationChanges)}
                        {renderHistoryList('Referrals', outcome.referrals)}
                        {renderHistoryList('Pathology', outcome.pathologyRequests)}
                        {renderHistoryList('Future tasks', outcome.futureTasks)}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {currentOutcome && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-3 rounded-md text-sm">
              You are creating a correction. This will supersede the previously recorded outcome.
            </div>
          )}
          
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Visit Summary / Outcome *</Label>
            <textarea 
              className="w-full flex min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={form.outcome}
              onChange={e => setForm({ ...form, outcome: e.target.value })}
              placeholder="How did the appointment go? What was the diagnosis or main takeaway?"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {renderListEditor('Discussed Items', 'discussedItems', 'discussed', 'e.g., Blood pressure results')}
            {renderListEditor('Medication Changes', 'medicationChanges', 'med', 'e.g., Increased dose of X')}
            {renderListEditor('Referrals Provided', 'referrals', 'referral', 'e.g., Physiotherapy')}
            {renderListEditor('Pathology Requests', 'pathologyRequests', 'pathology', 'e.g., Repeat blood test')}
            {renderListEditor('Future Tasks', 'futureTasks', 'task', 'e.g., Book follow-up in 4 weeks')}
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <Label className="text-sm font-semibold">Payment</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input value={form.payment.status} onChange={e => setForm({ ...form, payment: { ...form.payment, status: e.target.value } })} placeholder="Status (paid, pending)" />
              <Input type="number" min="0" value={form.payment.amount} onChange={e => setForm({ ...form, payment: { ...form.payment, amount: e.target.value } })} placeholder="Amount (AUD)" />
              <Input value={form.payment.method} onChange={e => setForm({ ...form, payment: { ...form.payment, method: e.target.value } })} placeholder="Method (card, cash)" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Follow-up Plan</Label>
            <Input 
              value={form.followUp}
              onChange={e => setForm({ ...form, followUp: e.target.value })}
              placeholder="e.g., Review in 6 months"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={saveOutcome} loading={saving}>{currentOutcome ? 'Save Correction' : 'Save Outcome'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
