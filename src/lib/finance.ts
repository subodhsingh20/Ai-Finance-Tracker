export type FinanceTransaction = {
  id: string
  type: 'income' | 'expense' | 'investment' | 'savings'
  amount: number
  category: string
  description: string
  occurredOn: string
  deletedAt?: string | null
}

export type Summary = {
  income: number
  expenses: number
  investments: number
  savings: number
  cashFlow: number
  remainingBudget: number | null
  budgetPercent: number | null
}

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

function toCents(amount: number) {
  if (!Number.isFinite(amount)) throw new RangeError('Money values must be finite numbers.')
  return BigInt(Math.round((amount + Number.EPSILON) * 100))
}

function fromCents(cents: bigint) {
  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
    throw new RangeError('The total is too large to represent safely in cents.')
  }
  return Number(cents) / 100
}

export function addMoney(left: number, right: number) {
  return fromCents(toCents(left) + toCents(right))
}

export function summarize(transactions: FinanceTransaction[], budget: number | null): Summary {
  const active = transactions.filter((item) => !item.deletedAt)
  const total = (type: FinanceTransaction['type']) => fromCents(active
    .filter((item) => item.type === type)
    .reduce((sum, item) => sum + toCents(item.amount), 0n))
  const income = total('income')
  const expenses = total('expense')
  const investments = total('investment')
  const savings = total('savings')
  const budgetCents = budget === null ? null : toCents(budget)
  const expenseCents = toCents(expenses)
  return {
    income, expenses, investments, savings,
    cashFlow: fromCents(toCents(income) - expenseCents - toCents(investments) - toCents(savings)),
    remainingBudget: budgetCents === null ? null : fromCents(budgetCents - expenseCents),
    budgetPercent: budgetCents === null || budgetCents <= 0n ? null : Number(expenseCents) / Number(budgetCents) * 100,
  }
}

export function goalProgress(contributions: number, target: number) {
  const contributionCents = toCents(contributions)
  const targetCents = toCents(target)
  return {
    percent: targetCents > 0n ? Number(contributionCents) / Number(targetCents) * 100 : null,
    outstanding: fromCents(targetCents > contributionCents ? targetCents - contributionCents : 0n),
  }
}

export function netWorth(assets: number, investmentHoldings: number, liabilities: number) {
  return fromCents(toCents(assets) + toCents(investmentHoldings) - toCents(liabilities))
}

export function monthBoundsInKolkata(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')!.value
  const month = parts.find((part) => part.type === 'month')!.value
  const start = `${year}-${month}-01`
  const endDate = new Date(Date.UTC(Number(year), Number(month), 1) - 1)
  return { start, end: `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}` }
}

export function rupees(amount: number) {
  if (!Number.isFinite(amount)) throw new RangeError('Money values must be finite numbers.')
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount)
}
