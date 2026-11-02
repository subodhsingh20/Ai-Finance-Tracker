export const DASHBOARD_CARDS = [
  { id: 'income', label: 'Income this month' },
  { id: 'expenses', label: 'Expenses this month' },
  { id: 'cashFlow', label: 'Cash flow' },
  { id: 'monthlyBudget', label: 'Monthly budget' },
  { id: 'categories', label: 'Expense categories' },
  { id: 'savingsGoals', label: 'Savings goals' },
  { id: 'investments', label: 'Investments' },
  { id: 'netWorth', label: 'Net worth' },
  { id: 'recentTransactions', label: 'Recent transactions' },
] as const

export const DEFAULT_DASHBOARD_ORDER = DASHBOARD_CARDS.map(({ id }) => id)

export const WORKSPACE_MODULES = [
  { id: 'transactions', label: 'Transactions', description: 'Review and manage income, expenses, savings, and investments.' },
  { id: 'reports', label: 'Reports', description: 'Compare income, spending, and allocations across periods.' },
  { id: 'budgets', label: 'Budgets', description: 'Set monthly and category spending limits.' },
  { id: 'savings', label: 'Savings', description: 'Track goals and linked contributions.' },
  { id: 'investments', label: 'Investments', description: 'Manage holdings and valuations.' },
  { id: 'assets', label: 'Assets & debts', description: 'Track assets, liabilities, and current values.' },
  { id: 'categories', label: 'Categories & sources', description: 'Manage transaction categories and income sources.' },
  { id: 'archive-trash', label: 'Archive & Trash', description: 'Restore archived and deleted records.' },
] as const

export const DEFAULT_WORKSPACE_MODULES = ['overview', ...WORKSPACE_MODULES.map(({ id }) => id)]
export const DEFAULT_MODULE_ORDER = WORKSPACE_MODULES.map(({ id }) => id)

export const QUICK_ACTIONS = [
  { id: 'addTransaction', label: 'Add transaction', type: null },
  { id: 'addIncome', label: 'Add income', type: 'income' },
  { id: 'addExpense', label: 'Add expense', type: 'expense' },
  { id: 'addInvestment', label: 'Add investment', type: 'investment' },
  { id: 'addSavings', label: 'Add savings contribution', type: 'savings' },
  { id: 'addBudget', label: 'Add budget', type: null },
  { id: 'addAsset', label: 'Add asset', type: null },
] as const

export const DEFAULT_QUICK_ACTIONS = ['addTransaction', 'addExpense', 'addIncome']
export const QUICK_ACTION_IDS = QUICK_ACTIONS.map(({ id }) => id)

export const DEFAULT_DASHBOARD_PREFERENCES: Record<string, unknown> = {
  income: true,
  expenses: true,
  cashFlow: true,
  monthlyBudget: true,
  categories: true,
  savingsGoals: true,
  investments: true,
  netWorth: true,
  recentTransactions: true,
  dashboardOrder: DEFAULT_DASHBOARD_ORDER,
  moduleOrder: DEFAULT_MODULE_ORDER,
  quickActions: DEFAULT_QUICK_ACTIONS,
  quickActionOrder: QUICK_ACTIONS.map(({ id }) => id),
  fontScale: 'medium',
  density: 'comfortable',
}

export function orderedIds(value: unknown, defaults: readonly string[]): string[] {
  const requested = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const valid = requested.filter((item, index) => defaults.includes(item) && requested.indexOf(item) === index)
  return [...valid, ...defaults.filter((item) => !valid.includes(item))]
}

export function selectedIds(value: unknown, defaults: readonly string[], allowed: readonly string[] = defaults): string[] {
  const requested = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [...defaults]
  return allowed.filter((item) => requested.includes(item))
}

export function preferenceValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function preferenceRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizedSelectedIds(value: unknown, defaults: readonly string[], allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...defaults]
  const selected = allowed.filter((id) => value.includes(id))
  return value.length > 0 && selected.length === 0 ? [...defaults] : selected
}

export function normalizeDashboardPreferences(value: unknown): Record<string, unknown> {
  const stored = preferenceRecord(value)
  const cards = Object.fromEntries(DASHBOARD_CARDS.map(({ id }) => [
    id,
    typeof stored[id] === 'boolean' ? stored[id] : true,
  ]))
  const preferences: Record<string, unknown> = {
    ...DEFAULT_DASHBOARD_PREFERENCES,
    ...stored,
    ...cards,
    dashboardOrder: orderedIds(stored.dashboardOrder, DEFAULT_DASHBOARD_ORDER),
    moduleOrder: orderedIds(stored.moduleOrder, DEFAULT_MODULE_ORDER),
    quickActions: normalizedSelectedIds(stored.quickActions, DEFAULT_QUICK_ACTIONS, QUICK_ACTION_IDS),
    quickActionOrder: orderedIds(stored.quickActionOrder, QUICK_ACTION_IDS),
    modulePreferencesSaved: stored.modulePreferencesSaved === true,
    fontScale: preferenceValue(stored.fontScale, ['small', 'medium', 'large'] as const, 'medium'),
    density: preferenceValue(stored.density, ['comfortable', 'compact'] as const, 'comfortable'),
  }
  return preferences
}

export function normalizeEnabledModules(value: unknown, preferencesSaved: boolean, modulePreferencesVersion = 0): string[] {
  const stored = Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [...DEFAULT_WORKSPACE_MODULES]
  const allowed = new Set(['overview', ...WORKSPACE_MODULES.map(({ id }) => id)])
  const modules = [...new Set(['overview', ...stored.filter((id) => allowed.has(id))])]
  if (!preferencesSaved && !modules.includes('archive-trash')) modules.push('archive-trash')
  if (modulePreferencesVersion < 1 && !modules.includes('reports')) modules.push('reports')
  return modules
}
