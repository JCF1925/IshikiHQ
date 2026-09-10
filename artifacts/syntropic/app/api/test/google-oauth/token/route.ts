import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  if (process.env.GOOGLE_OAUTH_FIXTURE !== '1') {
    return new Response('Not found', { status: 404 })
  }

  const body = await request.formData()
  const expectedAuthorization = `Basic ${Buffer.from(
    'controlled-google-client:controlled-google-secret',
  ).toString('base64')}`
  if (
    request.headers.get('authorization') !== expectedAuthorization
    || body.get('code') !== 'controlled-google-code'
    || body.get('grant_type') !== 'authorization_code'
  ) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
  }

  return NextResponse.json({
    access_token: 'controlled-google-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
  })
}