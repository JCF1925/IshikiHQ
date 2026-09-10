import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

export function useVariantData(medicationId: string, isExpanded: boolean) {
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [stockTxns, setStockTxns] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [stockLevel, setStockLevel] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!isExpanded || !medicationId) return
    setLoading(true)
    try {
      const [pRes, sRes, tRes, lRes, stRes] = await Promise.all([
        fetch(`/api/prescriptions?medicationId=${medicationId}`),
        fetch(`/api/dosage-schedules?medicationId=${medicationId}`),
        fetch(`/api/stock-transactions?medicationId=${medicationId}`),
        fetch(`/api/medication-logs?medicationId=${medicationId}`).catch(() => ({ ok: true, json: async () => [] })),
        fetch('/api/stock-levels')
      ])
      
      if (pRes.ok) setPrescriptions(await pRes.json())
      if (sRes.ok) setSchedules(await sRes.json())
      if (tRes.ok) setStockTxns(await tRes.json())
      if (lRes.ok) setLogs(await lRes.json())
      if (stRes.ok) {
        const allLevels = await stRes.json()
        setStockLevel((allLevels ?? []).find((s: any) => s.medicationId === medicationId))
      }
    } catch {
      toast.error('Failed to load variant details')
    } finally {
      setLoading(false)
    }
  }, [medicationId, isExpanded])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { prescriptions, schedules, stockTxns, logs, stockLevel, loading, refetch: fetchAll }
}
