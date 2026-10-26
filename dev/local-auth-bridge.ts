import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const route = '/__local/ai-authorization'
const maxBodyBytes = 8192

type SupabaseConfig = {
  url: string
  publishableKey: string
}

type Receipt = {
  sub: string
  tokenHash: string
  exp: number
  jti: string
}

function response(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function readDevVars(): Record<string, string> {
  const contents = readFileSync(resolve(process.cwd(), '.dev.vars'), 'utf8')
  return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    if (separator < 1) return []
    return [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]]
  }))
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function isSafeSupabasePublicKey(value: string): boolean {
  if (!value || /secret|service_role/i.test(value)) return false
  if (value.startsWith('sb_publishable_')) return true
  const payload = value.split('.')[1]
  if (!payload) return false
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    return JSON.parse(decoded).role === 'anon'
  } catch {
    return false
  }
}

export function signLocalAuthReceipt(secret: string, receipt: Receipt): string {
  const payload = Buffer.from(JSON.stringify(receipt)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readRequestBody(request: IncomingMessage): Promise<{ body?: string; tooLarge?: boolean }> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += data.byteLength
      if (size > maxBodyBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      if (!tooLarge) chunks.push(data)
    })
    request.on('end', () => resolveBody(tooLarge ? { tooLarge: true } : { body: Buffer.concat(chunks).toString('utf8') }))
    request.on('error', reject)
  })
}

function send(res: ServerResponse, result: Response): void {
  res.statusCode = result.status
  for (const [key, value] of result.headers) res.setHeader(key, value)
  void result.text().then((body) => res.end(body))
}

export async function authorizeLocalToken(
  accessToken: string,
  secret: string,
  config: SupabaseConfig,
  fetcher: typeof fetch,
): Promise<Response> {
  if (!isLoopbackUrl(config.url)) {
    return response(503, 'local_auth_unavailable', 'The local AI bridge requires an HTTP loopback Supabase URL.')
  }
  if (!isSafeSupabasePublicKey(config.publishableKey)) {
    return response(503, 'local_auth_unavailable', 'Set the Supabase publishable or legacy anon key. Never use a secret/service-role key.')
  }

  const baseUrl = config.url.replace(/\/+$/, '')
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${accessToken}` }
  try {
    const authResponse = await fetcher(`${baseUrl}/auth/v1/user`, {
      headers,
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (authResponse.status === 401 || authResponse.status === 403) {
      return response(401, 'unauthorized', 'Your session is invalid or expired.')
    }
    if (!authResponse.ok) {
      return response(503, 'auth_unavailable', 'Local Supabase Auth could not verify your session.')
    }

    const identity = await authResponse.json() as { id?: unknown; email_confirmed_at?: unknown }
    if (typeof identity.id !== 'string' || !identity.id || !identity.email_confirmed_at) {
      return response(403, 'unverified_user', 'Verify your invited account before using AI entry.')
    }

    const quotaResponse = await fetcher(`${baseUrl}/rest/v1/rpc/consume_ai_usage`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
    })
    if (!quotaResponse.ok) {
      return response(503, 'quota_unavailable', 'Local AI quota verification is unavailable. Manual entry is still available.')
    }
    if (await quotaResponse.json() !== true) {
      return response(429, 'quota_exceeded', 'You have reached the daily AI limit. Manual entry is still available.')
    }

    const now = Math.floor(Date.now() / 1000)
    const receipt = signLocalAuthReceipt(secret, {
      sub: identity.id,
      tokenHash: createHash('sha256').update(accessToken).digest('base64url'),
      exp: now + 30,
      jti: randomUUID(),
    })
    return Response.json({ receipt }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return response(503, 'auth_unavailable', 'Local Supabase cannot be reached by the development bridge.')
  }
}

export function localAuthBridgePlugin(
  secret: string,
  frontendConfig: SupabaseConfig,
): Plugin {
  return {
    name: 'local-supabase-ai-auth-bridge',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((request, res, next) => {
        if (request.url?.split('?')[0] !== route) {
          next()
          return
        }
        res.setHeader('Cache-Control', 'no-store')
        if (request.method !== 'POST') {
          send(res, response(405, 'method_not_allowed', 'Use POST for local AI verification.'))
          return
        }
        if (!request.headers['content-type']?.toLowerCase().includes('application/json')) {
          send(res, response(415, 'invalid_content_type', 'Request content must be JSON.'))
          return
        }
        const contentLength = Number(request.headers['content-length'])
        if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
          send(res, response(413, 'request_too_large', 'Request body is too large.'))
          request.resume()
          return
        }

        void readRequestBody(request).then(async ({ body, tooLarge }) => {
          if (tooLarge) {
            send(res, response(413, 'request_too_large', 'Request body is too large.'))
            return
          }
          let input: unknown
          try {
            input = JSON.parse(body ?? '')
          } catch {
            send(res, response(400, 'invalid_json', 'Request body must be valid JSON.'))
            return
          }
          if (typeof input !== 'object' || input === null || Array.isArray(input)) {
            send(res, response(400, 'invalid_input', 'A signed-in access token is required.'))
            return
          }
          const authorization = request.headers.authorization
          const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
          if (!accessToken || accessToken.length > 4096) {
            send(res, response(401, 'unauthorized', 'Sign in to use AI entry.'))
            return
          }

          const vars = readDevVars()
          const config = {
            url: vars.VITE_SUPABASE_URL ?? '',
            publishableKey: vars.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
          }
          if (config.url !== frontendConfig.url || config.publishableKey !== frontendConfig.publishableKey) {
            send(res, response(503, 'local_auth_unavailable', 'Local frontend and Worker Supabase settings must match.'))
            return
          }
          send(res, await authorizeLocalToken(accessToken, secret, config, fetch))
        }).catch(() => {
          if (!res.headersSent) send(res, response(503, 'auth_unavailable', 'Local Supabase verification failed.'))
        })
      })
    },
  }
}
