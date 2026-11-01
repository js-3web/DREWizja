import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

// Service worker = skrypt działający w tle przeglądarki. Zapisuje pliki aplikacji w pamięci
// urządzenia (cache), dzięki czemu aplikacja uruchamia się bez internetu. Przy nowej wersji
// na serwerze pobiera ją w tle i podmienia przy następnym uruchomieniu (autoUpdate).
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
