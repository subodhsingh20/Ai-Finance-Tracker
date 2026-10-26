import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Activity, Archive, ArrowDownLeft, ArrowUpRight, Bot, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, CircleHelp, CreditCard, Home, LogOut, Plus, Settings2, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { FinancePages, TransactionDialog, type AssetDraft, type AssetRow, type BudgetDraft, type BudgetRow, type CategoryRow, type GoalDraft, type GoalRow, type HoldingDraft, type HoldingRow, type IncomeSourceRow, type LiabilityDraft, type LiabilityRow, type TransactionDraft, type TransactionRow, type TransactionType } from './components/FinancePages'
import { ArchiveTrashPage, type ArchiveTrashRecord } from './components/ArchiveTrashPage'
import { createAiAdapter, validateAiProposal, type AiProposal } from './lib/ai'
import { resolveAiBatchItems, type ResolvedAiItem } from './lib/ai-batch'
import { addMoney, goalProgress, monthBoundsInKolkata, netWorth, rupees, summarize } from './lib/finance'
import { supabase } from './lib/supabase'

type Profile = { display_name: string | null; onboarding_completed: boolean; enabled_modules: string[]; dashboard_preferences: Record<string, boolean> }
type AssetValuation = { asset_id: string; value: number | string; as_of_date: string; recorded_at: string }
type HoldingValuation = { holding_id: string; value: number | string; as_of_date: string; recorded_at: string }
type OnboardingData = {
  displayName: string
  enabledModules: string[]
  dashboardPreferences: Record<string, boolean>
  expenseCategories: string[]
  incomeSources: string[]
  monthlyBudget: number | null
  goals: Array<{ name: string; targetAmount: number }>
  assets: Array<{ name: string; currentValue: number }>
  liabilities: Array<{ name: string; category: string; balance: number }>
}

