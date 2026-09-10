'use client';

import { useState, useEffect } from 'react';
import { useHousehold } from '@/hooks/use-household';
import { useStorage } from '@/hooks/use-storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, MapPin, Search, Package, Plus, Trash2, QrCode, Tag, X, ChevronRight, Share, Edit2, AlertTriangle, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Checkbox } from '@/components/ui/checkbox';
import { StorageLabelSheet } from './storage-label-sheet';

export default function StoragePage() {
  const { activeHousehold, isLoading: isLoadingHousehold } = useHousehold();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Use debounced search or just fetch on submit to avoid hammering the API
  const {
    data,
    isLoading: isLoadingStorage,
    addResource,
    updateResource,
    deleteResource,
    generateQR,
    generateLabels,
    activeLabels,
    isLoadingLabels,
    labelsError,
    reprintLabel,
    revokeLabel,
    isError: storageError,
  } = useStorage(activeHousehold?.id, searchQuery);
  
  const [activeTab, setActiveTab] = useState('items');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrData, setQrData] = useState<{url: string, token: string} | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, { type: 'item' | 'container', id: string, name: string, displayText: string }>>({});
  const [labelSheetOpen, setLabelSheetOpen] = useState(false);
  const [preparedLabel, setPreparedLabel] = useState<Awaited<ReturnType<typeof reprintLabel>> | null>(null);
  const [labelActionId, setLabelActionId] = useState<string | null>(null);

  const [isItemOpen, setIsItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [isContainerOpen, setIsContainerOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<any>(null);

  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);

  if (storageError) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold">Error Loading Storage</h2>
          <p className="text-muted-foreground">{storageError.message || 'Something went wrong.'}</p>
        </div>
      </div>
    );
  }
  
  if (isLoadingHousehold || (isLoadingStorage && !data)) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-primary animate-pulse">
          <Box className="h-8 w-8" />
          <p>Opening storage...</p>
        </div>
      </div>
    );
  }
  
  if (!activeHousehold) {
    return (
      <div className="flex h-[100dvh] items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <Box className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="text-2xl font-bold">No Household Found</h2>
          <p className="text-muted-foreground">Please create or join a household to manage your belongings.</p>
        </div>
      </div>
    );
  }

  const handleGenerateQR = async (itemId: string) => {
    try {
      const result = await generateQR(itemId);
      if (result && result.url) {
        setQrData(result);
        setQrDialogOpen(true);
      } else {
        toast.error("Failed to generate QR code");
      }
    } catch {
      toast.error("Error generating QR code");
    }
  };

  const toggleLabel = (record: { type: 'item' | 'container', id: string, name: string }) => {
    const key = `${record.type}:${record.id}`;
    setSelectedLabels((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = { ...record, displayText: record.name };
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Box className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold">Storage & Belongings</h1>
        </div>
        <Button size="sm" variant="outline" disabled={!Object.keys(selectedLabels).length} onClick={() => setLabelSheetOpen(true)}>
          <Printer className="mr-2 h-4 w-4" />
          Print selected ({Object.keys(selectedLabels).length})
        </Button>
      </header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto p-1 bg-muted/50 rounded-xl w-full sm:w-auto">
              <TabsTrigger value="items" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all px-6">
                <Tag className="h-4 w-4 mr-2" />
                <span>Items</span>
              </TabsTrigger>
              <TabsTrigger value="containers" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all px-6">
                <Package className="h-4 w-4 mr-2" />
                <span>Containers</span>
              </TabsTrigger>
              <TabsTrigger value="locations" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all px-6">
                <MapPin className="h-4 w-4 mr-2" />
                <span>Locations</span>
              </TabsTrigger>
              <TabsTrigger value="labels" className="py-2.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all px-6">
                <QrCode className="h-4 w-4 mr-2" />
                <span>Active labels</span>
              </TabsTrigger>
            </TabsList>
            
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={`Search...`} 
                className="pl-9 pr-4 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <TabsContent value="items" className="space-y-4 focus-visible:outline-none mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Stored Items</h2>
              <Button size="sm" className="gap-1.5" disabled={(data?.locations?.length || 0) === 0 && (data?.containers?.length || 0) === 0} onClick={() => { setEditingItem(null); setIsItemOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>
            <ItemDialog 
              locations={data?.locations || []} 
              containers={data?.containers || []} 
              open={isItemOpen}
              onOpenChange={setIsItemOpen}
              editItem={editingItem}
              onSave={(item) => {
                if (editingItem) updateResource('item', editingItem.id, item);
                else addResource('item', item);
                setIsItemOpen(false);
              }} 
            />
            
            {(!data?.items || data.items.length === 0) ? (
              <EmptyState 
                icon={Box} 
                title={searchQuery ? "No items found" : "No items stored yet"} 
                description={searchQuery ? "Try adjusting your search terms." : "Add items to keep track of where things are stored."} 
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((item) => {
                  const location = data.locations.find(l => l.id === item.locationId);
                  const container = data.containers.find(c => c.id === item.containerId);
                  
                  return (
                    <Card key={item.id} className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-all flex flex-col group">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base group-hover:text-primary transition-colors flex justify-between items-start">
                          <span className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              aria-label={`Select ${item.name} for label printing`}
                              checked={Boolean(selectedLabels[`item:${item.id}`])}
                              onCheckedChange={() => toggleLabel({ type: 'item', id: item.id, name: item.name })}
                            />
                            <span className="truncate pr-2">{item.name}</span>
                          </span>
                          {Number(item.quantity) !== 1 && (
                            <span className="shrink-0 text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">
                              {Number(item.quantity)} {item.unit || ''}
                            </span>
                          )}
                        </CardTitle>
                        {item.description && <CardDescription className="line-clamp-2">{item.description}</CardDescription>}
                      </CardHeader>
                      <CardContent className="flex-1 pb-3">
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {item.labels.map((label: any) => (
                            <span key={label.id || label.value} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
                              {label.value}
                            </span>
                          ))}
                        </div>
                        
                        <div className="space-y-1.5 mt-auto">
                          {(location || container || item.positionText) && (
                            <div className="flex flex-col gap-1 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg">
                              {(location || container) && (
                                <div className="flex items-center">
                                  <MapPin className="h-3.5 w-3.5 mr-2 shrink-0 text-primary" />
                                  <span className="truncate">
                                    {location?.name}
                                    {location && container && <ChevronRight className="inline h-3 w-3 mx-1" />}
                                    {container?.name}
                                  </span>
                                </div>
                              )}
                              {item.positionText && (
                                <div className="text-xs italic pl-5 text-muted-foreground/80">
                                  {item.positionText}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="pt-3 pb-3 px-6 flex justify-between bg-muted/10 border-t gap-2">
                        <Button variant="outline" size="sm" className="h-8 flex-1 text-xs" onClick={() => handleGenerateQR(item.id)}>
                          <QrCode className="h-3.5 w-3.5 mr-1.5" /> Label QR
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0" onClick={() => { setEditingItem(item); setIsItemOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0" onClick={() => deleteResource('item', item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="containers" className="space-y-4 focus-visible:outline-none mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Containers & Boxes</h2>
              <Button size="sm" className="gap-1.5" disabled={(data?.locations?.length || 0) === 0} onClick={() => { setEditingContainer(null); setIsContainerOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Container
              </Button>
            </div>
            <ContainerDialog 
              locations={data?.locations || []} 
              open={isContainerOpen}
              onOpenChange={setIsContainerOpen}
              editItem={editingContainer}
              onSave={(item) => {
                if (editingContainer) updateResource('container', editingContainer.id, item);
                else addResource('container', item);
                setIsContainerOpen(false);
              }} 
            />
            
            {(!data?.containers || data.containers.length === 0) ? (
              <EmptyState 
                icon={Package} 
                title="No containers" 
                description="Add boxes, bins, or drawers to organize your items better." 
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.containers.map((container) => {
                  const location = data.locations.find(l => l.id === container.locationId);
                  const itemCount = data.items.filter(i => i.containerId === container.id).length;
                  
                  return (
                    <Card key={container.id} className="overflow-hidden border-border/50 shadow-sm hover:border-primary/30 transition-all">
                      <CardHeader className="pb-3 bg-gradient-to-br from-primary/5 to-transparent">
                        <CardTitle className="flex items-center gap-2">
                          <Checkbox
                            aria-label={`Select ${container.name} for label printing`}
                            checked={Boolean(selectedLabels[`container:${container.id}`])}
                            onCheckedChange={() => toggleLabel({ type: 'container', id: container.id, name: container.name })}
                          />
                          <Package className="h-4 w-4 text-primary" />
                          {container.name}
                        </CardTitle>
                          {container.positionText && <CardDescription>Position: {container.positionText}</CardDescription>}
                      </CardHeader>
                      <CardContent className="py-4">
                        <div className="flex items-center text-sm font-medium text-muted-foreground">
                          <MapPin className="h-4 w-4 mr-2" />
                          {location?.name || 'Unknown Location'}
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between border-t bg-muted/20 py-3">
                        <span className="text-xs font-medium bg-background border px-2 py-1 rounded-md">
                          {itemCount} items inside
                        </span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditingContainer(container); setIsContainerOpen(true); }}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteResource('container', container.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="locations" className="space-y-4 focus-visible:outline-none mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight">Storage Locations</h2>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingLocation(null); setIsLocationOpen(true); }}>
                <Plus className="h-4 w-4" /> Add Location
              </Button>
            </div>
            <LocationDialog 
              open={isLocationOpen}
              onOpenChange={setIsLocationOpen}
              editItem={editingLocation}
              onSave={(item) => {
                if (editingLocation) updateResource('location', editingLocation.id, item);
                else addResource('location', item);
                setIsLocationOpen(false);
              }} 
            />
            
            {(!data?.locations || data.locations.length === 0) ? (
              <EmptyState 
                icon={MapPin} 
                title="No locations defined" 
                description="Add rooms, closets, or areas where things are stored." 
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {data.locations.map((location) => {
                  const containerCount = data.containers.filter(c => c.locationId === location.id).length;
                  const looseItemCount = data.items.filter(i => i.locationId === location.id && !i.containerId).length;
                  
                  return (
                    <Card key={location.id} className="overflow-hidden border-border/50 shadow-sm hover:border-primary/30 transition-all">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{location.name}</CardTitle>
                        {location.description && <CardDescription>{location.description}</CardDescription>}
                      </CardHeader>
                      <CardContent className="pt-2 pb-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Containers</span>
                          <span className="font-semibold">{containerCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Loose Items</span>
                          <span className="font-semibold">{looseItemCount}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-end border-t bg-muted/10 py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditingLocation(location); setIsLocationOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteResource('location', location.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="labels" className="space-y-4 focus-visible:outline-none mt-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Active storage labels</h2>
                <p className="text-sm text-muted-foreground">Reprint or revoke one label without changing the others.</p>
              </div>
              <span className="text-sm text-muted-foreground">{activeLabels.length} active</span>
            </div>

            {labelsError ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Active labels could not be loaded. Please try again.</span>
              </div>
            ) : isLoadingLabels ? (
              <div className="flex items-center justify-center rounded-xl border border-dashed p-12 text-sm text-muted-foreground">
                Loading active labels…
              </div>
            ) : activeLabels.length === 0 ? (
              <EmptyState
                icon={QrCode}
                title="No active labels"
                description="Print a label from an item or container to see it here."
              />
            ) : (
              <div className="grid gap-3">
                {activeLabels.map((label) => (
                  <Card key={label.referenceId} className="border-border/50 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold">{label.resourceName}</h3>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">{label.type}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Created {formatStorageLabelDate(label.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={labelActionId === label.referenceId}
                          onClick={async () => {
                            setLabelActionId(label.referenceId)
                            try {
                              const generated = await reprintLabel(label.referenceId)
                              setPreparedLabel(generated)
                              setLabelSheetOpen(true)
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : 'Storage label could not be reprinted')
                            } finally {
                              setLabelActionId(null)
                            }
                          }}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reprint
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={labelActionId === label.referenceId}
                          onClick={async () => {
                            if (!window.confirm(`Revoke the label for “${label.resourceName}”? This QR code will stop working.`)) return
                            setLabelActionId(label.referenceId)
                            try {
                              await revokeLabel(label.referenceId)
                            } finally {
                              setLabelActionId(null)
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Item QR Label</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 space-y-6">
            <div className="p-4 bg-white rounded-xl shadow-sm border">
              {qrData?.url && (
                <QRCodeSVG
                  value={qrData.url}
                  size={192}
                  level="M"
                  marginSize={2}
                  title="Authenticated storage item link"
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Print this QR code and attach it to the physical item or container. Scanning it will jump directly to the item's details.
            </p>
            <div className="flex w-full gap-2 mt-4">
              <Input readOnly value={qrData?.url || ''} className="bg-muted text-xs font-mono" />
              <Button size="icon" variant="outline" onClick={() => {
                navigator.clipboard.writeText(qrData?.url || '');
                toast.success('Link copied to clipboard');
              }}>
                <Share className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button variant="secondary" onClick={() => window.print()}>
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <StorageLabelSheet
        open={labelSheetOpen}
        onOpenChange={(open) => {
          setLabelSheetOpen(open)
          if (!open) setPreparedLabel(null)
        }}
        selected={Object.values(selectedLabels)}
        generateLabels={generateLabels}
        preparedLabels={preparedLabel ? [preparedLabel] : null}
      />
    </div>
  );
}

function formatStorageLabelDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
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

function LocationDialog({ open, onOpenChange, editItem, onSave }: { open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          name: editItem.name || '',
          description: editItem.description || ''
        });
      } else {
        setFormData({ name: '', description: '' });
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
          <DialogTitle>{editItem ? 'Edit Storage Location' : 'Add Storage Location'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="loc-name">Location Name</Label>
            <Input id="loc-name" placeholder="e.g. Garage, Attic, Master Closet" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loc-desc">Description (Optional)</Label>
            <Input id="loc-desc" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
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

function ContainerDialog({ locations, open, onOpenChange, editItem, onSave }: { locations: any[], open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', locationId: '', positionText: '' });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          name: editItem.name || '',
          locationId: editItem.locationId || '',
          positionText: editItem.positionText || ''
        });
      } else {
        setFormData({ name: '', locationId: '', positionText: '' });
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
          <DialogTitle>{editItem ? 'Edit Container' : 'Add Container / Box'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="con-name">Container Name/Number</Label>
            <Input id="con-name" placeholder="e.g. Box 12, Winter Clothes Bin" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="con-loc">Location</Label>
            <select 
              id="con-loc" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              required
              value={formData.locationId}
              onChange={e => setFormData({...formData, locationId: e.target.value})}
            >
              <option value="" disabled>Select a location</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="con-pos">Position Details (Optional)</Label>
            <Input id="con-pos" placeholder="e.g. Top shelf, left side" value={formData.positionText} onChange={e => setFormData({...formData, positionText: e.target.value})} />
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

function ItemDialog({ locations, containers, open, onOpenChange, editItem, onSave }: { locations: any[], containers: any[], open: boolean, onOpenChange: (o: boolean) => void, editItem: any, onSave: (data: any) => void }) {
  const [formData, setFormData] = useState({ name: '', description: '', labels: '', locationId: '', containerId: '', positionText: '', quantity: 1, unit: 'pcs', _originalLabels: [] as any[] });

  useEffect(() => {
    if (open) {
      if (editItem) {
        setFormData({
          name: editItem.name || '',
          description: editItem.description || '',
          labels: editItem.labels ? editItem.labels.map((l: any) => l.value).join(', ') : '',
          locationId: editItem.locationId || '',
          containerId: editItem.containerId || '',
          positionText: editItem.positionText || '',
          quantity: editItem.quantity || 1,
          unit: editItem.unit || 'pcs',
          _originalLabels: editItem.labels || [],
        });
      } else {
        setFormData({ name: '', description: '', labels: '', locationId: '', containerId: '', positionText: '', quantity: 1, unit: 'pcs', _originalLabels: [] });
      }
    }
  }, [open, editItem]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const available = [...formData._originalLabels]
    const labels = formData.labels.split(',').map((label: string) => label.trim()).filter(Boolean).map((value: string, index: number, values: string[]) => {
      const matchingIndex = available.findIndex((label: any) => label.value === value)
      const fallbackIndex = matchingIndex === -1 && values.length === formData._originalLabels.length
        ? Math.min(index, available.length - 1)
        : -1
      const existingIndex = matchingIndex === -1 ? fallbackIndex : matchingIndex
      if (existingIndex === -1) return { value }
      const [existing] = available.splice(existingIndex, 1)
      return { id: existing.id, createdById: existing.createdById, value }
    })
    onSave({
      name: formData.name,
      description: formData.description,
      locationId: formData.locationId,
      containerId: formData.containerId || null,
      positionText: formData.positionText,
      quantity: formData.quantity,
      unit: formData.unit,
      labels,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Item' : 'Store an Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="item-name">Item Name</Label>
            <Input id="item-name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} autoFocus />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="item-labels">Labels (comma separated)</Label>
            <Input id="item-labels" placeholder="e.g. winter, clothes, camping" value={formData.labels} onChange={e => setFormData({...formData, labels: e.target.value})} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-qty">Quantity</Label>
              <Input id="item-qty" type="number" min="1" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 1})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-unit">Unit</Label>
              <Input id="item-unit" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-loc">Location</Label>
              <select 
                id="item-loc" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formData.locationId}
                onChange={e => {
                  const locationId = e.target.value;
                  // If we change location, and the selected container is not in this new location, reset container
                  const container = containers.find(c => c.id === formData.containerId);
                  const containerId = container?.locationId === locationId ? formData.containerId : '';
                  setFormData({...formData, locationId, containerId});
                }}
                required
              >
                <option value="" disabled>Select a location</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-con">Container</Label>
              <select 
                id="item-con" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formData.containerId}
                onChange={e => {
                  const containerId = e.target.value
                  const container = containers.find(c => c.id === containerId)
                  setFormData({
                    ...formData,
                    containerId,
                    locationId: container?.locationId || formData.locationId,
                  })
                }}
              >
                <option value="">-- None --</option>
                {containers.filter(c => !formData.locationId || c.locationId === formData.locationId).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="item-pos">Position Details (Optional)</Label>
            <Input id="item-pos" placeholder="e.g. Back left corner" value={formData.positionText} onChange={e => setFormData({...formData, positionText: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="item-desc">Description / Notes</Label>
            <textarea 
              id="item-desc" 
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
            />
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
