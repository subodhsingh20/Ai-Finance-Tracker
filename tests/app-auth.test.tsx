import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

const authState = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  listener: null as ((event: string, session: { user: { id: string; email: string } } | null) => void) | null,
  signOut: vi.fn(),
  signOutError: null as Error | null,
}))

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: authState.session }, error: null })),
      onAuthStateChange: vi.fn((listener: typeof authState.listener) => {
        authState.listener = listener
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: vi.fn(async () => {
        authState.signOut()
        if (authState.signOutError) return { error: authState.signOutError }
        authState.listener?.('SIGNED_OUT', null)
        return { error: null }
      }),
    },
    from: vi.fn((table: string) => {
      const result = table === 'profiles'
        ? { data: { display_name: 'Ari Ledger', onboarding_completed: true, enabled_modules: ['overview'], dashboard_preferences: {} }, error: null }
        : { data: [], error: null }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      builder.select = chain
      builder.eq = chain
      builder.order = chain
      builder.range = () => Promise.resolve(result)
      builder.maybeSingle = () => Promise.resolve(result)
      builder.then = (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
      return builder
    }),
  },
}))

describe('authenticated sidebar logout', () => {
  beforeEach(() => {
    authState.session = { user: { id: 'user-123', email: 'ari@example.test' } }
    authState.listener = null
    authState.signOut.mockClear()
    authState.signOutError = null
  })

  it('shows the signed-in profile and returns to login after Supabase sign-out succeeds', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Ari Ledger')).toBeInTheDocument()
    const logout = screen.getByRole('button', { name: 'Logout' })
    expect(logout).toBeVisible()
    await user.click(logout)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument())
    expect(authState.signOut).toHaveBeenCalledOnce()
  })

  it('shows a useful error and keeps the signed-in account when sign-out fails', async () => {
    authState.signOutError = new Error('Network unavailable')
    render(<App />)

    await screen.findByText('Ari Ledger')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Logout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out: Network unavailable')
    expect(screen.getByText('Ari Ledger')).toBeInTheDocument()
  })
})
