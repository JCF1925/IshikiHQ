'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { SafeDate } from '@/components/safe-format'
import { OfferingsManager } from '@/components/appointments/offerings-manager'
import { Switch } from '@/components/ui/switch'
import { Stethoscope, Plus, Trash2, Pencil, Building2, Phone, Mail, Globe, FileText, Bell } from 'lucide-react'

type Org = { id: string; name: string; type: string | null; phone: string | null; address: string | null; website?: string | null; medicarePracticeIdentifier: string | null }
type Person = { id: string; name: string; type: string; role: string | null; phone: string | null; email: string | null; organisationId: string | null; organisation: Org | null; referralRequired: boolean; isActive: boolean }
type Referral = {
  id: string; issueDate: string; expiryDate: string | null; validityType: string; serviceLimitPeriod: string | null; appointmentLimit: number | null; appointmentsUsed: number
  reason: string | null; isActive: boolean; expired: boolean; remaining: number | null; exhausted: boolean
  status: string; statusMessage: string; renewalReminderEligible: boolean; renewalReminder: boolean
  practitioner: { id: string; name: string; role: string | null; organisation: { name: string } | null } | null
  referrer: { id: string; name: string } | null
  condition: { id: string; name: string } | null
}

const emptyPerson = { name: '', role: '', phone: '', email: '', organisationId: '', referralRequired: false }
const emptyOrg = { name: '', phone: '', address: '', website: '', medicarePracticeIdentifier: '' }
const emptyRef = { practitionerId: '', referrerId: '', conditionId: '', issueDate: new Date().toISOString().slice(0, 10), validityType: 'six_months', expiryDate: '', appointmentLimit: '', serviceLimitPeriod: 'calendar_year', reason: '' }

