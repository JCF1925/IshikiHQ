'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Pause, Play, ExternalLink } from 'lucide-react'
import {
  normalizeUnitPrice, evaluatePriceTarget, buildPriceWatchDto, buildObservationDto,
} from '@/lib/price-watch'

type Observation = {
  id: string; price: number; packQuantity: number; packUnit: string; shippingCost: number
  observedAt: string; sourceUrl?: string; membershipAssumption?: string; notes?: string
}
type Watch = {
  id: string; productName: string; packQuantity: number; packUnit: string
  preferredRetailers: string[]; targetPrice?: number; checkCadence?: string
  status: string; observations: Observation[]
}
const emptyWatch = { productName: '', packQuantity: '1', packUnit: 'count', preferredRetailers: '', targetPrice: '', checkCadence: '' }
const emptyObservation = { price: '', packQuantity: '', packUnit: 'count', shippingCost: '0', observedAt: new Date().toISOString().slice(0, 16), sourceUrl: '', membershipAssumption: '', notes: '' }

export function PriceWatchClient() {
  const [watches, setWatches] = useState<Watch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [watchForm, setWatchForm] = useState({ ...emptyWatch, id: '' })
  const [observation, setObservation] = useState({ ...emptyObservation, watchId: '' })
  const [editingObservation, setEditingObservation] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/price-watches')
      if (!response.ok) throw new Error('Unable to load price watches.')
      setWatches(await response.json())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load price watches. Please try again.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const saveWatch = async () => {
    try {
      const response = await fetch(watchForm.id ? `/api/price-watches/${watchForm.id}` : '/api/price-watches', {
        method: watchForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPriceWatchDto(watchForm)),
      })
      if (!response.ok) throw new Error('Please check the watch fields and try again.')
      setWatchForm({ ...emptyWatch, id: '' }); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save watch.') }
  }
  const saveObservation = async () => {
    if (!observation.watchId) return
    try {
      const payload = buildObservationDto(observation)
      const path = editingObservation
        ? `/api/price-watches/${observation.watchId}/observations/${editingObservation}`
        : `/api/price-watches/${observation.watchId}/observations`
      const response = await fetch(path, { method: editingObservation ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error('Please check the observation fields and try again.')
      setObservation({ ...emptyObservation, watchId: '' }); setEditingObservation(''); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save observation.') }
  }
  const remove = async (url: string) => {
    if (!confirm('Delete this item? This cannot be undone.')) return
    try { const response = await fetch(url, { method: 'DELETE' }); if (!response.ok) throw new Error('Unable to delete. Please try again.'); await load() }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete.') }
  }
  const togglePause = async (watch: Watch) => {
    try {
      const response = await fetch(`/api/price-watches/${watch.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: watch.status === 'paused' ? 'active' : 'paused' }) })
      if (!response.ok) throw new Error('Unable to change watch status. Please try again.')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change watch status.') }
  }
  const cancelObservation = () => { setObservation({ ...emptyObservation, watchId: '' }); setEditingObservation('') }

  return <div className="max-w-5xl space-y-6">
    <header><h1 className="font-display text-2xl font-bold">Price watch</h1><p className="mt-1 text-sm text-muted-foreground">Record Australian prices and compare like-for-like unit costs.</p></header>
    {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}
    <Card><CardContent className="space-y-4 p-5">
      <h2 className="font-semibold">{watchForm.id ? 'Edit watch' : 'Add a watch'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="watch-product">Product name *</Label><Input id="watch-product" required value={watchForm.productName} onChange={e => setWatchForm({ ...watchForm, productName: e.target.value })} /></div>
        <div><Label htmlFor="watch-quantity">Pack quantity *</Label><Input id="watch-quantity" required type="number" min="0" value={watchForm.packQuantity} onChange={e => setWatchForm({ ...watchForm, packQuantity: e.target.value })} /></div>
        <div><Label htmlFor="watch-unit">Unit *</Label><select id="watch-unit" required className="h-10 w-full rounded-md border bg-background px-3" value={watchForm.packUnit} onChange={e => setWatchForm({ ...watchForm, packUnit: e.target.value })}>{['count', 'g', 'kg', 'mL', 'L'].map(unit => <option key={unit}>{unit}</option>)}</select></div>
        <div><Label htmlFor="watch-target">Target price (AUD)</Label><Input id="watch-target" type="number" min="0" step="0.01" value={watchForm.targetPrice} onChange={e => setWatchForm({ ...watchForm, targetPrice: e.target.value })} /></div>
        <div><Label htmlFor="watch-retailers">Preferred retailers</Label><Input id="watch-retailers" value={watchForm.preferredRetailers} onChange={e => setWatchForm({ ...watchForm, preferredRetailers: e.target.value })} /></div>
        <div><Label htmlFor="watch-cadence">Check cadence</Label><Input id="watch-cadence" value={watchForm.checkCadence} onChange={e => setWatchForm({ ...watchForm, checkCadence: e.target.value })} /></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button onClick={saveWatch}><Plus className="mr-2 h-4 w-4" />{watchForm.id ? 'Save changes' : 'Create watch'}</Button>{watchForm.id && <Button variant="ghost" onClick={() => setWatchForm({ ...emptyWatch, id: '' })}>Cancel</Button>}</div>
    </CardContent></Card>
    {loading ? <p aria-live="polite" className="text-muted-foreground">Loading price watches…</p> : watches.length === 0 ? <Card><CardContent className="p-10 text-center text-muted-foreground">No price watches yet. Add one above to start tracking.</CardContent></Card> :
      <div className="grid gap-4 md:grid-cols-2">{watches.map(watch => {
        const prefix = `observation-${watch.id}`
        return <Card key={watch.id} className="min-w-0"><CardContent className="space-y-4 p-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-semibold">{watch.productName}</h2><p className="text-sm text-muted-foreground">{watch.packQuantity} {watch.packUnit} · {watch.preferredRetailers.join(', ') || 'Any retailer'}</p></div><Badge variant="outline">{watch.status}</Badge></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setWatchForm({ ...watch, id: watch.id, preferredRetailers: watch.preferredRetailers.join(', '), targetPrice: String(watch.targetPrice ?? ''), packQuantity: String(watch.packQuantity), checkCadence: watch.checkCadence ?? '' })}><Pencil className="mr-1 h-3 w-3" />Edit</Button><Button size="sm" variant="outline" onClick={() => void togglePause(watch)}>{watch.status === 'paused' ? <Play className="mr-1 h-3 w-3" /> : <Pause className="mr-1 h-3 w-3" />}{watch.status === 'paused' ? 'Resume' : 'Pause'}</Button><Button aria-label={`Delete ${watch.productName} watch`} size="sm" variant="ghost" onClick={() => void remove(`/api/price-watches/${watch.id}`)}><Trash2 className="h-3 w-3" /></Button></div>
          <div className="space-y-3 border-t pt-3"><h3 className="text-sm font-medium">Observations</h3>
            {watch.observations.length === 0 && <p className="text-sm text-muted-foreground">No observations yet. Add the first sourced price below.</p>}
            {watch.observations.map(obs => { const calc = normalizeUnitPrice(obs.price, obs.packQuantity, obs.packUnit, obs.shippingCost); const target = evaluatePriceTarget(watch.targetPrice, watch.packQuantity, watch.packUnit, obs.price, obs.packQuantity, obs.packUnit, obs.shippingCost); return <div key={obs.id} className="min-w-0 rounded-md bg-muted/40 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>${(obs.price + obs.shippingCost).toFixed(2)} total <Badge className="ml-2" variant={target.status === 'met' ? 'default' : 'outline'}>{target.status === 'met' ? 'Target met' : target.status === 'above' ? 'Above target' : 'Not comparable'}</Badge></span><span className="text-muted-foreground">{new Date(obs.observedAt).toLocaleString('en-AU')}</span></div><p className="text-muted-foreground">{calc.comparable ? calc.calculation : calc.explanation}</p><p className="text-xs text-muted-foreground">{target.explanation}</p>{obs.sourceUrl && <a className="text-primary text-xs" href={obs.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink className="inline h-3 w-3" /></a>}<div className="flex flex-wrap gap-2"><Button variant="link" className="h-auto p-0 text-xs" onClick={() => { setObservation({ ...obs, watchId: watch.id, observedAt: obs.observedAt.slice(0, 16), sourceUrl: obs.sourceUrl ?? '', membershipAssumption: obs.membershipAssumption ?? '', notes: obs.notes ?? '', price: String(obs.price), packQuantity: String(obs.packQuantity), packUnit: obs.packUnit, shippingCost: String(obs.shippingCost) }); setEditingObservation(obs.id) }}>Edit</Button><Button aria-label="Delete observation" variant="link" className="h-auto p-0 text-xs text-destructive" onClick={() => void remove(`/api/price-watches/${watch.id}/observations/${obs.id}`)}>Delete</Button></div></div> })}
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <div><Label htmlFor={`${prefix}-price`}>Price AUD *</Label><Input id={`${prefix}-price`} required type="number" value={observation.watchId === watch.id ? observation.price : ''} onChange={e => setObservation({ ...observation, watchId: watch.id, price: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-quantity`}>Pack quantity *</Label><Input id={`${prefix}-quantity`} required type="number" value={observation.watchId === watch.id ? observation.packQuantity : String(watch.packQuantity)} onChange={e => setObservation({ ...observation, watchId: watch.id, packQuantity: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-unit`}>Pack unit *</Label><select id={`${prefix}-unit`} required className="h-10 w-full rounded-md border bg-background px-3" value={observation.watchId === watch.id ? observation.packUnit : watch.packUnit} onChange={e => setObservation({ ...observation, watchId: watch.id, packUnit: e.target.value })}>{['count', 'g', 'kg', 'mL', 'L'].map(unit => <option key={unit}>{unit}</option>)}</select></div>
              <div><Label htmlFor={`${prefix}-shipping`}>Shipping AUD</Label><Input id={`${prefix}-shipping`} type="number" value={observation.watchId === watch.id ? observation.shippingCost : '0'} onChange={e => setObservation({ ...observation, watchId: watch.id, shippingCost: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-date`}>Observed date and time *</Label><Input id={`${prefix}-date`} required type="datetime-local" value={observation.watchId === watch.id ? observation.observedAt : emptyObservation.observedAt} onChange={e => setObservation({ ...observation, watchId: watch.id, observedAt: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-url`}>Source URL</Label><Input id={`${prefix}-url`} type="url" value={observation.watchId === watch.id ? observation.sourceUrl : ''} onChange={e => setObservation({ ...observation, watchId: watch.id, sourceUrl: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-membership`}>Membership assumption</Label><Input id={`${prefix}-membership`} value={observation.watchId === watch.id ? observation.membershipAssumption : ''} onChange={e => setObservation({ ...observation, watchId: watch.id, membershipAssumption: e.target.value })} /></div>
              <div><Label htmlFor={`${prefix}-notes`}>Notes</Label><Input id={`${prefix}-notes`} value={observation.watchId === watch.id ? observation.notes : ''} onChange={e => setObservation({ ...observation, watchId: watch.id, notes: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void saveObservation()} disabled={observation.watchId !== watch.id}>{editingObservation ? 'Save observation' : 'Add observation'}</Button>{editingObservation && observation.watchId === watch.id && <Button size="sm" variant="ghost" onClick={cancelObservation}>Cancel</Button>}</div>
          </div>
        </CardContent></Card>
      })}</div>}
  </div>
}