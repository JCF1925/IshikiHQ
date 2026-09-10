'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

const endpointMap: Record<string, string> = {
  transaction: '/api/transactions',
  task: '/api/tasks',
  'medication-log': '/api/medication-logs',
  'symptom-log': '/api/symptom-logs',
  'vital-log': '/api/vital-logs',
  'mood-log': '/api/mood-logs',
  'nutrition-log': '/api/nutrition-logs',
}

export function OfflineSync() {
  useEffect(() => {
    const syncQueue = async () => {
      try {
        const raw = localStorage.getItem('syntropic_offline_queue')
        if (!raw) return
        const queue = JSON.parse(raw)
        if (!Array.isArray(queue) || queue.length === 0) return

        const remaining: any[] = []
        for (const item of queue) {
          const endpoint = endpointMap[item?.type]
          if (!endpoint) { remaining.push(item); continue }
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.data),
            })
            if (!res.ok) remaining.push(item)
          } catch {
            remaining.push(item)
          }
        }

        localStorage.setItem('syntropic_offline_queue', JSON.stringify(remaining))
        const synced = queue.length - remaining.length
        if (synced > 0) toast.success(`Synced ${synced} offline item${synced > 1 ? 's' : ''}`)
      } catch { /* ignore */ }
    }

    // Sync on mount and when coming back online
    syncQueue()
    window.addEventListener('online', syncQueue)
    return () => window.removeEventListener('online', syncQueue)
  }, [])

  return null
}
