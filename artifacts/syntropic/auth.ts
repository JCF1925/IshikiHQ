import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { takeRateLimit } from '@/lib/security'
import { hasGoogleCalendarScopes } from '@/lib/calendar-scopes'
import {
  calendarOAuthCancellationCallback,
  persistExistingGoogleCalendarGrant,
} from '@/lib/calendar-oauth-server'
import { safeRelativeCallback } from '@/lib/safe-callback'
import type { NextRequest } from 'next/server'

const googleOAuthFixtureOrigin = process.env.GOOGLE_OAUTH_FIXTURE === '1'
  ? process.env.GOOGLE_OAUTH_FIXTURE_ORIGIN ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
  : undefined

const googleProvider = googleOAuthFixtureOrigin
  ? {
      id: 'google',
      name: 'Google',
      type: 'oauth' as const,
      clientId: 'controlled-google-client',
      clientSecret: 'controlled-google-secret',
      authorization: {
        url: `${googleOAuthFixtureOrigin}/api/test/google-oauth/authorize`,
        params: { scope: 'profile email' },
      },
      token: `${googleOAuthFixtureOrigin}/api/test/google-oauth/token`,
      userinfo: `${googleOAuthFixtureOrigin}/api/test/google-oauth/userinfo`,
      checks: ['pkce'] as Array<'pkce'>,
      profile: (profile: {
        sub?: string
        email?: string
        name?: string
        picture?: string
      }) => ({
        id: profile.sub ?? '',
        name: profile.name ?? null,
        email: profile.email ?? '',
        image: profile.picture ?? null,
      }),
    }
  : Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })

const { handlers: authHandlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.SESSION_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    googleProvider,
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null
        const email = String(credentials.email).trim().toLowerCase()
        const forwardedFor = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        if (!takeRateLimit(`credentials:${forwardedFor}:${email}`, 10).allowed) return null
        const user = await prisma.user.findUnique({
          where: { email },
        })
        if (!user?.passwordHash) return null
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!isValid) return null
        return { id: user.id, name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === 'google' && profile?.email_verified !== true) return false
      if (account?.provider === 'google' && user.id && hasGoogleCalendarScopes(account.scope)) {
        const persistence = await persistExistingGoogleCalendarGrant(user.id, account)
        if (persistence === 'account-mismatch') return false
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.authTime = Math.floor(Date.now() / 1000)
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user && token?.id) {
        (session.user as any).id = token.id as string
        session.authTime = typeof token.authTime === 'number' ? token.authTime : undefined
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${safeRelativeCallback(url)}`
      try {
        const parsed = new URL(url)
        if (parsed.origin === baseUrl) {
          return `${baseUrl}${safeRelativeCallback(`${parsed.pathname}${parsed.search}${parsed.hash}`)}`
        }
      } catch {
        return baseUrl
      }
      return baseUrl
    },
  },
})

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!cookie) return null

  try {
    return decodeURIComponent(cookie.slice(name.length + 1))
  } catch {
    return null
  }
}

function callbackFromCookie(request: Request) {
  const callbackCookie = cookieValue(request, '__Secure-authjs.callback-url')
    ?? cookieValue(request, 'authjs.callback-url')
  if (!callbackCookie) return '/'

  try {
    const callbackUrl = new URL(callbackCookie, request.url)
    return safeRelativeCallback(
      `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`,
    )
  } catch {
    return '/'
  }
}

function googleAccessDeniedRedirect(request: Request) {
  const url = new URL(request.url)
  if (
    url.pathname !== '/api/auth/callback/google'
    || url.searchParams.get('error') !== 'access_denied'
  ) {
    return null
  }

  const callback = callbackFromCookie(request)
  const calendarCallback = calendarOAuthCancellationCallback(callback)
  const relativeRedirect = (location: string) => new Response(null, {
    status: 302,
    headers: { Location: location },
  })
  if (calendarCallback) return relativeRedirect(calendarCallback)

  const loginUrl = new URL('/login', url.origin)
  loginUrl.searchParams.set('error', 'GoogleAccessDenied')
  loginUrl.searchParams.set('callbackUrl', callback)
  // Keep recovery on the browser's current public origin. The server can see
  // an internal bind address behind the Replit proxy, so an absolute redirect
  // here could send the browser to an unreachable or unintended origin.
  return relativeRedirect(`${loginUrl.pathname}${loginUrl.search}`)
}

function authRecoveryRedirect(request: Request, response?: Response) {
  const url = new URL(request.url)
  const location = response?.headers.get('location')
  const locationUrl = location ? new URL(location, url) : null
  const error = locationUrl?.searchParams.get('error') ?? url.searchParams.get('error')
  if (error !== 'Configuration' && error !== 'CallbackRouteError') return null

  if (response) {
    if (
      !locationUrl
      || response.status < 300
      || response.status >= 400
      || locationUrl.pathname !== '/login'
    ) return null
  } else if (url.pathname !== '/api/auth/error') {
    return null
  }

  const loginUrl = new URL('/login', url.origin)
  loginUrl.searchParams.set('error', error)
  loginUrl.searchParams.set('callbackUrl', callbackFromCookie(request))
  return new Response(null, {
    status: 302,
    headers: { Location: `${loginUrl.pathname}${loginUrl.search}` },
  })
}

export const handlers = {
  ...authHandlers,
  GET: async (request: NextRequest) => (
    googleAccessDeniedRedirect(request)
      ?? authRecoveryRedirect(request)
      ?? authHandlers.GET(request).then((response) => (
        authRecoveryRedirect(request, response) ?? response
      ))
  ),
}

export { auth, signIn, signOut }