const navItems = [
  { label: 'Overview', icon: Home, module: 'overview' },
  { label: 'Transactions', icon: Activity, module: 'transactions' },
  { label: 'Budgets', icon: ChartNoAxesCombined, module: 'budgets' },
  { label: 'Savings', icon: Wallet, module: 'savings' },
  { label: 'Investments', icon: BriefcaseBusiness, module: 'investments' },
  { label: 'Assets & debts', icon: CreditCard, module: 'assets' },
  { label: 'Categories & sources', icon: Settings2, module: 'categories' },
  { label: 'Archive & Trash', icon: Archive, module: 'archive-trash' },
]
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const currentMonth = () => today().slice(0, 7)
const csvColors = ['#54d8b4', '#f28496', '#88aefb', '#e9c47b', '#bd9cf4', '#75cbd5']
const defaultModules = ['overview', 'transactions', 'budgets', 'savings', 'investments', 'assets', 'categories']
const defaultDashboardPreferences = { cashFlow: true, categories: true, savingsGoals: true, investments: true, netWorth: true }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [holdings, setHoldings] = useState<HoldingRow[]>([])
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>([])
  const [incomeSources, setIncomeSources] = useState<IncomeSourceRow[]>([])
  const [assetValues, setAssetValues] = useState<Map<string, number>>(new Map())
  const [holdingValues, setHoldingValues] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [page, setPage] = useState('Overview')
  const [transactionEditor, setTransactionEditor] = useState<{ initial?: Partial<TransactionDraft>; transaction?: TransactionRow } | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const month = useMemo(() => monthBoundsInKolkata(), [])
  const activeTransactions = useMemo(() => transactions.filter((item) => !item.deleted_at), [transactions])
  const monthTransactions = useMemo(() => activeTransactions.filter((item) => item.occurred_on >= month.start && item.occurred_on <= month.end), [activeTransactions, month])

  function clearSignedInState() {
    setSession(null)
    setProfile(null)
    setTransactions([])
    setCategories([])
    setBudgets([])
    setGoals([])
    setAssets([])
    setHoldings([])
    setLiabilities([])
    setIncomeSources([])
    setAssetValues(new Map())
    setHoldingValues(new Map())
    setPage('Overview')
    setMobileOpen(false)
    setAiOpen(false)
    setTransactionEditor(null)
    setError('')
  }

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setAuthReady(true)
    }).catch((failure: unknown) => {
      if (!alive) return
      setError(errorText(failure))
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setError('')
      if (!nextSession) {
        clearSignedInState()
      }
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const refreshData = useCallback(async () => {
    if (!supabase || !session) return
    setLoading(true)
    try {
      const [profileResult, categoryResult, budgetResult, goalResult, assetResult, holdingResult, liabilityResult, sourceResult, assetValueResult, holdingValueResult, transactionRows] = await Promise.all([
        supabase.from('profiles').select('display_name,onboarding_completed,enabled_modules,dashboard_preferences').eq('id', session.user.id).maybeSingle(),
        supabase.from('categories').select('id,type,name,archived_at,deleted_at,trashed_from_archived_at').order('type').order('name'),
        supabase.from('budgets').select('id,category_id,month_start,limit_amount,archived_at,deleted_at,trashed_from_archived_at,categories(name)').order('month_start', { ascending: false }),
        supabase.from('savings_goals').select('id,name,target_amount,target_date,archived_at,deleted_at,trashed_from_archived_at').order('created_at', { ascending: false }),
        supabase.from('assets').select('id,name,category,current_value,as_of_date,description,archived_at,deleted_at,trashed_from_archived_at').order('name'),
        supabase.from('investment_holdings').select('id,name,instrument_type,symbol,quantity,current_value,as_of_date,notes,archived_at,deleted_at,trashed_from_archived_at').order('name'),
        supabase.from('liabilities').select('id,name,category,outstanding_balance,as_of_date,due_date,notes,archived_at,deleted_at,trashed_from_archived_at').order('name'),
        supabase.from('income_sources').select('id,name,archived_at,deleted_at,trashed_from_archived_at').order('name'),
        supabase.from('asset_valuations').select('asset_id,value,as_of_date,recorded_at').order('as_of_date', { ascending: false }).order('recorded_at', { ascending: false }),
        supabase.from('holding_valuations').select('holding_id,value,as_of_date,recorded_at').order('as_of_date', { ascending: false }).order('recorded_at', { ascending: false }),
        fetchTransactions(),
      ])
      const resultError = [profileResult, categoryResult, budgetResult, goalResult, assetResult, holdingResult, liabilityResult, sourceResult, assetValueResult, holdingValueResult].find((result) => result.error)?.error
      if (resultError) throw resultError
      if (!profileResult.data) throw new Error('Your account profile is missing. Apply the latest Supabase migration and sign in again.')
      setProfile(profileResult.data as Profile)
      setCategories((categoryResult.data ?? []) as CategoryRow[])
      setBudgets((budgetResult.data ?? []).map((row) => ({ ...row, categories: categoryRelation(row.categories) })) as BudgetRow[])
      setGoals((goalResult.data ?? []) as GoalRow[])
      setAssets((assetResult.data ?? []) as AssetRow[])
      setHoldings((holdingResult.data ?? []) as HoldingRow[])
      setLiabilities((liabilityResult.data ?? []) as LiabilityRow[])
      setIncomeSources((sourceResult.data ?? []) as IncomeSourceRow[])
      setTransactions(transactionRows)
      setAssetValues(latestValues(assetValueResult.data as AssetValuation[] ?? [], 'asset_id'))
      setHoldingValues(latestValues(holdingValueResult.data as HoldingValuation[] ?? [], 'holding_id'))
      setError('')
    } catch (failure) {
      setError(errorText(failure))
      throw failure
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) return
    void refreshData().catch((failure: unknown) => setError(errorText(failure)))
  }, [refreshData, session])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!supabase) {
      setError('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before signing in.')
      return
    }
    try {
      const result = resetMode
        ? await supabase.auth.resetPasswordForEmail(email)
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) setError(result.error.message)
      else if (resetMode) setToast('If the account exists, a password reset email has been sent.')
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  async function commit(operation: () => Promise<void>, message: string, reportError = true, showToast = true) {
    try {
      await operation()
      await refreshData()
      if (showToast) {
        setToast(message)
        window.setTimeout(() => setToast(''), 2800)
      }
    } catch (failure) {
      if (reportError) setError(errorText(failure))
      throw failure
    }
  }

  async function signOut() {
    if (!supabase) return
    if (signingOut) return
    setSigningOut(true)
    try {
      const result = await supabase.auth.signOut()
      if (result.error) {
        setError(`Could not sign out: ${result.error.message}`)
        setMobileOpen(false)
        return
      }
      clearSignedInState()
    } catch (failure) {
      setError(`Could not sign out: ${errorText(failure)}`)
      setMobileOpen(false)
    } finally {
      setSigningOut(false)
    }
  }

  function requireClient() {
    if (!supabase || !session) throw new Error('Sign in with an invited account before saving financial data.')
    return { client: supabase, userId: session.user.id }
  }

  async function saveTransaction(draft: TransactionDraft, id?: string) {
    const { client, userId } = requireClient()
    const category = categories.find((item) => item.id === draft.category_id && item.type === draft.type && !item.archived_at && !item.deleted_at)
    if (!category) throw new Error(`Choose an active ${draft.type} category before saving.`)
    const payload = {
        ...draft,
        income_source_id: draft.type === 'income' ? draft.income_source_id : null,
        savings_goal_id: draft.type === 'savings' ? draft.savings_goal_id : null,
      }
    await commit(async () => {
      if (id) {
        const result = await client.from('transactions').update(payload).eq('id', id).is('deleted_at', null).select('id').maybeSingle()
        if (result.error) throw result.error
        if (!result.data) throw new Error('That transaction is no longer active. Refresh the list before editing it.')
      } else {
        const result = await client.from('transactions').insert({
          ...payload,
          user_id: userId,
          created_via: 'manual',
          submission_id: crypto.randomUUID(),
          submission_item_index: 0,
        })
        if (result.error) throw result.error
      }
    }, id ? 'Transaction updated' : 'Transaction saved')
  }

  async function saveAiBatch(items: Array<{ draft: TransactionDraft; index: number }>, submissionId: string) {
    const { client } = requireClient()
    const rows = items.map(({ draft, index }) => {
      const category = categories.find((item) => item.id === draft.category_id && item.type === draft.type && !item.archived_at && !item.deleted_at)
      if (!category) throw new Error(`Choose an active ${draft.type} category for every proposed row.`)
      const source = draft.type === 'income' && draft.income_source_id
        ? incomeSources.find((item) => item.id === draft.income_source_id && !item.archived_at && !item.deleted_at)
        : undefined
      if (draft.income_source_id && !source) throw new Error('Choose an active income source owned by your account.')
      const goal = draft.type === 'savings' && draft.savings_goal_id
        ? goals.find((item) => item.id === draft.savings_goal_id && !item.archived_at && !item.deleted_at)
        : undefined
      if (draft.savings_goal_id && !goal) throw new Error('Choose an active savings goal owned by your account.')
      return {
        type: draft.type,
        amount: draft.amount,
        category_id: draft.category_id,
        description: draft.description,
        occurred_on: draft.occurred_on,
        income_source_id: draft.type === 'income' ? draft.income_source_id : null,
        source_name: draft.source_name,
        merchant_name: draft.merchant_name,
        instrument_name: draft.instrument_name ?? null,
        savings_goal_id: draft.type === 'savings' ? draft.savings_goal_id : null,
        submission_item_index: index,
      }
    })
    await commit(async () => {
      const result = await client.rpc('create_ai_transaction_batch', {
        p_submission_id: submissionId,
        p_items: rows,
      })
      if (result.error) throw result.error
      if (result.data !== rows.length) throw new Error('The database did not confirm the complete AI batch.')
    }, `${items.length} AI-proposed ${items.length === 1 ? 'transaction' : 'transactions'} saved`)
  }

  async function setDeleted(id: string, deleted: boolean) {
    const { client } = requireClient()
    await commit(async () => {
      const result = await client.from('transactions').update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', id)
        .filter('deleted_at', deleted ? 'is' : 'not.is', null)
        .select('id')
        .maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('That transaction was changed elsewhere. Refresh and try again.')
    }, deleted ? 'Transaction moved to trash' : 'Transaction restored')
  }

  async function saveCategory(draft: { type: TransactionType; name: string }, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('categories').update(draft).eq('id', id).select('id').maybeSingle()
        : await client.from('categories').insert({ ...draft, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Category was not saved. Refresh and try again.')
    }, id ? 'Category updated' : 'Category added')
  }

  async function saveSource(name: string, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('income_sources').update({ name }).eq('id', id).select('id').maybeSingle()
        : await client.from('income_sources').insert({ name, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Income source was not saved.')
    }, id ? 'Income source updated' : 'Income source added')
  }

  async function saveBudget(draft: BudgetDraft, id?: string) {
    const { client, userId } = requireClient()
    const payload = { ...draft, category_type: 'expense', user_id: userId }
    await commit(async () => {
      const result = id
        ? await client.from('budgets').update(payload).eq('id', id).select('id').maybeSingle()
        : await client.from('budgets').insert(payload).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Budget was not saved.')
    }, id ? 'Budget updated' : 'Budget added')
  }

  async function saveGoal(draft: GoalDraft, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('savings_goals').update(draft).eq('id', id).select('id').maybeSingle()
        : await client.from('savings_goals').insert({ ...draft, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Savings goal was not saved.')
    }, id ? 'Savings goal updated' : 'Savings goal added')
  }

  async function saveAsset(draft: AssetDraft, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('assets').update(draft).eq('id', id).select('id').maybeSingle()
        : await client.from('assets').insert({ ...draft, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Asset was not saved. No valuation snapshot was recorded.')
    }, id ? 'Asset valuation updated' : 'Asset and first valuation recorded')
  }

  async function saveHolding(draft: HoldingDraft, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('investment_holdings').update(draft).eq('id', id).select('id').maybeSingle()
        : await client.from('investment_holdings').insert({ ...draft, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Investment holding was not saved. No valuation snapshot was recorded.')
    }, id ? 'Holding valuation updated' : 'Investment holding and first valuation recorded')
  }

  async function saveLiability(draft: LiabilityDraft, id?: string) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = id
        ? await client.from('liabilities').update(draft).eq('id', id).select('id').maybeSingle()
        : await client.from('liabilities').insert({ ...draft, user_id: userId }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Liability was not saved.')
    }, id ? 'Liability updated' : 'Liability added')
  }

  async function archive(table: string, id: string, archived: boolean, title: string) {
    const { client } = requireClient()
    await commit(async () => {
      const result = await client.from(table).update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).is('deleted_at', null).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error(`${title} was not updated. Refresh and try again.`)
    }, `${title} ${archived ? 'archived' : 'restored'}`)
  }

  async function restoreArchivedRecord(record: ArchiveTrashRecord) {
    if (record.table === 'transactions') throw new Error('Transactions cannot be archived.')
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = await client.from(record.table).update({ archived_at: null })
        .eq('id', record.id).eq('user_id', userId).is('deleted_at', null).not('archived_at', 'is', null)
        .select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('That archived record changed elsewhere. Refresh and try again.')
    }, `${record.type} restored`, false, false)
  }

  async function moveArchivedRecordToTrash(record: ArchiveTrashRecord) {
    if (record.table === 'transactions') throw new Error('Transactions cannot be archived.')
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = await client.from(record.table).update({ deleted_at: new Date().toISOString() })
        .eq('id', record.id).eq('user_id', userId).is('deleted_at', null).not('archived_at', 'is', null)
        .select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('That archived record changed elsewhere. Refresh and try again.')
    }, `${record.type} moved to Trash`, false, false)
  }

  async function restoreTrashedRecord(record: ArchiveTrashRecord) {
    if (record.table === 'transactions') {
      await setDeleted(record.id, false)
      return
    }
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = await client.from(record.table).update({ deleted_at: null })
        .eq('id', record.id).eq('user_id', userId).not('deleted_at', 'is', null)
        .select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('That trashed record changed elsewhere. Refresh and try again.')
    }, `${record.type} restored`, false, false)
  }

  async function permanentlyDeleteRecord(record: ArchiveTrashRecord) {
    const { client } = requireClient()
    await commit(async () => {
      const result = await client.rpc('permanently_delete_trashed_record', {
        p_record_type: record.table,
        p_record_id: record.id,
      })
      if (result.error) throw result.error
      if (result.data !== true) throw new Error('This record is no longer in your Trash or cannot be permanently deleted.')
    }, `${record.type} permanently deleted`, false, false)
  }

  async function emptyTrash() {
    const { client } = requireClient()
    let deletedCount = 0
    await commit(async () => {
      const result = await client.rpc('empty_current_user_trash')
      if (result.error) throw result.error
      if (typeof result.data !== 'number' || !Number.isSafeInteger(result.data) || result.data < 0) {
        throw new Error('The database returned an invalid Trash deletion count.')
      }
      deletedCount = result.data
    }, 'Trash emptied', false, false)
    return deletedCount
  }

  async function saveProfile(displayName: string, enabledModules: string[], dashboardPreferences: Record<string, boolean>) {
    const { client, userId } = requireClient()
    await commit(async () => {
      const result = await client.from('profiles').update({ display_name: displayName || null, enabled_modules: enabledModules, dashboard_preferences: dashboardPreferences }).eq('id', userId).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('Preferences were not saved.')
    }, 'Preferences saved')
  }

  async function completeOnboarding(data: OnboardingData) {
    const { client, userId } = requireClient()
    await commit(async () => {
      for (const name of data.expenseCategories) {
        const existing = await client.from('categories').select('id,archived_at').eq('type', 'expense').eq('name', name).maybeSingle()
        if (existing.error) throw existing.error
        if (existing.data?.archived_at) {
          const restored = await client.from('categories').update({ archived_at: null }).eq('id', existing.data.id)
          if (restored.error) throw restored.error
        } else if (!existing.data) {
          const created = await client.from('categories').insert({ user_id: userId, type: 'expense', name })
          if (created.error) throw created.error
        }
      }
      for (const name of data.incomeSources) {
        const existing = await client.from('income_sources').select('id,archived_at').eq('name', name).maybeSingle()
        if (existing.error) throw existing.error
        if (existing.data?.archived_at) {
          const restored = await client.from('income_sources').update({ archived_at: null }).eq('id', existing.data.id)
          if (restored.error) throw restored.error
        } else if (!existing.data) {
          const created = await client.from('income_sources').insert({ user_id: userId, name })
          if (created.error) throw created.error
        }
      }
      if (data.monthlyBudget !== null) {
        const existing = await client.from('budgets').select('id').is('category_id', null).eq('month_start', `${currentMonth()}-01`).is('archived_at', null).maybeSingle()
        if (existing.error) throw existing.error
        const result = existing.data
          ? await client.from('budgets').update({ limit_amount: data.monthlyBudget }).eq('id', existing.data.id)
          : await client.from('budgets').insert({ user_id: userId, month_start: `${currentMonth()}-01`, limit_amount: data.monthlyBudget, category_type: 'expense' })
        if (result.error) throw result.error
      }
      for (const item of data.goals) {
        const existing = await client.from('savings_goals').select('id').eq('name', item.name).maybeSingle()
        if (existing.error) throw existing.error
        if (!existing.data) {
          const created = await client.from('savings_goals').insert({ user_id: userId, name: item.name, target_amount: item.targetAmount })
          if (created.error) throw created.error
        }
      }
      for (const item of data.assets) {
        const existing = await client.from('assets').select('id').eq('name', item.name).maybeSingle()
        if (existing.error) throw existing.error
        if (!existing.data) {
          const created = await client.from('assets').insert({ user_id: userId, name: item.name, category: 'other_valuables', current_value: item.currentValue, as_of_date: today() })
          if (created.error) throw created.error
        }
      }
      for (const item of data.liabilities) {
        const existing = await client.from('liabilities').select('id').eq('name', item.name).maybeSingle()
        if (existing.error) throw existing.error
        if (!existing.data) {
          const created = await client.from('liabilities').insert({ user_id: userId, name: item.name, category: item.category, outstanding_balance: item.balance, as_of_date: today() })
          if (created.error) throw created.error
        }
      }
      const updated = await client.from('profiles').update({
        display_name: data.displayName || null,
        enabled_modules: data.enabledModules,
        dashboard_preferences: data.dashboardPreferences,
        onboarding_completed: true,
      }).eq('id', userId).select('id').maybeSingle()
      if (updated.error) throw updated.error
      if (!updated.data) throw new Error('Onboarding could not be completed for this account.')
    }, 'Your workspace is ready')
  }

  if (!authReady) return <main className="splash">Loading your private workspace…</main>
  if (!supabase) return <SetupPage />
  if (!session) return <LoginPage email={email} password={password} resetMode={resetMode} error={error} onEmail={setEmail} onPassword={setPassword} onResetMode={setResetMode} onSubmit={signIn} />
  if (loading && !profile) return <main className="splash">Loading your private workspace…</main>
  if (error && !profile && !loading) return <main className="splash"><div className="login glass" role="alert"><h1>Unable to load your account</h1><p>{error}</p><button className="secondary" onClick={() => void refreshData().catch((failure: unknown) => setError(errorText(failure)))}>Retry</button><button className="link-btn" onClick={() => void signOut()}>Sign out</button></div></main>
  if (profile && !profile.onboarding_completed) return <Onboarding onComplete={completeOnboarding} onSignOut={() => void signOut()} error={error} />

  const activeModules = profile?.enabled_modules ?? defaultModules
  const visibleNav = navItems.filter(({ label, module }) => label === 'Overview' || label === 'Archive & Trash' || activeModules.includes(module))

  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <a className="brand" href="#overview"><span className="brand-mark"><Wallet size={20} /></span><span>ledger<span className="brand-dot">.</span><small>PERSONAL FINANCE</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {visibleNav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${page === label ? 'selected' : ''}`} aria-current={page === label ? 'page' : undefined} onClick={() => { setPage(label); setMobileOpen(false) }}><Icon size={18} /><span>{label}</span>{label === 'Transactions' && <span className="nav-count">{activeTransactions.length}</span>}</button>)}
        <button className={`nav-item ${page === 'Settings' ? 'selected' : ''}`} aria-current={page === 'Settings' ? 'page' : undefined} onClick={() => { setPage('Settings'); setMobileOpen(false) }}><Settings2 size={18} /><span>Settings</span></button>
        <button className={`nav-item ${page === 'Help & privacy' ? 'selected' : ''}`} aria-current={page === 'Help & privacy' ? 'page' : undefined} onClick={() => { setPage('Help & privacy'); setMobileOpen(false) }}><CircleHelp size={18} /><span>Help & privacy</span></button>
      </nav>
      <div className="side-bottom">
        <div className="side-tip"><span className="tip-icon"><Sparkles size={16} /></span><b>A calmer way to track</b><p>Only your active, signed-in financial records appear here.</p></div>
        <div className="profile"><div className="avatar">{(profile?.display_name ?? session.user.email ?? 'U')[0]?.toUpperCase()}</div><div className="profile-text"><b>{profile?.display_name || session.user.email}</b><small>Invited personal account</small></div><SignOutButton onSignOut={() => void signOut()} disabled={signingOut} /></div>
      </div>
    </aside>
    {mobileOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main">
      <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileOpen(true)}><MenuIcon /></button><div className="breadcrumbs">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><div className="month-select"><CalendarDays size={15} /><span>{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span></div><button className="secondary" onClick={() => setAiOpen(true)}><Sparkles size={15} /> Ask Ledger AI</button><button className="primary" onClick={() => setTransactionEditor({})}><Plus size={16} /> Add transaction</button></div></header>
      <div className="content">
        <div className="page-heading"><div><span className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).toUpperCase()}</span><h1>{page === 'Overview' ? 'Your financial picture' : page}</h1><p>{page === 'Overview' ? 'A clear view built from your active records and latest valuations.' : `Review and manage ${page.toLowerCase()} for your account.`}</p></div></div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        {loading && <p className="muted-note" role="status">Refreshing your records…</p>}
        {page === 'Overview'
          ? <Dashboard transactions={monthTransactions} categories={categories} budgets={budgets} goals={goals} holdings={holdings} assets={assets} liabilities={liabilities} assetValues={assetValues} holdingValues={holdingValues} preferences={profile?.dashboard_preferences ?? defaultDashboardPreferences} onAdd={() => setTransactionEditor({})} onPage={setPage} />
          : page === 'Help & privacy'
            ? <HelpPage />
            : page === 'Archive & Trash'
              ? <ArchiveTrashPage
                transactions={transactions}
                categories={categories}
                budgets={budgets}
                goals={goals}
                assets={assets}
                holdings={holdings}
                liabilities={liabilities}
                incomeSources={incomeSources}
                loading={loading}
                onRestoreArchived={restoreArchivedRecord}
                onMoveToTrash={moveArchivedRecordToTrash}
                onRestoreTrashed={restoreTrashedRecord}
                onPermanentlyDelete={permanentlyDeleteRecord}
                onEmptyTrash={emptyTrash}
              />
            : <FinancePages
              page={page}
              transactions={transactions}
              categories={categories}
              budgets={budgets}
              goals={goals}
              assets={assets}
              holdings={holdings}
              liabilities={liabilities}
              incomeSources={incomeSources}
              assetValues={assetValues}
              holdingValues={holdingValues}
              profile={{ display_name: profile?.display_name ?? null, enabled_modules: activeModules, dashboard_preferences: profile?.dashboard_preferences ?? defaultDashboardPreferences }}
              onOpenTransaction={(initial, transaction) => setTransactionEditor({ initial, transaction })}
              onSaveTransaction={saveTransaction}
              onSetDeleted={setDeleted}
              onSaveCategory={saveCategory}
              onArchiveCategory={(id, archived) => archive('categories', id, archived, 'Category')}
              onSaveSource={saveSource}
              onArchiveSource={(id, archived) => archive('income_sources', id, archived, 'Income source')}
              onSaveBudget={saveBudget}
              onArchiveBudget={(id, archived) => archive('budgets', id, archived, 'Budget')}
              onSaveGoal={saveGoal}
              onArchiveGoal={(id, archived) => archive('savings_goals', id, archived, 'Savings goal')}
              onSaveAsset={saveAsset}
              onArchiveAsset={(id, archived) => archive('assets', id, archived, 'Asset')}
              onSaveHolding={saveHolding}
              onArchiveHolding={(id, archived) => archive('investment_holdings', id, archived, 'Holding')}
              onSaveLiability={saveLiability}
              onArchiveLiability={(id, archived) => archive('liabilities', id, archived, 'Liability')}
              onSaveProfile={saveProfile}
            />}
        <footer className="footer"><span><ShieldCheck size={14} /> Protected by Supabase row-level security</span><span>INR · Asia/Kolkata</span></footer>
      </div>
    </main>
    {transactionEditor && <TransactionDialog categories={categories} goals={goals} incomeSources={incomeSources} initial={transactionEditor.initial} transaction={transactionEditor.transaction} onClose={() => setTransactionEditor(null)} onSave={saveTransaction} />}
    {aiOpen && <AiDialog
      accessToken={session.access_token}
      categories={categories}
      incomeSources={incomeSources}
      transactions={transactions}
      goals={goals}
      onClose={() => setAiOpen(false)}
      onSaveBatch={saveAiBatch}
      onSaveTransaction={saveTransaction}
      onSetDeleted={setDeleted}
    />}
    {toast && <div className="toast" role="status" aria-live="polite"><ShieldCheck size={17} />{toast}</div>}
  </div>
}

function Dashboard({ transactions, categories, budgets, goals, holdings, assets, liabilities, assetValues, holdingValues, preferences, onAdd, onPage }: {
  transactions: TransactionRow[]
  categories: CategoryRow[]
  budgets: BudgetRow[]
  goals: GoalRow[]
  holdings: HoldingRow[]
  assets: AssetRow[]
  liabilities: LiabilityRow[]
  assetValues: Map<string, number>
  holdingValues: Map<string, number>
  preferences: Record<string, boolean>
  onAdd: () => void
  onPage: (page: string) => void
}) {
  const financeTx = useMemo(() => transactions.map((item) => ({
    id: item.id,
    type: item.type,
    amount: Number(item.amount),
    category: item.categories?.name ?? 'Uncategorized',
    description: item.description,
    occurredOn: item.occurred_on,
    deletedAt: item.deleted_at,
  })), [transactions])
  const overallBudget = budgets.find((item) => !item.archived_at && !item.category_id && item.month_start === monthBoundsInKolkata().start)
  const summary = summarize(financeTx, overallBudget ? Number(overallBudget.limit_amount) : null)
  const cashFlowByDate = new Map<string, { date: string; income: number; expenses: number }>()
  const expensesByCategory = new Map<string, number>()
  for (const item of transactions) {
    const date = cashFlowByDate.get(item.occurred_on) ?? { date: item.occurred_on, income: 0, expenses: 0 }
    if (item.type === 'income') date.income = addMoney(date.income, Number(item.amount))
    if (item.type === 'expense') {
      date.expenses = addMoney(date.expenses, Number(item.amount))
      const category = item.categories?.name ?? 'Uncategorized'
      expensesByCategory.set(category, addMoney(expensesByCategory.get(category) ?? 0, Number(item.amount)))
    }
    cashFlowByDate.set(item.occurred_on, date)
  }
  const daily = [...cashFlowByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const categoryData = [...expensesByCategory].map(([name, value]) => ({ name, value }))
  const spending = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => addMoney(sum, Number(item.amount)), 0)
  const currentBudgets = budgets.filter((item) => !item.archived_at && !item.deleted_at && item.month_start === monthBoundsInKolkata().start)
  const activeGoals = goals.filter((item) => !item.archived_at && !item.deleted_at)
  const goalSummaries = activeGoals.map((goal) => {
    const contributed = transactions.filter((item) => item.type === 'savings' && item.savings_goal_id === goal.id).reduce((sum, item) => addMoney(sum, Number(item.amount)), 0)
    return { goal, contributed, progress: goalProgress(contributed, Number(goal.target_amount)) }
  })
  const currentAssets = assets.filter((asset) => !asset.archived_at && !asset.deleted_at).reduce((sum, asset) => addMoney(sum, assetValues.get(asset.id) ?? 0), 0)
  const currentHoldings = holdings.filter((holding) => !holding.archived_at && !holding.deleted_at).reduce((sum, holding) => addMoney(sum, holdingValues.get(holding.id) ?? 0), 0)
  const currentLiabilities = liabilities.filter((item) => !item.archived_at && !item.deleted_at).reduce((sum, item) => addMoney(sum, Number(item.outstanding_balance)), 0)
  const contributions = transactions.filter((item) => item.type === 'investment').reduce((sum, item) => addMoney(sum, Number(item.amount)), 0)
  const summaryCards = [
    { title: 'Income this month', value: summary.income, icon: <ArrowDownLeft />, tone: 'mint' },
    { title: 'Expenses this month', value: summary.expenses, icon: <ArrowUpRight />, tone: 'rose' },
    { title: 'Cash flow after allocations', value: summary.cashFlow, icon: <Activity />, tone: 'blue' },
    { title: 'Monthly budget left', value: summary.remainingBudget, icon: <CreditCard />, tone: 'amber' },
  ]
  const categoryBudgets = currentBudgets.filter((item) => item.category_id)

  return <>
    <section className="summary-grid">{summaryCards.map((card) => <SummaryCard key={card.title} title={card.title} amount={card.value} icon={card.icon} tone={card.tone} note={card.title === 'Monthly budget left' && !overallBudget ? 'No overall budget set' : card.title === 'Monthly budget left' ? `${Math.round(summary.budgetPercent ?? 0)}% of budget used` : 'Active entries in this month'} />)}</section>
    <div className="dashboard-grid">
      {preferences.cashFlow !== false && <section className="panel chart-panel"><PanelHeading title="Cash flow" description="Daily income and expenses from active entries" /><div className="chart-legend"><span><i className="dot income-dot" /> Income</span><span><i className="dot expense-dot" /> Expenses</span></div>{daily.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#51d6b0" stopOpacity={.2} /><stop offset="95%" stopColor="#51d6b0" stopOpacity={0} /></linearGradient><linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fa8192" stopOpacity={.15} /><stop offset="95%" stopColor="#fa8192" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#ffffff0b" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#69758e', fontSize: 11 }} tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} /><Tooltip contentStyle={{ background: '#141b2e', border: '1px solid #252e43', borderRadius: 10, color: '#e8edf7' }} labelFormatter={(value) => String(value)} formatter={(value) => rupees(Number(value))} /><Area type="monotone" dataKey="income" stroke="#51d6b0" strokeWidth={2} fill="url(#incomeFill)" /><Area type="monotone" dataKey="expenses" stroke="#fa8192" strokeWidth={2} fill="url(#expenseFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState message="Cash-flow charts appear when you record transactions for this month." onAdd={onAdd} />}</section>}
      <section className="panel budget-panel"><PanelHeading title="Monthly budgets" description="Progress from active expense entries" />{currentBudgets.length === 0 ? <EmptyState message="Set an overall or category budget to track your spending." onAdd={() => onPage('Budgets')} action="Manage budgets" /> : <div className="dashboard-list">{currentBudgets.map((budget) => {
        const spent = budget.category_id
          ? transactions.filter((item) => item.type === 'expense' && item.category_id === budget.category_id).reduce((sum, item) => addMoney(sum, Number(item.amount)), 0)
          : spending
        const limit = Number(budget.limit_amount)
        const percent = limit > 0 ? spent / limit * 100 : null
        return <div className="progress-item" key={budget.id}><div className="progress-caption"><b>{budget.categories?.name ?? 'Overall budget'}</b><span>{rupees(spent)} / {rupees(limit)}</span></div><ProgressBar value={percent ?? 0} /><div className="budget-foot"><span>{rupees(limit - spent)} remaining</span><span>{percent === null ? '—' : `${Math.round(percent)}%`}</span></div></div>
      })}</div>}</section>
      {preferences.categories !== false && <section className="panel chart-panel"><PanelHeading title="Expense categories" description="Only active expense transactions in this month" />{categoryData.length ? <div className="category-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>{categoryData.map((item, index) => <Cell key={item.name} fill={csvColors[index % csvColors.length]} />)}</Pie><Tooltip formatter={(value) => rupees(Number(value))} contentStyle={{ background: '#141b2e', border: '1px solid #252e43', borderRadius: 10, color: '#e8edf7' }} /></PieChart></ResponsiveContainer><div className="category-legend">{categoryData.map((item, index) => <div key={item.name}><span><i className="dot" style={{ background: csvColors[index % csvColors.length] }} />{item.name}</span><b>{rupees(item.value)}</b></div>)}</div></div> : <EmptyState message="Expense categories will appear when active expenses are recorded." onAdd={onAdd} />}</section>}
      {preferences.savingsGoals !== false && <section className="panel budget-panel"><PanelHeading title="Savings goals" description="Linked contributions from active savings entries" />{goalSummaries.length ? <div className="dashboard-list">{goalSummaries.map(({ goal, contributed, progress }) => <div className="progress-item" key={goal.id}><div className="progress-caption"><b>{goal.name}</b><span>{rupees(contributed)} / {rupees(Number(goal.target_amount))}</span></div><ProgressBar value={progress.percent ?? 0} /><div className="budget-foot"><span>{progress.outstanding === 0 ? 'Target reached' : `${rupees(progress.outstanding)} remaining`}</span><span>{Math.round(progress.percent ?? 0)}%</span></div></div>)}</div> : <EmptyState message="Create a savings goal and link contributions to it." onAdd={() => onPage('Savings')} action="Manage goals" />}</section>}
      {preferences.investments !== false && <section className="panel transactions-panel"><PanelHeading title="Investments" description="Contributions are separate from the latest holdings valuation" /><div className="valuation-list"><div><span>Contributions this month</span><b>{rupees(contributions)}</b></div><div><span>Latest holdings valuations</span><b>{rupees(currentHoldings)}</b></div></div><button className="text-action" onClick={() => onPage('Investments')}>Manage holdings →</button></section>}
      {preferences.netWorth !== false && <section className="panel networth-panel"><PanelHeading title="Estimated net worth" description="Latest asset and holding snapshots less active liabilities" /><div className="networth-value">{rupees(netWorth(currentAssets, currentHoldings, currentLiabilities))}</div><div className="valuation-list"><div><span><i className="asset-dot" /> Assets</span><b>{rupees(currentAssets)}</b></div><div><span><i className="asset-dot" /> Investment holdings</span><b>{rupees(currentHoldings)}</b></div><div><span><i className="liability-dot" /> Liabilities</span><b>{rupees(currentLiabilities)}</b></div></div><p className="disclaimer">An estimate from manually recorded balances, not a bank-verified statement.</p><button className="text-action" onClick={() => onPage('Assets & debts')}>Manage assets and debts →</button></section>}
      {categoryBudgets.length > 0 && <section className="panel transactions-panel"><PanelHeading title="Category budget progress" description="Category limits compared with current-month expenses" />{categoryBudgets.map((budget) => {
        const spent = transactions.filter((item) => item.type === 'expense' && item.category_id === budget.category_id).reduce((sum, item) => addMoney(sum, Number(item.amount)), 0)
        const limit = Number(budget.limit_amount)
        return <div className="progress-item" key={budget.id}><div className="progress-caption"><b>{budget.categories?.name ?? 'Category'}</b><span>{rupees(spent)} / {rupees(limit)}</span></div><ProgressBar value={limit > 0 ? spent / limit * 100 : 0} /></div>
      })}</section>}
      {categories.length > 0 && <section className="panel transactions-panel"><PanelHeading title="Recent transactions" description="Latest active entries in this month" />{transactions.length ? <div className="transaction-list">{[...transactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 5).map((item) => <div className="transaction-row" key={item.id}><div className={`transaction-icon ${item.type}`}><Activity size={15} /></div><div className="transaction-meta"><b>{item.description}</b><span>{item.categories?.name ?? 'Uncategorized'} · {item.occurred_on}</span></div><strong className={item.type === 'income' ? 'positive' : ''}>{item.type === 'income' ? '+' : '−'}{rupees(Number(item.amount))}</strong></div>)}</div> : <EmptyState message="There are no active entries for this month." onAdd={onAdd} />}</section>}
    </div>
    <span className="sr-only">Active categories: {categories.filter((item) => !item.archived_at).length}</span>
  </>
}

export function AiDialog({ accessToken, categories, incomeSources, transactions, goals, onClose, onSaveBatch, onSaveTransaction, onSetDeleted, aiAdapter }: {
  accessToken: string
  categories: CategoryRow[]
  incomeSources: IncomeSourceRow[]
  transactions: TransactionRow[]
  goals: GoalRow[]
  onClose: () => void
  onSaveBatch: (items: Array<{ draft: TransactionDraft; index: number }>, submissionId: string) => Promise<void>
  onSaveTransaction: (draft: TransactionDraft, id?: string) => Promise<void>
  onSetDeleted: (id: string, deleted: boolean) => Promise<void>
  aiAdapter?: ReturnType<typeof createAiAdapter>
}) {
  type NewItem = ResolvedAiItem
  type Change = Extract<AiProposal, { action: 'change' }>
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const [items, setItems] = useState<NewItem[]>([])
  const [submissionId, setSubmissionId] = useState('')
  const [submissionAttempted, setSubmissionAttempted] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [changeDraft, setChangeDraft] = useState<Change | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const activeCategories = categories.filter((item) => !item.archived_at && !item.deleted_at)
  const activeTransactions = transactions.filter((item) => !item.deleted_at)
  const matches = useMemo(() => {
    if (proposal?.action !== 'change') return []
    const tokens = proposal.searchText.toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return activeTransactions.filter((item) => {
      const text = [item.description, item.source_name, item.merchant_name, item.categories?.name].filter(Boolean).join(' ').toLocaleLowerCase()
      return tokens.every((token) => text.includes(token))
    })
  }, [activeTransactions, proposal])
  const selected = matches.find((item) => item.id === selectedId)
  const totalFor = (type: TransactionType) => {
    const group = items.filter((item) => item.type === type)
    if (group.some((item) => !Number.isFinite(item.amount))) return null
    return group.reduce((total, item) => addMoney(total, item.amount), 0)
  }
  const formatTotal = (type: TransactionType) => {
    const total = totalFor(type)
    return total === null ? 'Resolve amount' : rupees(total)
  }
  const readyToConfirm = items.length > 0 && items.length <= 25 && items.every((item) => (
    Number.isFinite(item.amount) && item.amount > 0 && item.amount <= 999999999999
    && Math.abs(item.amount * 100 - Math.round(item.amount * 100)) < 1e-7
    && validDate(item.occurredOn)
    && item.description.trim().length > 0 && item.description.length <= 180
    && activeCategories.some((category) => category.id === item.categoryId && category.type === item.type)
    && !(item.type === 'investment' && (item.instrumentRequired || !item.instrumentName.trim()))
    && !(item.type === 'savings' && item.destinationRequired)
    && !(item.type === 'savings' && item.savingsGoalId
      && !goals.some((goal) => goal.id === item.savingsGoalId && !goal.archived_at && !goal.deleted_at))
    && !(item.type === 'income' && item.incomeSourceId
      && !incomeSources.some((source) => source.id === item.incomeSourceId && !source.archived_at && !source.deleted_at))
  ))

  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAiError('')
    setProposal(null)
    setItems([])
    setSubmissionAttempted(false)
    setSelectedId('')
    setChangeDraft(null)
    setCategoryId('')
    setBusy(true)
    try {
      const generated = await (aiAdapter ?? createAiAdapter()).parse(text, accessToken)
      const checked = validateAiProposal(generated)
      setProposal(checked)
      if (checked.action === 'create') {
        setSubmissionId(crypto.randomUUID())
        setItems(resolveAiBatchItems(checked.items, activeCategories, goals, incomeSources, today(), text))
      } else if (checked.action === 'change') {
        setChangeDraft(checked)
        const tokens = checked.searchText.toLocaleLowerCase().split(/\s+/).filter(Boolean)
        const found = activeTransactions.filter((item) => {
          const value = [item.description, item.source_name, item.merchant_name, item.categories?.name].filter(Boolean).join(' ').toLocaleLowerCase()
          return tokens.every((token) => value.includes(token))
        })
        if (found.length === 1) {
          setSelectedId(found[0].id)
          const requestedCategory = checked.changes?.categoryName
            ? activeCategories.find((item) => item.type === found[0].type && item.name.toLocaleLowerCase() === checked.changes?.categoryName?.toLocaleLowerCase())
            : undefined
          setCategoryId(requestedCategory?.id ?? found[0].category_id)
        }
      }
    } catch (failure) {
      setAiError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  function close() {
    setProposal(null)
    setItems([])
    setText('')
    setAiError('')
    onClose()
  }

  async function confirmCreate() {
    setAiError('')
    const candidate = {
      action: 'create' as const,
      intent: 'create' as const,
      items: items.map((item) => ({
        type: item.type,
        amount: item.amount,
        categoryName: item.categoryName,
        description: item.description,
        occurredOn: item.occurredOn,
        ...(item.instrumentName ? { instrumentName: item.instrumentName } : {}),
        ...(item.savingsGoalName ? { savingsGoalName: item.savingsGoalName } : {}),
        ...(item.assumptions?.length ? { assumptions: item.assumptions } : {}),
        ...(item.sourceName === undefined ? {} : { sourceName: item.sourceName }),
        ...(item.merchantName === undefined ? {} : { merchantName: item.merchantName }),
      })),
      clarificationQuestion: null,
    }
    let checked: Extract<AiProposal, { action: 'create' }>
    try {
      checked = validateAiProposal(candidate) as Extract<AiProposal, { action: 'create' }>
    } catch (failure) {
      setAiError(`Review all proposed values before saving. ${errorText(failure)}`)
      return
    }
    if (checked.items.length !== items.length || items.some((item) => !Number.isFinite(item.amount) || item.amount <= 0
      || !activeCategories.some((category) => category.id === item.categoryId && category.type === item.type)
      || !validDate(item.occurredOn)
      || (item.type === 'investment' && (item.instrumentRequired || !item.instrumentName.trim()))
      || (item.type === 'savings' && item.destinationRequired)
      || (item.type === 'savings' && item.savingsGoalId && !goals.some((goal) => goal.id === item.savingsGoalId && !goal.archived_at && !goal.deleted_at))
      || (item.type === 'income' && item.incomeSourceId && !incomeSources.some((source) => source.id === item.incomeSourceId && !source.archived_at && !source.deleted_at)))) {
      setAiError('Resolve every category, destination, instrument and valid amount/date before confirming the batch.')
      return
    }
    setBusy(true)
    try {
      setSubmissionAttempted(true)
      await onSaveBatch(items.map((item) => ({
        index: item.itemIndex,
        draft: {
          type: item.type,
          amount: item.amount,
          category_id: item.categoryId,
          income_source_id: item.type === 'income' ? item.incomeSourceId || null : null,
          description: item.description,
          occurred_on: item.occurredOn,
          source_name: item.sourceName ?? null,
          merchant_name: item.merchantName ?? null,
          savings_goal_id: item.type === 'savings' ? item.savingsGoalId || null : null,
          instrument_name: item.type === 'investment' ? item.instrumentName.trim() : null,
        },
      })), submissionId)
      close()
    } catch (failure) {
      setAiError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  async function confirmChange() {
    if (!changeDraft || !selected) return
    setAiError('')
    setBusy(true)
    try {
      if (changeDraft.intent === 'delete') {
        await onSetDeleted(selected.id, true)
      } else {
        const change = changeDraft.changes ?? {}
        const nextCategoryId = categoryId || (change.categoryName
          ? activeCategories.find((item) => item.type === selected.type && item.name.toLocaleLowerCase() === change.categoryName?.toLocaleLowerCase())?.id
          : selected.category_id)
        if (!nextCategoryId) throw new Error('Select a category that matches the transaction type.')
        await onSaveTransaction({
          type: selected.type,
          amount: change.amount ?? Number(selected.amount),
          category_id: nextCategoryId,
          description: change.description ?? selected.description,
          occurred_on: change.occurredOn ?? selected.occurred_on,
          source_name: change.sourceName ?? selected.source_name,
          merchant_name: change.merchantName ?? selected.merchant_name,
          income_source_id: selected.income_source_id,
          savings_goal_id: selected.savings_goal_id,
        }, selected.id)
      }
      close()
    } catch (failure) {
      setAiError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  function updateItem(index: number, update: Partial<NewItem>) {
    setItems((existing) => existing.map((item, position) => position === index ? { ...item, ...update } : item))
  }

  return <div className="modal-backdrop ai-backdrop"><section className="modal ai-dialog glass" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title"><div className="modal-head"><div><span className="eyebrow">AI QUICK ENTRY</span><h2 id="ai-dialog-title">Review before anything is saved</h2></div><button className="icon-button" aria-label="Close AI entry" onClick={close}><X size={18} /></button></div>
    {!proposal && <form className="ai-modal" onSubmit={(event) => void parse(event)}><div className="ai-badge"><Bot size={19} /></div><p>Describe a new entry or ask to update/delete one of your active transactions. AI text is sent to Cloudflare for parsing; the app searches only your own active records.</p><label htmlFor="ai-text">Description<textarea id="ai-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. Spent ₹400 on groceries today" rows={4} maxLength={2000} required /></label><div className="privacy-note"><ShieldCheck size={16} /> No financial record is written until you review and confirm. Manual entry remains available if AI is unavailable.</div><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={busy || !text.trim()}><Sparkles size={16} />{busy ? 'Parsing…' : 'Prepare preview'}</button></div></form>}
    {proposal?.action === 'create' && <div className="proposal-preview">
      <p>Review every proposed entry, resolved date, category and assumption. Nothing is written until you confirm the complete batch.</p>
      {submissionAttempted && aiError && <p className="muted-note">The write response was uncertain. Retry the exact same values or cancel and check your transaction list first.</p>}
      <section className="ai-batch-summary" aria-label="Batch totals">
        <strong>Batch summary · {items.length} proposed {items.length === 1 ? 'record' : 'records'}</strong>
        <span>Income: {formatTotal('income')}</span>
        <span>Expenses: {formatTotal('expense')}</span>
        <span>Savings contributions: {formatTotal('savings')}</span>
        <span>Investment contributions: {formatTotal('investment')}</span>
      </section>
      {items.map((item, index) => <fieldset className="proposal-row" key={`${submissionId}-${item.itemIndex}`} disabled={submissionAttempted || busy}>
        <legend>{titleCase(item.type)} · Proposed entry {index + 1}</legend>
        <button type="button" className="secondary remove-proposal" onClick={() => setItems((existing) => existing.filter((_, rowIndex) => rowIndex !== index))}>Remove row</button>
        <label>Type<select value={item.type} onChange={(event) => {
          const type = event.target.value as TransactionType
          const category = activeCategories.find((candidate) => candidate.type === type)
          updateItem(index, {
            type,
            categoryId: category?.id ?? '',
            categoryName: category?.name ?? '',
            incomeSourceId: '',
            savingsGoalId: '',
            destinationRequired: false,
            instrumentName: '',
            instrumentRequired: type === 'investment',
          })
        }}>{['income', 'expense', 'investment', 'savings'].map((value) => <option value={value} key={value}>{titleCase(value)}</option>)}</select></label>
        <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={item.amountText} onChange={(event) => updateItem(index, { amountText: event.target.value, amount: event.target.value === '' ? Number.NaN : Number(event.target.value) })} /></label>
        <label>Category<select value={item.categoryId} onChange={(event) => {
          const category = activeCategories.find((candidate) => candidate.id === event.target.value)
          updateItem(index, {
            categoryId: event.target.value,
            categoryName: category?.name ?? '',
            ...(item.type === 'savings' && !item.savingsGoalName ? { destinationRequired: false } : {}),
          })
        }}><option value="">Choose a category</option>{activeCategories.filter((category) => category.type === item.type).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Description<input value={item.description} maxLength={180} onChange={(event) => updateItem(index, { description: event.target.value })} /></label>
        <label>Resolved date<input type="date" value={item.occurredOn} onChange={(event) => updateItem(index, { occurredOn: event.target.value })} /></label>
        {item.type === 'income' && <label>Income source<select value={item.incomeSourceId} onChange={(event) => {
          const source = incomeSources.find((entry) => entry.id === event.target.value)
          updateItem(index, { incomeSourceId: event.target.value, sourceName: source?.name ?? '' })
        }}><option value="">No linked source</option>{incomeSources.filter((source) => !source.archived_at && !source.deleted_at).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}
        {(item.type === 'income' || item.sourceName) && <label>Source details<input value={item.sourceName ?? ''} maxLength={120} onChange={(event) => updateItem(index, { sourceName: event.target.value })} /></label>}
        {(item.type === 'expense' || item.merchantName) && <label>Merchant<input value={item.merchantName ?? ''} maxLength={120} onChange={(event) => updateItem(index, { merchantName: event.target.value })} /></label>}
        {item.type === 'investment' && <label>Investment instrument<input value={item.instrumentName ?? ''} maxLength={120} placeholder="Enter an instrument; none was invented" onChange={(event) => {
          const instrumentName = event.target.value
          updateItem(index, { instrumentName, instrumentRequired: !instrumentName.trim() })
        }} /></label>}
        {item.type === 'savings' && <label>Savings goal<select value={item.savingsGoalId} onChange={(event) => updateItem(index, { savingsGoalId: event.target.value, destinationRequired: item.savingsGoalName ? !event.target.value : false })}><option value="">No linked goal</option>{goals.filter((goal) => !goal.archived_at && !goal.deleted_at).map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label>}
        {item.assumptions?.map((assumption, assumptionIndex) => <p className="ai-assumption" key={`${item.itemIndex}-assumption-${assumptionIndex}`} role="note">Assumption: {assumption}</p>)}
        {item.instrumentRequired && <p className="form-error">Enter the actual investment instrument before confirming.</p>}
        {item.destinationRequired && <p className="form-error">Select a valid savings destination before confirming.</p>}
      </fieldset>)}
      <div className="modal-actions"><button className="secondary" onClick={close}>Cancel batch</button><button className="primary" disabled={busy || !readyToConfirm} onClick={() => void confirmCreate()}>{busy ? 'Saving…' : submissionAttempted ? 'Retry save same batch' : `Confirm and save ${items.length} ${items.length === 1 ? 'transaction' : 'transactions'}`}</button></div>
    </div>}
    {proposal?.action === 'change' && <div className="proposal-preview"><p>Search matches are your own active transactions only. Select the row to change; compare both sides before confirming.</p>{matches.length === 0 ? <p role="status">No active transactions match “{proposal.searchText}”. Try another description or use manual entry.</p> : <label>Matching active transaction<select aria-label="Select a matching transaction" value={selectedId} onChange={(event) => { const next = matches.find((item) => item.id === event.target.value); const requestedCategory = next && changeDraft?.changes?.categoryName ? activeCategories.find((item) => item.type === next.type && item.name.toLocaleLowerCase() === changeDraft.changes?.categoryName?.toLocaleLowerCase()) : undefined; setSelectedId(event.target.value); setCategoryId(requestedCategory?.id ?? next?.category_id ?? '') }}><option value="">Select a transaction</option>{matches.map((item) => <option key={item.id} value={item.id}>{item.occurred_on} · {item.description} · {item.categories?.name ?? 'Uncategorized'} · {rupees(Number(item.amount))}</option>)}</select></label>}
      {selected && changeDraft?.intent === 'update' && <div className="side-by-side"><section><h3>Current record</h3><p>{selected.description}</p><p>{rupees(Number(selected.amount))} · {selected.categories?.name ?? 'Uncategorized'}</p><p>{selected.occurred_on}</p><p>{selected.merchant_name || 'No merchant'} · {selected.source_name || 'No source'}</p></section><section><h3>Proposed update</h3><label>Amount<input type="number" min="0.01" step="0.01" value={changeDraft.changes?.amount ?? Number(selected.amount)} onChange={(event) => setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, amount: Number(event.target.value) } })} /></label><label>Category<select value={categoryId || activeCategories.find((item) => item.id === selected.category_id)?.id || ''} onChange={(event) => { const next = activeCategories.find((item) => item.id === event.target.value); setCategoryId(event.target.value); if (next) setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, categoryName: next.name } }) }}>{activeCategories.filter((item) => item.type === selected.type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Description<input value={changeDraft.changes?.description ?? selected.description} maxLength={180} onChange={(event) => setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, description: event.target.value } })} /></label><label>Date<input type="date" value={changeDraft.changes?.occurredOn ?? selected.occurred_on} onChange={(event) => setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, occurredOn: event.target.value } })} /></label><label>Source<input value={changeDraft.changes?.sourceName ?? selected.source_name ?? ''} onChange={(event) => setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, sourceName: event.target.value } })} /></label><label>Merchant<input value={changeDraft.changes?.merchantName ?? selected.merchant_name ?? ''} onChange={(event) => setChangeDraft({ ...changeDraft, changes: { ...changeDraft.changes, merchantName: event.target.value } })} /></label></section></div>}
      {selected && changeDraft?.intent === 'delete' && <div className="side-by-side"><section><h3>Selected active record</h3><p>{selected.description}</p><p>{rupees(Number(selected.amount))} · {selected.occurred_on}</p></section><section><h3>Requested action</h3><p>This transaction will be moved to trash and can be restored later. No row will be permanently deleted.</p></section></div>}
      <div className="modal-actions"><button className="secondary" onClick={close}>Cancel request</button><button className="primary" disabled={busy || !selected} onClick={() => void confirmChange()}>{busy ? 'Saving…' : changeDraft?.intent === 'delete' ? 'Confirm soft delete' : 'Confirm update'}</button></div>
    </div>}
    {(proposal?.action === 'clarify' || proposal?.action === 'question') && <div className="proposal-preview"><p>{proposal.action === 'clarify' ? proposal.clarificationQuestion : proposal.question}</p><button className="secondary" onClick={close}>Close</button></div>}
    {aiError && <p className="form-error" role="alert">{aiError}</p>}
  </section></div>
}

export function Onboarding({ onComplete, onSignOut, error }: { onComplete: (data: OnboardingData) => Promise<void>; onSignOut: () => void; error: string }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    const form = new FormData(event.currentTarget)
    try {
      const budgetText = String(form.get('monthly_budget')).trim()
      const budgetValue = budgetText ? Number(budgetText) : null
      if (budgetValue !== null && (!Number.isFinite(budgetValue) || budgetValue < 0)) throw new Error('Budget must be a non-negative number.')
      const data: OnboardingData = {
        displayName: String(form.get('display_name')).trim(),
        enabledModules: defaultModules.filter((module) => form.get(`module-${module}`) === 'on'),
        dashboardPreferences: {
          cashFlow: form.get('pref-cashFlow') === 'on',
          categories: form.get('pref-categories') === 'on',
          savingsGoals: form.get('pref-savingsGoals') === 'on',
          investments: form.get('pref-investments') === 'on',
          netWorth: form.get('pref-netWorth') === 'on',
        },
        expenseCategories: csvNames(String(form.get('categories'))),
        incomeSources: csvNames(String(form.get('income_sources'))),
        monthlyBudget: budgetValue && budgetValue > 0 ? budgetValue : null,
        goals: parseNameAmounts(String(form.get('goals')), 'goal'),
        assets: parseNameAmounts(String(form.get('assets')), 'asset'),
        liabilities: parseLiabilities(String(form.get('liabilities'))),
      }
      setSaving(true)
      await onComplete(data)
    } catch (failure) {
      setFormError(errorText(failure))
    } finally {
      setSaving(false)
    }
  }
  return <main className="onboarding-wrap"><form className="onboarding-card glass" onSubmit={(event) => void submit(event)}><span className="eyebrow">FIRST SIGN-IN SETUP</span><h1>Make this workspace yours</h1><p>All setup choices are optional. Your profile and preferences are private to your invited account; you can adjust them later.</p>
    <label>Display name (optional)<input name="display_name" maxLength={100} autoComplete="name" /></label>
    <fieldset><legend>Enable modules</legend><div className="check-grid">{defaultModules.map((module) => <label className="checkbox-label" key={module}><input type="checkbox" name={`module-${module}`} defaultChecked />{titleCase(module)}</label>)}</div></fieldset>
    <fieldset><legend>Dashboard preferences</legend><div className="check-grid">{[
      ['cashFlow', 'Cash-flow chart'],
      ['categories', 'Expense categories'],
      ['savingsGoals', 'Savings goals'],
      ['investments', 'Investment summary'],
      ['netWorth', 'Estimated net worth'],
    ].map(([key, label]) => <label className="checkbox-label" key={key}><input type="checkbox" name={`pref-${key}`} defaultChecked />{label}</label>)}</div></fieldset>
    <label>Optional monthly overall budget (₹)<input name="monthly_budget" type="number" min="0" step="0.01" placeholder="Leave blank to skip" /></label>
    <label>Additional expense categories (comma separated)<input name="categories" placeholder="Pet care, Travel" /></label>
    <label>Income sources (comma separated)<input name="income_sources" placeholder="Salary, Freelance" /></label>
    <label>Savings goals, one per line: name | target amount<textarea name="goals" rows={3} placeholder={'Emergency fund | 100000\nHoliday | 50000'} /></label>
    <label>Assets, one per line: name | current value (₹)<textarea name="assets" rows={3} placeholder={'Bank savings | 25000\nGold | 40000'} /></label>
    <label>Liabilities, one per line: name | category | balance (₹)<textarea name="liabilities" rows={3} placeholder={'Education loan | Loan | 50000'} /></label>
    {(formError || error) && <p className="form-error" role="alert">{formError || error}</p>}
    <button className="primary full" disabled={saving}>{saving ? 'Preparing your workspace…' : 'Complete setup'}</button><button type="button" className="link-btn" onClick={onSignOut}>Sign out</button>
  </form></main>
}

export function LoginPage({ email, password, resetMode, error, onEmail, onPassword, onResetMode, onSubmit }: {
  email: string
  password: string
  resetMode: boolean
  error: string
  onEmail: (value: string) => void
  onPassword: (value: string) => void
  onResetMode: (value: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return <main className="login-wrap"><form className="login glass" onSubmit={onSubmit}><div className="brand-mark"><Wallet size={23} /></div><span className="eyebrow">PRIVATE FINANCE</span><h1>{resetMode ? 'Reset password' : 'Welcome back'}</h1><p>Sign in to your personal ledger. Accounts are invited by your administrator; public registration is disabled.</p><label>Email address<input type="email" value={email} onChange={(event) => onEmail(event.target.value)} required autoComplete="email" /></label>{!resetMode && <label>Password<input type="password" value={password} onChange={(event) => onPassword(event.target.value)} required autoComplete="current-password" /> </label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full">{resetMode ? 'Send reset link' : 'Sign in securely'}</button><button type="button" className="link-btn" onClick={() => onResetMode(!resetMode)}>{resetMode ? 'Back to sign in' : 'Forgot password?'}</button><div className="privacy-note"><ShieldCheck size={16} /> Your records are protected by database row-level security.</div></form></main>
}

export function SignOutButton({ onSignOut, disabled = false }: { onSignOut: () => void; disabled?: boolean }) {
  return <button aria-label="Logout" className="profile-logout" onClick={onSignOut} disabled={disabled}><LogOut size={15} /><span>{disabled ? 'Signing out…' : 'Logout'}</span></button>
}

function SetupPage() {
  return <main className="login-wrap"><section className="login glass"><div className="brand-mark"><Wallet size={23} /></div><span className="eyebrow">CONFIGURATION REQUIRED</span><h1>Connect your private database</h1><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>, then restart the development server. No demo financial data is shown.</p><a className="secondary setup-link" href="https://supabase.com/dashboard">Open Supabase dashboard</a></section></main>
}

function HelpPage() {
  return <section className="workspace-page panel"><PanelHeading title="Help & privacy" description="How this app treats your financial information." /><ul className="help-list"><li>Financial records are stored in your Supabase project and protected by row-level security.</li><li>The Supabase publishable key is intended for browser use; the database policies are the access boundary.</li><li>AI entry sends the text you submit to Cloudflare Workers AI for parsing. No record is written until you confirm the preview.</li><li>AI update/delete proposals search your signed-in active transactions; the model never supplies database IDs or SQL.</li><li>All entered values are manual estimates. There are no bank connections, live market prices, tax calculations, or automatic valuations.</li><li>Archived records are hidden from active views and can be restored; deleted transactions are moved to trash, not permanently removed.</li></ul></section>
}

function SummaryCard({ title, amount, icon, tone, note }: { title: string; amount: number | null; icon: ReactNode; tone: string; note: string }) {
  return <div className="summary-card panel"><div className="summary-top"><span>{title}</span><span className={`summary-icon ${tone}`}>{icon}</span></div><div className="summary-amount">{amount === null ? '—' : rupees(amount)}</div><div className="summary-note">{note}</div></div>
}
function PanelHeading({ title, description }: { title: string; description: string }) {
  return <div className="panel-header"><div><h2>{title}</h2><p>{description}</p></div></div>
}
function ProgressBar({ value }: { value: number }) {
  return <div className="progress-track" role="progressbar" aria-label="Budget progress" aria-valuenow={Math.max(0, Math.min(100, value))} aria-valuemin={0} aria-valuemax={100}><div className={`progress-fill ${value > 100 ? 'over' : ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}
function EmptyState({ message, onAdd, action = 'Add transaction' }: { message: string; onAdd: () => void; action?: string }) {
  return <div className="empty-transactions"><div className="empty-icon"><ChartNoAxesCombined size={22} /></div><b>No data to show</b><p>{message}</p><button className="text-action" onClick={onAdd}>{action} →</button></div>
}
function MenuIcon() {
  return <span aria-hidden="true">☰</span>
}
function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function latestValues<T extends { value: number | string; as_of_date: string; recorded_at: string }>(rows: T[], key: keyof T) {
  const latest = new Map<string, number>()
  for (const row of rows) {
    const id = String(row[key])
    if (!latest.has(id)) latest.set(id, Number(row.value))
  }
  return latest
}
async function fetchTransactions(): Promise<TransactionRow[]> {
  if (!supabase) return []
  const resultRows: TransactionRow[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const result = await supabase.from('transactions').select('id,type,amount,description,occurred_on,category_id,income_source_id,source_name,merchant_name,savings_goal_id,deleted_at,categories(name)').order('occurred_on', { ascending: false }).order('id').range(offset, offset + pageSize - 1)
    if (result.error) throw result.error
    const rows = (result.data ?? []).map((row) => ({ ...row, categories: categoryRelation(row.categories) })) as TransactionRow[]
    resultRows.push(...rows)
    if (rows.length < pageSize) break
  }
  return resultRows
}
function errorText(failure: unknown) {
  return failure instanceof Error ? failure.message : 'The request failed. Please try again.'
}
function csvNames(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}
function parseNameAmounts(value: string, label: 'goal'): Array<{ name: string; targetAmount: number }>
function parseNameAmounts(value: string, label: 'asset'): Array<{ name: string; currentValue: number }>
function parseNameAmounts(value: string, label: 'goal' | 'asset') {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const separator = line.lastIndexOf('|')
    if (separator < 1) throw new Error(`Each ${label} must use: name | amount.`)
    const name = line.slice(0, separator).trim()
    const amount = Number(line.slice(separator + 1).trim())
    if (!name || !Number.isFinite(amount) || amount < 0) throw new Error(`Each ${label} needs a name and non-negative amount.`)
    return label === 'goal' ? { name, targetAmount: amount } : { name, currentValue: amount }
  })
}
function parseLiabilities(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = '', category = '', balanceText = ''] = line.split('|').map((part) => part.trim())
    const balance = Number(balanceText)
    if (!name || !category || !Number.isFinite(balance) || balance < 0) throw new Error('Each liability must use: name | category | non-negative balance.')
    return { name, category, balance }
  })
}
function categoryRelation(value: unknown): { name: string } | null {
  const category = Array.isArray(value) ? value[0] : value
  return typeof category === 'object' && category !== null && 'name' in category && typeof category.name === 'string'
    ? { name: category.name }
    : null
}
