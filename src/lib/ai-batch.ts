import type { AiCreateItem } from '../../shared/ai-proposal'
import type { CategoryRow, GoalRow, IncomeSourceRow } from '../components/FinancePages'

export type ResolvedAiItem = Omit<AiCreateItem, 'occurredOn' | 'instrumentName'> & {
  occurredOn: string
  amountText: string
  instrumentName: string
  categoryId: string
  incomeSourceId: string
  savingsGoalId: string
  itemIndex: number
  destinationRequired: boolean
  instrumentRequired: boolean
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()
}

function active<T extends { archived_at: string | null; deleted_at?: string | null }>(record: T) {
  return !record.archived_at && !record.deleted_at
}

function categoryNameHint(item: AiCreateItem) {
  const text = normalized(`${item.categoryName} ${item.description} ${item.instrumentName ?? ''}`)
  if (item.type === 'expense' && /\b(food|groceries|grocery|meal|dining)\b/.test(text)) return 'food'
  if (item.type === 'expense' && /\b(petrol|fuel|gas|transport|taxi|cab)\b/.test(text)) return 'transport'
  if (item.type === 'investment' && /\b(gold|gold etf)\b/.test(text)) return 'gold'
  if (item.type === 'investment' && /\b(etf|stock|stocks|mutual fund|equity)\b/.test(text)) return 'stocks mutual funds etf'
  if (item.type === 'investment' && /\b(fd|fixed deposit|rd|recurring deposit)\b/.test(text)) return 'fixed deposit rd'
  if (item.type === 'income' && /\b(rapido|gig|delivery)\b/.test(text)) return 'rapido gig work'
  return normalized(item.categoryName)
}

function chooseCategory(item: AiCreateItem, categories: CategoryRow[]) {
  const choices = categories.filter((category) => category.type === item.type && active(category))
  const hint = categoryNameHint(item)
  const exact = choices.find((category) => normalized(category.name) === hint)
  if (exact) return { category: exact, assumed: false }
  const tokens = hint.split(' ').filter((token) => token.length > 2)
  const scored = choices.map((category) => {
    const name = normalized(category.name)
    const score = tokens.reduce((total, token) => total + (name.includes(token) ? 1 : 0), 0)
    return { category, score }
  }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score)
  if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return { category: scored[0].category, assumed: true }
  }
  if (item.type === 'investment' && !item.instrumentName?.trim()) {
    const other = choices.find((category) => normalized(category.name) === 'other')
    if (other) return { category: other, assumed: true }
  }
  if (item.type === 'savings' && !item.savingsGoalName?.trim()) {
    const emergency = choices.find((category) => normalized(category.name) === 'emergency fund')
    if (emergency) return { category: emergency, assumed: true }
  }
  return { category: undefined, assumed: false }
}

function matchNamedGoal(name: string | undefined, goals: GoalRow[]) {
  if (!name?.trim()) return undefined
  const target = normalized(name)
  const exact = goals.find((goal) => normalized(goal.name) === target)
  if (exact) return exact
  const matches = goals.filter((goal) => normalized(goal.name).includes(target) || target.includes(normalized(goal.name)))
  return matches.length === 1 ? matches[0] : undefined
}

function hasUnresolvedInstrumentAssumption(assumptions: string[]) {
  return assumptions.some((assumption) => /\binstrument\b/i.test(assumption)
    && /\b(?:needs? confirmation|requires? confirmation|to be confirmed|not specified|unspecified|missing|enter)\b/i.test(assumption))
}

