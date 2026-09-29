import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CueAuthProvider } from './auth'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CueAuthProvider>
      <App />
    </CueAuthProvider>
  </StrictMode>,
)
