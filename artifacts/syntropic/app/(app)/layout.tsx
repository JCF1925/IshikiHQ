import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { QuickAddFab } from '@/components/quick-add-fab'
import { OfflineSync } from '@/components/offline-sync'
import { DevelopmentFeedback } from '@/components/development-feedback'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppSidebar />
      <main
        id="main-content"
        className="min-w-0 overflow-x-clip pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pl-60 lg:pb-0"
      >
        <div className="mx-auto max-w-7xl min-w-0 px-4 pb-4 pt-[calc(4rem+env(safe-area-inset-top))] lg:p-6">
          {children}
        </div>
      </main>
      <QuickAddFab />
      {process.env.NODE_ENV === 'development' && <DevelopmentFeedback />}
      <OfflineSync />
    </div>
  )
}
