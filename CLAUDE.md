# CLAUDE.md — zasady pracy w repo DREWizja

Nazwa aplikacji: **DREWizja** (dokładnie ta pisownia). Pełna specyfikacja: `SPEC.md` (czytaj przed pracą). Skrót zasad (SPEC sekcja 14):

- Pracuj etapami z SPEC sekcja 12; po każdym etapie: podsumowanie, jak uruchomić, co przetestować, pytania.
- Użytkownik **nie jest programistą** i chce się uczyć IT: przy każdej nowej koncepcji dodaj 2–4 zdania „co to jest i po co tu jest”.
- Komentarze w kodzie po polsku przy logice biznesowej (meble, wymiary), nazwy w kodzie po angielsku.
- Jednostki wewnętrzne: mm, liczby całkowite. Konwersja tylko na wejściu/wyjściu.
- Żadnych sekretów w repo (`.env` w `.gitignore`). Klucz Claude API tylko w backendzie (etap 4).
- Każda funkcja geometryczna ma test jednostkowy z liczbami.
- Nie dodawaj zależności bez uzasadnienia w jednym zdaniu.
- Wątpliwość co do wymagań → zapytaj, nie zgaduj.

## Wymagania dystrybucji (od użytkownika)
- Aplikacja działa online z adresu URL (GitHub Pages, workflow `.github/workflows/deploy.yml`).
- Instalowalna jako PWA na komputerze i iPhonie, działa offline (service worker, `vite-plugin-pwa`).
- Baza danych lokalnie na urządzeniu (IndexedDB przez Dexie, `src/db/db.ts`) + eksport/import JSON jako kopia.

## Komendy
- `npm run dev` — serwer deweloperski, `npm test` — testy (Vitest), `npm run lint` — oxlint,
  `npm run typecheck` — TypeScript, `npm run build` — wersja produkcyjna do `dist/`.