export function resolveAiBatchItems(
  proposed: AiCreateItem[],
  categories: CategoryRow[],
  goals: GoalRow[],
  incomeSources: IncomeSourceRow[],
  today: string,
  originalText = '',
): ResolvedAiItem[] {
  const activeGoals = goals.filter(active)
  const activeSources = incomeSources.filter(active)
  const activeCategories = categories.filter(active)
  const sourceText = normalized(originalText)
  const explicitlyMentioned = (value: string | undefined) => {
    const candidate = normalized(value ?? '')
    return candidate.length > 0 && sourceText.includes(candidate)
  }
  return proposed.map((item, itemIndex) => {
    const assumptions = [...(item.assumptions ?? [])]
    const sourceName = explicitlyMentioned(item.sourceName) ? item.sourceName : undefined
    const merchantName = explicitlyMentioned(item.merchantName) ? item.merchantName : undefined
    const instrumentName = explicitlyMentioned(item.instrumentName) ? item.instrumentName?.trim() ?? '' : ''
    const savingsGoalName = explicitlyMentioned(item.savingsGoalName) ? item.savingsGoalName : undefined
    const categoryName = item.type === 'investment' && !instrumentName
      ? 'Other'
      : item.type === 'savings' && !savingsGoalName
        ? 'Emergency Fund'
        : item.categoryName
    if (item.instrumentName && !instrumentName) {
      assumptions.push('The proposed instrument was not stated in your message; enter the actual instrument.')
    }
    if (item.sourceName && !sourceName) assumptions.push('The proposed income source was not stated in your message; it was not linked.')
    if (item.merchantName && !merchantName) assumptions.push('The proposed merchant was not stated in your message; it was removed.')
    if (item.savingsGoalName && !savingsGoalName) assumptions.push('The proposed goal was not stated in your message; it was not trusted and a configured default will be considered.')
    if (item.type === 'investment' && !instrumentName) {
      assumptions.push('No instrument was explicitly stated; using the existing general Other investment category when available.')
    }
    const safeItem = { ...item, categoryName, instrumentName, savingsGoalName, sourceName, merchantName }
    const occurredOn = item.occurredOn ?? today
    if (!item.occurredOn && !assumptions.some((value) => value.toLocaleLowerCase().includes('date'))) {
      assumptions.push('Date defaulted to today in Asia/Kolkata.')
    }

    let goal: GoalRow | undefined
    let destinationRequired = false
    if (item.type === 'savings') {
      goal = matchNamedGoal(savingsGoalName, activeGoals)
      if (savingsGoalName && !goal) {
        destinationRequired = true
        assumptions.push(`Select a matching savings goal for "${savingsGoalName}".`)
      } else if (!savingsGoalName) {
        const emergencyGoals = activeGoals.filter((candidate) => normalized(candidate.name).includes('emergency fund'))
        if (emergencyGoals.length === 1) {
          goal = emergencyGoals[0]
          assumptions.push('Defaulted to Emergency Fund savings goal.')
        } else if (emergencyGoals.length > 1) {
          if (activeCategories.some((category) => category.type === 'savings' && normalized(category.name) === 'emergency fund')) {
            assumptions.push('Multiple Emergency Fund goals exist; defaulted to the Emergency Fund savings category without linking a goal.')
          } else {
            destinationRequired = true
            assumptions.push('Multiple Emergency Fund goals exist and no Emergency Fund category is available; choose a destination.')
          }
        } else if (activeCategories.some((category) => category.type === 'savings' && normalized(category.name) === 'emergency fund')) {
          assumptions.push('Defaulted to the Emergency Fund savings category; no goal was linked.')
        } else {
          destinationRequired = true
          assumptions.push('Choose a savings goal or an active savings category.')
        }
      }
    }

    const categoryMatch = chooseCategory(safeItem, categories)
    if (categoryMatch.assumed && !assumptions.some((value) => value.toLocaleLowerCase().includes('default'))) {
      assumptions.push(`Category matched to ${categoryMatch.category?.name}.`)
    } else if (!categoryMatch.category) {
      assumptions.push(`No matching active ${item.type} category was found; choose a category.`)
    }
    const instrumentRequired = item.type === 'investment'
      && (instrumentName.length === 0 || hasUnresolvedInstrumentAssumption(assumptions))
    if (instrumentRequired && !assumptions.some((value) => value.toLocaleLowerCase().includes('instrument'))) {
      assumptions.push('Investment instrument not specified; enter it before saving.')
    }
    const source = sourceName
      ? activeSources.find((candidate) => normalized(candidate.name) === normalized(sourceName))
      : undefined
    return {
      ...safeItem,
      occurredOn,
      amountText: String(item.amount),
      assumptions,
      categoryId: categoryMatch.category?.id ?? '',
      incomeSourceId: source?.id ?? '',
      savingsGoalId: goal?.id ?? '',
      itemIndex,
      destinationRequired,
      instrumentName,
      instrumentRequired,
    }
  })
}
