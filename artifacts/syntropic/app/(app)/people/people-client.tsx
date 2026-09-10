'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Plus, Trash2, Pencil, Building2, Phone, Mail, Cake, MapPin, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'

type Person = { id: string; name: string; type: string; role: string | null; phone: string | null; email: string | null; address: string | null; organisationId: string | null; birthday: string | null; notes: string | null; organisation?: { name: string } | null }
type Org = { id: string; name: string; type: string | null; address: string | null; phone: string | null; website: string | null; notes: string | null; _count?: { people: number } }

const ROLE_CHIPS = ['GP', 'Specialist', 'Pharmacist', 'Allied Health', 'Employer', 'Family', 'Friend', 'Real Estate']
const ORG_TYPES = ['medical_practice', 'employer', 'insurer', 'government', 'pharmacy', 'other']

const emptyPerson = { name: '', type: 'person', role: '', phone: '', email: '', address: '', organisationId: '', birthday: '', notes: '' }
const emptyOrg = { name: '', type: '', address: '', phone: '', website: '', notes: '' }

export function PeopleClient() {
  const [people, setPeople] = useState<Person[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showPerson, setShowPerson] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [pForm, setPForm] = useState({ ...emptyPerson })

  const [showOrg, setShowOrg] = useState(false)
  const [editOrg, setEditOrg] = useState<Org | null>(null)
  const [oForm, setOForm] = useState({ ...emptyOrg })

  const fetchAll = useCallback(async () => {
    try {
      const [pr, or] = await Promise.all([fetch('/api/people'), fetch('/api/organisations')])
      if (!pr.ok || !or.ok) throw new Error()
      setPeople(await pr.json()); setOrgs(await or.json())
    } catch { toast.error('Failed to load contacts') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // People handlers
  const openAddPerson = () => { setEditPerson(null); setPForm({ ...emptyPerson }); setShowPerson(true) }
  const openEditPerson = (p: Person) => {
    setEditPerson(p)
    setPForm({ name: p.name, type: p.type, role: p.role ?? '', phone: p.phone ?? '', email: p.email ?? '', address: p.address ?? '', organisationId: p.organisationId ?? '', birthday: p.birthday ? p.birthday.split('T')[0] : '', notes: p.notes ?? '' })
    setShowPerson(true)
  }
  const savePerson = async () => {
    if (!pForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...pForm, organisationId: pForm.organisationId || null, birthday: pForm.birthday || null }
      const res = editPerson
        ? await fetch(`/api/people/${editPerson.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editPerson ? 'Contact updated' : 'Contact added')
      setShowPerson(false); setEditPerson(null); fetchAll()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }
  const deletePerson = async (p: Person) => {
    if (!confirm(`Delete ${p.name}?`)) return
    try { await fetch(`/api/people/${p.id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() } catch { toast.error('Failed to delete') }
  }

  // Org handlers
  const openAddOrg = () => { setEditOrg(null); setOForm({ ...emptyOrg }); setShowOrg(true) }
  const openEditOrg = (o: Org) => {
    setEditOrg(o)
    setOForm({ name: o.name, type: o.type ?? '', address: o.address ?? '', phone: o.phone ?? '', website: o.website ?? '', notes: o.notes ?? '' })
    setShowOrg(true)
  }
  const saveOrg = async () => {
    if (!oForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...oForm, type: oForm.type || null }
      const res = editOrg
        ? await fetch(`/api/organisations/${editOrg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/organisations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      toast.success(editOrg ? 'Organisation updated' : 'Organisation added')
      setShowOrg(false); setEditOrg(null); fetchAll()
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }
  const deleteOrg = async (o: Org) => {
    if (!confirm(`Delete ${o.name}? People linked to it will be kept but unlinked.`)) return
    try { await fetch(`/api/organisations/${o.id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" /> People &amp; Organisations</h1>
          <p className="text-muted-foreground text-sm mt-1">Your shared contacts — practitioners, employers, family and the organisations behind them.</p>
        </div>
      </FadeIn>

      <Tabs defaultValue="people">
        <TabsList>
          <TabsTrigger value="people">People ({people.length})</TabsTrigger>
          <TabsTrigger value="orgs">Organisations ({orgs.length})</TabsTrigger>
        </TabsList>

        {/* PEOPLE TAB */}
        <TabsContent value="people" className="space-y-4">
          <div className="flex justify-end"><Button onClick={openAddPerson}><Plus className="h-4 w-4 mr-2" /> Add person</Button></div>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : people.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground"><Users className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No people yet.</p></CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {people.map((p) => (
                <Card key={p.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{p.name}</p>
                          {p.type === 'practitioner' && <Badge className="text-[10px] bg-primary/15 text-primary">Practitioner</Badge>}
                          {p.role && <Badge variant="secondary" className="text-[10px]">{p.role}</Badge>}
                        </div>
                        {p.organisation?.name && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.organisation.name}</p>}
                        <div className="mt-2 space-y-1">
                          {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> <span suppressHydrationWarning>{p.phone}</span></p>}
                          {p.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> <span suppressHydrationWarning>{p.email}</span></p>}
                          {p.birthday && <p className="text-xs text-muted-foreground flex items-center gap-1"><Cake className="h-3 w-3" /> <SafeDate date={p.birthday} options={{ day: 'numeric', month: 'long' }} /></p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEditPerson(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => deletePerson(p)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ORGS TAB */}
        <TabsContent value="orgs" className="space-y-4">
          <div className="flex justify-end"><Button onClick={openAddOrg}><Plus className="h-4 w-4 mr-2" /> Add organisation</Button></div>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-3">{[1,2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : orgs.length === 0 ? (
            <Card><CardContent className="p-12 text-center text-muted-foreground"><Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm">No organisations yet.</p></CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {orgs.map((o) => (
                <Card key={o.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{o.name}</p>
                          {o.type && <Badge variant="secondary" className="text-[10px]">{o.type.replace('_', ' ')}</Badge>}
                        </div>
                        <div className="mt-2 space-y-1">
                          {o.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> <span suppressHydrationWarning>{o.phone}</span></p>}
                          {o.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.address}</p>}
                          {o.website && <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> {o.website}</p>}
                        </div>
                        {(o._count?.people ?? 0) > 0 && <p className="text-[10px] text-muted-foreground mt-2">{o._count!.people} linked {o._count!.people === 1 ? 'person' : 'people'}</p>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEditOrg(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => deleteOrg(o)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Person dialog */}
      <Dialog open={showPerson} onOpenChange={(o) => { if (!o) { setShowPerson(false); setEditPerson(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editPerson ? 'Edit person' : 'Add person'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={pForm.name} onChange={(e: any) => setPForm({ ...pForm, name: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={pForm.type} onValueChange={(v: string) => setPForm({ ...pForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="person">Person</SelectItem><SelectItem value="practitioner">Practitioner</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Role / Tag</Label>
              <Input value={pForm.role} onChange={(e: any) => setPForm({ ...pForm, role: e.target.value })} placeholder="e.g. GP, Employer, Family" />
              <div className="flex flex-wrap gap-1 mt-2">
                {ROLE_CHIPS.map((r) => <button key={r} type="button" onClick={() => setPForm({ ...pForm, role: r })} className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:bg-muted">{r}</button>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={pForm.phone} onChange={(e: any) => setPForm({ ...pForm, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={pForm.email} onChange={(e: any) => setPForm({ ...pForm, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Organisation</Label>
                <Select value={pForm.organisationId || 'none'} onValueChange={(v: string) => setPForm({ ...pForm, organisationId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Birthday</Label><Input type="date" value={pForm.birthday} onChange={(e: any) => setPForm({ ...pForm, birthday: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={pForm.address} onChange={(e: any) => setPForm({ ...pForm, address: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={pForm.notes} onChange={(e: any) => setPForm({ ...pForm, notes: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Adding a birthday automatically creates a yearly event in your calendar.</p>
            <Button onClick={savePerson} className="w-full" loading={saving}>{editPerson ? 'Save changes' : 'Add person'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Org dialog */}
      <Dialog open={showOrg} onOpenChange={(o) => { if (!o) { setShowOrg(false); setEditOrg(null) } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editOrg ? 'Edit organisation' : 'Add organisation'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={oForm.name} onChange={(e: any) => setOForm({ ...oForm, name: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={oForm.type || 'none'} onValueChange={(v: string) => setOForm({ ...oForm, type: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unspecified</SelectItem>
                    {ORG_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={oForm.phone} onChange={(e: any) => setOForm({ ...oForm, phone: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={oForm.website} onChange={(e: any) => setOForm({ ...oForm, website: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={oForm.address} onChange={(e: any) => setOForm({ ...oForm, address: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={oForm.notes} onChange={(e: any) => setOForm({ ...oForm, notes: e.target.value })} /></div>
            <Button onClick={saveOrg} className="w-full" loading={saving}>{editOrg ? 'Save changes' : 'Add organisation'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
