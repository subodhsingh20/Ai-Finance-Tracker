import { createContext, useContext } from 'react'

export type Theme = 'dark' | 'light'
export type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void }
export const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', setTheme: () => undefined })
export const useTheme = () => useContext(ThemeContext)
