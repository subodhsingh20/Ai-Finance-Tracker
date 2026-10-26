import { useMemo, useState, type FormEvent } from 'react'
import { goalProgress, rupees, type FinanceTransaction } from '../lib/finance'

export type TransactionType = FinanceTransaction['type']
export type CategoryRow = { id: string; type: TransactionType; name: string; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }
export type TransactionRow = {
  id: string
  type: TransactionType
  amount: number | string
  description: string
  occurred_on: string
  category_id: string
  income_source_id: string | null
  source_name: string | null
  merchant_name: string | null
  savings_goal_id: string | null
  deleted_at: string | null
  categories?: { name: string } | null
}
export type BudgetRow = { id: string; category_id: string | null; month_start: string; limit_amount: number | string; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null; categories?: { name: string } | null }
export type GoalRow = { id: string; name: string; target_amount: number | string; target_date: string | null; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }
export type AssetRow = { id: string; name: string; category: string; current_value: number | string; as_of_date: string; description: string | null; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }
export type HoldingRow = { id: string; name: string; instrument_type: string; symbol: string | null; quantity: number | string | null; current_value: number | string; as_of_date: string; notes: string | null; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }
export type LiabilityRow = { id: string; name: string; category: string; outstanding_balance: number | string; as_of_date: string; due_date: string | null; notes: string | null; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }
export type IncomeSourceRow = { id: string; name: string; archived_at: string | null; deleted_at?: string | null; trashed_from_archived_at?: string | null }

export type TransactionDraft = {
  type: TransactionType
  amount: number
  category_id: string
  income_source_id: string | null
  description: string
  occurred_on: string
  source_name: string | null
  merchant_name: string | null
  savings_goal_id: string | null
  instrument_name?: string | null
}
export type BudgetDraft = { category_id: string | null; month_start: string; limit_amount: number }
export type GoalDraft = { name: string; target_amount: number; target_date: string | null }
export type AssetDraft = { name: string; category: string; current_value: number; as_of_date: string; description: string | null }
export type HoldingDraft = { name: string; instrument_type: string; symbol: string | null; quantity: number | null; current_value: number; as_of_date: string; notes: string | null }
export type LiabilityDraft = { name: string; category: string; outstanding_balance: number; as_of_date: string; due_date: string | null; notes: string | null }

export type FinancePagesProps = {
  page: string
  transactions: TransactionRow[]
  categories: CategoryRow[]
  budgets: BudgetRow[]
  goals: GoalRow[]
  assets: AssetRow[]
  holdings: HoldingRow[]
  liabilities: LiabilityRow[]
  incomeSources: IncomeSourceRow[]
  assetValues: Map<string, number>
  holdingValues: Map<string, number>
  onOpenTransaction: (draft?: Partial<TransactionDraft>, transaction?: TransactionRow) => void
  onSaveTransaction: (draft: TransactionDraft, id?: string) => Promise<void>
  onSetDeleted: (id: string, deleted: boolean) => Promise<void>
  onSaveCategory: (draft: { type: TransactionType; name: string }, id?: string) => Promise<void>
  onArchiveCategory: (id: string, archived: boolean) => Promise<void>
  onSaveSource: (name: string, id?: string) => Promise<void>
  onArchiveSource: (id: string, archived: boolean) => Promise<void>
  onSaveBudget: (draft: BudgetDraft, id?: string) => Promise<void>
  onArchiveBudget: (id: string, archived: boolean) => Promise<void>
  onSaveGoal: (draft: GoalDraft, id?: string) => Promise<void>
  onArchiveGoal: (id: string, archived: boolean) => Promise<void>
  onSaveAsset: (draft: AssetDraft, id?: string) => Promise<void>
  onArchiveAsset: (id: string, archived: boolean) => Promise<void>
  onSaveHolding: (draft: HoldingDraft, id?: string) => Promise<void>
  onArchiveHolding: (id: string, archived: boolean) => Promise<void>
  onSaveLiability: (draft: LiabilityDraft, id?: string) => Promise<void>
  onArchiveLiability: (id: string, archived: boolean) => Promise<void>
  onSaveProfile: (displayName: string, enabledModules: string[], dashboardPreferences: Record<string, boolean>) => Promise<void>
  profile: { display_name: string | null; enabled_modules: string[]; dashboard_preferences: Record<string, boolean> }
}

