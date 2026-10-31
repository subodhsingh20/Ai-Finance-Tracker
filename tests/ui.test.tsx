import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiDialog, LoginPage, Onboarding, SignOutButton } from '../src/App'
import { FinancePages, TransactionDialog, type FinancePagesProps, type TransactionRow } from '../src/components/FinancePages'
import { ArchiveTrashPage, type ArchiveTrashRecord } from '../src/components/ArchiveTrashPage'
import { createMockAiAdapter } from '../src/lib/ai'
import { ThemeProvider } from '../src/theme'

const category = { id: 'category-food', type: 'expense' as const, name: 'Food', archived_at: null }
const transaction: TransactionRow = {
  id: 'transaction-1',
  type: 'expense',
  amount: 125,
  description: 'Lunch at the cafe',
  occurred_on: '2026-10-12',
  category_id: category.id,
  income_source_id: null,
  source_name: null,
  merchant_name: 'Cafe',
  savings_goal_id: null,
  deleted_at: null,
  categories: { name: 'Food' },
}

const noAction = async () => undefined
type OnboardingInput = Parameters<Parameters<typeof Onboarding>[0]['onComplete']>[0]
type AiBatchCallback = Parameters<typeof AiDialog>[0]['onSaveBatch']
type AiTransactionCallback = Parameters<typeof AiDialog>[0]['onSaveTransaction']
type AssetCallback = Parameters<FinancePagesProps['onSaveAsset']>[0]
const pageProps: FinancePagesProps = {
  page: 'Transactions',
  transactions: [],
  categories: [category],
  budgets: [],
  goals: [],
  assets: [],
  holdings: [],
  liabilities: [],
  incomeSources: [],
  assetValues: new Map(),
  holdingValues: new Map(),
  onOpenTransaction: vi.fn(),
  onSaveTransaction: vi.fn(noAction),
  onSetDeleted: vi.fn(noAction),
  onSaveCategory: vi.fn(noAction),
  onArchiveCategory: vi.fn(noAction),
  onSaveSource: vi.fn(noAction),
  onArchiveSource: vi.fn(noAction),
  onSaveBudget: vi.fn(noAction),
  onArchiveBudget: vi.fn(noAction),
  onSaveGoal: vi.fn(noAction),
  onArchiveGoal: vi.fn(noAction),
  onSaveAsset: vi.fn(noAction),
  onArchiveAsset: vi.fn(noAction),
  onSaveHolding: vi.fn(noAction),
  onArchiveHolding: vi.fn(noAction),
  onSaveLiability: vi.fn(noAction),
  onArchiveLiability: vi.fn(noAction),
  onSaveProfile: vi.fn(noAction),
  profile: { display_name: null, enabled_modules: [], dashboard_preferences: {} },
}

describe('authentication and onboarding controls', () => {
  it('submits invite-only sign-in without exposing public registration', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())
    render(<LoginPage email="" password="" resetMode={false} error="" onEmail={vi.fn()} onPassword={vi.fn()} onResetMode={vi.fn()} onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email address'), 'person@example.test')
    await user.type(screen.getByLabelText('Password'), 'password')
    fireEvent.submit(screen.getByLabelText('Email address').closest('form')!)
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /sign up|register/i })).not.toBeInTheDocument()
    expect(screen.getByText(/accounts are invited by your administrator/i)).toBeInTheDocument()
  })

  it('runs the accessible sign-out action', async () => {
    const onSignOut = vi.fn()
    render(<SignOutButton onSignOut={onSignOut} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Logout' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('completes onboarding with optional fields left blank', async () => {
    const onComplete = vi.fn(async (data: OnboardingInput) => { void data })
    const user = userEvent.setup()
    render(<Onboarding onComplete={onComplete} onSignOut={vi.fn()} error="" />)
    await user.click(screen.getByRole('button', { name: 'Complete setup' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      displayName: '',
      monthlyBudget: null,
      expenseCategories: [],
      incomeSources: [],
      goals: [],
      assets: [],
      liabilities: [],
      enabledModules: expect.arrayContaining(['transactions', 'budgets']),
      dashboardPreferences: { cashFlow: true, categories: true, savingsGoals: true, investments: true, netWorth: true },
    })
  })
})

