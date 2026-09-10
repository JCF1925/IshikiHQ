export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/api'
import { enqueueCalendarSync } from '@/lib/calendar-server'
export async function POST(_r:Request,{params}:{params:Promise<{id:string}>}) {
 const s=await auth();if(!s?.user)return apiError('UNAUTHORIZED','Authentication required',401);const {id}=await params
 const e=await prisma.event.findFirst({where:{id,userId:(s.user as any).id}});if(!e)return apiError('NOT_FOUND','Event not found',404)
 await prisma.event.update({where:{id},data:{syncStatus:'pending',syncError:null,syncVersion:{increment:1}}})
 const retry=await enqueueCalendarSync((s.user as any).id,id,'update')
 return apiSuccess({retry:{queued:retry.queued}})
}