import { describe, expect, it, vi } from 'vitest'
import { createAiAdapter, createMockAiAdapter, validateAiProposal } from '../src/lib/ai'

const createProposal = {
  action: 'create',
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
  it('validates a generated proposal and sends the signed-in access token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ proposal: createProposal }))
    const adapter = createAiAdapter(fetcher)

    await expect(adapter.parse('spent 400 on groceries today', 'test-access-token')).resolves.toEqual(createProposal)
    expect(fetcher).toHaveBeenCalledWith('/api/ai/parse', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
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

  it('provides a schema-valid mock adapter for UI tests', async () => {
    const adapter = createMockAiAdapter(createProposal)
    await expect(adapter.parse('test', 'token')).resolves.toEqual(createProposal)
  })
})
