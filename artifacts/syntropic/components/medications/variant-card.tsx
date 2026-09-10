import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChevronDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVariantData } from './use-variant-data'
import { PrescriptionsTab } from './prescriptions-tab'
import { DoseHistoryTab } from './dose-history-tab'
import { StockTab } from './stock-tab'
import { RemindersTab } from './reminders-tab'
import { Skeleton } from '@/components/ui/skeleton'

export function VariantCard({ variant, practitioners, onPractitionerAdded }: any) {
  const [expanded, setExpanded] = useState(false)
  const { prescriptions, schedules, stockTxns, logs, stockLevel, loading, refetch } = useVariantData(variant.id, expanded)
  
  const currentStock = stockLevel?.currentQuantity || 0
  const isScheduled = schedules?.length > 0
  const hasDoseToday = logs?.some((l: any) => new Date(l.takenAt).toDateString() === new Date().toDateString() && !l.skipped)

  return (
    <div className={cn(
      "bg-card border rounded-2xl overflow-hidden transition-all duration-300",
      expanded ? "border-violet-500/30 shadow-md shadow-violet-500/5" : "border-border/50 hover:border-border"
    )}>
      {/* Header */}
      <div 
        className="p-4 md:p-5 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
          <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
          <span className="font-medium text-lg md:text-xl text-foreground">
            {variant.strength} {variant.unit} <span className="text-muted-foreground font-normal text-base ml-1">{variant.form}</span>
          </span>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-transparent font-normal">
            {currentStock} in stock
          </Badge>
          {isScheduled && expanded && (
            <Badge variant="outline" className="border-border/50 text-muted-foreground font-normal">
              Scheduled
            </Badge>
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 md:p-6 border-t border-border/50 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
          
          {/* Today Status */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground tracking-wider uppercase">Today {hasDoseToday ? '1/1' : '0/1'}</span>
            {hasDoseToday ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 gap-1.5 rounded-full py-1 px-3">
                <CheckCircle2 className="w-3.5 h-3.5" /> Done
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border/50 text-muted-foreground gap-1.5 rounded-full py-1 px-3">
                Pending
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-full" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <Tabs defaultValue="prescriptions" className="w-full">
              <TabsList className="bg-muted/30 p-1 rounded-full w-full justify-start overflow-x-auto h-auto border border-border/50 flex-nowrap hide-scrollbar">
                {["Prescriptions", "Dose history", "Stock", "Reminder"].map(t => (
                  <TabsTrigger 
                    key={t} 
                    value={t.toLowerCase()} 
                    className="rounded-full px-5 py-2 data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-300 data-[state=active]:border-violet-500/30 data-[state=active]:shadow-none border border-transparent text-sm font-medium transition-all whitespace-nowrap"
                  >
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-8">
                <TabsContent value="prescriptions" className="m-0">
                  <PrescriptionsTab variant={variant} data={{ prescriptions }} onRefetch={refetch} practitioners={practitioners} onPractitionerAdded={onPractitionerAdded} />
                </TabsContent>
                <TabsContent value="dose history" className="m-0">
                  <DoseHistoryTab variant={variant} data={{ logs, schedules }} onRefetch={refetch} />
                </TabsContent>
                <TabsContent value="stock" className="m-0">
                  <StockTab variant={variant} data={{ stockTxns, stockLevel }} onRefetch={refetch} />
                </TabsContent>
                <TabsContent value="reminder" className="m-0">
                  <RemindersTab variant={variant} data={{ schedules, prescriptions }} onRefetch={refetch} />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      )}
    </div>
  )
}
