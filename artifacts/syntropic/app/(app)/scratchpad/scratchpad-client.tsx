'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Lightbulb, Save, LayoutGrid, Compass, Coins } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'

// Business Model Canvas blocks (Osterwalder)
const CANVAS: { key: string; label: string; hint: string }[] = [
  { key: 'keyPartners', label: 'Key Partners', hint: 'Suppliers, allies, who you rely on' },
  { key: 'keyActivities', label: 'Key Activities', hint: 'The most important things you must do' },
  { key: 'keyResources', label: 'Key Resources', hint: 'Assets required to deliver value' },
  { key: 'valueProps', label: 'Value Propositions', hint: 'What problem you solve, for whom' },
  { key: 'customerRelationships', label: 'Customer Relationships', hint: 'How you get, keep & grow customers' },
  { key: 'channels', label: 'Channels', hint: 'How you reach & deliver to customers' },
  { key: 'customerSegments', label: 'Customer Segments', hint: 'Who you create value for' },
  { key: 'costStructure', label: 'Cost Structure', hint: 'The biggest costs in the model' },
  { key: 'revenueStreams', label: 'Revenue Streams', hint: 'How the business earns' },
]

type Data = Record<string, string>

export function ScratchpadClient() {
  const [data, setData] = useState<Data>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState('canvas')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/scratchpad')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json.data ?? {})
    } catch { toast.error('Failed to load scratchpad') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const set = (key: string, value: string) => { setData((d) => ({ ...d, [key]: value })); setDirty(true) }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/scratchpad', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })
      if (!res.ok) throw new Error()
      toast.success('Scratchpad saved')
      setDirty(false)
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
              <Lightbulb className="h-6 w-6" /> Business Scratchpad
            </h1>
            <p className="text-muted-foreground text-sm mt-1">A private space to shape strategy, model and financials for Ishiki (or any venture).</p>
          </div>
          <Button onClick={save} loading={saving} disabled={!dirty}><Save className="h-4 w-4 mr-2" /> {dirty ? 'Save changes' : 'Saved'}</Button>
        </div>
      </FadeIn>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="canvas"><LayoutGrid className="h-4 w-4 mr-1.5" /> Business Model</TabsTrigger>
            <TabsTrigger value="strategy"><Compass className="h-4 w-4 mr-1.5" /> Strategy</TabsTrigger>
            <TabsTrigger value="financials"><Coins className="h-4 w-4 mr-1.5" /> Financials</TabsTrigger>
          </TabsList>

          <TabsContent value="canvas" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {CANVAS.map((block) => (
                <Card key={block.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{block.label}</CardTitle>
                    <p className="text-xs text-muted-foreground">{block.hint}</p>
                  </CardHeader>
                  <CardContent>
                    <Textarea value={data[block.key] ?? ''} onChange={(e: any) => set(block.key, e.target.value)} placeholder="…" className="min-h-[120px] text-sm" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="strategy" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Vision &amp; positioning</CardTitle><p className="text-xs text-muted-foreground">Where this is going and why it wins.</p></CardHeader>
              <CardContent><Textarea value={data.vision ?? ''} onChange={(e: any) => set('vision', e.target.value)} placeholder="Vision, mission, unique angle, moat…" className="min-h-[140px] text-sm" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Opportunities &amp; risks</CardTitle><p className="text-xs text-muted-foreground">Market, competitors, threats, what could go wrong.</p></CardHeader>
              <CardContent><Textarea value={data.risks ?? ''} onChange={(e: any) => set('risks', e.target.value)} placeholder="SWOT, competitor notes, key risks…" className="min-h-[140px] text-sm" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Next moves</CardTitle><p className="text-xs text-muted-foreground">Concrete experiments and milestones. Promote firm ones to Goals or Tasks.</p></CardHeader>
              <CardContent><Textarea value={data.nextMoves ?? ''} onChange={(e: any) => set('nextMoves', e.target.value)} placeholder="What to test next, in what order…" className="min-h-[140px] text-sm" /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financials" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pricing &amp; unit economics</CardTitle><p className="text-xs text-muted-foreground">Price points, margins, cost to serve, break-even.</p></CardHeader>
              <CardContent><Textarea value={data.pricing ?? ''} onChange={(e: any) => set('pricing', e.target.value)} placeholder="e.g. $10/user/mo, gross margin, CAC, LTV…" className="min-h-[140px] text-sm" /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Projections &amp; funding</CardTitle><p className="text-xs text-muted-foreground">Rough forecasts, runway, funding needs.</p></CardHeader>
              <CardContent><Textarea value={data.projections ?? ''} onChange={(e: any) => set('projections', e.target.value)} placeholder="Revenue targets, costs, runway, capital required…" className="min-h-[140px] text-sm" /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
