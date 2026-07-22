import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/geist-sans/latin-400.css'
import '@fontsource/geist-sans/latin-500.css'
import '@fontsource/geist-sans/latin-600.css'
import '@fontsource/geist-sans/latin-700.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-500.css'
import '@fontsource/geist-mono/latin-600.css'
import './styles/design-system.css'
import './index.css'
import App from './App.jsx'
import { bootstrapSessionFromUrl } from './sessionBootstrap.js'

bootstrapSessionFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/nhcx/service/">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
