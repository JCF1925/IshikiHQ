import { NextResponse } from 'next/server'

const fixtureEnabled = () => process.env.GOOGLE_OAUTH_FIXTURE === '1'

export async function GET(request: Request) {
  if (!fixtureEnabled()) return new Response('Not found', { status: 404 })

  const requestUrl = new URL(request.url)
  const redirectUri = requestUrl.searchParams.get('redirect_uri')
  const state = requestUrl.searchParams.get('state')
  const clientId = requestUrl.searchParams.get('client_id')
  if (
    clientId !== 'controlled-google-client'
    || !redirectUri
  ) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  let callbackUrl: URL
  try {
    callbackUrl = new URL(redirectUri)
  } catch {
    return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 })
  }

  callbackUrl.searchParams.set('code', 'controlled-google-code')
  if (state) callbackUrl.searchParams.set('state', state)
  return NextResponse.redirect(callbackUrl)
}