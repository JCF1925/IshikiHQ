'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserPlus, Mail, Lock, User } from 'lucide-react'
import { toast } from 'sonner'
import { GoogleSignInButton } from '@/components/google-signin-button'
import { safeRelativeCallback } from '@/lib/safe-callback'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('/')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    setCallbackUrl(safeRelativeCallback(searchParams.get('callbackUrl')))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      toast.error('Password must be at least 12 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error?.message ?? data?.error ?? 'Signup failed'
        setError(message)
        toast.error(message)
        return
      }
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Account created but automatic sign-in failed. Please sign in.')
        toast.error('Account created but auto-login failed. Please sign in.')
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      } else {
        router.replace(callbackUrl)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary mb-4">
            <span className="text-primary-foreground font-display font-bold text-xl">I</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Ishiki</h1>
          <p className="text-muted-foreground text-sm mt-1">Your life, structured.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create account
            </CardTitle>
            <CardDescription>Get started with Ishiki</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setError('') }}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError('') }}
                    className="pl-10"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'signup-error' : undefined}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="12+ chars with upper, lower, number & symbol"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError('') }}
                    className="pl-10"
                    required
                    minLength={12}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'signup-password-help signup-error' : 'signup-password-help'}
                  />
                </div>
                <p id="signup-password-help" className="text-xs text-muted-foreground">
                  Use at least 12 characters.
                </p>
              </div>
              {error && (
                <p id="signup-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" loading={loading}>
                Create account
              </Button>
            </form>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>
            <GoogleSignInButton label="Sign up with Google" redirectTo={callbackUrl} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href={{ pathname: '/login', query: { callbackUrl } }}
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
