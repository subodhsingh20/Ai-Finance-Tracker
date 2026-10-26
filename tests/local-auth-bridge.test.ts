import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeLocalToken, isSafeSupabasePublicKey } from '../dev/local-auth-bridge'

const config = {
  url: 'http://127.0.0.1:54321',
  publishableKey: 'sb_publishable_local-test',
}

describe('local Supabase AI authorization bridge', () => {
  afterEach(() => vi.restoreAllMocks())

  it('accepts public Supabase keys and rejects secret/service-role keys', () => {
    const anonJwt = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`
    const serviceRoleJwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`

    expect(isSafeSupabasePublicKey('sb_publishable_test-key')).toBe(true)
    expect(isSafeSupabasePublicKey(anonJwt)).toBe(true)
    expect(isSafeSupabasePublicKey(serviceRoleJwt)).toBe(false)
    expect(isSafeSupabasePublicKey('sb_secret_test-key')).toBe(false)
  })

  it('verifies email and consumes the atomic quota before issuing a receipt', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        id: 'user-123',
        email_confirmed_at: '2026-10-26T00:00:00Z',
      }))
      .mockResolvedValueOnce(Response.json(true))

    const response = await authorizeLocalToken('access-token', 'bridge-secret', config, fetcher)

    expect(response.status).toBe(200)
    const body = await response.json() as { receipt: string }
    expect(body.receipt).toMatch(/^[\w-]+\.[\w-]+$/)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://127.0.0.1:54321/auth/v1/user')
    expect(String(fetcher.mock.calls[1]?.[0])).toBe('http://127.0.0.1:54321/rest/v1/rpc/consume_ai_usage')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer access-token')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe('Bearer access-token')
  })

  it('does not consume quota for unverified users', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
      id: 'user-123',
      email_confirmed_at: null,
    }))

    const response = await authorizeLocalToken('access-token', 'bridge-secret', config, fetcher)

    expect(response.status).toBe(403)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('reports exhausted quota without issuing an authorization receipt', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'user-123', email_confirmed_at: 'verified' }))
      .mockResolvedValueOnce(Response.json(false))

    const response = await authorizeLocalToken('access-token', 'bridge-secret', config, fetcher)

    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code: 'quota_exceeded' } })
  })

  it('rejects non-loopback URLs and non-publishable keys', async () => {
    const externalUrlResponse = await authorizeLocalToken('token', 'secret', {
      ...config,
      url: 'https://example.invalid',
    }, vi.fn<typeof fetch>())
    const secretKeyResponse = await authorizeLocalToken('token', 'secret', {
      ...config,
      publishableKey: 'sb_secret_not-allowed',
    }, vi.fn<typeof fetch>())

    expect(externalUrlResponse.status).toBe(503)
    expect(secretKeyResponse.status).toBe(503)
  })

  it('accepts a legacy anon JWT key', async () => {
    const legacyConfig = {
      ...config,
      publishableKey: `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`,
    }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'user-123', email_confirmed_at: 'verified' }))
      .mockResolvedValueOnce(Response.json(true))

    const response = await authorizeLocalToken('access-token', 'bridge-secret', legacyConfig, fetcher)

    expect(response.status).toBe(200)
  })
})
