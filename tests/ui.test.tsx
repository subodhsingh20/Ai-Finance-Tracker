import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AiDialog, LoginPage, Onboarding, SignOutButton } from '../src/App'
import { FinancePages, TransactionDialog, type FinancePagesProps, type TransactionRow } from '../src/components/FinancePages'
import { createMockAiAdapter } from '../src/lib/ai'

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
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
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
