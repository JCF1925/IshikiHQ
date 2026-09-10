'use client';

import { useState, useEffect } from 'react';
import { useHousehold } from '@/hooks/use-household';
import { useKitchen } from '@/hooks/use-kitchen';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChefHat, ShoppingCart, Calendar, Refrigerator, Plus, Trash2, Edit2, CheckCircle2, Circle, AlertTriangle, Link2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function KitchenPage() {
  const { activeHousehold, isLoading: isLoadingHousehold } = useHousehold();
  const { data, isLoading: isLoadingKitchen, addResource, updateResource, deleteResource, isError: kitchenError } = useKitchen(activeHousehold?.id);
  
  const [activeTab, setActiveTab] = useState('inventory');
  const [today, setToday] = useState('');
  
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [editingInventory, setEditingInventory] = useState<any>(null);

  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any>(null);

  const [isMealPlanOpen, setIsMealPlanOpen] = useState(false);
  const [editingMealPlan, setEditingMealPlan] = useState<any>(null);

  const [isShoppingOpen, setIsShoppingOpen] = useState(false);
  const [editingShopping, setEditingShopping] = useState<any>(null);

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);
  
  if (kitchenError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Error Loading Kitchen</h2>
          <p className="text-muted-foreground">{kitchenError.message || 'Something went wrong.'}</p>
        </div>
      </div>
    );
  }

  if (isLoadingHousehold || isLoadingKitchen) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-primary animate-pulse">
          <ChefHat className="h-8 w-8" />
          <p>Warming up the kitchen...</p>
        </div>
      </div>
    );
  }
  
  if (!activeHousehold) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <ChefHat className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">No Household Found</h2>
          <p className="text-muted-foreground">Please create or join a household to manage your kitchen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ChefHat className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold">Kitchen & Meals</h1>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-4 w-full h-auto p-1 bg-muted/50 rounded-xl">
            <TabsTrigger value="inventory" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Refrigerator className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Pantry & Fridge</span>
            </TabsTrigger>
            <TabsTrigger value="recipes" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <ChefHat className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Recipes</span>
            </TabsTrigger>
            <TabsTrigger value="plans" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <Calendar className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Meal Plan</span>
            </TabsTrigger>
            <TabsTrigger value="shopping" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all">
              <ShoppingCart className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Shopping</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-4 focus-visible:outline-none">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Inventory</h2>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingInventory(null); setIsInventoryOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
            <InventoryDialog 
              open={isInventoryOpen} 
              onOpenChange={setIsInventoryOpen} 
              editItem={editingInventory}
              onSave={(item) => {
                if (editingInventory) updateResource('inventory', editingInventory.id, item);
                else addResource('inventory', item);
                setIsInventoryOpen(false);
              }} 
            />
            
            {data?.inventory.length === 0 ? (
              <EmptyState 
                icon={Refrigerator} 
                title="Your pantry is empty" 
                description="Start tracking your ingredients, fridge, and freezer stock to minimize waste." 
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data?.inventory.map((item) => (
                  <Card key={item.id} className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3 bg-gradient-to-br from-primary/5 to-transparent">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{item.name}</CardTitle>
                          <CardDescription className="text-xs uppercase tracking-wider mt-1 font-semibold text-primary/70">{item.location}</CardDescription>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-bold text-foreground">{item.quantity}</span>
                          <span className="text-sm text-muted-foreground ml-1">{item.unit}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="pt-3 pb-3 px-6 flex justify-between bg-muted/20 border-t">
                      <div className="text-xs text-muted-foreground flex items-center">
                        {item.expiresAt ? `Exp: ${new Date(item.expiresAt).toLocaleDateString('en-AU', { timeZone: 'UTC' })}` : 'No expiry set'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditingInventory(item); setIsInventoryOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteResource('inventory', item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recipes" className="space-y-4 focus-visible:outline-none">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold tracking-tight">Recipes</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditingRecipe({ _startImport: true }); setIsRecipeOpen(true); }}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => { setEditingRecipe(null); setIsRecipeOpen(true); }}>
                  <Plus className="h-4 w-4" /> New Recipe
                </Button>
              </div>
            </div>
            <RecipeDialog 
              open={isRecipeOpen} 
              onOpenChange={setIsRecipeOpen} 
              editItem={editingRecipe}
              householdId={activeHousehold.id}
              onSave={(item) => {
                if (editingRecipe?.id) updateResource('recipe', editingRecipe.id, item);
                else addResource('recipe', item);
                setIsRecipeOpen(false);
              }} 
            />
            
            {data?.recipes.length === 0 ? (
              <EmptyState 
                icon={ChefHat} 
                title="No recipes yet" 
                description="Save your family's favorite meals here." 
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data?.recipes.map((recipe) => (
                  <Card key={recipe.id} className="group overflow-hidden border-border/50 shadow-sm hover:border-primary/30 transition-all cursor-pointer">
                    <CardHeader>
                      <CardTitle className="group-hover:text-primary transition-colors">{recipe.name}</CardTitle>
                      <CardDescription>{recipe.prepMinutes || 0} mins prep time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{recipe.instructions}</p>
                      {recipe.importMethod === 'url' && recipe.sourceUrl ? (
                        <a className="mt-3 inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                          <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">Imported source</span>
                        </a>
                      ) : recipe.importMethod === 'url' ? (
                        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="h-3 w-3" /> Imported from a recipe link</p>
                      ) : recipe.importMethod === 'image' ? (
                        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground"><Upload className="h-3 w-3" /> Imported from a recipe photo</p>
                      ) : null}
                    </CardContent>
                    <CardFooter className="flex justify-between border-t bg-muted/20 py-3">
                      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">
                        {recipe.ingredients?.length || 0} ingredients
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setEditingRecipe(recipe); setIsRecipeOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); deleteResource('recipe', recipe.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="plans" className="space-y-4 focus-visible:outline-none">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Meal Plan</h2>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingMealPlan(null); setIsMealPlanOpen(true); }}>
                <Plus className="h-4 w-4" /> Plan Meal
              </Button>
            </div>
            <MealPlanDialog 
              recipes={data?.recipes || []} 
              open={isMealPlanOpen} 
              onOpenChange={setIsMealPlanOpen} 
              editItem={editingMealPlan}
              onSave={(item) => {
                if (editingMealPlan) updateResource('mealPlan', editingMealPlan.id, item);
                else addResource('mealPlan', item);
                setIsMealPlanOpen(false);
              }} 
            />
            
            {data?.mealPlans.length === 0 ? (
              <EmptyState 
                icon={Calendar} 
                title="Nothing planned" 
                description="Coordinate meals to take the guesswork out of dinner." 
              />
            ) : (
              <div className="space-y-3">
                {data?.mealPlans.sort((a, b) => new Date(a.plannedFor).getTime() - new Date(b.plannedFor).getTime()).map((plan) => {
                  const recipe = data?.recipes.find(r => r.id === plan.recipeId);
                  const isPast = Boolean(today && plan.plannedFor.slice(0, 10) < today);
                  return (
                    <div key={plan.id} className={`flex items-center gap-4 p-4 rounded-xl border bg-card shadow-sm transition-all ${isPast ? 'opacity-60' : 'hover:shadow-md hover:border-primary/30'}`}>
                      <div className="flex flex-col items-center justify-center bg-primary/10 rounded-lg p-2 min-w-[60px] text-primary">
                        <span className="text-xs font-bold uppercase">{new Date(plan.plannedFor).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
                        <span className="text-lg font-bold leading-none mt-1">{new Date(plan.plannedFor).getUTCDate()}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{plan.mealType}</span>
                        </div>
                        <h3 className="font-semibold text-lg">{plan.title || recipe?.name || 'Untitled Meal'}</h3>
                        {recipe && plan.notes && <p className="text-sm text-muted-foreground mt-0.5">{plan.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => { setEditingMealPlan(plan); setIsMealPlanOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteResource('mealPlan', plan.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="shopping" className="space-y-4 focus-visible:outline-none">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Shopping List</h2>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingShopping(null); setIsShoppingOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
            <ShoppingItemDialog 
              open={isShoppingOpen} 
              onOpenChange={setIsShoppingOpen} 
              editItem={editingShopping}
              onSave={(item) => {
                if (editingShopping) updateResource('shoppingEntry', editingShopping.id, item);
                else addResource('shoppingEntry', item);
                setIsShoppingOpen(false);
              }} 
            />
            
            {(!data?.shoppingList || data.shoppingList.length === 0) ? (
              <EmptyState 
                icon={ShoppingCart} 
                title="List is empty" 
                description="Add items you need to buy for your next grocery run." 
              />
            ) : (
              <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <ul className="divide-y">
                  {data.shoppingList.map((item) => (
                    <li key={item.id} className={`flex items-center gap-3 p-4 transition-colors hover:bg-muted/30 ${item.checked ? 'opacity-50 bg-muted/20' : ''}`}>
                      <button 
                        onClick={() => updateResource('shoppingEntry', item.id, { checked: !item.checked })}
                        className="text-primary hover:scale-110 transition-transform"
                      >
                        {item.checked ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                      </button>
                      <div className="flex-1">
                        <span className={`font-medium text-base ${item.checked ? 'line-through text-muted-foreground' : ''}`}>{item.name}</span>
                      </div>
                      <div className="text-sm font-semibold bg-secondary text-secondary-foreground px-2 py-1 rounded-md">
                        {item.quantity} {item.unit}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-foreground" onClick={() => { setEditingShopping(item); setIsShoppingOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-destructive hover:bg-destructive/10" onClick={() => deleteResource('shoppingEntry', item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl bg-muted/10">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">{description}</p>
    </div>
  );
}

function InventoryDialog({ open, onOpenChange, editItem, onSave }: { open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', quantity: 1, unit: 'pcs', location: 'pantry', expiresAt: '' });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          name: editItem.name || '',
          quantity: editItem.quantity || 1,
          unit: editItem.unit || '',
          location: editItem.location || 'pantry',
          expiresAt: editItem.expiresAt ? new Date(editItem.expiresAt).toISOString().split('T')[0] : '',
        });
      } else {
        setFormData({ name: '', quantity: 1, unit: 'pcs', location: 'pantry', expiresAt: '' });
      }
    }
  }, [open, editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Inventory' : 'Add to Inventory'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item Name</Label>
            <Input id="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <select 
              id="location" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            >
              <option value="pantry">Pantry</option>
              <option value="fridge">Fridge</option>
              <option value="freezer">Freezer</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expiry Date (Optional)</Label>
            <Input id="expiresAt" type="date" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RecipePreview = {
  name: string
  ingredients: string[]
  instructions: string
  prepMinutes: number | null
  cookMinutes: number | null
  sourceType: 'url' | 'image'
  confidence: Record<'name' | 'ingredients' | 'instructions' | 'timing', 'high' | 'medium' | 'low'>
  warnings: string[]
}

function RecipeDialog({ open, onOpenChange, editItem, householdId, onSave }: { open: boolean, onOpenChange: (o: boolean) => void, editItem: any, householdId: string, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', ingredients: '', instructions: '', prepMinutes: 30, cookMinutes: 0, _originalIngredients: [] as any[] });
  const [importMode, setImportMode] = useState(false)
  const [sourceType, setSourceType] = useState<'url' | 'image'>('url')
  const [recipeUrl, setRecipeUrl] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<RecipePreview | null>(null)
  const [importError, setImportError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [retainSourceUrl, setRetainSourceUrl] = useState(true)

  useEffect(() => {
    if (open) {
      setImportMode(Boolean(editItem?._startImport))
      setPreview(null)
      setImportError('')
      setRecipeUrl('')
      setPhoto(null)
      setRetainSourceUrl(true)
      if (editItem?.id) {
        setFormData({
          name: editItem.name || '',
          ingredients: editItem.ingredients ? editItem.ingredients.map((i: any) => i.name).join('\n') : '',
          instructions: editItem.instructions || '',
          prepMinutes: editItem.prepMinutes || 30,
          cookMinutes: editItem.cookMinutes || 0,
          _originalIngredients: editItem.ingredients || []
        });
      } else {
        setFormData({ name: '', ingredients: '', instructions: '', prepMinutes: 30, cookMinutes: 0, _originalIngredients: [] });
      }
    }
  }, [open, editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = formData.ingredients.split('\n').filter(i => i.trim() !== '');
    const available = [...formData._originalIngredients]
    const mappedIngredients = lines.map((line, idx) => {
      const name = line.trim()
      const matchingIndex = available.findIndex((ingredient: any) => ingredient.name === name)
      const fallbackIndex = matchingIndex === -1 && lines.length === formData._originalIngredients.length
        ? Math.min(idx, available.length - 1)
        : -1
      const existingIndex = matchingIndex === -1 ? fallbackIndex : matchingIndex
      if (existingIndex === -1) return { name }
      const [existing] = available.splice(existingIndex, 1)
      return existing ? { id: existing.id, name: line.trim() } : { name: line.trim() };
    });
    
    onSave({
      name: formData.name,
      instructions: formData.instructions,
      prepMinutes: formData.prepMinutes,
      cookMinutes: formData.cookMinutes || null,
      ingredients: mappedIngredients,
      ...(preview ? {
        importMethod: preview.sourceType,
        sourceUrl: preview.sourceType === 'url' && retainSourceUrl ? recipeUrl.trim() : null,
      } : {}),
    });
  };

  const extractRecipe = async () => {
    setImportError('')
    setIsExtracting(true)
    try {
      let response: Response
      if (sourceType === 'url') {
        response = await fetch(`/api/households/${householdId}/kitchen/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceType, url: recipeUrl }),
        })
      } else {
        if (!photo) throw new Error('Choose a recipe photo')
        const body = new FormData()
        body.set('sourceType', 'image')
        body.set('file', photo)
        response = await fetch(`/api/households/${householdId}/kitchen/import`, { method: 'POST', body })
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Recipe extraction failed')
      const next = result as RecipePreview
      setPreview(next)
      setFormData({
        name: next.name,
        ingredients: next.ingredients.join('\n'),
        instructions: next.instructions,
        prepMinutes: next.prepMinutes ?? 0,
        cookMinutes: next.cookMinutes ?? 0,
        _originalIngredients: [],
      })
      setImportMode(false)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Recipe extraction failed')
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem?.id ? 'Edit Recipe' : preview ? 'Review imported recipe' : importMode ? 'Import a recipe' : 'Add Recipe'}</DialogTitle>
        </DialogHeader>
        {importMode ? (
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">Import details are only used to prepare this preview. Nothing is saved until you review and confirm it.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={sourceType === 'url' ? 'default' : 'outline'} onClick={() => setSourceType('url')}><Link2 className="mr-2 h-4 w-4" />Recipe link</Button>
              <Button type="button" variant={sourceType === 'image' ? 'default' : 'outline'} onClick={() => setSourceType('image')}><Upload className="mr-2 h-4 w-4" />Recipe photo</Button>
            </div>
            {sourceType === 'url' ? (
              <div className="space-y-2">
                <Label htmlFor="recipe-url">Recipe URL</Label>
                <Input id="recipe-url" type="url" placeholder="https://example.com/recipe" value={recipeUrl} onChange={(event) => setRecipeUrl(event.target.value)} />
                <p className="text-xs text-muted-foreground">HTTPS recipe pages with structured recipe details are supported.</p>
                 <label className="flex items-start gap-2 text-sm">
                   <Checkbox checked={retainSourceUrl} onCheckedChange={(checked) => setRetainSourceUrl(checked === true)} />
                   <span>Keep this source link with the recipe <span className="text-xs text-muted-foreground">(private to household members)</span></span>
                 </label>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="recipe-photo">Recipe-card photo</Label>
                <Input id="recipe-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP; maximum 8 MB.</p>
              </div>
            )}
            {importError && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{importError}</div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" disabled={isExtracting || (sourceType === 'url' ? !recipeUrl.trim() : !photo)} onClick={extractRecipe}>
                {isExtracting ? 'Preparing preview…' : 'Prepare preview'}
              </Button>
            </DialogFooter>
          </div>
        ) : <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {preview && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <p className="text-sm font-medium">Review every field before saving</p>
              {preview.warnings.length ? (
                <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                  {preview.warnings.map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</li>)}
                </ul>
              ) : <p className="text-sm text-emerald-700 dark:text-emerald-300">All core fields were identified. You can still edit them below.</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="recipe-name">Recipe Name {preview?.confidence.name === 'low' && <span className="text-amber-600">(check this field)</span>}</Label>
            <Input id="recipe-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ingredients">Ingredients (one per line) {preview?.confidence.ingredients === 'low' && <span className="text-amber-600">(missing or unclear)</span>}</Label>
            <textarea 
              id="ingredients" 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              required 
              value={formData.ingredients} 
              onChange={e => setFormData({...formData, ingredients: e.target.value})} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions {preview?.confidence.instructions === 'low' && <span className="text-amber-600">(missing or unclear)</span>}</Label>
            <textarea 
              id="instructions" 
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              required 
              value={formData.instructions} 
              onChange={e => setFormData({...formData, instructions: e.target.value})} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prepMinutes">Prep time (mins)</Label>
              <Input id="prepMinutes" type="number" min="0" value={formData.prepMinutes} onChange={e => setFormData({...formData, prepMinutes: parseInt(e.target.value) || 0})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookMinutes">Cook time (mins)</Label>
              <Input id="cookMinutes" type="number" min="0" value={formData.cookMinutes} onChange={e => setFormData({...formData, cookMinutes: parseInt(e.target.value) || 0})} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{preview ? 'Confirm and save recipe' : 'Save Recipe'}</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}

function MealPlanDialog({ recipes, open, onOpenChange, editItem, onSave }: { recipes: any[], open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ title: '', plannedFor: '', mealType: 'Dinner', recipeId: '', notes: '' });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          title: editItem.title || '',
          plannedFor: editItem.plannedFor ? new Date(editItem.plannedFor).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          mealType: editItem.mealType || 'Dinner',
          recipeId: editItem.recipeId || '',
          notes: editItem.notes || ''
        });
      } else {
        setFormData({ title: '', plannedFor: new Date().toISOString().split('T')[0], mealType: 'Dinner', recipeId: '', notes: '' });
      }
    }
  }, [open, editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Meal' : 'Schedule a Meal'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Meal Title</Label>
            <Input id="title" required placeholder="e.g. Spaghetti Bolognese" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plannedFor">Date</Label>
              <Input id="plannedFor" type="date" required value={formData.plannedFor} onChange={e => setFormData({...formData, plannedFor: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mealType">Meal Type</Label>
              <select 
                id="mealType" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.mealType}
                onChange={e => setFormData({...formData, mealType: e.target.value})}
              >
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Snack">Snack</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipeId">Recipe (Optional)</Label>
            <select 
              id="recipeId" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={formData.recipeId}
              onChange={e => setFormData({...formData, recipeId: e.target.value})}
            >
              <option value="">-- No Recipe Selected --</option>
              {recipes.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes / Custom Meal</Label>
            <Input id="notes" placeholder="e.g. Ordering Pizza" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save Plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShoppingItemDialog({ open, onOpenChange, editItem, onSave }: { open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', quantity: 1, unit: 'pcs' });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          name: editItem.name || '',
          quantity: editItem.quantity || 1,
          unit: editItem.unit || '',
        });
      } else {
        setFormData({ name: '', quantity: 1, unit: 'pcs' });
      }
    }
  }, [open, editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Shopping Item' : 'Add to Shopping List'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="shop-name">Item Name</Label>
            <Input id="shop-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shop-quantity">Quantity</Label>
              <Input id="shop-quantity" type="number" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop-unit">Unit</Label>
              <Input id="shop-unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
