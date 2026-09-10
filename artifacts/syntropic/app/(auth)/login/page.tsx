'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogIn, Mail, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { GoogleSignInButton } from '@/components/google-signin-button'
import { safeRelativeCallback } from '@/lib/safe-callback'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('/')

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const authError = searchParams.get('error')
    setCallbackUrl(safeRelativeCallback(searchParams.get('callbackUrl')))
    if (authError === 'GoogleAccessDenied') {
      setError('Google sign-in was cancelled. You can try again whenever you’re ready.')
    } else if (authError === 'Configuration' || authError === 'CallbackRouteError') {
      setError('Google sign-in expired or could not be completed. Please try again.')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password.')
        toast.error('Invalid email or password')
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
              <LogIn className="h-5 w-5" />
              Sign in
            </CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    aria-describedby={error ? 'login-error' : undefined}
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
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError('') }}
                    className="pl-10"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
              </div>
              {error && (
                <p id="login-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" loading={loading}>
                Sign in
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
            <GoogleSignInButton redirectTo={callbackUrl} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link
                href={{ pathname: '/signup', query: { callbackUrl } }}
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
