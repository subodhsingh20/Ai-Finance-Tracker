import { z } from 'zod'

const transactionItem = z.object({
  type: z.enum(['income', 'expense', 'investment', 'savings']),
  amount: z.number().finite().positive().max(999999999999),
  categoryName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(180),
  occurredOn: z.string().date(),
  sourceName: z.string().trim().max(120).optional(),
  merchantName: z.string().trim().max(120).optional(),
}).strict()

const changeProposal = z.object({
  action: z.literal('change'),
  intent: z.enum(['update', 'delete']),
  searchText: z.string().trim().min(1).max(180),
  changes: z.object({
    amount: z.number().finite().positive().max(999999999999).optional(),
    categoryName: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(180).optional(),
    occurredOn: z.string().date().optional(),
    sourceName: z.string().trim().max(120).optional(),
    merchantName: z.string().trim().max(120).optional(),
  }).strict().optional(),
}).strict().superRefine((proposal, context) => {
  if (proposal.intent === 'update' && (!proposal.changes || Object.keys(proposal.changes).length === 0)) {
    context.addIssue({ code: 'custom', message: 'An update needs at least one editable field.' })
  }
  if (proposal.intent === 'delete' && proposal.changes) {
    context.addIssue({ code: 'custom', message: 'A delete proposal cannot include field changes.' })
  }
})

export const aiProposalSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    items: z.array(transactionItem).min(1).max(20),
    clarificationQuestion: z.null(),
  }).strict(),
  changeProposal,
  z.object({ action: z.literal('clarify'), clarificationQuestion: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal('question'), question: z.string().trim().min(1).max(500) }).strict(),
])

export type AiProposal = z.infer<typeof aiProposalSchema>
export type AiAdapter = {
  parse(text: string, accessToken: string): Promise<AiProposal>
}

export function validateAiProposal(value: unknown): AiProposal {
  return aiProposalSchema.parse(value)
}

export function createAiAdapter(fetcher: typeof fetch = fetch): AiAdapter {
  return {
    async parse(text, accessToken) {
      const response = await fetcher('/api/ai/parse', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, locale: 'en-IN' }),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload
          && typeof payload.error === 'object' && payload.error !== null && 'message' in payload.error
          && typeof payload.error.message === 'string'
          ? payload.error.message
          : `AI parsing failed (${response.status}).`
        throw new Error(message)
      }
      if (typeof payload !== 'object' || payload === null || !('proposal' in payload)) {
        throw new Error('The AI service returned an invalid response.')
      }
      return validateAiProposal(payload.proposal)
    },
  }
}

export function createMockAiAdapter(proposal: unknown): AiAdapter {
  return { async parse() { return validateAiProposal(proposal) } }
}
