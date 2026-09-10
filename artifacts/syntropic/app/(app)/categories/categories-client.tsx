'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { FolderTree, Plus, Trash2, Pencil, ChevronRight, ChevronDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'

type Cat = { id: string; name: string; kind: string; level: number; parentId: string | null; taxCategory: string | null; children?: Cat[] }

const KIND_META: Record<string, { label: string; color: string }> = {
  income: { label: 'Income', color: 'bg-emerald-500/20 text-emerald-400' },
  expense: { label: 'Expense', color: 'bg-rose-500/20 text-rose-400' },
  transfer: { label: 'Transfer', color: 'bg-sky-500/20 text-sky-400' },
}

const DEFAULT_CHART: { name: string; kind: string; children: { name: string; children?: string[] }[] }[] = [
  { name: 'Income', kind: 'income', children: [
    { name: 'Salary & Wages', children: ['Base Salary', 'Overtime', 'Bonus'] },
    { name: 'Investment Income', children: ['Dividends', 'Interest', 'Rent Received'] },
    { name: 'Government', children: ['Centrelink', 'Tax Refund'] },
  ]},
  { name: 'Housing', kind: 'expense', children: [
    { name: 'Rent / Mortgage', children: ['Rent', 'Mortgage Interest', 'Mortgage Principal'] },
    { name: 'Utilities', children: ['Electricity', 'Gas', 'Water', 'Internet'] },
    { name: 'Maintenance' , children: [] },
  ]},
  { name: 'Living', kind: 'expense', children: [
    { name: 'Groceries', children: [] },
    { name: 'Transport', children: ['Fuel', 'Public Transport', 'Rideshare'] },
    { name: 'Health', children: ['Medications', 'Doctor / Specialist', 'Private Health Insurance'] },
  ]},
  { name: 'Lifestyle', kind: 'expense', children: [
    { name: 'Dining Out', children: [] },
    { name: 'Entertainment', children: ['Subscriptions', 'Events'] },
    { name: 'Shopping', children: [] },
  ]},
  { name: 'Financial', kind: 'expense', children: [
    { name: 'Bank Fees', children: [] },
    { name: 'Interest & Charges', children: [] },
    { name: 'Tax & HELP', children: ['Income Tax', 'HELP Repayment'] },
  ]},
  { name: 'Transfers', kind: 'transfer', children: [
    { name: 'Between Accounts', children: [] },
    { name: 'Savings', children: [] },
  ]},
]

