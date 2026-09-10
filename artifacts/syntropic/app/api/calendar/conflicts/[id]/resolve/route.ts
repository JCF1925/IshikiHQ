export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess, parseBody } from '@/lib/api'
import { z } from 'zod'
import { providerVersionEventData } from '@/lib/calendar-core'
import { enqueueCalendarSync } from '@/lib/calendar-server'
const schema = z.object({ resolution: z.enum(['keep_local', 'keep_provider', 'manual']) })
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
 const s=await auth(); if(!s?.user)return apiError('UNAUTHORIZED','Authentication required',401); const {id}=await params; const p=await parseBody(r,schema); if(!p.success)return p.response
 const c=await prisma.calendarSyncConflict.findFirst({where:{id,connection:{userId:(s.user as any).id}}}); if(!c)return apiError('NOT_FOUND','Conflict not found',404)
 if(c.resolvedAt)return apiError('CONFLICT','Conflict is already resolved',409)
  const providerData=p.data.resolution==='keep_local'?null:providerVersionEventData(c.providerVersion)
  if(p.data.resolution!=='keep_local'&&!providerData)return apiError('CONFLICT','The provider snapshot is not available yet. Retry sync before choosing the provider version.',409)
  const conflict=await prisma.calendarSyncConflict.update({where:{id},data:{resolution:p.data.resolution,resolvedAt:new Date()}})
  if(p.data.resolution==='keep_local') {
    await prisma.event.update({where:{id:c.eventId},data:{syncStatus:'pending',syncError:null,syncVersion:{increment:1}}})
    await enqueueCalendarSync((s.user as any).id,c.eventId,'update')
  } else {
    await prisma.event.update({where:{id:c.eventId},data:providerData!})
  }
 return apiSuccess({conflict:{id:conflict.id,resolution:conflict.resolution,resolvedAt:conflict.resolvedAt}})
}
