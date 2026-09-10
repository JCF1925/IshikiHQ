'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard, Pill, CreditCard, CheckSquare, Calendar,
  Target, Wallet, TrendingUp, Heart, Activity, Stethoscope,
  Users, GraduationCap, Settings, LogOut, ChevronLeft, ChevronDown,
  Menu, X, Landmark, Repeat, Inbox,
   Coins, Package, Calculator, Building2, Scale, Receipt, FolderTree,
  CalendarClock, ShieldPlus, FlaskConical, Lightbulb, ChefHat, Box, ShoppingCart, type LucideIcon
} from 'lucide-react'

type Leaf = { href: string; label: string; icon: LucideIcon }
type Section = { section: string; icon: LucideIcon; items: Leaf[] }
type Group = { group: string; icon: LucideIcon; sections: Section[] }

// Top-level items (always visible, no group)
const topItems: Leaf[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/events', label: 'Events', icon: Calendar },
]

const groups: Group[] = [
  {
    group: 'Money', icon: Landmark, sections: [
      {
        section: 'Transactions', icon: CreditCard, items: [
          { href: '/transactions', label: 'Transactions', icon: CreditCard },
          { href: '/review', label: 'Review Queue', icon: Inbox },
        ],
      },
      {
        section: 'Assets', icon: Building2, items: [
          { href: '/accounts', label: 'Bank accounts', icon: Landmark },
          { href: '/assets', label: 'Owned assets', icon: Building2 },
        ],
      },
      {
        section: 'Liabilities', icon: Scale, items: [
          { href: '/liabilities', label: 'Liabilities', icon: Scale },
          { href: '/bnpl', label: 'BNPL workspace', icon: CreditCard },
        ],
      },
      {
        section: 'Shared money', icon: Users, items: [
          { href: '/debts', label: 'Shared debts', icon: Users },
        ],
      },
      {
        section: 'Regular transactions', icon: Repeat, items: [
          { href: '/recurring', label: 'Recurring transactions', icon: Repeat },
          { href: '/bills', label: 'Bills workspace', icon: Receipt },
          { href: '/commitments', label: 'Commitments overview', icon: CalendarClock },
        ],
      },
      {
        section: 'Earnings', icon: Coins, items: [
          { href: '/income', label: 'Income & Pay', icon: Coins },
          { href: '/salary-packaging', label: 'Salary Packaging', icon: Package },
        ],
      },
      {
        section: 'Taxation', icon: Calculator, items: [
          { href: '/tax', label: 'Taxation', icon: Calculator },
        ],
      },
      {
        section: 'Planning', icon: Target, items: [
          { href: '/financial', label: 'Financial', icon: TrendingUp },
          { href: '/goals', label: 'Goals', icon: Target },
          { href: '/budgets', label: 'Budgets', icon: Wallet },
          { href: '/categories', label: 'Chart of Accounts', icon: FolderTree },
          { href: '/scratchpad', label: 'Business Scratchpad', icon: Lightbulb },
        ],
      },
      {
        section: 'Money Planning', icon: ShoppingCart, items: [
          { href: '/price-watch', label: 'Price watch', icon: ShoppingCart },
        ],
      },
    ],
  },
  {
    group: 'Health', icon: Heart, sections: [
      {
        section: 'Health', icon: Heart, items: [
          { href: '/medications', label: 'Medications', icon: Pill },
          { href: '/health', label: 'Health Metrics', icon: Activity },
          { href: '/conditions', label: 'Conditions', icon: Heart },
          { href: '/practitioners', label: 'Practitioners', icon: Stethoscope },
          { href: '/appointments', label: 'Appointments', icon: CalendarClock },
          { href: '/pathology', label: 'Pathology & Imaging', icon: FlaskConical },
          { href: '/health-funding', label: 'Health Funding', icon: ShieldPlus },
        ],
      },
    ],
  },
  {
    group: 'Household', icon: Box, sections: [
      {
        section: 'Household', icon: Box, items: [
          { href: '/kitchen', label: 'Kitchen & Meals', icon: ChefHat },
          { href: '/storage', label: 'Storage & Belongings', icon: Box },
        ],
      },
    ],
  },
  {
    group: 'Other', icon: Users, sections: [
      {
        section: 'Other', icon: Users, items: [
          { href: '/people', label: 'People & Orgs', icon: Users },
          { href: '/qualifications', label: 'Qualifications', icon: GraduationCap },
        ],
      },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const groupId = (name: string) => `nav-group-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const closeMobileMenu = () => {
    setMobileOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname?.startsWith(`${href}/`)
  }

  // Which section contains the active route — expand it by default
  const activeGroup = groups.find((g) => g.sections.some((s) => s.items.some((it) => isActive(it.href))))?.group
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    groups.forEach((g) => { init[g.group] = true })
    return init
  })
  const toggle = (name: string) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  useEffect(() => {
    if (!mobileOpen) return

    let focusFrame = 0
    const focusFrameAfterPaint = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileMenu()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrameAfterPaint)
      if (focusFrame) cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileOpen])

  const leafClass = (active: boolean, nested: boolean) => cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
    active ? 'bg-primary/10 text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    nested && !collapsed && 'pl-9',
    collapsed && 'justify-center px-2'
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        ref={menuButtonRef}
        onClick={() => { setCollapsed(false); setMobileOpen(true) }}
        className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-[calc(0.75rem+env(safe-area-inset-left))] z-50 lg:hidden p-2 rounded-lg bg-card border border-border"
        aria-label="Open navigation menu"
        aria-controls="app-sidebar"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        aria-label="Primary navigation"
        className={cn(
          'fixed top-0 left-0 z-50 h-[100dvh] bg-card border-r border-border flex flex-col transition-all duration-normal pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          collapsed ? 'w-16' : 'w-60',
          'max-lg:-translate-x-full max-lg:invisible max-lg:pointer-events-none',
          mobileOpen && 'max-lg:translate-x-0 max-lg:visible max-lg:pointer-events-auto'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-border">
          {!collapsed && (
            <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-display font-bold text-sm">I</span>
              </div>
              <div>
                <span className="font-display font-bold text-sm">Ishiki</span>
              </div>
            </Link>
          )}
          {collapsed && (
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <span className="text-primary-foreground font-display font-bold text-sm">I</span>
            </div>
          )}
          <button
            onClick={() => mobileOpen ? closeMobileMenu() : setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-muted transition-colors hidden lg:block"
            aria-label={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
          <button
            ref={closeButtonRef}
            onClick={closeMobileMenu}
            className="p-1 rounded hover:bg-muted transition-colors lg:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {/* Top-level */}
          {topItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={leafClass(active, false)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}

          {/* Collapsible groups */}
          {groups.map((g) => {
            const GroupIcon = g.icon
            const isOpen = collapsed ? true : (expanded[g.group] ?? true)
            const groupHasActive = g.group === activeGroup
            if (collapsed) {
              // Collapsed rail: divider + icon-only leaves
              return (
                <div key={g.group} className="pt-2">
                  <div className="border-t border-border mb-1" />
                  {g.sections.flatMap((s) => s.items).map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={leafClass(active, false)}
                          title={item.label}
                          aria-label={item.label}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                        </Link>
                      )
                    })}
                </div>
              )
            }
            return (
              <div key={g.group} className="pt-2">
                <button
                  onClick={() => toggle(g.group)}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors hover:bg-muted',
                    groupHasActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  aria-expanded={isOpen}
                  aria-controls={groupId(g.group)}
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest">{g.group}</span>
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !isOpen && '-rotate-90')} />
                </button>
                {isOpen && (
                  <div
                    id={groupId(g.group)}
                    className="mt-0.5 space-y-0.5"
                  >
                    {g.sections.map((section) => (
                      <div key={section.section} className="pt-1">
                        <div className="flex items-center gap-2 px-3 py-1 text-muted-foreground">
                          <section.icon className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-medium uppercase tracking-wider">{section.section}</span>
                        </div>
                        {section.items.map((item) => {
                          const Icon = item.icon
                          const active = isActive(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileOpen(false)}
                              className={leafClass(active, true)}
                              aria-current={active ? 'page' : undefined}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span>{item.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2 space-y-0.5">
          <Link
            href="/settings"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Settings' : undefined}
            aria-label={collapsed ? 'Settings' : undefined}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Settings</span>}
          </Link>
          <button
            onClick={() => signOut({ redirectTo: '/login' })}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors',
              collapsed && 'justify-center px-2'
            )}
            aria-label={collapsed ? 'Sign out' : undefined}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Bottom tab bar for mobile: keep this focused on the top-level daily destinations.
          The full grouped route directory is available from the mobile drawer. */}
      <nav
        aria-label="Mobile primary navigation"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-around h-14">
          {topItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 text-[10px]',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
