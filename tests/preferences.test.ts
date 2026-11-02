import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DASHBOARD_ORDER,
  DEFAULT_MODULE_ORDER,
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_WORKSPACE_MODULES,
  normalizeDashboardPreferences,
  normalizeEnabledModules,
} from '../src/lib/preferences'

describe('account preference compatibility', () => {
  it.each([undefined, null, [], 'invalid', 42])('uses safe defaults for malformed preference roots: %s', (value) => {
    const preferences = normalizeDashboardPreferences(value)
    expect(preferences).toMatchObject({
      income: true,
      expenses: true,
      cashFlow: true,
      monthlyBudget: true,
      fontScale: 'medium',
      density: 'comfortable',
      dashboardOrder: DEFAULT_DASHBOARD_ORDER,
      moduleOrder: DEFAULT_MODULE_ORDER,
      quickActions: DEFAULT_QUICK_ACTIONS,
      modulePreferencesSaved: false,
    })
  })

  it('preserves existing dashboard visibility keys and unknown profile preferences', () => {
    const preferences = normalizeDashboardPreferences({
      cashFlow: false,
      categories: false,
      futureSetting: { enabled: true },
    })
    expect(preferences.cashFlow).toBe(false)
    expect(preferences.categories).toBe(false)
    expect(preferences.savingsGoals).toBe(true)
    expect(preferences.futureSetting).toEqual({ enabled: true })
  })

  it('repairs invalid new settings while preserving intentional empty selections', () => {
    const preferences = normalizeDashboardPreferences({
      income: 'hidden',
      fontScale: 'giant',
      density: null,
      dashboardOrder: ['netWorth', 'not-a-card', 'netWorth'],
      moduleOrder: ['assets', 5, 'assets'],
      quickActions: [],
      quickActionOrder: 'not-an-array',
    })
    expect(preferences.income).toBe(true)
    expect(preferences.fontScale).toBe('medium')
    expect(preferences.density).toBe('comfortable')
    expect(preferences.dashboardOrder).toEqual(['netWorth', ...DEFAULT_DASHBOARD_ORDER.filter((id) => id !== 'netWorth')])
    expect(preferences.moduleOrder).toEqual(['assets', ...DEFAULT_MODULE_ORDER.filter((id) => id !== 'assets')])
    expect(preferences.quickActions).toEqual([])
    expect(preferences.quickActionOrder).toEqual(expect.arrayContaining(['addTransaction', 'addIncome']))
  })

  it('keeps Overview available and preserves legacy Archive navigation defaults', () => {
    expect(normalizeEnabledModules(['transactions', 'unknown'], false)).toEqual(['overview', 'transactions', 'archive-trash', 'reports'])
    expect(normalizeEnabledModules(['transactions'], true, 1)).toEqual(['overview', 'transactions'])
    expect(normalizeEnabledModules(null, true)).toEqual(DEFAULT_WORKSPACE_MODULES)
  })
})
