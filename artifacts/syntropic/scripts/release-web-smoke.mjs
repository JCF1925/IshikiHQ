#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDirectory, '../../..')
const defaultArtifactToml = path.join(
  workspaceRoot,
  'artifacts/syntropic/.replit-artifact/artifact.toml',
)
const startupTimeoutMs = Number(process.env.WEB_RELEASE_SMOKE_TIMEOUT_MS ?? 60_000)
const requestTimeoutMs = 2_000

const section = (toml, sectionName) => {
  const header = `[${sectionName}]`
  const start = toml.indexOf(header)
  if (start < 0) {
    throw new Error(`missing [${sectionName}] section`)
  }

  const bodyStart = start + header.length
  const nextSection = toml.slice(bodyStart).search(/\n\s*\[/)
  return toml.slice(bodyStart, nextSection < 0 ? toml.length : bodyStart + nextSection)
}

const assignment = (body, key) => {
  const match = body.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'))
  if (!match) {
    throw new Error(`missing ${key} assignment`)
  }
  return match[1]
}

const parseString = (value, label) => {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'string') throw new Error('not a string')
    return parsed
  } catch {
    throw new Error(`${label} must be a TOML basic string`)
  }
}

const parseStringArray = (value, label) => {
  try {
    const parsed = JSON.parse(value)
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((item) => typeof item !== 'string' || item.length === 0)
    ) {
      throw new Error('not a non-empty string array')
    }
    return parsed
  } catch {
    throw new Error(`${label} must be a non-empty TOML string array`)
  }
}

export const readReleaseConfig = async (artifactTomlPath = defaultArtifactToml) => {
  const toml = await readFile(artifactTomlPath, 'utf8')
  const runArgs = parseStringArray(
    assignment(section(toml, 'services.production.run'), 'args'),
    'services.production.run.args',
  )
  const startupPath = parseString(
    assignment(section(toml, 'services.web.production.health.startup'), 'path'),
    'services.web.production.health.startup.path',
  )

  if (!startupPath.startsWith('/') || startupPath.startsWith('//')) {
    throw new Error(
      `services.web.production.health.startup.path must be an absolute local path, received "${startupPath}"`,
    )
  }

  return { artifactTomlPath, runArgs, startupPath }
}

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('could not determine the isolated smoke-check port'))
        return
      }
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })

const commandLabel = (runArgs) => runArgs.map((arg) => JSON.stringify(arg)).join(' ')

const tail = (lines) => lines.join('').trim().split('\n').slice(-12).join('\n')

const terminate = async (child) => {
  const signalProcessGroup = (signal) => {
    if (process.platform === 'win32' || !child.pid) return
    try {
      process.kill(-child.pid, signal)
    } catch {
      // The process group may already have exited.
    }
  }

  signalProcessGroup('SIGTERM')
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      signalProcessGroup('SIGKILL')
      child.kill('SIGKILL')
      resolve()
    }, 3_000)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

const requestStartupPath = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await fetch(url, { redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export const runReleaseSmoke = async ({
  artifactTomlPath = process.env.WEB_RELEASE_SMOKE_ARTIFACT ?? defaultArtifactToml,
} = {}) => {
  const { runArgs, startupPath } = await readReleaseConfig(artifactTomlPath)
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}${startupPath}`
  const output = []
  const child = spawn(runArgs[0], runArgs.slice(1), {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
    },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let spawnError
  child.on('error', (error) => {
    spawnError = error
    output.push(`${error.message}\n`)
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  let result
  try {
    const deadline = Date.now() + startupTimeoutMs
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error(
          [
            `production command could not start: ${spawnError.message}`,
            `command: ${commandLabel(runArgs)}`,
            tail(output),
          ].join('\n'),
        )
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          [
            `production command exited before ${startupPath} became ready (status ${child.exitCode ?? `signal ${child.signalCode}`})`,
            `command: ${commandLabel(runArgs)}`,
            tail(output) || 'no process output',
          ].join('\n'),
        )
      }

      try {
        const response = await requestStartupPath(url)
        if (response.status !== 200) {
          const location = response.headers.get('location')
          const redirectDetail = location ? ` (Location: ${location})` : ''
          throw new Error(
            `startup path ${startupPath} returned HTTP ${response.status}${redirectDetail}; expected HTTP 200 without redirects`,
          )
        }
        result = response
        break
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('startup path ')) throw error
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }

    if (!result) {
      throw new Error(
        [
          `production command did not make ${startupPath} ready within ${startupTimeoutMs}ms`,
          `command: ${commandLabel(runArgs)}`,
          tail(output) || 'no process output',
        ].join('\n'),
      )
    }

    console.log(
      `web release smoke: ${startupPath} returned HTTP 200 on isolated port ${port}`,
    )
  } finally {
    await terminate(child)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await runReleaseSmoke()
  } catch (error) {
    console.error(
      `web release smoke failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}