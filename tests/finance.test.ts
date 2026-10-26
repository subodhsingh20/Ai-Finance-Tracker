import { describe, expect, it } from 'vitest'
import { addMoney, goalProgress, monthBoundsInKolkata, netWorth, summarize } from '../src/lib/finance'

describe('finance calculations', () => {
  it('totals active transaction types and deducts allocations from cash flow', () => {
    const result = summarize([
      { id: '1', type: 'income', amount: 1200, category: 'Gig', description: 'Pay', occurredOn: '2026-10-02' },
      { id: '2', type: 'expense', amount: 300, category: 'Food', description: 'Lunch', occurredOn: '2026-10-03' },
      { id: '3', type: 'investment', amount: 200, category: 'ETF', description: 'ETF', occurredOn: '2026-10-04' },
      { id: '4', type: 'savings', amount: 100, category: 'Emergency', description: 'Fund', occurredOn: '2026-10-05' },
      { id: '5', type: 'expense', amount: 900, category: 'Food', description: 'Removed', occurredOn: '2026-10-05', deletedAt: '2026-10-06' },
    ], 500)
    expect(result).toMatchObject({ income: 1200, expenses: 300, investments: 200, savings: 100, cashFlow: 600, remainingBudget: 200, budgetPercent: 60 })
  })
  it('handles missing and zero budgets without misleading percentages', () => {
    expect(summarize([], null).remainingBudget).toBeNull()
    expect(summarize([], 0).budgetPercent).toBeNull()
  })
  it('adds decimal currency values in cents and rejects totals beyond safe precision', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(() => addMoney(Number.MAX_SAFE_INTEGER / 100, 0.01)).toThrow(RangeError)
  })
  it('calculates goal progress and caps outstanding at zero', () => {
    expect(goalProgress(30, 100)).toEqual({ percent: 30, outstanding: 70 })
    expect(goalProgress(120, 100).outstanding).toBe(0)
    expect(goalProgress(5, 0).percent).toBeNull()
  })
  it('calculates net worth without adding contributions a second time', () => {
    expect(netWorth(50000, 12000, 8000)).toBe(54000)
  })
  it('uses the Asia/Kolkata calendar month', () => {
    expect(monthBoundsInKolkata(new Date('2026-10-31T19:00:00Z'))).toEqual({ start: '2026-11-01', end: '2026-11-30' })
  })
})
