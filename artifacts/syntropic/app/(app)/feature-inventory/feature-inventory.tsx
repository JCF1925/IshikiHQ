'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, ListTree, RotateCcw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FeatureInventoryRow } from '@/lib/feature-inventory'

type FeatureInventoryProps = {
  rows: FeatureInventoryRow[]
}

function uniqueValues(rows: FeatureInventoryRow[], key: 'module' | 'submodule' | 'surface') {
  return [...new Set(rows.map((row) => row[key]))].sort((a, b) => a.localeCompare(b))
}

function webRoute(row: FeatureInventoryRow) {
  if (row.surface !== 'Web' || !row.routeOrSource.startsWith('/')) return null

  const [route, ...sourceParts] = row.routeOrSource.split(';')
  const trimmedRoute = route.trim()
  if (!/^\/[\w./~:@%+,'!$&()*=-]*$/.test(trimmedRoute)) return null

  return {
    route: trimmedRoute,
    source: sourceParts.join(';').trim(),
  }
}

function RouteOrSource({ row }: { row: FeatureInventoryRow }) {
  const route = webRoute(row)

  if (!route) {
    return <code className="break-words text-xs text-muted-foreground">{row.routeOrSource}</code>
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Link
        href={route.route}
        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${route.route}`}
        data-testid={`link-feature-route-${route.route === '/' ? 'home' : route.route.slice(1).replace(/\//g, '-')}`}
      >
        {route.route}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {route.source && <span className="text-xs text-muted-foreground">; {route.source}</span>}
    </span>
  )
}

export function FeatureInventory({ rows }: FeatureInventoryProps) {
  const [query, setQuery] = useState('')
  const [module, setModule] = useState('all')
  const [submodule, setSubmodule] = useState('all')
  const [surface, setSurface] = useState('all')

  const modules = useMemo(() => uniqueValues(rows, 'module'), [rows])
  const submodules = useMemo(() => uniqueValues(rows, 'submodule'), [rows])
  const surfaces = useMemo(() => uniqueValues(rows, 'surface'), [rows])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()

    return rows.filter((row) => {
      const matchesQuery = !normalizedQuery || [row.module, row.submodule, row.feature]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))

      return matchesQuery
        && (module === 'all' || row.module === module)
        && (submodule === 'all' || row.submodule === submodule)
        && (surface === 'all' || row.surface === surface)
    })
  }, [module, query, rows, submodule, surface])

  const hasFilters = query.length > 0 || module !== 'all' || submodule !== 'all' || surface !== 'all'
  const clearFilters = () => {
    setQuery('')
    setModule('all')
    setSubmodule('all')
    setSurface('all')
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Product reference</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <ListTree className="h-6 w-6" aria-hidden="true" />
            Feature inventory
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A searchable map of Ishiki capabilities across web, mobile, and API surfaces.
          </p>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-inventory-source">
          {rows.length} documented {rows.length === 1 ? 'feature' : 'features'} · static reference
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(18rem,1.5fr)_repeat(3,minmax(10rem,1fr))_auto] lg:items-end">
            <div className="space-y-2">
              <label htmlFor="feature-inventory-search" className="text-sm font-medium">Search features</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="feature-inventory-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search module, submodule, or feature…"
                  className="pl-9"
                  data-testid="input-feature-inventory-search"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="feature-inventory-module" className="text-sm font-medium">Module</label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger id="feature-inventory-module" data-testid="select-feature-inventory-module">
                  <SelectValue placeholder="All modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {modules.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="feature-inventory-submodule" className="text-sm font-medium">Submodule</label>
              <Select value={submodule} onValueChange={setSubmodule}>
                <SelectTrigger id="feature-inventory-submodule" data-testid="select-feature-inventory-submodule">
                  <SelectValue placeholder="All submodules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All submodules</SelectItem>
                  {submodules.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="feature-inventory-surface" className="text-sm font-medium">Surface</label>
              <Select value={surface} onValueChange={setSurface}>
                <SelectTrigger id="feature-inventory-surface" data-testid="select-feature-inventory-surface">
                  <SelectValue placeholder="All surfaces" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All surfaces</SelectItem>
                  {surfaces.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="gap-2"
                aria-label="Clear inventory filters"
                data-testid="button-clear-inventory-filters"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="inventory-results-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="inventory-results-heading" className="text-sm font-semibold">Inventory results</h2>
            <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="text-inventory-results">
              Showing {filteredRows.length} of {rows.length} {rows.length === 1 ? 'feature' : 'features'}
            </p>
          </div>
          {(module !== 'all' || submodule !== 'all' || surface !== 'all') && (
            <div className="flex flex-wrap gap-1.5" aria-label="Active filters">
              {module !== 'all' && <Badge variant="secondary">{module}</Badge>}
              {submodule !== 'all' && <Badge variant="secondary">{submodule}</Badge>}
              {surface !== 'all' && <Badge variant="secondary">{surface}</Badge>}
            </div>
          )}
        </div>

        {filteredRows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
              <h3 className="font-semibold">No matching features</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                Try a different search or clear the filters to see the full inventory.
              </p>
              <Button type="button" variant="outline" onClick={clearFilters} data-testid="button-empty-clear-inventory-filters">
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Feature inventory results</caption>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead scope="col" className="whitespace-nowrap text-xs uppercase tracking-wide">Module</TableHead>
                      <TableHead scope="col" className="whitespace-nowrap text-xs uppercase tracking-wide">Submodule</TableHead>
                      <TableHead scope="col" className="min-w-72 text-xs uppercase tracking-wide">Feature / function</TableHead>
                      <TableHead scope="col" className="whitespace-nowrap text-xs uppercase tracking-wide">Surface</TableHead>
                      <TableHead scope="col" className="min-w-44 text-xs uppercase tracking-wide">Route or source</TableHead>
                      <TableHead scope="col" className="min-w-56 text-xs uppercase tracking-wide">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, index) => (
                      <TableRow key={`${row.module}-${row.submodule}-${row.feature}`} data-testid={`row-feature-inventory-${index}`}>
                        <TableCell className="align-top font-medium">{row.module}</TableCell>
                        <TableCell className="align-top text-muted-foreground">{row.submodule}</TableCell>
                        <TableCell className="align-top">{row.feature}</TableCell>
                        <TableCell className="align-top"><Badge variant="outline">{row.surface}</Badge></TableCell>
                        <TableCell className="align-top"><RouteOrSource row={row} /></TableCell>
                        <TableCell className="align-top text-sm text-muted-foreground">{row.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}