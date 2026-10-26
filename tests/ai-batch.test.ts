import { describe, expect, it } from 'vitest'
import { resolveAiBatchItems } from '../src/lib/ai-batch'
import type { AiCreateItem } from '../shared/ai-proposal'

const item = (overrides: Partial<AiCreateItem>): AiCreateItem => ({
  type: 'expense',
  amount: 10,
  categoryName: 'Food',
  description: 'Food',
  occurredOn: '2026-10-28',
  ...overrides,
})
const food = { id: 'food', type: 'expense' as const, name: 'Food & Groceries', archived_at: null }
const transport = { id: 'transport', type: 'expense' as const, name: 'Transport', archived_at: null }
const emergency = { id: 'emergency-category', type: 'savings' as const, name: 'Emergency Fund', archived_at: null }
const otherInvestment = { id: 'other-investment', type: 'investment' as const, name: 'Other', archived_at: null }

describe('resolving AI batch entries to account-owned records', () => {
  it('matches Food and Petrol to active Food and Transport categories', () => {
    const resolved = resolveAiBatchItems([
      item({ categoryName: 'Food', description: 'Food' }),
      item({ categoryName: 'Miscellaneous', description: 'Petrol', type: 'expense' }),
    ], [food, transport], [], [], '2026-10-28')

    expect(resolved.map((entry) => entry.categoryId)).toEqual(['food', 'transport'])
  })

  it('uses a unique active Emergency Fund goal for generic savings', () => {
    const resolved = resolveAiBatchItems(
      [item({ type: 'savings', categoryName: 'Emergency Fund', description: 'Savings' })],
      [emergency],
      [{ id: 'emergency-goal', name: 'Emergency Fund', target_amount: 1000, target_date: null, archived_at: null }],
      [],
      '2026-10-28',
    )[0]

    expect(resolved).toMatchObject({
      categoryId: 'emergency-category',
      savingsGoalId: 'emergency-goal',
      destinationRequired: false,
    })
    expect(resolved.assumptions).toContain('Defaulted to Emergency Fund savings goal.')
  })

  it('falls back to the existing Emergency Fund category without inventing a goal ID', () => {
    const resolved = resolveAiBatchItems(
      [item({ type: 'savings', categoryName: 'Emergency Fund', description: 'Savings' })],
      [emergency],
      [],
      [],
      '2026-10-28',
    )[0]

    expect(resolved.categoryId).toBe('emergency-category')
    expect(resolved.savingsGoalId).toBe('')
    expect(resolved.destinationRequired).toBe(false)
    expect(resolved.assumptions).toContain('Defaulted to the Emergency Fund savings category; no goal was linked.')
  })

  it('requires the user to resolve savings destination when no valid account category exists', () => {
    const resolved = resolveAiBatchItems(
      [item({ type: 'savings', categoryName: 'Emergency Fund', description: 'Savings' })],
      [],
      [],
      [],
      '2026-10-28',
    )[0]
    expect(resolved.categoryId).toBe('')
    expect(resolved.destinationRequired).toBe(true)
  })

  it('uses Other for a generic investment and leaves the instrument unresolved', () => {
    const resolved = resolveAiBatchItems(
      [item({ type: 'investment', categoryName: 'Other', description: 'Investment' })],
      [otherInvestment],
      [],
      [],
      '2026-10-28',
    )[0]
    expect(resolved.categoryId).toBe('other-investment')
    expect(resolved.instrumentName).toBe('')
    expect(resolved.instrumentRequired).toBe(true)
  })

  it('keeps an instrument marked for confirmation unresolved until the user edits it', () => {
    const resolved = resolveAiBatchItems(
      [item({
        type: 'investment',
        categoryName: 'Other',
        description: 'Investment',
        instrumentName: 'Fund',
        assumptions: ['Investment instrument needs confirmation'],
      })],
      [otherInvestment],
      [],
      [],
      '2026-10-28',
      'Investment 2000 in Fund',
    )[0]

    expect(resolved.instrumentName).toBe('Fund')
    expect(resolved.instrumentRequired).toBe(true)
    expect(resolved.assumptions).toContain('Investment instrument needs confirmation')
  })

  it('does not trust AI-invented instrument or goal names that are absent from the prompt', () => {
    const resolved = resolveAiBatchItems(
      [item({
        type: 'investment',
        categoryName: 'Gold',
        description: 'Investment',
        instrumentName: 'Gold ETF',
        savingsGoalName: 'Holiday Fund',
      })],
      [otherInvestment, { id: 'gold', type: 'investment', name: 'Gold', archived_at: null }],
      [],
      [],
      '2026-10-28',
      'Investment 2000',
    )[0]
    expect(resolved.categoryId).toBe('other-investment')
    expect(resolved.instrumentName).toBe('')
    expect(resolved.instrumentRequired).toBe(true)
    expect(resolved.savingsGoalName).toBeUndefined()
    expect(resolved.assumptions).toContain('The proposed instrument was not stated in your message; enter the actual instrument.')
  })

  it('keeps an explicitly stated instrument and ignores an invented goal destination', () => {
    const resolved = resolveAiBatchItems(
      [item({
        type: 'investment',
        categoryName: 'Gold',
        description: 'Gold ETF',
        instrumentName: 'Gold ETF',
      })],
      [{ id: 'gold', type: 'investment', name: 'Gold', archived_at: null }],
      [],
      [],
      '2026-10-28',
      'Invested 2000 in a Gold ETF',
    )[0]
    expect(resolved.instrumentName).toBe('Gold ETF')
    expect(resolved.instrumentRequired).toBe(false)
  })

  it('does not link an AI-suggested income source absent from the user message', () => {
    const resolved = resolveAiBatchItems(
      [item({ type: 'income', categoryName: 'Rapido / Gig Work', description: 'Income', sourceName: 'Rapido' })],
      [{ id: 'gig-income', type: 'income', name: 'Rapido / Gig Work', archived_at: null }],
      [],
      [{ id: 'rapido-source', name: 'Rapido', archived_at: null }],
      '2026-10-28',
      'Income 1200',
    )[0]
    expect(resolved.incomeSourceId).toBe('')
    expect(resolved.sourceName).toBeUndefined()
  })

  it('resolves a missing date to the supplied local date and records the assumption', () => {
    const resolved = resolveAiBatchItems(
      [item({ occurredOn: undefined })],
      [food],
      [],
      [],
      '2026-10-28',
    )[0]
    expect(resolved.occurredOn).toBe('2026-10-28')
    expect(resolved.assumptions).toContain('Date defaulted to today in Asia/Kolkata.')
  })
})
