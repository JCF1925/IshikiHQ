import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function HealthDisclaimer() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="flex items-start gap-2 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">This is a personal tracking tool only. It does not provide clinical decision support or medical advice. Always consult your healthcare provider.</p>
      </CardContent>
    </Card>
  )
}
