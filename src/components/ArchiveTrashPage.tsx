import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, RotateCcw, Search, ShieldAlert, Trash2 } from 'lucide-react'
import { rupees } from '../lib/finance'
import type {
  AssetRow,
  BudgetRow,
  CategoryRow,
  GoalRow,
  HoldingRow,
  IncomeSourceRow,
  LiabilityRow,
  TransactionRow,
} from './FinancePages'

export type ArchiveTrashTable =
  | 'transactions'
  | 'categories'
  | 'income_sources'
  | 'savings_goals'
  | 'budgets'
  | 'assets'
  | 'investment_holdings'
  | 'liabilities'

export type ArchiveTrashRecord = {
  id: string
  table: ArchiveTrashTable
  type: string
  name: string
  detail?: string
  amount?: number
  archivedAt: string | null
  deletedAt: string | null
  trashedFromArchivedAt?: string | null
}

type Props = {
  transactions: TransactionRow[]
  categories: CategoryRow[]
  budgets: BudgetRow[]
  goals: GoalRow[]
  assets: AssetRow[]
  holdings: HoldingRow[]
  liabilities: LiabilityRow[]
  incomeSources: IncomeSourceRow[]
  loading?: boolean
  error?: string
  onRestoreArchived: (record: ArchiveTrashRecord) => Promise<void>
  onMoveToTrash: (record: ArchiveTrashRecord) => Promise<void>
  onRestoreTrashed: (record: ArchiveTrashRecord) => Promise<void>
  onPermanentlyDelete: (record: ArchiveTrashRecord) => Promise<void>
  onEmptyTrash: () => Promise<number>
}

type Confirmation = { kind: 'delete'; record: ArchiveTrashRecord } | { kind: 'empty' }
type Tab = 'archived' | 'trash'

