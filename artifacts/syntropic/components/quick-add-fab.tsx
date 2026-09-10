'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Pill, CreditCard, CheckSquare, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { getDashboardData, invalidateDashboardData } from '@/lib/dashboard-cache'

type QuickAddType = 'medication' | 'transaction' | 'task' | null

export function QuickAddFab() {
  const [open, setOpen] = useState(false)
  const [activeType, setActiveType] = useState<QuickAddType>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<{ field: string; message: string } | null>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)

  // Transaction form
  const [txnAmount, setTxnAmount] = useState('')
  const [txnMerchant, setTxnMerchant] = useState('')
  const [txnCategory, setTxnCategory] = useState('')

  // Task form
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')

  // Med log form
  const [medScheduleId, setMedScheduleId] = useState('')
  const [schedules, setSchedules] = useState<any[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(false)

  const openQuickAdd = async (type: QuickAddType) => {
    setActiveType(type)
    setFormError(null)
    if (type === 'medication') {
      setSchedulesLoading(true)
      try {
        const data = await getDashboardData()
        setSchedules(data?.todaySchedules ?? [])
      } catch {
        setSchedules([])
        setFormError({ field: 'medication', message: 'Medications could not be loaded. Close and try again.' })
      } finally {
        setSchedulesLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!open || activeType) return
    firstActionRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        fabRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, activeType])

  const resetForms = () => {
    setTxnAmount(''); setTxnMerchant(''); setTxnCategory('')
    setTaskTitle(''); setTaskPriority('medium')
    setMedScheduleId('')
    setFormError(null)
    setActiveType(null)
  }

  const saveToOfflineQueue = (type: string, data: any) => {
    try {
      const queue = JSON.parse(localStorage.getItem('syntropic_offline_queue') ?? '[]')
      queue.push({ type, data, timestamp: Date.now() })
      localStorage.setItem('syntropic_offline_queue', JSON.stringify(queue))
    } catch { /* ignore */ }
  }

  const submitTransaction = async () => {
    if (!txnAmount) { setFormError({ field: 'amount', message: 'Amount is required.' }); return }
    setLoading(true)
    const payload = { date: new Date().toISOString(), amount: parseFloat(txnAmount), merchant: txnMerchant, category: txnCategory }
    try {
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      invalidateDashboardData()
      toast.success('Transaction added')
      resetForms(); setOpen(false)
    } catch {
      saveToOfflineQueue('transaction', payload)
      toast.success('Saved offline — will sync when connected')
      resetForms(); setOpen(false)
    } finally { setLoading(false) }
  }

  const submitTask = async () => {
    if (!taskTitle.trim()) { setFormError({ field: 'title', message: 'Title is required.' }); return }
    setLoading(true)
    const payload = { title: taskTitle, priority: taskPriority }
    try {
      const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      invalidateDashboardData()
      toast.success('Task added')
      resetForms(); setOpen(false)
    } catch {
      saveToOfflineQueue('task', payload)
      toast.success('Saved offline — will sync when connected')
      resetForms(); setOpen(false)
    } finally { setLoading(false) }
  }

  const submitMedLog = async () => {
    if (!medScheduleId) { setFormError({ field: 'medication', message: 'Select a medication.' }); return }
    setLoading(true)
    const payload = { scheduleId: medScheduleId, takenAt: new Date().toISOString() }
    try {
      const res = await fetch('/api/medication-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      invalidateDashboardData()
      toast.success('Medication logged')
      resetForms(); setOpen(false)
    } catch {
      saveToOfflineQueue('medication-log', payload)
      toast.success('Saved offline — will sync when connected')
      resetForms(); setOpen(false)
    } finally { setLoading(false) }
  }

  return (
    <>
      {/* FAB button */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] lg:bottom-6 lg:right-6 z-30">
        <button
          ref={fabRef}
          onClick={() => setOpen(!open)}
          className={cn(
            'h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-all hover:scale-105',
            'shadow-lg hover:shadow-xl'
          )}
          aria-label={open ? 'Close quick add menu' : 'Open quick add menu'}
          aria-expanded={open}
          aria-controls="quick-add-actions"
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>

        {/* Quick action buttons */}
        {open && !activeType && (
          <div id="quick-add-actions" aria-label="Quick add actions" className="absolute bottom-16 right-0 flex flex-col gap-2 items-end">
            {[
              { type: 'medication' as const, icon: Pill, label: 'Log medication', color: 'bg-emerald-600' },
              { type: 'transaction' as const, icon: CreditCard, label: 'Add transaction', color: 'bg-blue-600' },
              { type: 'task' as const, icon: CheckSquare, label: 'Add task', color: 'bg-amber-600' },
            ].map((item) => (
              <button
                key={item.type}
                ref={item.type === 'medication' ? firstActionRef : undefined}
                onClick={() => openQuickAdd(item.type)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-md hover:scale-105 transition-all',
                  item.color
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick add dialogs */}
      <Dialog open={!!activeType} onOpenChange={(o: boolean) => {
        if (!o) {
          resetForms()
          setOpen(false)
          requestAnimationFrame(() => fabRef.current?.focus())
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {activeType === 'transaction' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Quick Transaction</DialogTitle></DialogHeader>
              <DialogDescription className="sr-only">Record a transaction and add it to your recent activity.</DialogDescription>
              <div className="space-y-4">
                <div><Label htmlFor="quick-txn-amount">Amount (AUD)</Label><Input id="quick-txn-amount" type="number" step="0.01" placeholder="-45.50" value={txnAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setTxnAmount(e.target.value); setFormError(null) }} aria-invalid={formError?.field === 'amount'} aria-describedby={formError?.field === 'amount' ? 'quick-add-error' : undefined} /></div>
                <div><Label htmlFor="quick-txn-merchant">Merchant</Label><Input id="quick-txn-merchant" placeholder="Woolworths" value={txnMerchant} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxnMerchant(e.target.value)} /></div>
                <div><Label htmlFor="quick-txn-category">Category</Label><Input id="quick-txn-category" placeholder="Groceries" value={txnCategory} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTxnCategory(e.target.value)} /></div>
                {formError && <p id="quick-add-error" role="alert" className="text-sm text-destructive">{formError.message}</p>}
                <Button onClick={submitTransaction} className="w-full" loading={loading}>Save Transaction</Button>
              </div>
            </>
          )}
          {activeType === 'task' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" /> Quick Task</DialogTitle></DialogHeader>
              <DialogDescription className="sr-only">Create a task with a title and priority.</DialogDescription>
              <div className="space-y-4">
                <div><Label htmlFor="quick-task-title">Title</Label><Input id="quick-task-title" placeholder="What needs doing?" value={taskTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setTaskTitle(e.target.value); setFormError(null) }} aria-invalid={formError?.field === 'title'} aria-describedby={formError?.field === 'title' ? 'quick-add-error' : undefined} /></div>
                <div>
                  <Label htmlFor="quick-task-priority">Priority</Label>
                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                    <SelectTrigger id="quick-task-priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formError && <p id="quick-add-error" role="alert" className="text-sm text-destructive">{formError.message}</p>}
                <Button onClick={submitTask} className="w-full" loading={loading}>Save Task</Button>
              </div>
            </>
          )}
          {activeType === 'medication' && (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5" /> Log Medication</DialogTitle></DialogHeader>
              <DialogDescription className="sr-only">Choose a medication to record it as taken.</DialogDescription>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="quick-medication">Medication</Label>
                  <Select value={medScheduleId} onValueChange={(value) => { setMedScheduleId(value); setFormError(null) }}>
                    <SelectTrigger id="quick-medication" aria-invalid={formError?.field === 'medication'} aria-describedby={formError?.field === 'medication' ? 'quick-add-error' : undefined} disabled={schedulesLoading}><SelectValue placeholder={schedulesLoading ? 'Loading medications…' : 'Select medication'} /></SelectTrigger>
                    <SelectContent>
                      {(schedules ?? []).map((s: any) => (
                        <SelectItem key={s?.id} value={s?.id ?? ''}>
                          {s?.prescription?.medication?.name ?? 'Unknown'} — {s?.doseAmount ?? ''} {s?.prescription?.medication?.unit ?? ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formError && <p id="quick-add-error" role="alert" className="text-sm text-destructive">{formError.message}</p>}
                <Button onClick={submitMedLog} className="w-full" loading={loading}>Log as Taken</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
