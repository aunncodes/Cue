import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CueAuthProvider } from './auth'
import { migrateDatabase } from './migrate'
import './styles.css'

async function start() {
  await migrateDatabase()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CueAuthProvider>
        <App />
      </CueAuthProvider>
    </StrictMode>,
  )
}

void start()
