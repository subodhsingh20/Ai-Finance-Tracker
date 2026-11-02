import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './finance.css'
import './archive-trash.css'
import './theme.css'
import './mobile-ux.css'
import './settings-personalization.css'
import { ThemeProvider } from './theme'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><App /></ThemeProvider></React.StrictMode>,
)
