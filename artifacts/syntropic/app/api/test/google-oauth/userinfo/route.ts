import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (process.env.GOOGLE_OAUTH_FIXTURE !== '1') {
    return new Response('Not found', { status: 404 })
  }

  if (request.headers.get('authorization') !== 'Bearer controlled-google-access-token') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }

  const email = process.env.GOOGLE_OAUTH_FIXTURE_EMAIL?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: 'fixture_email_missing' }, { status: 500 })
  }

  return NextResponse.json({
    sub: 'controlled-google-user',
    email,
    email_verified: true,
    name: 'Controlled Google replacement',
    given_name: 'Controlled',
    family_name: 'Google replacement',
    picture: 'https://example.test/controlled-google-avatar.png',
  })
}