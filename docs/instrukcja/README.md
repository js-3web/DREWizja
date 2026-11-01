# Instrukcja obsługi — źródła

- `instrukcja.html` + `*.jpg` — treść i zrzuty ekranu; gotowy PDF: `public/instrukcja-DREWizja.pdf`
  (dostępny w aplikacji pod przyciskiem ❓).
- Odtworzenie po zmianach w aplikacji (Node + Playwright z Chromium):
  1. `npm run build && npx vite preview --port 4173`
  2. `node docs/instrukcja/shots.cjs <katalog-z-sample.txt> docs/instrukcja` — zrzuty (PNG; potem konwersja do JPG),
  3. `node docs/instrukcja/topdf.cjs $PWD/docs/instrukcja/instrukcja.html public/instrukcja-DREWizja.pdf`.
