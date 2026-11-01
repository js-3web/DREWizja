import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

// Service worker = skrypt działający w tle przeglądarki. Zapisuje pliki aplikacji w pamięci
// urządzenia (cache), dzięki czemu aplikacja uruchamia się bez internetu. Przy nowej wersji
// na serwerze pobiera ją w tle i podmienia przy następnym uruchomieniu (autoUpdate).
// Dodatkowo sprawdzamy aktualizację przy każdym powrocie do aplikacji i co godzinę — na iPhonie
// aplikacja z ekranu początkowego potrafi długo „żyć” w tle ze starą wersją.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {})
    }
    setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
