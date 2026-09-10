'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowRight, Repeat } from 'lucide-react'
import { FadeIn } from '@/components/ui/animate'
import { RecurringClient } from '../recurring/recurring-client'
import { BillsClient } from '../bills/bills-client'
import { BnplClient } from '../bnpl/bnpl-client'
import { Button } from '@/components/ui/button'

export function CommitmentsClient() {
  const [tab, setTab] = useState('recurring')
  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-6 w-6 text-primary" /> Commitments overview
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review recurring transactions, subscriptions &amp; bills, and BNPL plans together here. For focused bill management or instalment tracking, use one of these dedicated workspaces in Money.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-auto min-h-9 w-full max-w-full whitespace-normal text-left sm:w-auto"
            >
              <Link href="/bills">
                Bills workspace <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-auto min-h-9 w-full max-w-full whitespace-normal text-left sm:w-auto"
            >
              <Link href="/bnpl">
                BNPL workspace <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </FadeIn>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="bills">Subscriptions &amp; Bills</TabsTrigger>
          <TabsTrigger value="bnpl">BNPL &amp; Instalments</TabsTrigger>
        </TabsList>
        <TabsContent value="recurring" className="mt-4">
          <RecurringClient />
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <BillsClient />
        </TabsContent>
        <TabsContent value="bnpl" className="mt-4">
          <BnplClient />
        </TabsContent>
      </Tabs>
    </div>
  )
}
