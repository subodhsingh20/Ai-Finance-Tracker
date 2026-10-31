import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme-context'
const STORAGE_KEY = 'friday-finance-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'light' ? '#f3f6fa' : '#0b1020')
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
    } catch {
      // Theme switching still works for this session when storage is unavailable.
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
