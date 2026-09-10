import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bell, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function RemindersTab({ variant, data, onRefetch }: any) {
  const { schedules, prescriptions } = data
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const emptyForm = { frequency: 'daily', doseAmount: '1', timeStr: '08:00', withFood: false, prescriptionId: '' }
  const [form, setForm] = useState(emptyForm)

  const handleSave = async () => {
    setSaving(true)
    try {
      let times = [form.timeStr]
      if (form.frequency === 'twice_daily') {
        times = [form.timeStr, '20:00']
      } else if (form.frequency === 'three_times_daily') {
        times = [form.timeStr, '14:00', '20:00']
      }

      const res = await fetch('/api/dosage-schedules', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          ...(form.prescriptionId ? { prescriptionId: form.prescriptionId } : { medicationId: variant.id }),
          frequency: form.frequency,
          doseAmount: form.doseAmount,
          times,
          startDate: new Date().toISOString().slice(0, 10),
          withFood: form.withFood,
          // Each schedule is an independently enabled reminder. Editing a
          // regimen can supersede one explicitly, but adding another reminder
          // must not silently archive the existing times.
          supersede: false
        }) 
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to add reminder')
      }
      toast.success('Reminder added')
      setShowAdd(false)
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to add reminder')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (s: any) => {
    try {
      const res = await fetch(`/api/dosage-schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: s.isActive === false ? true : false })
      })
      if (!res.ok) throw new Error()
      toast.success(s.isActive === false ? 'Schedule enabled' : 'Schedule disabled')
      onRefetch()
    } catch {
      toast.error('Failed to update schedule')
    }
  }

  const freqLabel = (f: string) => ({ 
    daily: 'Every day', 
    twice_daily: 'Twice daily', 
    three_times_daily: 'Three times daily', 
    weekly: 'Weekly', 
    as_needed: 'As needed' 
  }[f] ?? f)

  return (
    <div className="space-y-4">
      {(!schedules || schedules.length === 0) ? (
        <div className="text-center py-8 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
          <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No reminders set for this variant.</p>
        </div>
      ) : (
        schedules.map((s: any) => (
          <div key={s.id} className={cn("border rounded-2xl p-5 flex items-start justify-between transition-all", s.isActive === false ? "bg-muted/30 border-border/30 opacity-75" : "bg-card border-border/50 hover:border-violet-500/30")}>
            <div className="flex items-start gap-4">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5", s.isActive === false ? "bg-muted" : "bg-violet-500/10")}>
                <Bell className={cn("w-5 h-5", s.isActive === false ? "text-muted-foreground" : "text-violet-400")} />
              </div>
              <div>
                <div className="font-medium text-lg text-foreground mb-1">
                  Reminder on {s.isActive === false && <Badge variant="secondary" className="ml-2 text-xs">Archived</Badge>}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-1 mb-3">
                  <Clock className="w-3.5 h-3.5" /> 
                  {freqLabel(s.frequency)}
                  {s.withFood && ' • with food'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.times?.map((t: string) => (
                    <Badge key={t} variant="secondary" className={cn("text-sm py-1 px-3 border-transparent", s.isActive === false ? "bg-muted text-muted-foreground" : "bg-violet-500/10 text-violet-300")}>
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 md:gap-3">
              <Switch checked={s.isActive !== false} onCheckedChange={() => handleToggleActive(s)} className="data-[state=checked]:bg-violet-600 mr-2" />
            </div>
          </div>
        ))
      )}

      <Button 
        variant="outline" 
        onClick={() => { setForm(emptyForm); setShowAdd(true) }}
        className="w-full md:w-auto bg-violet-500/5 text-violet-400 border-transparent hover:bg-violet-500/10 hover:text-violet-300"
      >
        <Plus className="w-4 h-4 mr-2" /> Add another reminder
      </Button>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent aria-describedby="add-reminder-description" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add reminder</DialogTitle>
            <p id="add-reminder-description" className="text-sm text-muted-foreground">Set a direct reminder or link it to a prescription.</p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Prescription (optional)</Label>
              <Select value={form.prescriptionId || 'direct'} onValueChange={v => setForm({...form, prescriptionId: v === 'direct' ? '' : v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct medication reminder</SelectItem>
                  {(prescriptions || []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.prescriber?.name ? `${p.prescriber.name} — ` : ''}{p.quantity ? `${p.quantity} per fill` : 'Prescription'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={v => setForm({...form, frequency: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="twice_daily">Twice daily</SelectItem>
                  <SelectItem value="three_times_daily">Three times daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="as_needed">As needed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{form.frequency === 'twice_daily' || form.frequency === 'three_times_daily' ? 'First Dose Time' : 'Time'}</Label>
              <Input type="time" value={form.timeStr} onChange={e => setForm({...form, timeStr: e.target.value})} />
              {(form.frequency === 'twice_daily' || form.frequency === 'three_times_daily') && (
                <p className="text-xs text-muted-foreground">Additional times will be added automatically.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Dose Amount</Label>
              <Input value={form.doseAmount} onChange={e => setForm({...form, doseAmount: e.target.value})} placeholder="1" />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch checked={form.withFood} onCheckedChange={c => setForm({...form, withFood: c})} />
              <Label>Take with food</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">Save reminder</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