export function FinancePages(props: FinancePagesProps) {
  switch (props.page) {
    case 'Transactions': return <TransactionsPage {...props} />
    case 'Budgets': return <BudgetsPage {...props} />
    case 'Savings': return <GoalsPage {...props} />
    case 'Investments': return <InvestmentsPage {...props} />
    case 'Assets & debts': return <AssetsPage {...props} />
    case 'Categories & sources': return <CategoriesPage {...props} />
    case 'Settings': return <SettingsPage {...props} />
    default: return null
  }
}

function TransactionsPage({ transactions, categories, goals, onOpenTransaction, onSetDeleted }: FinancePagesProps) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [trash, setTrash] = useState(false)
  const activeCategories = categories.filter((category) => !category.archived_at && !category.deleted_at)
  const filtered = useMemo(() => transactions.filter((row) => {
    const deleted = Boolean(row.deleted_at)
    const searchable = [row.description, row.source_name, row.merchant_name, row.categories?.name]
      .some((value) => value?.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    return deleted === trash
      && searchable
      && (!type || row.type === type)
      && (!categoryId || row.category_id === categoryId)
      && (!from || row.occurred_on >= from)
      && (!to || row.occurred_on <= to)
      && (!min || Number(row.amount) >= Number(min))
      && (!max || Number(row.amount) <= Number(max))
  }), [transactions, search, type, categoryId, from, to, min, max, trash])

  function exportRows(format: 'csv' | 'json') {
    const rows = filtered.map((row) => ({
      date: row.occurred_on,
      type: row.type,
      amount: Number(row.amount),
      category: row.categories?.name ?? 'Uncategorized',
      description: row.description,
      source: row.source_name ?? '',
      merchant: row.merchant_name ?? '',
      deletedAt: row.deleted_at,
    }))
    const content = format === 'json'
      ? JSON.stringify(rows, null, 2)
      : [
        'date,type,amount,category,description,source,merchant,deletedAt',
        ...rows.map((row) => Object.values(row).map(csvCell).join(',')),
      ].join('\r\n')
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ledger-transactions-${new Date().toISOString().slice(0, 10)}.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="workspace-page panel" aria-labelledby="transactions-title">
    <PageHeading id="transactions-title" title="Transactions" description="Search, filter, export, update, and restore your own entries." />
    <div className="filter-grid">
      <label>Search<input aria-label="Search transactions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Description, merchant, source" /></label>
      <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{transactionTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
      <label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>Minimum amount<input type="number" min="0" step="0.01" value={min} onChange={(event) => setMin(event.target.value)} /></label>
      <label>Maximum amount<input type="number" min="0" step="0.01" value={max} onChange={(event) => setMax(event.target.value)} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={trash} onChange={(event) => setTrash(event.target.checked)} /> Show trash</label>
    </div>
    <div className="table-actions"><span>{filtered.length} matching {trash ? 'deleted' : 'active'} entries</span><div><button className="secondary" onClick={() => exportRows('csv')}>Export filtered CSV</button><button className="secondary" onClick={() => exportRows('json')}>Export filtered JSON</button><button className="primary" onClick={() => onOpenTransaction()}>Add transaction</button></div></div>
    <div className="table-scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Category</th><th>Amount</th><th>Actions</th></tr></thead><tbody>
      {filtered.map((row) => <tr key={row.id}><td>{row.occurred_on}</td><td>{titleCase(row.type)}</td><td>{row.description}</td><td>{row.categories?.name ?? 'Uncategorized'}</td><td>{rupees(Number(row.amount))}</td><td className="row-actions">{trash
        ? <button className="secondary" onClick={() => runHandledAction(onSetDeleted(row.id, false))}>Restore</button>
        : <><button className="secondary" onClick={() => onOpenTransaction(undefined, row)}>Edit</button><button className="secondary danger-button" onClick={() => runHandledAction(onSetDeleted(row.id, true))}>Move to trash</button></>}</td></tr>)}
      {filtered.length === 0 && <tr><td colSpan={6} className="empty-cell">No matching transactions.</td></tr>}
    </tbody></table></div>
    <p className="muted-note">Deleted transactions are soft-deleted and can be restored. Permanent deletion is not available in this app.</p>
    {goals.length > 0 && <span className="sr-only">Savings goals available: {goals.length}</span>}
  </section>
}

function CategoriesPage({ categories, incomeSources, onSaveCategory, onArchiveCategory, onSaveSource, onArchiveSource }: FinancePagesProps) {
  const [categoryId, setCategoryId] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const category = categories.find((item) => item.id === categoryId)
  const source = incomeSources.find((item) => item.id === sourceId)
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveCategory({ type: form.get('type') as TransactionType, name: String(form.get('name')).trim() }, categoryId || undefined)
      setCategoryId('')
      target.reset()
    } catch { return }
  }
  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveSource(String(form.get('name')).trim(), sourceId || undefined)
      setSourceId('')
      target.reset()
    } catch { return }
  }
  return <div className="split-page">
    <section className="workspace-page panel"><PageHeading id="categories-title" title="Categories" description="Edit or archive the categories used by your transactions." />
      <form className="inline-form" onSubmit={(event) => void saveCategory(event)}><label>Type<select name="type" defaultValue={category?.type ?? 'expense'} key={category?.id ?? 'new-category-type'}>{transactionTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label>Name<input name="name" required minLength={1} maxLength={80} defaultValue={category?.name ?? ''} key={category?.id ?? 'new-category-name'} /></label><button className="primary">{category ? 'Save category' : 'Add category'}</button>{category && <button type="button" className="secondary" onClick={() => setCategoryId('')}>Cancel edit</button>}</form>
      <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
        <div className="entity-list">{categories.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.name}</b><span>{titleCase(item.type)}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setCategoryId(item.id)}>Edit</button><button className="secondary" onClick={() => runHandledAction(onArchiveCategory(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
    </section>
    <section className="workspace-page panel"><PageHeading id="sources-title" title="Income sources" description="Keep salary, freelance, and other income sources organized." />
      <form className="inline-form" onSubmit={(event) => void saveSource(event)}><label>Name<input name="name" required minLength={1} maxLength={120} defaultValue={source?.name ?? ''} key={source?.id ?? 'new-income-source'} /></label><button className="primary">{source ? 'Save source' : 'Add source'}</button>{source && <button type="button" className="secondary" onClick={() => setSourceId('')}>Cancel edit</button>}</form>
      <div className="entity-list">{incomeSources.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.name}</b><span>{item.archived_at ? 'Archived' : 'Active'}</span></div><div className="row-actions"><button className="secondary" onClick={() => setSourceId(item.id)}>Edit</button><button className="secondary" onClick={() => runHandledAction(onArchiveSource(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
    </section>
  </div>
}

function BudgetsPage({ budgets, categories, onSaveBudget, onArchiveBudget }: FinancePagesProps) {
  const [budgetId, setBudgetId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const budget = budgets.find((item) => item.id === budgetId)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveBudget({
        category_id: String(form.get('category_id')) || null,
        month_start: `${String(form.get('month'))}-01`,
        limit_amount: Number(form.get('amount')),
      }, budgetId || undefined)
      setBudgetId('')
      target.reset()
    } catch { return }
  }
  return <section className="workspace-page panel"><PageHeading id="budgets-title" title="Budgets" description="Create overall or category-specific monthly spending limits." />
    <form className="inline-form" onSubmit={(event) => void save(event)}><label>Month<input name="month" type="month" required defaultValue={budget?.month_start.slice(0, 7) ?? currentMonth()} key={budget?.id ?? 'new-budget-month'} /></label><label>Category<select name="category_id" defaultValue={budget?.category_id ?? ''} key={budget?.id ?? 'new-budget-category'}><option value="">Overall budget</option>{categories.filter((item) => item.type === 'expense' && !item.archived_at && !item.deleted_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Monthly limit (₹)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={budget ? Number(budget.limit_amount) : ''} key={budget?.id ?? 'new-budget-amount'} /></label><button className="primary">{budget ? 'Save budget' : 'Add budget'}</button>{budget && <button type="button" className="secondary" onClick={() => setBudgetId('')}>Cancel edit</button>}</form>
    <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
    <div className="entity-list">{budgets.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.categories?.name ?? 'Overall budget'}</b><span>{item.month_start.slice(0, 7)} · {rupees(Number(item.limit_amount))}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setBudgetId(item.id)}>Edit</button><button className="secondary" onClick={() => runHandledAction(onArchiveBudget(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
  </section>
}

function GoalsPage({ goals, transactions, categories, onSaveGoal, onArchiveGoal, onOpenTransaction }: FinancePagesProps) {
  const [goalId, setGoalId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const goal = goals.find((item) => item.id === goalId)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveGoal({ name: String(form.get('name')).trim(), target_amount: Number(form.get('target')), target_date: String(form.get('target_date')) || null }, goalId || undefined)
      setGoalId('')
      target.reset()
    } catch { return }
  }
  return <section className="workspace-page panel"><PageHeading id="goals-title" title="Savings goals" description="Track goals and link each contribution to a specific goal." />
    <form className="inline-form" onSubmit={(event) => void save(event)}><label>Goal name<input name="name" required maxLength={120} defaultValue={goal?.name ?? ''} key={goal?.id ?? 'new-goal-name'} /></label><label>Target (₹)<input name="target" type="number" min="0" step="0.01" required defaultValue={goal ? Number(goal.target_amount) : ''} key={goal?.id ?? 'new-goal-target'} /></label><label>Target date<input name="target_date" type="date" defaultValue={goal?.target_date ?? ''} key={goal?.id ?? 'new-goal-date'} /></label><button className="primary">{goal ? 'Save goal' : 'Add goal'}</button>{goal && <button type="button" className="secondary" onClick={() => setGoalId('')}>Cancel edit</button>}</form>
    <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
    <div className="goal-list">{goals.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => {
      const contributions = transactions.filter((transaction) => !transaction.deleted_at && transaction.type === 'savings' && transaction.savings_goal_id === item.id).reduce((sum, transaction) => sum + Number(transaction.amount), 0)
      const progress = goalProgress(contributions, Number(item.target_amount))
      return <article className="goal-card panel" key={item.id}><div className="entity-row"><div><b>{item.name}</b><span>{item.target_date ? `Target ${item.target_date}` : 'No target date'}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setGoalId(item.id)}>Edit</button><button className="secondary" onClick={() => runHandledAction(onArchiveGoal(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div><p>{rupees(contributions)} of {rupees(Number(item.target_amount))}</p><Progress value={progress.percent ?? 0} /><div className="budget-foot"><span>{progress.outstanding === 0 ? 'Target reached' : `${rupees(progress.outstanding)} remaining`}</span><span>{Math.round(progress.percent ?? 0)}%</span></div><button className="primary" disabled={Boolean(item.archived_at) || !categories.some((category) => category.type === 'savings' && !category.archived_at && !category.deleted_at)} onClick={() => onOpenTransaction({ type: 'savings', savings_goal_id: item.id })}>Add contribution</button></article>
    })}</div>
  </section>
}

function InvestmentsPage({ holdings, transactions, holdingValues, onSaveHolding, onArchiveHolding }: FinancePagesProps) {
  const [holdingId, setHoldingId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const holding = holdings.find((item) => item.id === holdingId)
  const contributions = transactions.filter((item) => !item.deleted_at && item.type === 'investment').reduce((sum, item) => sum + Number(item.amount), 0)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveHolding({
        name: String(form.get('name')).trim(),
        instrument_type: String(form.get('instrument_type')).trim(),
        symbol: String(form.get('symbol')).trim() || null,
        quantity: String(form.get('quantity')) ? Number(form.get('quantity')) : null,
        current_value: Number(form.get('current_value')),
        as_of_date: String(form.get('as_of_date')),
        notes: String(form.get('notes')).trim() || null,
      }, holdingId || undefined)
      setHoldingId('')
      target.reset()
    } catch { return }
  }
  return <section className="workspace-page panel"><PageHeading id="investments-title" title="Investments" description="Record contributions separately from current holding valuations." />
    <div className="summary-grid compact-grid"><SummaryTile label="Investment contributions" value={rupees(contributions)} /><SummaryTile label="Current holdings" value={rupees([...holdings].filter((item) => !item.archived_at).reduce((sum, item) => sum + (holdingValues.get(item.id) ?? 0), 0))} /></div>
    <form className="inline-form" onSubmit={(event) => void save(event)}><label>Name<input name="name" required maxLength={120} defaultValue={holding?.name ?? ''} key={holding?.id ?? 'new-holding-name'} /></label><label>Instrument type<input name="instrument_type" required maxLength={80} defaultValue={holding?.instrument_type ?? ''} key={holding?.id ?? 'new-holding-type'} /></label><label>Symbol<input name="symbol" maxLength={40} defaultValue={holding?.symbol ?? ''} key={holding?.id ?? 'new-holding-symbol'} /></label><label>Quantity<input name="quantity" type="number" min="0" step="0.000001" defaultValue={holding?.quantity ?? ''} key={holding?.id ?? 'new-holding-quantity'} /></label><label>Value (₹)<input name="current_value" type="number" min="0" step="0.01" required defaultValue={holding ? Number(holding.current_value) : ''} key={holding?.id ?? 'new-holding-value'} /></label><label>Valued on<input name="as_of_date" type="date" required defaultValue={holding?.as_of_date ?? today()} key={holding?.id ?? 'new-holding-date'} /></label><label>Notes<input name="notes" maxLength={1000} defaultValue={holding?.notes ?? ''} key={holding?.id ?? 'new-holding-notes'} /></label><button className="primary">{holding ? 'Save holding' : 'Add holding'}</button>{holding && <button type="button" className="secondary" onClick={() => setHoldingId('')}>Cancel edit</button>}</form>
    <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
    <div className="entity-list">{holdings.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.name} {item.symbol && <span>({item.symbol})</span>}</b><span>{item.instrument_type} · Latest recorded valuation {rupees(holdingValues.get(item.id) ?? 0)} as of {item.as_of_date}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setHoldingId(item.id)}>Update valuation</button><button className="secondary" onClick={() => runHandledAction(onArchiveHolding(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
  </section>
}

function AssetsPage({ assets, liabilities, assetValues, onSaveAsset, onArchiveAsset, onSaveLiability, onArchiveLiability }: FinancePagesProps) {
  const [assetId, setAssetId] = useState('')
  const [liabilityId, setLiabilityId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const asset = assets.find((item) => item.id === assetId)
  const liability = liabilities.find((item) => item.id === liabilityId)
  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveAsset({ name: String(form.get('name')).trim(), category: String(form.get('category')), current_value: Number(form.get('value')), as_of_date: String(form.get('date')), description: String(form.get('description')).trim() || null }, assetId || undefined)
      setAssetId('')
      target.reset()
    } catch { return }
  }
  async function saveLiability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)
    try {
      await onSaveLiability({ name: String(form.get('name')).trim(), category: String(form.get('category')).trim(), outstanding_balance: Number(form.get('balance')), as_of_date: String(form.get('date')), due_date: String(form.get('due_date')) || null, notes: String(form.get('notes')).trim() || null }, liabilityId || undefined)
      setLiabilityId('')
      target.reset()
    } catch { return }
  }
  return <div className="split-page">
    <section className="workspace-page panel"><PageHeading id="assets-title" title="Assets" description="Record assets and date-stamped valuation snapshots." />
      <form className="entity-form" onSubmit={(event) => void saveAsset(event)}><label>Name<input name="name" required maxLength={120} defaultValue={asset?.name ?? ''} key={asset?.id ?? 'new-asset-name'} /></label><label>Category<select name="category" defaultValue={asset?.category ?? 'bank_cash'} key={asset?.id ?? 'new-asset-category'}>{assetCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Current value (₹)<input name="value" type="number" min="0" step="0.01" required defaultValue={asset ? Number(asset.current_value) : ''} key={asset?.id ?? 'new-asset-value'} /></label><label>Valued on<input name="date" type="date" required defaultValue={asset?.as_of_date ?? today()} key={asset?.id ?? 'new-asset-date'} /></label><label>Description<input name="description" maxLength={1000} defaultValue={asset?.description ?? ''} key={asset?.id ?? 'new-asset-description'} /></label><div className="row-actions"><button className="primary">{asset ? 'Save valuation' : 'Add asset'}</button>{asset && <button type="button" className="secondary" onClick={() => setAssetId('')}>Cancel</button>}</div></form>
      <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
      <div className="entity-list">{assets.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.name}</b><span>{assetCategoryName(item.category)} · {rupees(assetValues.get(item.id) ?? 0)} as of {item.as_of_date}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setAssetId(item.id)}>Update valuation</button><button className="secondary" onClick={() => runHandledAction(onArchiveAsset(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
    </section>
    <section className="workspace-page panel"><PageHeading id="liabilities-title" title="Liabilities" description="Maintain manually entered outstanding balances and dates." />
      <form className="entity-form" onSubmit={(event) => void saveLiability(event)}><label>Name<input name="name" required maxLength={120} defaultValue={liability?.name ?? ''} key={liability?.id ?? 'new-liability-name'} /></label><label>Category<input name="category" required maxLength={80} defaultValue={liability?.category ?? ''} key={liability?.id ?? 'new-liability-category'} /></label><label>Outstanding balance (₹)<input name="balance" type="number" min="0" step="0.01" required defaultValue={liability ? Number(liability.outstanding_balance) : ''} key={liability?.id ?? 'new-liability-balance'} /></label><label>As of<input name="date" type="date" required defaultValue={liability?.as_of_date ?? today()} key={liability?.id ?? 'new-liability-date'} /></label><label>Due date<input name="due_date" type="date" defaultValue={liability?.due_date ?? ''} key={liability?.id ?? 'new-liability-due'} /></label><label>Notes<input name="notes" maxLength={1000} defaultValue={liability?.notes ?? ''} key={liability?.id ?? 'new-liability-notes'} /></label><div className="row-actions"><button className="primary">{liability ? 'Save liability' : 'Add liability'}</button>{liability && <button type="button" className="secondary" onClick={() => setLiabilityId('')}>Cancel</button>}</div></form>
      <ArchiveToggle checked={showArchived} onChange={setShowArchived} />
      <div className="entity-list">{liabilities.filter((item) => !item.deleted_at && (showArchived || !item.archived_at)).map((item) => <div className="entity-row" key={item.id}><div><b>{item.name}</b><span>{item.category} · {rupees(Number(item.outstanding_balance))} as of {item.as_of_date}{item.archived_at ? ' · archived' : ''}</span></div><div className="row-actions"><button className="secondary" onClick={() => setLiabilityId(item.id)}>Edit</button><button className="secondary" onClick={() => runHandledAction(onArchiveLiability(item.id, !item.archived_at))}>{item.archived_at ? 'Restore' : 'Archive'}</button></div></div>)}</div>
    </section>
  </div>
}

function SettingsPage({ profile, onSaveProfile }: FinancePagesProps) {
  const [saving, setSaving] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await onSaveProfile(String(form.get('display_name')).trim(), moduleNames.filter((module) => form.get(`module-${module}`) === 'on'), {
        cashFlow: form.get('pref-cashFlow') === 'on',
        categories: form.get('pref-categories') === 'on',
        savingsGoals: form.get('pref-savingsGoals') === 'on',
        investments: form.get('pref-investments') === 'on',
        netWorth: form.get('pref-netWorth') === 'on',
      })
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }
  return <section className="workspace-page panel"><PageHeading id="settings-title" title="Settings" description="Choose enabled sections and the dashboard cards shown in your workspace." />
    <form className="settings-form" onSubmit={(event) => void save(event)}><label>Display name<input name="display_name" maxLength={100} defaultValue={profile.display_name ?? ''} /></label><fieldset><legend>Enabled modules</legend>{moduleNames.map((module) => <label className="checkbox-label" key={module}><input type="checkbox" name={`module-${module}`} defaultChecked={profile.enabled_modules.includes(module)} />{titleCase(module)}</label>)}</fieldset><fieldset><legend>Dashboard cards</legend>{dashboardCards.map(([key, label]) => <label className="checkbox-label" key={key}><input type="checkbox" name={`pref-${key}`} defaultChecked={profile.dashboard_preferences[key] !== false} />{label}</label>)}</fieldset><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save preferences'}</button></form>
  </section>
}

export function TransactionDialog({ categories, goals, incomeSources, transaction, initial, onClose, onSave }: {
  categories: CategoryRow[]
  goals: GoalRow[]
  incomeSources: IncomeSourceRow[]
  transaction?: TransactionRow
  initial?: Partial<TransactionDraft>
  onClose: () => void
  onSave: (draft: TransactionDraft, id?: string) => Promise<void>
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initial?.type ?? 'expense')
  const validCategories = categories.filter((item) => item.type === type && !item.archived_at && !item.deleted_at)
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? initial?.category_id ?? '')
  const [incomeSourceId, setIncomeSourceId] = useState(transaction?.income_source_id ?? '')
  const [saving, setSaving] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selectedCategory = validCategories.find((item) => item.id === categoryId) ?? validCategories[0]
    if (!selectedCategory) return
    setSaving(true)
    try {
      await onSave({
        type,
        amount: Number(form.get('amount')),
        category_id: selectedCategory.id,
        income_source_id: type === 'income' ? incomeSourceId || null : null,
        description: String(form.get('description')).trim(),
        occurred_on: String(form.get('occurred_on')),
        source_name: String(form.get('source_name')).trim() || null,
        merchant_name: String(form.get('merchant_name')).trim() || null,
        savings_goal_id: String(form.get('savings_goal_id')) || null,
      }, transaction?.id)
      onClose()
    } catch {
      return
    } finally {
      setSaving(false)
    }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal glass" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title"><div className="modal-head"><div><span className="eyebrow">MANUAL ENTRY</span><h2 id="transaction-dialog-title">{transaction ? 'Edit transaction' : 'Add a transaction'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div>
    <form className="transaction-form" onSubmit={(event) => void save(event)}><label>Type<select value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId(''); if (event.target.value !== 'income') setIncomeSourceId('') }}>{transactionTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={transaction ? Number(transaction.amount) : ''} /></label><label>Category<select required value={categoryId || validCategories[0]?.id || ''} onChange={(event) => setCategoryId(event.target.value)}>{validCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Description<input name="description" required maxLength={180} defaultValue={transaction?.description ?? ''} /></label><label>Date<input name="occurred_on" type="date" required defaultValue={transaction?.occurred_on ?? initial?.occurred_on ?? today()} /></label>{type === 'income' && <label>Income source<select value={incomeSourceId} onChange={(event) => setIncomeSourceId(event.target.value)}><option value="">No linked source</option>{incomeSources.filter((source) => !source.archived_at && !source.deleted_at).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>}<label>Source details<input name="source_name" maxLength={120} defaultValue={transaction?.source_name ?? ''} /></label><label>Merchant<input name="merchant_name" maxLength={120} defaultValue={transaction?.merchant_name ?? ''} /></label>{type === 'savings' && <label>Savings goal<select name="savings_goal_id" defaultValue={transaction?.savings_goal_id ?? initial?.savings_goal_id ?? ''}><option value="">No linked goal</option>{goals.filter((goal) => !goal.archived_at && !goal.deleted_at).map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || validCategories.length === 0}>{saving ? 'Saving…' : transaction ? 'Save changes' : 'Save transaction'}</button></div>{validCategories.length === 0 && <p className="form-error">Add an active {type} category before recording this transaction.</p>}</form>
  </section></div>
}

function PageHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return <div className="panel-header"><div><h2 id={id}>{title}</h2><p>{description}</p></div></div>
}
function ArchiveToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="checkbox-label archive-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />Show archived records</label>
}
function Progress({ value }: { value: number }) {
  return <div className="progress-track" role="progressbar" aria-label="Progress" aria-valuenow={Math.min(100, Math.max(0, value))} aria-valuemin={0} aria-valuemax={100}><div className={`progress-fill ${value > 100 ? 'over' : ''}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}
function SummaryTile({ label, value }: { label: string; value: string }) {
  return <div className="summary-card panel"><span>{label}</span><b className="summary-amount">{value}</b></div>
}
function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}
function titleCase(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function runHandledAction(action: Promise<void>) {
  void action.catch(() => undefined)
}
function currentMonth() {
  return today().slice(0, 7)
}
function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}
function assetCategoryName(value: string) {
  return assetCategories.find(([key]) => key === value)?.[1] ?? value
}
const transactionTypes: TransactionType[] = ['income', 'expense', 'investment', 'savings']
const assetCategories = [
  ['bank_cash', 'Bank & cash'],
  ['real_estate', 'Real estate'],
  ['vehicle', 'Vehicle'],
  ['gold_jewellery', 'Gold & jewellery'],
  ['other_valuables', 'Other valuables'],
]
const moduleNames = ['overview', 'transactions', 'budgets', 'savings', 'investments', 'assets', 'categories']
const dashboardCards: Array<[string, string]> = [
  ['cashFlow', 'Cash-flow chart'],
  ['categories', 'Expense categories'],
  ['savingsGoals', 'Savings-goal progress'],
  ['investments', 'Investment contributions and holdings'],
  ['netWorth', 'Estimated net worth'],
]
