import { z } from 'zod'

const transactionItem = z.object({
  type: z.enum(['income', 'expense', 'investment', 'savings']),
  amount: z.number().finite().positive().max(999999999999)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, 'Amount must use at most two decimal places.'),
  categoryName: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(180),
  occurredOn: z.string().date().optional(),
  sourceName: z.string().trim().max(120).optional(),
  merchantName: z.string().trim().max(120).optional(),
  instrumentName: z.string().trim().max(120).optional(),
  savingsGoalName: z.string().trim().max(120).optional(),
  assumptions: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
}).strict()

const changeProposal = z.object({
  action: z.literal('change'),
  intent: z.enum(['update', 'delete']),
  searchText: z.string().trim().min(1).max(180),
  changes: z.object({
    amount: z.number().finite().positive().max(999999999999)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, 'Amount must use at most two decimal places.').optional(),
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
    intent: z.literal('create'),
    items: z.array(transactionItem).min(1).max(25),
    clarificationQuestion: z.null(),
  }).strict(),
  changeProposal,
  z.object({ action: z.literal('clarify'), clarificationQuestion: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal('question'), question: z.string().trim().min(1).max(500) }).strict(),
])

export type AiProposal = z.infer<typeof aiProposalSchema>
export type AiCreateItem = Extract<AiProposal, { action: 'create' }>['items'][number]
