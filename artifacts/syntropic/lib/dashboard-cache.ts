export interface DashboardData {
  todaySchedules: any[]
  recentTransactions: any[]
  upcomingTasks: any[]
  accounts: any[]
  upcomingEvents: any[]
  lowStock: any[]
  stats: { totalBalance: number; tasksDueToday: number; lowStockCount: number }
}

const CACHE_TTL_MS = 30_000
let cached: { data: DashboardData; expiresAt: number } | null = null
let inFlight: Promise<DashboardData> | null = null

export async function getDashboardData(force = false): Promise<DashboardData> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.data
  if (!force && inFlight) return inFlight

  inFlight = fetch('/api/dashboard')
    .then(async (response) => {
      if (!response.ok) throw new Error('Failed to load dashboard')
      const data = await response.json() as DashboardData
      cached = { data, expiresAt: Date.now() + CACHE_TTL_MS }
      return data
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

export function invalidateDashboardData() {
  cached = null
}