import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it, mock } from 'node:test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db.ts'

const enabled = process.env.MOBILE_API_DATABASE_TESTS === '1'
const accountDeletionSession = { userId: '', authTime: Math.floor(Date.now() / 1000) }

mock.module('@/auth', {
  namedExports: {
    auth: async () => accountDeletionSession.userId
      ? { user: { id: accountDeletionSession.userId }, authTime: accountDeletionSession.authTime }
      : null,
  },
})
mock.module('@/lib/db', { namedExports: { prisma } })
mock.module('@/lib/s3', {
  namedExports: {
    deleteFile: async () => undefined,
  },
})

describe('mobile API process account deletion acceptance', { skip: !enabled }, () => {
  let apiProcess: ChildProcess | undefined
  let baseUrl = ''
  let userId = ''

  const request = async (token: string, path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (init.body && !headers.has('content-type') && !(init.body instanceof Uint8Array)) {
      headers.set('content-type', 'application/json')
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers })
  }

  const json = async <T>(response: Response) => response.json() as Promise<T>

  const stopProcess = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
  }

  const availablePort = async () => {
    const probe = net.createServer()
    await new Promise<void>((resolve, reject) => probe.listen(0, '127.0.0.1', () => resolve()))
    const address = probe.address()
    assert.ok(address && typeof address !== 'string')
    const port = address.port
    await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
    return port
  }

  const startApiProcess = async () => {
    const port = await availablePort()
    const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const child = spawn('pnpm', ['--filter', '@workspace/api-server', 'run', 'dev'], {
      cwd: workspaceRoot,
      env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
      stdio: 'ignore',
    })
    baseUrl = `http://127.0.0.1:${port}`
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          const health = await fetch(`${baseUrl}/api/healthz`)
          if (health.ok) {
            apiProcess = child
            return
          }
        } catch {
          // The API build and server startup can take a few seconds in CI.
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      throw new Error('real mobile API process did not become healthy')
    } catch (error) {
      await stopProcess(child)
      throw error
    }
  }

  before(async () => {
    userId = `mobile-api-process-${randomUUID()}`
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        passwordHash: await bcrypt.hash('offline-recovery-password', 4),
      },
    })
    await startApiProcess()
  })

  after(async () => {
    if (apiProcess) await stopProcess(apiProcess)
    await prisma.$disconnect()
  })

  it('rejects dashboard, sync, and push requests after web account deletion', async () => {
    const sessionResponse = await request('', '/api/mobile/auth/device-sessions', {
      method: 'POST',
      body: JSON.stringify({
        email: `${userId}@example.test`,
        password: 'offline-recovery-password',
        installId: `ios-deleted-account-${randomUUID()}`,
        platform: 'ios',
        deviceName: 'Acceptance iPhone',
        appVersion: 'acceptance',
      }),
    })
    assert.equal(sessionResponse.status, 201)
    const session = await json<{ accessToken: string; deviceId: string }>(sessionResponse)
    assert.ok(session.accessToken)
    assert.ok(session.deviceId)

    const pushToken = `acceptance-push-${randomUUID()}`
    const registered = await request(session.accessToken, '/api/mobile/push/devices', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apns', token: pushToken, environment: 'sandbox' }),
    })
    assert.equal(registered.status, 200)

    accountDeletionSession.userId = userId
    const { DELETE } = await import('../app/api/account/delete/route.ts')
    const deletion = await DELETE(new Request('http://account-delete.test/api/account/delete', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
    }))
    assert.equal(deletion.status, 200)
    assert.equal((await json<{ deleted: boolean }>(deletion)).deleted, true)

    for (const response of [
      await request(session.accessToken, '/api/mobile/dashboard'),
      await request(session.accessToken, '/api/mobile/sync/push', {
        method: 'POST',
        headers: { 'idempotency-key': `deleted-account-${randomUUID()}` },
        body: JSON.stringify({
          changes: [{
            changeId: `deleted-account-${randomUUID()}`,
            entityType: 'task',
            entityId: `deleted-account-${randomUUID()}`,
            operation: 'upsert',
            baseVersion: 0,
            payload: { title: 'Must not be recreated' },
            changedAt: new Date().toISOString(),
          }],
        }),
      }),
      await request(session.accessToken, '/api/mobile/push/devices', {
        method: 'POST',
        body: JSON.stringify({ provider: 'apns', token: pushToken, environment: 'sandbox' }),
      }),
    ]) {
      assert.equal(response.status, 401)
      assert.equal((await json<{ error: { code: string } }>(response)).error.code, 'invalid_session')
    }

    const [users, devices, sessions, pushCredentials, records, syncChanges, idempotencyKeys] = await Promise.all([
      prisma.user.count({ where: { id: userId } }),
      prisma.mobileDevice.count({ where: { userId } }),
      prisma.mobileDeviceSession.count({ where: { userId } }),
      prisma.mobilePushDevice.count({ where: { OR: [{ userId }, { token: pushToken }] } }),
      prisma.mobileRecord.count({ where: { userId } }),
      prisma.mobileSyncChange.count({ where: { userId } }),
      prisma.mobileIdempotencyKey.count({ where: { userId } }),
    ])
    assert.deepEqual({
      users,
      devices,
      sessions,
      pushCredentials,
      records,
      syncChanges,
      idempotencyKeys,
    }, {
      users: 0,
      devices: 0,
      sessions: 0,
      pushCredentials: 0,
      records: 0,
      syncChanges: 0,
      idempotencyKeys: 0,
    })
  })
})