export function ArchiveTrashPage({
  transactions,
  categories,
  budgets,
  goals,
  assets,
  holdings,
  liabilities,
  incomeSources,
  loading = false,
  error = '',
  onRestoreArchived,
  onMoveToTrash,
  onRestoreTrashed,
  onPermanentlyDelete,
  onEmptyTrash,
}: Props) {
  const [tab, setTab] = useState<Tab>('archived')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [actionError, setActionError] = useState('')
  const [status, setStatus] = useState('')

  const records = useMemo(() => {
    const rows: ArchiveTrashRecord[] = []
    const add = (record: ArchiveTrashRecord) => rows.push(record)
    for (const row of transactions) {
      add({
        id: row.id,
        table: 'transactions',
        type: 'Transaction',
        name: row.description,
        detail: `${row.type} · ${row.categories?.name ?? 'Uncategorized'} · ${row.occurred_on}`,
        amount: Number(row.amount),
        archivedAt: null,
        deletedAt: row.deleted_at,
      })
    }
    for (const row of categories) add({
      id: row.id, table: 'categories', type: 'Category', name: row.name,
      detail: row.type, archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of incomeSources) add({
      id: row.id, table: 'income_sources', type: 'Income source', name: row.name,
      archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of goals) add({
      id: row.id, table: 'savings_goals', type: 'Savings goal', name: row.name,
      detail: row.target_date ? `Target ${row.target_date}` : 'Savings target',
      amount: Number(row.target_amount), archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of budgets) add({
      id: row.id, table: 'budgets', type: 'Budget',
      name: row.categories?.name ?? 'Overall budget',
      detail: row.month_start.slice(0, 7), amount: Number(row.limit_amount),
      archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of assets) add({
      id: row.id, table: 'assets', type: 'Asset', name: row.name,
      detail: row.as_of_date, amount: Number(row.current_value),
      archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of holdings) add({
      id: row.id, table: 'investment_holdings', type: 'Investment holding', name: row.name,
      detail: [row.instrument_type, row.symbol, row.as_of_date].filter(Boolean).join(' · '),
      amount: Number(row.current_value), archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    for (const row of liabilities) add({
      id: row.id, table: 'liabilities', type: 'Liability', name: row.name,
      detail: `${row.category} · ${row.as_of_date}`,
      amount: Number(row.outstanding_balance), archivedAt: row.archived_at, deletedAt: row.deleted_at ?? null,
      trashedFromArchivedAt: row.trashed_from_archived_at ?? null,
    })
    return rows
  }, [transactions, categories, incomeSources, goals, budgets, assets, holdings, liabilities])

  const archivedRecords = records.filter((record) => record.archivedAt !== null && record.deletedAt === null)
  const trashedRecords = records.filter((record) => record.deletedAt !== null)
  const source = tab === 'archived' ? archivedRecords : trashedRecords
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filtered = source.filter((record) => (
    (!typeFilter || record.table === typeFilter)
    && (!normalizedSearch || `${record.type} ${record.name} ${record.detail ?? ''}`.toLocaleLowerCase().includes(normalizedSearch))
  ))
  const typeOptions = [...new Map(source.map((record) => [record.table, record.type])).entries()]

  async function runAction(key: string, action: () => Promise<void>, successMessage: string) {
    if (busyKey) return
    setBusyKey(key)
    setActionError('')
    setStatus('')
    try {
      await action()
      setStatus(successMessage)
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'The action failed. Please try again.')
    } finally {
      setBusyKey('')
    }
  }

  async function confirmIrreversibleAction() {
    if (!confirmation || busyKey) return
    const current = confirmation
    const key = current.kind === 'empty' ? 'empty-trash' : `delete-${current.record.table}-${current.record.id}`
    setBusyKey(key)
    setActionError('')
    setStatus('')
    try {
      if (current.kind === 'empty') {
        const count = await onEmptyTrash()
        setStatus(`Trash emptied. ${count} ${count === 1 ? 'record was' : 'records were'} permanently deleted.`)
      } else {
        await onPermanentlyDelete(current.record)
        setStatus(`${current.record.type} permanently deleted.`)
      }
      setConfirmation(null)
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : 'The action failed. Please try again.')
    } finally {
      setBusyKey('')
    }
  }

  return <section className="workspace-page panel archive-trash-page" aria-labelledby="archive-trash-title">
    <div className="panel-header archive-trash-heading">
      <div><h2 id="archive-trash-title">Archive &amp; Trash</h2><p>Restore records or permanently remove items you no longer need.</p></div>
      {tab === 'trash' && <button className="danger-button" disabled={busyKey !== '' || trashedRecords.length === 0} onClick={() => { setConfirmation({ kind: 'empty' }); setActionError(''); setStatus('') }}><Trash2 size={15} /> Empty Trash</button>}
    </div>
    <div className="archive-trash-tabs" role="tablist" aria-label="Archive and Trash">
      <button id="archived-tab" role="tab" aria-selected={tab === 'archived'} aria-controls="archive-trash-list" className={tab === 'archived' ? 'selected' : ''} onClick={() => { setTab('archived'); setTypeFilter('') }}><Archive size={16} /> Archived <span>{archivedRecords.length}</span></button>
      <button id="trash-tab" role="tab" aria-selected={tab === 'trash'} aria-controls="archive-trash-list" className={tab === 'trash' ? 'selected' : ''} onClick={() => { setTab('trash'); setTypeFilter('') }}><Trash2 size={16} /> Trash <span>{trashedRecords.length}</span></button>
    </div>
    <div className="filter-grid archive-trash-filters">
      <label><span className="sr-only">Search records</span><span className="search-input-wrap"><Search size={15} /><input aria-label="Search records" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or description" /></span></label>
      <label>Record type<select aria-label="Filter by record type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All record types</option>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {error && <p className="archive-trash-error" role="alert">{error}</p>}
    {actionError && !confirmation && <p className="archive-trash-error" role="alert">{actionError}</p>}
    {status && <p className="archive-trash-status" role="status">{status}</p>}
    {loading && <p className="muted-note" role="status">Refreshing your records…</p>}
    <div id="archive-trash-list" role="tabpanel" aria-labelledby={tab === 'archived' ? 'archived-tab' : 'trash-tab'}>
      {filtered.length === 0
        ? <div className="archive-trash-empty"><span className="archive-trash-empty-icon">{tab === 'archived' ? <Archive size={21} /> : <Trash2 size={21} />}</span><b>{source.length === 0 ? `No ${tab === 'archived' ? 'archived records' : 'trashed records'}` : 'No matching records'}</b><p>{source.length === 0 ? tab === 'archived' ? 'Records you archive will appear here.' : 'Deleted records will stay here until restored or permanently deleted.' : 'Try a different search or record type.'}</p></div>
        : <div className="archive-trash-list">{filtered.map((record) => {
          const key = `${record.table}-${record.id}`
          const timestamp = tab === 'archived' ? record.archivedAt : record.deletedAt
          return <article className="archive-trash-row" key={key}>
            <div className="archive-trash-record-icon">{tab === 'archived' ? <Archive size={17} /> : <Trash2 size={17} />}</div>
            <div className="archive-trash-record-main"><div className="archive-trash-record-title"><b>{record.name}</b><span>{record.type}</span></div><div className="archive-trash-record-details">{record.detail && <span>{record.detail}</span>}{record.amount !== undefined && <b>{rupees(record.amount)}</b>}<span>{tab === 'archived' ? 'Archived' : 'Deleted'} {formatDate(timestamp)}</span></div></div>
            <div className="archive-trash-actions">
              {tab === 'archived'
                ? <><button className="secondary" disabled={busyKey !== ''} onClick={() => void runAction(`restore-${key}`, () => onRestoreArchived(record), `${record.type} restored.`)}><ArchiveRestore size={15} /> Restore</button><button className="secondary" disabled={busyKey !== ''} onClick={() => void runAction(`trash-${key}`, () => onMoveToTrash(record), `${record.type} moved to Trash.`)}><Trash2 size={15} /> Move to Trash</button></>
                : <><button className="secondary" disabled={busyKey !== ''} onClick={() => void runAction(`restore-${key}`, () => onRestoreTrashed(record), `${record.type} restored.`)}><RotateCcw size={15} /> Restore</button><button className="danger-button" disabled={busyKey !== ''} onClick={() => { setConfirmation({ kind: 'delete', record }); setActionError(''); setStatus('') }}><Trash2 size={15} /> Delete Permanently</button></>}
            </div>
          </article>
        })}</div>}
    </div>
    {confirmation && <div className="modal-backdrop archive-trash-confirm-backdrop"><section className="modal glass archive-trash-confirm" role="alertdialog" aria-modal="true" aria-labelledby="archive-trash-confirm-title" aria-describedby="archive-trash-confirm-description">
      <span className="archive-trash-warning"><ShieldAlert size={20} /></span>
      <h2 id="archive-trash-confirm-title">{confirmation.kind === 'empty' ? 'Empty Trash?' : 'Delete this record permanently?'}</h2>
      <p id="archive-trash-confirm-description">{confirmation.kind === 'empty'
        ? 'This will permanently delete every record currently in your Trash. This action cannot be undone.'
        : `“${confirmation.record.name}” will be permanently deleted. This action cannot be undone.`}</p>
      {actionError && <p className="archive-trash-error" role="alert">{actionError}</p>}
      <div className="modal-actions"><button className="secondary" disabled={busyKey !== ''} onClick={() => setConfirmation(null)}>Cancel</button><button className="danger-button" disabled={busyKey !== ''} onClick={() => void confirmIrreversibleAction()}>{busyKey ? 'Deleting…' : confirmation.kind === 'empty' ? 'Empty Trash' : 'Delete Permanently'}</button></div>
    </section></div>}
  </section>
}

function formatDate(value: string | null) {
  if (!value) return 'date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'date unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}
