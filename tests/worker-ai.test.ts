import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { signLocalAuthReceipt } from '../dev/local-auth-bridge'
import worker from '../worker/index'

const validProposal = {
  action: 'create',
  intent: 'create',
  clarificationQuestion: null,
  items: [{
    type: 'expense',
    amount: 400,
    categoryName: 'Food & Groceries',
    description: 'Groceries',
    occurredOn: '2026-10-26',
  }],
}

const modelResponse = (content: string) => ({
  choices: [{ message: { content } }],
})

function mockSupabase(quotaAvailable = true) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ id: 'test-user', email_confirmed_at: '2026-10-26T00:00:00Z' })
    }
    if (url.endsWith('/rest/v1/rpc/consume_ai_usage')) {
      return Response.json(quotaAvailable)
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

function createEnv(aiResponse: unknown) {
  const run = vi.fn(async () => aiResponse)
  const env = {
    AI_MODEL: '@cf/zai-org/glm-4.7-flash',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    AI: { run },
  } as unknown as Parameters<typeof worker.fetch>[1]
  return { env, run }
}

function createRequest(body: BodyInit = JSON.stringify({ text: 'spent 400 on groceries today' }), receipt?: string) {
  const init: RequestInit & { duplex?: 'half' } = {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-access-token',
      'Content-Type': 'application/json',
      ...(receipt ? { 'X-Local-AI-Authorization': receipt } : {}),
    },
    body,
  }
  if (body instanceof ReadableStream) init.duplex = 'half'
  return new Request('https://finance.test/api/ai/parse', init)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Workers AI endpoint', () => {
  it('extracts and validates the GLM chat-completion content', async () => {
    mockSupabase()
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))

    const response = await worker.fetch(createRequest(), env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ proposal: validProposal })
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith('@cf/zai-org/glm-4.7-flash', expect.objectContaining({
      response_format: { type: 'json_object' },
      max_completion_tokens: 2400,
    }))
    const options = run.mock.calls[0]?.[1]
    expect(options).not.toHaveProperty('max_tokens')
  })

  it('rejects malformed JSON in the model content', async () => {
    mockSupabase()
    const { env } = createEnv(modelResponse('{not json'))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_invalid_json', message: expect.not.stringContaining('unclear') },
    })
  })

  it('reports an unexpected response shape when chat-completion choices are absent', async () => {
    mockSupabase()
    const { env } = createEnv({})

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_unexpected_response', message: expect.stringContaining('unsupported response format') },
    })
  })

  it('reports missing model content distinctly', async () => {
    mockSupabase()
    const { env } = createEnv({ choices: [{ message: {} }] })

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_missing_content', message: expect.stringContaining('returned no proposal') },
    })
  })

  it('reports empty model content distinctly from response-shape failures', async () => {
    mockSupabase()
    const { env } = createEnv(modelResponse('   '))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_missing_content', message: expect.stringContaining('returned no proposal') },
    })
  })

  it('rejects schema-invalid JSON with sanitized issue path diagnostics', async () => {
    mockSupabase()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const userText = 'My private message should never enter logs.'
    const responseText = JSON.stringify({
      ...validProposal,
      items: [{ type: 'expense', amount: -1, categoryName: 'Food', description: userText, id: 'untrusted-id' }],
    })
    const { env } = createEnv(modelResponse(responseText))

    const response = await worker.fetch(createRequest(JSON.stringify({ text: userText })), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_invalid_proposal', message: expect.stringContaining('validation requirements') },
    })
    expect(warning).toHaveBeenCalledOnce()
    const diagnostics = String(warning.mock.calls[0]?.[0])
    expect(diagnostics).toContain('"event":"workers_ai_invalid_proposal"')
    expect(diagnostics).toContain('"issue_paths"')
    expect(diagnostics).not.toContain(userText)
    expect(diagnostics).not.toContain(responseText)
  })

  it('normalizes only a missing create intent and still validates all remaining proposal fields', async () => {
    mockSupabase()
    const { env } = createEnv(modelResponse(JSON.stringify({
      action: 'create',
      clarificationQuestion: null,
      items: validProposal.items,
    })))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      proposal: { action: 'create', intent: 'create', items: validProposal.items },
    })
  })

  it('returns one valid proposal for the requested four-entry batch, including defaults and missing instrument', async () => {
    mockSupabase()
    const batch = {
      action: 'create',
      clarificationQuestion: null,
      items: [
        { type: 'expense', amount: 99, categoryName: 'Food & Groceries', description: 'Food 99' },
        { type: 'expense', amount: 50, categoryName: 'Transport', description: 'Petrol 50' },
        { type: 'savings', amount: 400, categoryName: 'Emergency Fund', description: 'Savings 400', assumptions: 'Defaulted to Emergency Fund' },
        { type: 'investment', amount: 2000, categoryName: 'Other', description: 'Investment 2000', assumptions: 'Investment instrument needs confirmation' },
      ],
    }
    const { env, run } = createEnv(modelResponse(JSON.stringify(batch)))
    const response = await worker.fetch(createRequest(JSON.stringify({ text: 'Food 99\nPetrol 50\nSavings 400\nInvestment 2000' })), env)
    expect(response.status).toBe(200)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const payload = await response.json() as { proposal: { intent: string; items: Array<Record<string, unknown>> } }
    expect(payload.proposal.intent).toBe('create')
    expect(payload.proposal.items).toHaveLength(4)
    expect(payload.proposal.items.map((item) => [item.type, item.amount])).toEqual([
      ['expense', 99], ['expense', 50], ['savings', 400], ['investment', 2000],
    ])
    expect(payload.proposal.items.map((item) => item.occurredOn)).toEqual(Array(4).fill(today))
    expect(payload.proposal.items[2].assumptions).toEqual(['Defaulted to Emergency Fund', 'Date defaulted to today in Asia/Kolkata.'])
    expect(payload.proposal.items[3].assumptions).toEqual(['Investment instrument needs confirmation', 'Date defaulted to today in Asia/Kolkata.'])
    const systemPrompt = run.mock.calls[0]?.[1].messages[0]?.content
    expect(systemPrompt).toContain('"assumptions":["Defaulted to Emergency Fund"]')
    expect(systemPrompt).toContain('"assumptions":["Investment instrument needs confirmation"]')
    expect(systemPrompt).toContain('Never return assumptions as a scalar string, boolean, or object')
  })

  it('accepts empty assumption arrays without altering them', async () => {
    mockSupabase()
    const { env } = createEnv(modelResponse(JSON.stringify({
      ...validProposal,
      items: [{ ...validProposal.items[0], assumptions: [] }],
    })))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      proposal: { items: [{ assumptions: [] }] },
    })
  })

  it('does not normalize invalid assumption types', async () => {
    mockSupabase()
    const invalidAssumptions = [true, { reason: 'unspecified' }, 12, null]
    const { env } = createEnv(modelResponse(JSON.stringify({
      ...validProposal,
      items: invalidAssumptions.map((assumptions) => ({
        ...validProposal.items[0],
        assumptions,
      })),
    })))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_invalid_proposal' },
    })
  })

  it('rejects assumption strings and arrays that exceed the existing limits', async () => {
    mockSupabase()
    const longAssumption = 'x'.repeat(241)
    const oversizedAssumptions = Array(21).fill('Assumption')
    const { env } = createEnv(modelResponse(JSON.stringify({
      ...validProposal,
      items: [
        { ...validProposal.items[0], assumptions: longAssumption },
        { ...validProposal.items[0], assumptions: oversizedAssumptions },
      ],
    })))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_invalid_proposal' },
    })
  })

  it('accepts comma-separated entries in one AI request', async () => {
    mockSupabase()
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const text = 'Food 300, Petrol 500, Savings 50, Investment 2000'
    expect((await worker.fetch(createRequest(JSON.stringify({ text })), env)).status).toBe(200)
    expect(run.mock.calls[0]?.[1].messages[1]).toEqual({ role: 'user', content: text })
  })

  it('accepts income mixed with expenses, savings and investments in a single batch proposal', async () => {
    mockSupabase()
    const batch = {
      ...validProposal,
      items: [
        { type: 'income', amount: 1200, categoryName: 'Rapido / Gig Work', description: 'Rapido income', occurredOn: '2026-10-28', sourceName: 'Rapido' },
        { type: 'expense', amount: 300, categoryName: 'Food & Groceries', description: 'Food', occurredOn: '2026-10-28' },
        { type: 'expense', amount: 500, categoryName: 'Transport', description: 'Petrol', occurredOn: '2026-10-28' },
        { type: 'savings', amount: 50, categoryName: 'Emergency Fund', description: 'Emergency savings', occurredOn: '2026-10-28' },
        { type: 'investment', amount: 2000, categoryName: 'Gold', description: 'Gold ETF', occurredOn: '2026-10-28', instrumentName: 'Gold ETF' },
      ],
    }
    const { env, run } = createEnv(modelResponse(JSON.stringify(batch)))
    const naturalText = 'I earned ₹1,200 from Rapido today, spent ₹300 on food and ₹500 on petrol, invested ₹2,000 in a Gold ETF, and saved ₹50 for emergencies.'
    const response = await worker.fetch(createRequest(JSON.stringify({ text: naturalText })), env)
    expect(response.status).toBe(200)
    expect(run.mock.calls[0]?.[1].messages[1]).toEqual({ role: 'user', content: naturalText })
    await expect(response.json()).resolves.toMatchObject({ proposal: { items: batch.items } })
  })

  it('resolves omitted dates to today in Asia/Kolkata and discloses the default', async () => {
    mockSupabase()
    const noDate = {
      ...validProposal,
      items: [{ ...validProposal.items[0], occurredOn: undefined }],
    }
    const { env } = createEnv(modelResponse(JSON.stringify(noDate)))
    const response = await worker.fetch(createRequest(), env)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    await expect(response.json()).resolves.toMatchObject({
      proposal: { items: [{ occurredOn: today, assumptions: ['Date defaulted to today in Asia/Kolkata.'] }] },
    })
  })

  it('rejects model output with more than 25 entries', async () => {
    mockSupabase()
    const oversized = { ...validProposal, items: Array.from({ length: 26 }, () => validProposal.items[0]) }
    const { env, run } = createEnv(modelResponse(JSON.stringify(oversized)))
    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'ai_invalid_proposal' } })
    expect(run).toHaveBeenCalledOnce()
  })

  it('rejects non-finite, zero, and missing amounts without fabricating replacements', async () => {
    mockSupabase()
    const { env: zeroEnv } = createEnv(modelResponse(JSON.stringify({
      ...validProposal,
      items: [{ ...validProposal.items[0], amount: 0 }],
    })))
    const zeroResponse = await worker.fetch(createRequest(), zeroEnv)
    expect(zeroResponse.status).toBe(502)
    await expect(zeroResponse.json()).resolves.toMatchObject({ error: { code: 'ai_invalid_proposal' } })

    const { env: missingEnv } = createEnv(modelResponse(JSON.stringify({
      ...validProposal,
      items: [{ type: 'expense', categoryName: 'Food', description: 'Missing amount' }],
    })))
    const missingResponse = await worker.fetch(createRequest(), missingEnv)
    expect(missingResponse.status).toBe(502)
    await expect(missingResponse.json()).resolves.toMatchObject({ error: { code: 'ai_invalid_proposal' } })
  })

  it('returns a provider error message and code without treating the prompt as unclear', async () => {
    mockSupabase()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { env, run } = createEnv(null)
    run.mockRejectedValueOnce(new Error('sensitive provider detail'))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ai_provider_error', message: expect.stringContaining('temporarily unavailable') },
    })
    expect(String(warning.mock.calls[0]?.[0])).not.toContain('sensitive provider detail')
  })

  it('allows signed-in local AI entry using the frontend Supabase variables', async () => {
    const fetcher = mockSupabase()
    const { env: configuredEnv, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const env = {
      ...configuredEnv,
      SUPABASE_URL: undefined,
      SUPABASE_PUBLISHABLE_KEY: undefined,
      VITE_SUPABASE_URL: 'https://local-supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
    } as typeof configuredEnv

    const response = await worker.fetch(createRequest(), env)

    expect(response.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://local-supabase.test/auth/v1/user')
    const authHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
    expect(authHeaders.get('apikey')).toBe('local-publishable-key')
    expect(authHeaders.get('Authorization')).toBe('Bearer test-access-token')
    expect(String(fetcher.mock.calls[1]?.[0])).toBe('https://local-supabase.test/rest/v1/rpc/consume_ai_usage')
    expect(run).toHaveBeenCalledOnce()
  })

  it('accepts a signed one-use local authorization receipt without private-network fetches', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const { env: configuredEnv, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const secret = 'dev-only-secret'
    const receipt = signLocalAuthReceipt(secret, {
      sub: 'test-user',
      tokenHash: createHash('sha256').update('test-access-token').digest('base64url'),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: randomUUID(),
    })
    const env = { ...configuredEnv, LOCAL_AUTH_BRIDGE_SECRET: secret } as typeof configuredEnv

    const response = await worker.fetch(createRequest(undefined, receipt), env)

    expect(response.status).toBe(200)
    expect(fetcher).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledOnce()
  })

  it('rejects a replayed local authorization receipt', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const { env: configuredEnv, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const secret = 'dev-only-secret'
    const receipt = signLocalAuthReceipt(secret, {
      sub: 'test-user',
      tokenHash: createHash('sha256').update('test-access-token').digest('base64url'),
      exp: Math.floor(Date.now() / 1000) + 30,
      jti: randomUUID(),
    })
    const env = { ...configuredEnv, LOCAL_AUTH_BRIDGE_SECRET: secret } as typeof configuredEnv

    expect((await worker.fetch(createRequest(undefined, receipt), env)).status).toBe(200)
    const replay = await worker.fetch(createRequest(undefined, receipt), env)

    expect(replay.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledOnce()
  })

  it('reports expired sessions distinctly when Supabase rejects the access token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))

    const response = await worker.fetch(createRequest(), env)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'unauthorized', message: 'Your session is invalid or expired.' },
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('reports missing Supabase Worker configuration separately from sign-in', async () => {
    const fetcher = mockSupabase()
    const { env: configuredEnv, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const env = {
      ...configuredEnv,
      SUPABASE_URL: undefined,
      SUPABASE_PUBLISHABLE_KEY: undefined,
    } as typeof configuredEnv

    const response = await worker.fetch(createRequest(), env)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'auth_unavailable', message: 'AI sign-in verification is not configured. Contact the administrator.' },
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects oversized streamed bodies before quota consumption', async () => {
    const fetcher = mockSupabase()
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8193))
        controller.close()
      },
    })

    const response = await worker.fetch(createRequest(stream), env)

    expect(response.status).toBe(413)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests without calling Supabase or Workers AI', async () => {
    const fetcher = mockSupabase()
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))
    const request = new Request('https://finance.test/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'spent 400 on groceries today' }),
    })

    expect((await worker.fetch(request, env)).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('stops before inference when the atomic quota is exhausted', async () => {
    mockSupabase(false)
    const { env, run } = createEnv(modelResponse(JSON.stringify(validProposal)))

    const response = await worker.fetch(createRequest(), env)
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'quota_exceeded', message: expect.stringContaining('daily AI limit') },
    })
    expect(run).not.toHaveBeenCalled()
  })
})
