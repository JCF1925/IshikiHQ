#!/usr/bin/env node

const base = process.env.ACCEPTANCE_BASE || 'http://localhost:3000'
const email = process.env.ACCEPTANCE_EMAIL || 'abacus-e9442339@example.com'
const password = process.env.ACCEPTANCE_PASSWORD || 'Syntropic!Test2026'
const jar = {}
const cookies = () => Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ')
const save = response => (response.headers.getSetCookie?.() || []).forEach(cookie => {
  const [pair] = cookie.split(';')
  const index = pair.indexOf('=')
  jar[pair.slice(0, index)] = pair.slice(index + 1)
})
const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    redirect: init.redirect ?? 'manual',
    headers: { ...init.headers, cookie: cookies() },
  })
  save(response)
  return response
}
const expect = async (name, response, status) => {
  if (response.status !== status) throw new Error(`${name}: HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  console.log(`ok   ${name}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const csrf = await expect('CSRF endpoint', await request('/api/auth/csrf'), 200)
await expect('seeded account login', await request('/api/auth/callback/credentials', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password }),
}), 302)
const session = await expect('authenticated session', await request('/api/auth/session'), 200)
if (!session.user) throw new Error('authenticated session: no user')
await expect('dashboard journey', await request('/api/dashboard'), 200)
const accountResult = await expect('account creation journey', await request('/api/accounts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Acceptance account', type: 'transaction', openingBalance: 100 }),
}), 201)
const account = accountResult.data ?? accountResult
const transactionResult = await expect('transaction creation journey', await request('/api/transactions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ accountId: account.id, date: '2026-09-08', amount: -25, merchant: 'Acceptance merchant', category: 'Testing' }),
}), 201)
const transaction = transactionResult.data ?? transactionResult
await expect('transaction confirmation journey', await request(`/api/transactions/${transaction.id}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'confirm' }),
}), 200)
const accountsResult = await expect('derived account balance journey', await request('/api/accounts'), 200)
const accounts = accountsResult.data ?? accountsResult
const accepted = accounts.find(item => item.id === account.id)
if (!accepted || accepted.derivedBalance !== 75) throw new Error(`derived account balance journey: expected 75, received ${accepted?.derivedBalance}`)
console.log('ACCEPTANCE SMOKE: PASS')