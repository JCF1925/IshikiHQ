export const dynamic='force-dynamic'
import {auth} from '@/auth';import {prisma} from '@/lib/db';import {apiError,apiSuccess,parseBody} from '@/lib/api'
import {matchesInviteRule,type CalendarEvent,type InviteRule} from '@/lib/calendar-core'
import {executeInvitationNotifications} from '@/lib/calendar-invitations'
import {enqueueCalendarSync} from '@/lib/calendar-server'
import {z} from 'zod'
const schema=z.object({eventId:z.string().cuid()})
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){const s=await auth();if(!s?.user)return apiError('UNAUTHORIZED','Authentication required',401);const p=await parseBody(r,schema);if(!p.success)return p.response;const userId=(s.user as any).id;const {id}=await params;const [rule,event]=await Promise.all([prisma.calendarInviteRule.findFirst({where:{id,userId}}),prisma.event.findFirst({where:{id:p.data.eventId,userId}})]);if(!rule)return apiError('NOT_FOUND','Invite rule not found',404);if(!event)return apiError('NOT_FOUND','Event not found',404);if(!matchesInviteRule(event as CalendarEvent,rule as InviteRule))return apiError('CONFLICT','This event does not match the invite rule',409)
 const people=await prisma.person.findMany({where:{userId,id:{in:rule.inviteePersonIds}},select:{id:true,email:true}})
 const validIds=new Set(people.filter(person=>person.email&&z.string().email().safeParse(person.email).success).map(person=>person.id))
 const invalidIds=rule.inviteePersonIds.filter(personId=>!validIds.has(personId))
 if(invalidIds.length)return apiError('VALIDATION_ERROR','Every invitee must have a valid email address',400,{invalidPersonIds:invalidIds})
 const nextEvent=await prisma.$transaction(async tx=>{if(!rule.firstMatchConfirmedAt)await tx.calendarInviteRule.update({where:{id},data:{firstMatchConfirmedAt:new Date()}});await tx.eventInviteDecision.createMany({data:rule.inviteePersonIds.map(personId=>({eventId:event.id,ruleId:id,personId,decision:'rule_selected' as const})),skipDuplicates:true});return tx.event.update({where:{id:event.id},data:{syncVersion:{increment:1},syncStatus:'pending',syncError:null}})})
 const notification=await executeInvitationNotifications(userId,event.id,nextEvent.syncVersion,'sent',rule.inviteePersonIds)
 const sync=await enqueueCalendarSync(userId,event.id,'update').catch(()=>({queued:false}))
 return apiSuccess({confirmed:true,eventId:event.id,notification,sync})}