export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { PATCH as confirmPeriod } from '@/app/api/income/[id]/periods/route'

// Keep confirmation addressable by period id while retaining the source-scoped
// collection endpoint for schedule generation.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params
  return confirmPeriod(request, { params: Promise.resolve({ id: periodId }) })
}