export function PractitionersClient() {
  const [people, setPeople] = useState<Person[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [conditions, setConditions] = useState<{ id: string; name: string }[]>([])
  const [offerings, setOfferings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [showPerson, setShowPerson] = useState(false)
  const [personForm, setPersonForm] = useState({ ...emptyPerson })
  const [showOrg, setShowOrg] = useState(false)
  const [editOrg, setEditOrg] = useState<Org | null>(null)
  const [orgForm, setOrgForm] = useState({ ...emptyOrg })
  const [showRef, setShowRef] = useState(false)
  const [refForm, setRefForm] = useState({ ...emptyRef })
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [pRes, oRes, rRes, cRes, offRes] = await Promise.all([
        fetch('/api/people'), fetch('/api/organisations'), fetch('/api/referrals'), fetch('/api/conditions'), fetch('/api/appointment-care/offerings')
      ])
      const allPeople = await pRes.json()
      setPeople((allPeople ?? []).filter((p: Person) => p.type === 'practitioner'))
      const allOrgs = await oRes.json()
      setOrgs((allOrgs ?? []).filter((o: Org) => o.type === 'medical_practice' || o.type == null))
      setReferrals(await rRes.json())
      setConditions((await cRes.json()).map((c: any) => ({ id: c.id, name: c.name })))
      setOfferings(await offRes.json())
    } catch { toast.error('Failed to load practitioners') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const savePerson = async () => {
    if (!personForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...personForm, type: 'practitioner', organisationId: personForm.organisationId || null }) })
      if (!res.ok) throw new Error()
      toast.success('Practitioner added'); setShowPerson(false); setPersonForm({ ...emptyPerson }); fetchAll()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const saveOrg = async () => {
    if (!orgForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = editOrg
        ? await fetch(`/api/organisations/${editOrg.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...orgForm, type: 'medical_practice' }) })
        : await fetch('/api/organisations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...orgForm, type: 'medical_practice' }) })
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Failed to save practice')
      toast.success(editOrg ? 'Practice updated' : 'Practice added')
      setShowOrg(false); setEditOrg(null); setOrgForm({ ...emptyOrg }); fetchAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save practice')
    } finally { setSaving(false) }
  }

  const saveRef = async () => {
    if (!refForm.practitionerId) { toast.error('Select the referred-to practitioner'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refForm) })
      if (!res.ok) throw new Error()
      toast.success('Referral added'); setShowRef(false); setRefForm({ ...emptyRef }); fetchAll()
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  const delPerson = async (id: string) => { if (!confirm('Delete this practitioner?')) return; await fetch(`/api/people/${id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() }
  const delOrg = async (id: string) => { if (!confirm('Delete this practice?')) return; await fetch(`/api/organisations/${id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() }
  const delRef = async (id: string) => { if (!confirm('Delete this referral?')) return; await fetch(`/api/referrals/${id}`, { method: 'DELETE' }); toast.success('Deleted'); fetchAll() }
  const togglePractitioner = async (person: Person, field: 'referralRequired' | 'isActive', value: boolean) => {
    const res = await fetch(`/api/people/${person.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) })
    if (res.ok) setPeople((current) => current.map((item) => item.id === person.id ? { ...item, [field]: value } : item))
    else toast.error('Failed to update practitioner')
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><Stethoscope className="h-6 w-6 text-primary" /> Practitioners</h1>
          <p className="text-sm text-muted-foreground mt-1">Your care team, practices and referrals.</p>
        </div>
      </FadeIn>

      <Tabs defaultValue="team">
        <TabsList>
          <TabsTrigger value="team">Care team</TabsTrigger>
          <TabsTrigger value="practices">Practices</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>

        {/* CARE TEAM */}
        <TabsContent value="team" className="space-y-4 pt-4">
          <div className="flex justify-end"><Button onClick={() => { setPersonForm({ ...emptyPerson }); setShowPerson(true) }}><Plus className="h-4 w-4 mr-1" /> Add practitioner</Button></div>
          {loading ? <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div> : people.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No practitioners yet.</CardContent></Card>
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {people.map((p) => (
                <StaggerItem key={p.id}>
                  <Card className="h-full">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                       <div><CardTitle className="text-base">{p.name}</CardTitle>{p.role && <p className="text-xs text-muted-foreground mt-0.5">{p.role}</p>}</div>
                      <Button variant="ghost" size="icon-sm" onClick={() => delPerson(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {p.organisation && <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.organisation.name}</p>}
                      {p.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone}</p>}
                      {p.email && <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> {p.email}</p>}
                       <div className="flex items-center justify-between gap-3 border-t border-border pt-2 mt-2">
                         <Label htmlFor={`referral-${p.id}`} className="text-xs text-muted-foreground">Referral required for Medicare</Label>
                         <Switch id={`referral-${p.id}`} checked={p.referralRequired} onCheckedChange={(value) => togglePractitioner(p, 'referralRequired', value)} />
                       </div>
                       <div className="flex items-center justify-between gap-3">
                         <Label htmlFor={`active-${p.id}`} className="text-xs text-muted-foreground">Active relationship</Label>
                         <Switch id={`active-${p.id}`} checked={p.isActive} onCheckedChange={(value) => togglePractitioner(p, 'isActive', value)} />
                       </div>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>

        {/* PRACTICES */}
        <TabsContent value="practices" className="space-y-4 pt-4">
          <div className="flex justify-end"><Button onClick={() => { setEditOrg(null); setOrgForm({ ...emptyOrg }); setShowOrg(true) }}><Plus className="h-4 w-4 mr-1" /> Add practice</Button></div>
          {orgs.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No practices yet.</CardContent></Card>
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {orgs.map((o) => (
                <StaggerItem key={o.id}>
                  <Card className="h-full">
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> {o.name}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${o.name}`} onClick={() => { setEditOrg(o); setOrgForm({ name: o.name, phone: o.phone ?? '', address: o.address ?? '', website: o.website ?? '', medicarePracticeIdentifier: o.medicarePracticeIdentifier ?? '' }); setShowOrg(true) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${o.name}`} onClick={() => delOrg(o.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {o.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> {o.phone}</p>}
                      {o.address && <p className="text-xs text-muted-foreground">{o.address}</p>}
                      {o.website && <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> {o.website}</p>}
                      {o.medicarePracticeIdentifier && <p className="text-xs text-muted-foreground">Medicare practice identifier: {o.medicarePracticeIdentifier}</p>}
                      <OfferingsManager practice={o} offerings={offerings} people={people} onRefresh={fetchAll} />
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>

        {/* REFERRALS */}
        <TabsContent value="referrals" className="space-y-4 pt-4">
          <div className="flex justify-end"><Button onClick={() => { setRefForm({ ...emptyRef }); setShowRef(true) }}><Plus className="h-4 w-4 mr-1" /> Add referral</Button></div>
          {referrals.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No referrals yet.</CardContent></Card>
          ) : (
            <Stagger className="space-y-3">
              {referrals.map((r) => (
                <StaggerItem key={r.id}>
                  <Card>
                    <CardContent className="flex items-start justify-between gap-3 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> To {r.practitioner?.name ?? 'Unknown'}{r.practitioner?.role ? ` (${r.practitioner.role})` : ''}</p>
                        <p className="text-xs text-muted-foreground">Issued <SafeDate date={r.issueDate} options={{ dateStyle: 'medium' }} />{r.expiryDate && <> · expires <SafeDate date={r.expiryDate} options={{ dateStyle: 'medium' }} /></>}</p>
                        {r.condition && <p className="text-xs text-muted-foreground">For {r.condition.name}</p>}
                        {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {r.appointmentLimit != null && <Badge variant="outline">{r.appointmentsUsed}/{r.appointmentLimit} used</Badge>}
                          {r.expired && <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">Expired</Badge>}
                          {r.exhausted && <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">Exhausted</Badge>}
                          {r.status === 'valid' && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>}
                          {r.status !== 'valid' && r.status !== 'expired' && r.status !== 'exhausted' && <Badge variant="outline" className="text-amber-400 border-amber-500/30">{r.statusMessage}</Badge>}
                          {r.renewalReminder && <Badge variant="outline" className="text-amber-400 border-amber-500/30"><Bell className="h-3 w-3 mr-1" /> Renewal soon</Badge>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => delRef(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    </CardContent>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </TabsContent>
      </Tabs>

      {/* Add practitioner dialog */}
      <Dialog open={showPerson} onOpenChange={setShowPerson}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add practitioner</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={personForm.name} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} placeholder="e.g. Sarah Chen" /></div>
             <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Role / specialty</Label><Input value={personForm.role} onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })} placeholder="e.g. Cardiologist" /></div>
              <div className="space-y-1.5">
                <Label>Practice</Label>
                <Select value={personForm.organisationId || 'none'} onValueChange={(v) => setPersonForm({ ...personForm, organisationId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
             <div className="flex items-center justify-between rounded-md border border-border p-3">
               <Label htmlFor="new-referral-required">Require a referral for Medicare rebates</Label>
               <Switch id="new-referral-required" checked={personForm.referralRequired} onCheckedChange={(value) => setPersonForm({ ...personForm, referralRequired: value })} />
             </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={personForm.phone} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={personForm.email} onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowPerson(false)}>Cancel</Button><Button onClick={savePerson} loading={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add practice dialog */}
      <Dialog open={showOrg} onOpenChange={(open) => { setShowOrg(open); if (!open) setEditOrg(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editOrg ? 'Edit practice' : 'Add practice'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} placeholder="e.g. Bayside Medical Centre" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={orgForm.phone} onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Website</Label><Input type="url" value={orgForm.website} onChange={(e) => setOrgForm({ ...orgForm, website: e.target.value })} placeholder="https://example.com" /></div>
            <div className="space-y-1.5"><Label>Medicare practice identifier</Label><Input value={orgForm.medicarePracticeIdentifier} onChange={(e) => setOrgForm({ ...orgForm, medicarePracticeIdentifier: e.target.value })} placeholder="Optional provider/practice identifier" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowOrg(false)}>Cancel</Button><Button onClick={saveOrg} loading={saving}>{editOrg ? 'Save changes' : 'Add'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add referral dialog */}
      <Dialog open={showRef} onOpenChange={setShowRef}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add referral</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Referred to *</Label>
              <Select value={refForm.practitionerId || 'none'} onValueChange={(v) => setRefForm({ ...refForm, practitionerId: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Select practitioner" /></SelectTrigger>
                <SelectContent><SelectItem value="none" disabled>Select practitioner</SelectItem>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Referred by</Label>
                <Select value={refForm.referrerId || 'none'} onValueChange={(v) => setRefForm({ ...refForm, referrerId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="e.g. GP" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={refForm.conditionId || 'none'} onValueChange={(v) => setRefForm({ ...refForm, conditionId: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Not set</SelectItem>{conditions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
             <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Issued</Label><Input type="date" value={refForm.issueDate} onChange={(e) => setRefForm({ ...refForm, issueDate: e.target.value })} /></div>
               <div className="space-y-1.5"><Label>Validity</Label><Select value={refForm.validityType} onValueChange={(v) => setRefForm({ ...refForm, validityType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="six_months">Six months</SelectItem><SelectItem value="twelve_months">Twelve months</SelectItem><SelectItem value="indefinite">Indefinite</SelectItem><SelectItem value="custom">Custom dates</SelectItem></SelectContent></Select></div>
            </div>
             {refForm.validityType === 'custom' && <div className="space-y-1.5"><Label>Expires</Label><Input type="date" value={refForm.expiryDate} onChange={(e) => setRefForm({ ...refForm, expiryDate: e.target.value })} /></div>}
             <div className="grid grid-cols-2 gap-3">
               <div className="space-y-1.5"><Label>Service limit</Label><Input type="number" value={refForm.appointmentLimit} onChange={(e) => setRefForm({ ...refForm, appointmentLimit: e.target.value })} placeholder="Optional, e.g. 5" /></div>
               <div className="space-y-1.5"><Label>Limit period</Label><Select value={refForm.serviceLimitPeriod} onValueChange={(v) => setRefForm({ ...refForm, serviceLimitPeriod: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar_year">Calendar year</SelectItem><SelectItem value="rolling_twelve_months">Rolling 12 months</SelectItem></SelectContent></Select></div>
             </div>
            <div className="space-y-1.5"><Label>Reason</Label><Input value={refForm.reason} onChange={(e) => setRefForm({ ...refForm, reason: e.target.value })} placeholder="optional" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRef(false)}>Cancel</Button><Button onClick={saveRef} loading={saving}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
