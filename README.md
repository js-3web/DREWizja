# DREWizja

Szkic → meble 3D.

Aplikacja dla stolarza: z JSON projektu (później: ze zdjęcia szkicu przez AI) generuje model 3D zabudowy
(kuchnie, garderoby) do pokazania klientowi. Specyfikacja: [SPEC.md](SPEC.md).

**Adres aplikacji:** https://js-3web.github.io/DREWizja/

## Instalacja na urządzeniu (praca offline)
- **iPhone/iPad (Safari):** otwórz adres → przycisk Udostępnij → „Do ekranu początkowego”.
  Zainstalowana aplikacja działa bez internetu, a dane są lepiej chronione przed automatycznym czyszczeniem.
- **Komputer (Chrome/Edge):** ikona „Zainstaluj” w pasku adresu.

## Gdzie są moje projekty?
W lokalnej bazie przeglądarki (IndexedDB) na **tym** urządzeniu — nic nie idzie na serwer.
Inne urządzenie/przeglądarka = osobna baza. Do kopii zapasowej i przenoszenia służy **Eksport / Import JSON**.
Usunięcie danych witryny w ustawieniach przeglądarki usuwa projekty — rób eksport.

## Dla programisty
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy jednostkowe
npm run build      # wersja produkcyjna w dist/
```
Struktura: `src/model` (schemat Zod, przykład, migracje), `src/geometry` (czyste funkcje geometrii + testy),
`src/store` (Zustand, undo/redo), `src/db` (IndexedDB/Dexie), `src/ui` (scena 3D, panel).