export function CategoriesClient() {
  const [cats, setCats] = useState<Cat[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [showAdd, setShowAdd] = useState(false)
  const [addParent, setAddParent] = useState<Cat | null>(null)
  const [form, setForm] = useState({ name: '', kind: 'expense', taxCategory: '' })

  const [editing, setEditing] = useState<Cat | null>(null)
  const [editForm, setEditForm] = useState({ name: '', taxCategory: '' })

  const fetchCats = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (!res.ok) throw new Error()
      setCats(await res.json())
    } catch { toast.error('Failed to load categories') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchCats() }, [fetchCats])

  const buildTree = (flat: Cat[]): Cat[] => {
    const map = new Map<string, Cat>()
    flat.forEach((c) => map.set(c.id, { ...c, children: [] }))
    const roots: Cat[] = []
    map.forEach((c) => {
      if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.children!.push(c)
      else roots.push(c)
    })
    return roots
  }

  const openAddRoot = () => { setAddParent(null); setForm({ name: '', kind: 'expense', taxCategory: '' }); setShowAdd(true) }
  const openAddChild = (parent: Cat) => { setAddParent(parent); setForm({ name: '', kind: parent.kind, taxCategory: '' }); setShowAdd(true) }

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, kind: addParent ? addParent.kind : form.kind, parentId: addParent?.id ?? null, taxCategory: form.taxCategory || null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error) }
      if (addParent) setExpanded((e) => ({ ...e, [addParent.id]: true }))
      toast.success('Category added')
      setShowAdd(false)
      fetchCats()
    } catch (e: any) { toast.error(e?.message ?? 'Failed to add category') }
    finally { setSaving(false) }
  }

  const openEdit = (c: Cat) => { setEditing(c); setEditForm({ name: c.name, taxCategory: c.taxCategory ?? '' }); }
  const handleEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/categories/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editForm.name, taxCategory: editForm.taxCategory || null }),
      })
      if (!res.ok) throw new Error()
      toast.success('Category updated')
      setEditing(null)
      fetchCats()
    } catch { toast.error('Failed to update') }
    finally { setSaving(false) }
  }

  const handleDelete = async (c: Cat) => {
    if (!confirm(`Delete "${c.name}"${(c.children?.length ?? 0) > 0 ? ' and all its sub-categories' : ''}?`)) return
    try {
      await fetch(`/api/categories/${c.id}`, { method: 'DELETE' })
      toast.success('Category deleted')
      fetchCats()
    } catch { toast.error('Failed to delete') }
  }

  const handleSeed = async () => {
    if (!confirm('Add a starter Australian chart of accounts? This will not remove any existing categories.')) return
    setSaving(true)
    try {
      for (const root of DEFAULT_CHART) {
        const r = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: root.name, kind: root.kind }) })
        const rootCat: any = await r.json()
        for (const child of root.children) {
          const c = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: child.name, parentId: rootCat.id }) })
          const childCat: any = await c.json()
          for (const leaf of (child.children ?? [])) {
            await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: leaf, parentId: childCat.id }) })
          }
        }
      }
      toast.success('Starter chart of accounts created')
      fetchCats()
    } catch { toast.error('Failed to seed chart') }
    finally { setSaving(false) }
  }

  const tree = buildTree(cats)

  const TreeNode = ({ node, depth }: { node: Cat; depth: number }) => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isOpen = expanded[node.id] ?? false
    return (
      <div>
        <div className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/60 group" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
          {hasChildren ? (
            <button onClick={() => setExpanded((e) => ({ ...e, [node.id]: !isOpen }))} className="text-muted-foreground hover:text-foreground">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : <span className="w-4" />}
          <span className="text-sm font-medium">{node.name}</span>
          {depth === 0 && <Badge className={`text-[10px] ${KIND_META[node.kind]?.color ?? ''}`}>{KIND_META[node.kind]?.label ?? node.kind}</Badge>}
          {node.taxCategory && <Badge variant="outline" className="text-[10px]">Tax: {node.taxCategory}</Badge>}
          <span className="text-[10px] text-muted-foreground">L{node.level}</span>
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.level < 3 && (
              <Button variant="ghost" size="icon-sm" onClick={() => openAddChild(node)} title="Add sub-category"><Plus className="h-3.5 w-3.5" /></Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(node)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(node)} className="text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        {isOpen && hasChildren && node.children!.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2"><FolderTree className="h-6 w-6" /> Chart of Accounts</h1>
            <p className="text-muted-foreground text-sm mt-1">A 3-level, fully editable category tree used across transactions, budgets and tax.</p>
          </div>
          <div className="flex gap-2">
            {cats.length === 0 && <Button variant="outline" onClick={handleSeed} disabled={saving}><Sparkles className="h-4 w-4 mr-2" /> Add starter chart</Button>}
            <Button onClick={openAddRoot}><Plus className="h-4 w-4 mr-2" /> Add category</Button>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <CardContent className="p-3">
            {loading ? (
              <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : tree.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No categories yet. Add a starter chart or create your own.</p>
              </div>
            ) : (
              <div className="space-y-0.5">{tree.map((node) => <TreeNode key={node.id} node={node} depth={0} />)}</div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent aria-describedby="add-category-dialog-description" className="sm:max-w-md">
          <DialogHeader><DialogTitle>{addParent ? `Add sub-category under “${addParent.name}”` : 'Add top-level category'}</DialogTitle></DialogHeader>
          <p id="add-category-dialog-description" className="sr-only">Add a category and optionally place it under a parent category.</p>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Groceries" autoFocus /></div>
            {!addParent && (
              <div>
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v: string) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Tax category (optional)</Label><Input value={form.taxCategory} onChange={(e: any) => setForm({ ...form, taxCategory: e.target.value })} placeholder="e.g. D5 Work-related expenses" /></div>
            <Button onClick={handleAdd} className="w-full" loading={saving}>Add category</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent aria-describedby="edit-category-dialog-description" className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit category</DialogTitle></DialogHeader>
          <p id="edit-category-dialog-description" className="sr-only">Edit the category name and settings.</p>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={editForm.name} onChange={(e: any) => setEditForm({ ...editForm, name: e.target.value })} /></div>
            <div><Label>Tax category (optional)</Label><Input value={editForm.taxCategory} onChange={(e: any) => setEditForm({ ...editForm, taxCategory: e.target.value })} /></div>
            <Button onClick={handleEdit} className="w-full" loading={saving}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
