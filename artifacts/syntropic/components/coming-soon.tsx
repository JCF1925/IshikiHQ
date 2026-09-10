'use client'

import { Card } from '@/components/ui/card'
import { Construction, Target, Wallet, TrendingUp, Activity, Heart, Users, GraduationCap } from 'lucide-react'
import { FadeIn } from '@/components/ui/animate'

const iconMap: Record<string, any> = {
  target: Target,
  wallet: Wallet,
  'trending-up': TrendingUp,
  activity: Activity,
  heart: Heart,
  users: Users,
  'graduation-cap': GraduationCap,
}

export function ComingSoon({ title, description, iconName }: { title: string; description: string; iconName: string }) {
  const Icon = iconMap[iconName] ?? Construction

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Icon className="h-6 w-6" /> {title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card className="py-16 text-center">
          <Construction className="h-16 w-16 mx-auto text-muted-foreground/20" />
          <h2 className="text-lg font-medium mt-6">Coming Soon</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            This module is being built. It will be available in a future update.
          </p>
        </Card>
      </FadeIn>
    </div>
  )
}
