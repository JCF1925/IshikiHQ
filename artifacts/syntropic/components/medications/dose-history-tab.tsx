import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export function DoseHistoryTab({ variant, data, onRefetch }: any) {
  const { logs, schedules } = data
  const [saving, setSaving] = useState(false)
  const activeSchedules = (schedules || []).filter((s: any) => s.isActive !== false)
  const [scheduleId, setScheduleId] = useState<string>(activeSchedules[0]?.id || '')

  const handleLogDose = async () => {
    if (!scheduleId && activeSchedules.length > 0) {
      toast.error('Please select a schedule')
      return
    }
    setSaving(true)
    try {
      const selectedScheduleId = scheduleId || activeSchedules[0]?.id
      if (!selectedScheduleId) {
        toast.error('Add an active reminder before logging a dose')
        return
      }
      const res = await fetch('/api/medication-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: selectedScheduleId,
          takenAt: new Date().toISOString(),
          skipped: false
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || err.message || 'Failed to log dose')
      }
      toast.success('Dose logged')
      onRefetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to log dose')
    } finally {
      setSaving(false)
    }
  }

  const handlePatch = async (id: string, updates: any) => {
    try {
      const res = await fetch(`/api/medication-logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (!res.ok) throw new Error()
      toast.success('Log updated')
      onRefetch()
    } catch {
      toast.error('Failed to update log')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg font-medium">Dose history</h3>
        <div className="flex items-center gap-2">
          {activeSchedules.length > 0 ? (
            <Select value={scheduleId} onValueChange={setScheduleId}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Select schedule" />
              </SelectTrigger>
              <SelectContent>
                {activeSchedules.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.frequency === 'daily' ? 'Daily' :
                     s.frequency === 'twice_daily' ? 'Twice Daily' :
                     s.frequency === 'three_times_daily' ? 'Three Times Daily' :
                     s.frequency === 'weekly' ? 'Weekly' : 'As needed'}
                    {' '}({s.times?.[0] || 'Any'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground mr-2">No active schedule</span>
          )}
          <Button size="sm" onClick={() => handleLogDose()} disabled={saving || activeSchedules.length === 0} className="bg-violet-600 hover:bg-violet-700 text-white shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Log dose
          </Button>
        </div>
      </div>

      {(!logs || logs.length === 0) ? (
        <div className="text-center py-8 bg-muted/20 rounded-2xl border border-border/50 border-dashed">
          <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No doses logged recently.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between p-4 border border-border/50 rounded-xl bg-card">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${log.skipped ? 'bg-muted text-muted-foreground' : 'bg-violet-500/10 text-violet-400'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={log.skipped ? "bg-muted text-muted-foreground border-transparent font-normal" : "bg-violet-500/10 text-violet-300 border-transparent font-normal"}>
                    {log.skipped ? 'Skipped' : 'Taken'}
                  </Badge>
                  <span className="text-muted-foreground">
                    {format(new Date(log.takenAt), "d MMM yyyy, HH:mm")}
                  </span>
                  {log.doseTaken && !log.skipped && (
                    <span className="text-sm text-muted-foreground border-l border-border pl-3">
                      {log.doseTaken} {variant.unit}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handlePatch(log.id, { skipped: !log.skipped })} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4 mr-2" /> {log.skipped ? 'Unskip' : 'Skip'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
