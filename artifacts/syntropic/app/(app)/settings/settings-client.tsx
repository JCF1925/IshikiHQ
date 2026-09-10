'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Globe, Palette, Key, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FadeIn } from '@/components/ui/animate'
import { useTheme } from 'next-themes'
import { useMounted } from '@/components/client-only'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoriesClient } from '../categories/categories-client'
import { signOut } from 'next-auth/react'

export function SettingsClient() {
  const [timezone, setTimezone] = useState('Australia/Sydney')
  const [currency, setCurrency] = useState('AUD')
  const [redbarkKey, setRedbarkKey] = useState('')
  const [redbarkConfigured, setRedbarkConfigured] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [saving, setSaving] = useState(false)
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) return
        const data = await res.json()
        setTimezone(data?.timezone ?? 'Australia/Sydney')
        setCurrency(data?.currency ?? 'AUD')
        setRedbarkConfigured(Boolean(data?.settings?.redbark_api_key_configured))
      } catch { /* silent */ }
    }
    load()
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone,
          currency,
          theme: theme ?? 'dark',
          settings: { redbark_api_key: redbarkKey },
        }),
      })
      if (!res.ok) throw new Error()
      if (redbarkKey.trim()) {
        setRedbarkConfigured(true)
        setRedbarkKey('')
      }
      toast.success('Settings saved')
    } catch { toast.error('Failed to save settings') }
    finally { setSaving(false) }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Account deletion could not be completed.')
      }
      await signOut({ redirectTo: '/login' })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Account deletion could not be completed.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" /> Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Configure your preferences, integrations and chart of accounts.</p>
        </div>
      </FadeIn>

      <Tabs defaultValue="preferences">
        <TabsList>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="coa">Chart of Accounts</TabsTrigger>
        </TabsList>
        <TabsContent value="preferences" className="mt-4 max-w-2xl">
        <form className="space-y-6" onSubmit={handleSave}>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Locale</CardTitle>
            <CardDescription>Timezone and currency settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Australia/Sydney">Australia/Sydney (AEST)</SelectItem>
                  <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST)</SelectItem>
                  <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                  <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUD">AUD ($)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.15}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="theme">Theme</Label>
              {mounted && (
                <Select value={theme ?? 'dark'} onValueChange={setTheme}>
                  <SelectTrigger id="theme"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.2}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" /> Integrations</CardTitle>
            <CardDescription>Connect external services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="redbark-key">Redbark API Key</Label>
              <Input
                id="redbark-key"
                type="password"
                autoComplete="off"
                value={redbarkKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedbarkKey(e.target.value)}
                placeholder={redbarkConfigured ? 'Credential configured — enter a new value to replace it' : 'Enter your Redbark API key for bank feeds'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {redbarkConfigured ? 'A credential is stored server-side and is never returned to this page.' : 'Used for automatic bank transaction imports.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.25}>
        <Button type="submit" loading={saving}>Save Settings</Button>
      </FadeIn>
        </form>

        <FadeIn delay={0.3}>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Account data</CardTitle>
              <CardDescription>Export a private copy of your data or permanently delete your account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-start gap-2">
                <Button asChild variant="outline">
                  <a href="/api/account/export" download><Download /> Export my data</a>
                </Button>
                <p className="text-xs text-muted-foreground">The download excludes passwords, sessions, provider credentials, push tokens, and raw binary files.</p>
              </div>
              <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
                <div>
                  <p className="font-medium text-destructive">Delete account</p>
                  <p className="text-sm text-muted-foreground">This permanently removes your private records. Export first. Active household memberships must be resolved before deletion.</p>
                </div>
                <div>
                  <Label htmlFor="delete-confirmation">Type DELETE MY ACCOUNT to confirm</Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    autoComplete="off"
                    aria-invalid={Boolean(deleteError)}
                    aria-describedby={deleteError ? 'delete-account-error' : undefined}
                  />
                </div>
                {deleteError && <p id="delete-account-error" role="alert" className="text-sm text-destructive">{deleteError}</p>}
                <Button
                  type="button"
                  variant="destructive"
                  loading={deleting}
                  disabled={deleteConfirmation !== 'DELETE MY ACCOUNT'}
                  onClick={handleDeleteAccount}
                >
                  <Trash2 /> Permanently delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
        </TabsContent>
        <TabsContent value="coa" className="mt-4">
          <CategoriesClient />
        </TabsContent>
      </Tabs>
    </div>
  )
}