describe('Friday theme preferences', () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = 'dark'
    window.localStorage.clear()
  })

  it('defaults to dark and provides accessible theme controls in Settings', () => {
    render(<ThemeProvider><FinancePages {...pageProps} page="Settings" /></ThemeProvider>)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dark theme/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /light theme/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches themes immediately, persists the choice, and restores it after remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeProvider><FinancePages {...pageProps} page="Settings" /></ThemeProvider>)
    await user.click(screen.getByRole('button', { name: /light theme/i }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('friday-finance-theme')).toBe('light')
    expect(screen.getByRole('button', { name: /light theme/i })).toHaveAttribute('aria-pressed', 'true')

    unmount()
    // The early head script applies this stored choice before React mounts on a page reload.
    document.documentElement.dataset.theme = window.localStorage.getItem('friday-finance-theme') === 'light' ? 'light' : 'dark'
    render(<ThemeProvider><FinancePages {...pageProps} page="Settings" /></ThemeProvider>)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await user.click(screen.getByRole('button', { name: /dark theme/i }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('friday-finance-theme')).toBe('dark')
  })

  it('falls back to dark for an invalid saved value and does not call profile or network actions', async () => {
    window.localStorage.setItem('friday-finance-theme', 'sepia')
    document.documentElement.dataset.theme = window.localStorage.getItem('friday-finance-theme') === 'light' ? 'light' : 'dark'
    const saveProfile = vi.fn(noAction)
    const fetchSpy = vi.spyOn(window, 'fetch')
    const user = userEvent.setup()
    render(<ThemeProvider><FinancePages {...pageProps} page="Settings" onSaveProfile={saveProfile} /></ThemeProvider>)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await user.click(screen.getByRole('button', { name: /light theme/i }))
    expect(saveProfile).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('supports keyboard selection of the theme', async () => {
    const user = userEvent.setup()
    render(<ThemeProvider><FinancePages {...pageProps} page="Settings" /></ThemeProvider>)
    screen.getByRole('button', { name: /dark theme/i }).focus()
    await user.keyboard('{Tab}{Enter}')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('still switches themes when localStorage writes are unavailable', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled') })
    const user = userEvent.setup()
    render(<ThemeProvider><FinancePages {...pageProps} page="Settings" /></ThemeProvider>)
    await user.click(screen.getByRole('button', { name: /light theme/i }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    setItem.mockRestore()
  })
})

describe('manual finance forms', () => {
  it('creates a transaction only after the manual form is submitted', async () => {
    const onSave = vi.fn(noAction)
    const user = userEvent.setup()
    render(<TransactionDialog categories={[category]} goals={[]} incomeSources={[]} onClose={vi.fn()} onSave={onSave} />)
    await user.type(screen.getByLabelText('Amount (₹)'), '125.50')
    await user.type(screen.getByLabelText('Description'), 'Lunch')
    await user.click(screen.getByRole('button', { name: 'Save transaction' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense',
      amount: 125.5,
      category_id: category.id,
      description: 'Lunch',
      income_source_id: null,
    }), undefined))
  })

  it('edits an existing transaction through the manual form', async () => {
    const onSave = vi.fn(noAction)
    const user = userEvent.setup()
    render(<TransactionDialog categories={[category]} goals={[]} incomeSources={[]} transaction={transaction} onClose={vi.fn()} onSave={onSave} />)
    await user.clear(screen.getByLabelText('Amount (₹)'))
    await user.type(screen.getByLabelText('Amount (₹)'), '250')
    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Updated lunch')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      amount: 250,
      description: 'Updated lunch',
      category_id: category.id,
    }), transaction.id))
  })

  it('filters active transactions and exposes trash restore controls', async () => {
    const onSetDeleted = vi.fn(noAction)
    const deleted = { ...transaction, id: 'transaction-deleted', deleted_at: '2026-10-13T00:00:00Z' }
    const user = userEvent.setup()
    const { rerender } = render(<FinancePages {...pageProps} transactions={[transaction, { ...transaction, id: 'other', description: 'Bus fare', type: 'expense', amount: 40 }, deleted]} onSetDeleted={onSetDeleted} />)
    await user.type(screen.getByRole('textbox', { name: 'Search transactions' }), 'lunch')
    expect(screen.getByText('1 matching active entries')).toBeInTheDocument()
    expect(screen.getByText('Lunch at the cafe')).toBeInTheDocument()
    expect(screen.queryByText('Bus fare')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move to trash' }))
    expect(onSetDeleted).toHaveBeenCalledWith(transaction.id, true)
    await user.click(screen.getByLabelText('Show trash'))
    expect(screen.getByText('1 matching deleted entries')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(onSetDeleted).toHaveBeenCalledWith('transaction-deleted', false)
    rerender(<FinancePages {...pageProps} transactions={[transaction]} />)
    expect(screen.getByRole('button', { name: 'Export filtered CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export filtered JSON' })).toBeInTheDocument()
  })

  it('creates a monthly budget with an optional category', async () => {
    const onSaveBudget = vi.fn(noAction)
    const user = userEvent.setup()
    render(<FinancePages {...pageProps} page="Budgets" onSaveBudget={onSaveBudget} />)
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-10' } })
    await user.type(screen.getByLabelText('Monthly limit (₹)'), '2500')
    await user.click(screen.getByRole('button', { name: 'Add budget' }))
    await waitFor(() => expect(onSaveBudget).toHaveBeenCalledWith({
      category_id: null,
      month_start: '2026-10-01',
      limit_amount: 2500,
    }, undefined))
  })

  it('updates an asset valuation through the asset editor', async () => {
    const onSaveAsset = vi.fn(async (draft: AssetCallback, id?: string) => { void draft; void id })
    const user = userEvent.setup()
    render(<FinancePages {...pageProps} page="Assets & debts" assets={[{
      id: 'asset-1',
      name: 'Savings account',
      category: 'bank_cash',
      current_value: 100,
      as_of_date: '2026-10-01',
      description: null,
      archived_at: null,
    }]} onSaveAsset={onSaveAsset} />)
    await user.click(screen.getByRole('button', { name: 'Update valuation' }))
    const valueInput = screen.getByLabelText('Current value (₹)')
    await user.clear(valueInput)
    await user.type(valueInput, '175.25')
    await user.click(screen.getByRole('button', { name: 'Save valuation' }))
    await waitFor(() => expect(onSaveAsset).toHaveBeenCalledWith(expect.objectContaining({ current_value: 175.25 }), 'asset-1'))
  })

  it('creates and updates categories with accessible type and name inputs', async () => {
    const onSaveCategory = vi.fn(noAction)
    const user = userEvent.setup()
    render(<FinancePages {...pageProps} page="Categories & sources" onSaveCategory={onSaveCategory} />)
    const categories = within(screen.getByRole('heading', { name: 'Categories' }).closest('section')!)
    await user.selectOptions(categories.getByLabelText('Type'), 'expense')
    await user.type(categories.getByLabelText('Name'), 'Pet care')
    await user.click(categories.getByRole('button', { name: 'Add category' }))
    await waitFor(() => expect(onSaveCategory).toHaveBeenCalledWith({ type: 'expense', name: 'Pet care' }, undefined))
    await user.click(categories.getByRole('button', { name: 'Edit' }))
    const name = categories.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Dining out')
    await user.click(categories.getByRole('button', { name: 'Save category' }))
    await waitFor(() => expect(onSaveCategory).toHaveBeenCalledWith({ type: 'expense', name: 'Dining out' }, category.id))
  })
})

describe('AI proposal confirmation', () => {
  const proposal = {
    action: 'create' as const,
    intent: 'create' as const,
    clarificationQuestion: null,
    items: [{
      type: 'expense' as const,
      amount: 400,
      categoryName: 'Food',
      description: 'Groceries',
      occurredOn: '2026-10-26',
    }],
  }

  it('shows an editable proposal but writes nothing until explicit confirmation', async () => {
    const onSaveBatch = vi.fn<AiBatchCallback>(async () => undefined)
    const user = userEvent.setup()
    render(<AiDialog accessToken="access-token" categories={[category]} incomeSources={[]} transactions={[]} goals={[]} onClose={vi.fn()} onSaveBatch={onSaveBatch} onSaveTransaction={vi.fn(noAction)} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(proposal)} />)
    await user.type(screen.getByLabelText('Description'), 'Spent 400 on groceries today')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    expect(await screen.findByDisplayValue('2026-10-26')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Groceries')).toBeInTheDocument()
    expect(onSaveBatch).not.toHaveBeenCalled()
    await user.clear(screen.getByDisplayValue('Groceries'))
    await user.type(screen.getByLabelText('Description'), 'Grocery shop')
    await user.click(screen.getByRole('button', { name: 'Confirm and save 1 transaction' }))
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledOnce())
    expect(onSaveBatch.mock.calls[0][0][0].draft).toMatchObject({ description: 'Grocery shop', category_id: category.id, occurred_on: '2026-10-26' })
  })

  it('shows separate type totals and requires a real investment instrument before confirming the batch', async () => {
    const onSaveBatch = vi.fn<AiBatchCallback>(async () => undefined)
    const user = userEvent.setup()
    const categories = [
      category,
      { id: 'transport', type: 'expense' as const, name: 'Transport', archived_at: null },
      { id: 'emergency', type: 'savings' as const, name: 'Emergency Fund', archived_at: null },
      { id: 'investment-other', type: 'investment' as const, name: 'Other', archived_at: null },
    ]
    const batch = {
      action: 'create' as const,
      intent: 'create' as const,
      clarificationQuestion: null,
      items: [
        { type: 'expense' as const, amount: 300, categoryName: 'Food', description: 'Food', occurredOn: '2026-10-26' },
        { type: 'expense' as const, amount: 500, categoryName: 'Transport', description: 'Petrol', occurredOn: '2026-10-26' },
        { type: 'savings' as const, amount: 50, categoryName: 'Emergency Fund', description: 'Savings', occurredOn: '2026-10-26' },
        { type: 'investment' as const, amount: 2000, categoryName: 'Other', description: 'Investment in Fund', occurredOn: '2026-10-26', instrumentName: 'Fund', assumptions: ['Investment instrument needs confirmation'] },
      ],
    }
    render(<AiDialog accessToken="access-token" categories={categories} incomeSources={[]} transactions={[]} goals={[]} onClose={vi.fn()} onSaveBatch={onSaveBatch} onSaveTransaction={vi.fn(noAction)} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(batch)} />)
    const userText = screen.getByLabelText('Description')
    await user.type(userText, 'Food 300, Petrol 500, Savings 50, Investment 2000 in Fund')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    expect(await screen.findByText(/Batch summary · 4 proposed records/)).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Batch totals' })
    expect(summary).toHaveTextContent('Expenses: ₹800.00')
    expect(summary).toHaveTextContent('Savings contributions: ₹50.00')
    expect(summary).toHaveTextContent('Investment contributions: ₹2,000.00')
    expect(screen.getByText('Assumption: Investment instrument needs confirmation')).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Confirm and save 4 transactions' })
    expect(confirm).toBeDisabled()
    expect(onSaveBatch).not.toHaveBeenCalled()
    const instrument = screen.getByLabelText('Investment instrument')
    await user.clear(instrument)
    await user.type(instrument, 'User selected fund')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledOnce())
    expect(onSaveBatch.mock.calls[0][0]).toHaveLength(4)
    expect(onSaveBatch.mock.calls[0][0][3].draft).toMatchObject({
      type: 'investment',
      amount: 2000,
      instrument_name: 'User selected fund',
    })
  })

  it('allows removing individual proposed records before any write', async () => {
    const onSaveBatch = vi.fn<AiBatchCallback>(async () => undefined)
    const user = userEvent.setup()
    const twoRows = { ...proposal, items: [proposal.items[0], { ...proposal.items[0], amount: 100, description: 'Second entry' }] }
    render(<AiDialog accessToken="access-token" categories={[category]} incomeSources={[]} transactions={[]} goals={[]} onClose={vi.fn()} onSaveBatch={onSaveBatch} onSaveTransaction={vi.fn(noAction)} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(twoRows)} />)
    await user.type(screen.getByLabelText('Description'), 'Two expenses')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    expect(await screen.findByText(/Batch summary · 2 proposed records/)).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Remove row' })[0])
    expect(screen.getByText(/Batch summary · 1 proposed record/)).toBeInTheDocument()
    expect(onSaveBatch).not.toHaveBeenCalled()
  })

  it('preserves an unchanged batch after an atomic save error and retries with the same submission ID', async () => {
    const onSaveBatch = vi.fn<AiBatchCallback>()
      .mockRejectedValueOnce(new Error('Atomic batch failed'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<AiDialog accessToken="access-token" categories={[category]} incomeSources={[]} transactions={[]} goals={[]} onClose={vi.fn()} onSaveBatch={onSaveBatch} onSaveTransaction={vi.fn(noAction)} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(proposal)} />)
    await user.type(screen.getByLabelText('Description'), 'Spent 400 on groceries')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm and save 1 transaction' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Atomic batch failed')
    expect(screen.getByDisplayValue('Groceries')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Retry save same batch' })
    expect(retry).toBeEnabled()
    await user.click(retry)
    await waitFor(() => expect(onSaveBatch).toHaveBeenCalledTimes(2))
    expect(onSaveBatch.mock.calls[1][1]).toBe(onSaveBatch.mock.calls[0][1])
    expect(onSaveBatch.mock.calls[1][0]).toEqual(onSaveBatch.mock.calls[0][0])
  })

  describe('Archive & Trash', () => {
    const archivedCategory = { ...category, id: 'archived-category', name: 'Old food', archived_at: '2026-10-10T12:00:00Z' }
    const trashedCategory = { ...category, id: 'trashed-category', name: 'Removed food', archived_at: null, deleted_at: '2026-10-12T12:00:00Z', trashed_from_archived_at: '2026-10-08T12:00:00Z' }
    const deletedTransaction = { ...transaction, id: 'trashed-transaction', deleted_at: '2026-10-13T12:00:00Z' }
    const record = (table: ArchiveTrashRecord['table'], id: string): ArchiveTrashRecord => ({
      id, table, type: table === 'categories' ? 'Category' : 'Transaction',
      name: table === 'categories' ? id === archivedCategory.id ? archivedCategory.name : trashedCategory.name : deletedTransaction.description,
      archivedAt: id === archivedCategory.id ? archivedCategory.archived_at : null,
      deletedAt: id === deletedTransaction.id ? deletedTransaction.deleted_at : id === trashedCategory.id ? trashedCategory.deleted_at! : null,
      ...(id === trashedCategory.id ? { trashedFromArchivedAt: trashedCategory.trashed_from_archived_at } : {}),
    })
    const archiveProps = {
      ...pageProps,
      transactions: [deletedTransaction],
      categories: [archivedCategory, trashedCategory],
      onRestoreArchived: vi.fn(noAction),
      onMoveToTrash: vi.fn(noAction),
      onRestoreTrashed: vi.fn(noAction),
      onPermanentlyDelete: vi.fn(noAction),
      onEmptyTrash: vi.fn(async () => 2),
    }

    it('switches tabs and searches/filters records', async () => {
      const user = userEvent.setup()
      render(<ArchiveTrashPage {...archiveProps} />)
      expect(screen.getByText('Old food')).toBeInTheDocument()
      await user.type(screen.getByRole('textbox', { name: 'Search records' }), 'old')
      expect(screen.getByText('Old food')).toBeInTheDocument()
      expect(screen.queryByText('Removed food')).not.toBeInTheDocument()
      await user.clear(screen.getByRole('textbox', { name: 'Search records' }))
      await user.click(screen.getByRole('tab', { name: /Trash/ }))
      await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by record type' }), 'categories')
      expect(screen.getByText('Removed food')).toBeInTheDocument()
      expect(screen.queryByText('Lunch at the cafe')).not.toBeInTheDocument()
    })

    it('restores archived records and moves archived records to Trash', async () => {
      const user = userEvent.setup()
      render(<ArchiveTrashPage {...archiveProps} />)
      const oldFood = screen.getByText('Old food').closest('article')!
      await user.click(within(oldFood).getByRole('button', { name: /Restore/ }))
      expect(archiveProps.onRestoreArchived).toHaveBeenCalledWith(expect.objectContaining(record('categories', archivedCategory.id)))
      await user.click(within(oldFood).getByRole('button', { name: /Move to Trash/ }))
      expect(archiveProps.onMoveToTrash).toHaveBeenCalledWith(expect.objectContaining(record('categories', archivedCategory.id)))
    })

    it('restores a deleted transaction and preserves previous archive metadata for entities', async () => {
      const user = userEvent.setup()
      render(<ArchiveTrashPage {...archiveProps} />)
      await user.click(screen.getByRole('tab', { name: /Trash/ }))
      const transactionRow = screen.getByText('Lunch at the cafe').closest('article')!
      await user.click(within(transactionRow).getByRole('button', { name: /Restore/ }))
      expect(archiveProps.onRestoreTrashed).toHaveBeenCalledWith(expect.objectContaining(record('transactions', deletedTransaction.id)))
      const archivedRestoreRow = screen.getByText('Removed food').closest('article')!
      await user.click(within(archivedRestoreRow).getByRole('button', { name: /Restore/ }))
      expect(archiveProps.onRestoreTrashed).toHaveBeenCalledWith(expect.objectContaining({
        ...record('categories', trashedCategory.id),
        trashedFromArchivedAt: trashedCategory.trashed_from_archived_at,
      }))
    })

    it('requires confirmation for permanent deletion and reports action errors', async () => {
      const user = userEvent.setup()
      const onPermanentlyDelete = vi.fn(async () => { throw new Error('Referenced by financial history') })
      render(<ArchiveTrashPage {...archiveProps} onPermanentlyDelete={onPermanentlyDelete} />)
      await user.click(screen.getByRole('tab', { name: /Trash/ }))
      const categoryRow = screen.getByText('Removed food').closest('article')!
      await user.click(within(categoryRow).getByRole('button', { name: /Delete Permanently/ }))
      expect(onPermanentlyDelete).not.toHaveBeenCalled()
      await user.click(screen.getByRole('alertdialog').querySelector('button.danger-button')!)
      expect(await screen.findByText('Referenced by financial history')).toBeInTheDocument()
      expect(onPermanentlyDelete).toHaveBeenCalledWith(expect.objectContaining(record('categories', trashedCategory.id)))
    })

    it('requires confirmation to empty Trash and reports failures', async () => {
      const user = userEvent.setup()
      const onEmptyTrash = vi.fn(async () => { throw new Error('Trash could not be emptied atomically') })
      render(<ArchiveTrashPage {...archiveProps} onEmptyTrash={onEmptyTrash} />)
      await user.click(screen.getByRole('tab', { name: /Trash/ }))
      await user.click(screen.getByRole('button', { name: 'Empty Trash' }))
      expect(onEmptyTrash).not.toHaveBeenCalled()
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
      await user.click(screen.getByRole('alertdialog').querySelector('button.danger-button')!)
      expect(await screen.findByText('Trash could not be emptied atomically')).toBeInTheDocument()
      expect(onEmptyTrash).toHaveBeenCalledOnce()
    })

    it('shows loading, empty and failure states', () => {
      const { rerender } = render(<ArchiveTrashPage {...archiveProps} transactions={[]} categories={[]} loading />)
      expect(screen.getByRole('status')).toHaveTextContent('Refreshing your records')
      rerender(<ArchiveTrashPage {...archiveProps} transactions={[]} categories={[]} />)
      expect(screen.getByText('No archived records')).toBeInTheDocument()
      rerender(<ArchiveTrashPage {...archiveProps} error="Unable to load records" />)
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to load records')
    })
  })

  it('cancels an AI batch without writing any rows', async () => {
    const onSaveBatch = vi.fn(noAction)
    const user = userEvent.setup()
    render(<AiDialog accessToken="access-token" categories={[category]} incomeSources={[]} transactions={[]} goals={[]} onClose={vi.fn()} onSaveBatch={onSaveBatch} onSaveTransaction={vi.fn(noAction)} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(proposal)} />)
    await user.type(screen.getByLabelText('Description'), 'Spent 400 on groceries')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel batch' }))
    expect(onSaveBatch).not.toHaveBeenCalled()
  })

  it('requires selection between ambiguous active matches and previews an update', async () => {
    const onSaveTransaction = vi.fn<AiTransactionCallback>(async () => undefined)
    const updateProposal = { action: 'change' as const, intent: 'update' as const, searchText: 'Cafe', changes: { amount: 200, categoryName: 'Dining out' } }
    const user = userEvent.setup()
    render(<AiDialog accessToken="access-token" categories={[category, { ...category, id: 'category-dining', name: 'Dining out' }]} incomeSources={[]} transactions={[transaction, { ...transaction, id: 'transaction-2', occurred_on: '2026-10-13' }]} goals={[]} onClose={vi.fn()} onSaveBatch={vi.fn(noAction)} onSaveTransaction={onSaveTransaction} onSetDeleted={vi.fn(noAction)} aiAdapter={createMockAiAdapter(updateProposal)} />)
    await user.type(screen.getByLabelText('Description'), 'Change cafe transaction to 200')
    await user.click(screen.getByRole('button', { name: 'Prepare preview' }))
    const confirm = await screen.findByRole('button', { name: 'Confirm update' })
    expect(confirm).toBeDisabled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select a matching transaction' }), 'transaction-2')
    expect(screen.getByText('Current record')).toBeInTheDocument()
    expect(screen.getByText('Proposed update')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toHaveValue('category-dining')
    await user.click(confirm)
    await waitFor(() => expect(onSaveTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, category_id: 'category-dining' }), 'transaction-2'))
  })
})
