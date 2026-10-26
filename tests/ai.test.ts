import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAiAdapter, createMockAiAdapter, validateAiProposal } from '../src/lib/ai'

const createProposal = {
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

describe('AI proposal validation and adapter', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('validates a generated proposal and sends the signed-in access token', async () => {
    vi.stubEnv('DEV', false)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ proposal: createProposal }))
    const adapter = createAiAdapter(fetcher)

    await expect(adapter.parse('spent 400 on groceries today', 'test-access-token')).resolves.toEqual(createProposal)
    expect(fetcher).toHaveBeenCalledWith('/api/ai/parse', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
    }))
  })

  it('explains when a signed-in session has no access token', async () => {
    vi.stubEnv('DEV', false)
    const fetcher = vi.fn<typeof fetch>()
    const adapter = createAiAdapter(fetcher)

    await expect(adapter.parse('spent 400 on groceries today', '  '))
      .rejects.toThrow('Your sign-in session is missing. Refresh the page and sign in again before using AI entry.')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('obtains local authorization before sending a Worker request in development', async () => {
    vi.stubEnv('DEV', true)
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ receipt: 'signed-local-receipt' }))
      .mockResolvedValueOnce(Response.json({ proposal: createProposal }))
    const adapter = createAiAdapter(fetcher)

    await expect(adapter.parse('spent 400 on groceries today', 'test-access-token')).resolves.toEqual(createProposal)
    expect(fetcher).toHaveBeenNthCalledWith(1, '/__local/ai-authorization', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
    }))
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/ai/parse', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-access-token',
        'X-Local-AI-Authorization': 'signed-local-receipt',
      }),
    }))
  })

  it('rejects unexpected model fields and unsafe update requests', () => {
    expect(() => validateAiProposal({
      ...createProposal,
      items: [{ ...createProposal.items[0], id: 'untrusted-id' }],
    })).toThrow()
    expect(() => validateAiProposal({
      action: 'change',
      intent: 'update',
      searchText: 'coffee',
      changes: {},
    })).toThrow()
  })

  it('accepts batches up to 25 items and rejects a larger or invalid batch', () => {
    const item = createProposal.items[0]
    expect(() => validateAiProposal({ ...createProposal, items: Array.from({ length: 25 }, () => item) })).not.toThrow()
    expect(() => validateAiProposal({ ...createProposal, items: Array.from({ length: 26 }, () => item) })).toThrow()
    expect(() => validateAiProposal({
      ...createProposal,
      items: [{ ...item, amount: Number.POSITIVE_INFINITY }],
    })).toThrow()
    expect(() => validateAiProposal({
      ...createProposal,
      items: [{ ...item, occurredOn: '2026-02-30' }],
    })).toThrow()
  })

  it('provides a schema-valid mock adapter for UI tests', async () => {
    const adapter = createMockAiAdapter(createProposal)
    await expect(adapter.parse('test', 'token')).resolves.toEqual(createProposal)
  })
})
