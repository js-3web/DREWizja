# DREWizja

Szkic → meble 3D.

Aplikacja dla stolarza: z JSON projektu (później: ze zdjęcia szkicu przez AI) generuje model 3D zabudowy
(kuchnie, garderoby) do pokazania klientowi. Specyfikacja: [SPEC.md](SPEC.md).

**Adres aplikacji:** https://js-3web.github.io/DREWizja/

## Instalacja na urządzeniu (praca offline)
- **iPhone/iPad (Safari):** otwórz adres → przycisk Udostępnij → „Do ekranu początkowego”.
  Zainstalowana aplikacja działa bez internetu, a dane są lepiej chronione przed automatycznym czyszczeniem.
- **Komputer (Chrome/Edge):** ikona „Zainstaluj” w pasku adresu.

## Jak pracować (przepływ)
1. **📷 Ze szkicu** → podaj wymiary pomieszczenia (cm) → **Kopiuj prompt**.
2. W swoim czacie AI (Claude, ChatGPT…) **dołącz zdjęcie szkicu** i wklej prompt.
3. Skopiuj całą odpowiedź AI → wklej w kroku 3 → **Sprawdź odczyt**.
4. **Weryfikacja**: popraw szerokości/typy (wiersze żółte = niska pewność), odpowiedz na pytania AI.
   Większe poprawki: wpisz uwagi → **Kopiuj prompt korekty** → wklej w tej samej rozmowie z AI.
5. **Utwórz projekt 3D** → dotknij szafki: wymiary, fronty, AGD; panel materiałów: rodzaj → styl → dekor
   (dla szafki / grupy / wszystkich).
6. Zakładka **Kontrola**: błędy (blokują PDF), ostrzeżenia, przypomnienia.
7. **📄 PDF** dla klienta: widok 3D, rzut każdej ściany z wymiarami (cm), materiały i kolory.

Aplikacja nie łączy się z żadnym AI sama — nie ma klucza API ani serwera. Działa w pełni offline;
internet potrzebny jest tylko Twojemu czatowi AI.

**⚙ Ustawienia**: nazwa warsztatu do PDF, legenda symboli na szkicach (trafia do promptu), wartości domyślne.

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
Struktura:
- `src/model` — schemat Zod projektu, ustawienia, edycja szafek, migracje, przykład,
- `src/geometry` — czyste funkcje: korpus z płyt, fronty (flat/shaker/ramiak), rozmieszczenie, walidacja (+ testy),
- `src/ai` — format odczytu szkicu, generator promptu, konwersja odczyt → projekt (+ testy),
- `src/materials` — biblioteka materiałów i przypisania (element/grupa/wszystkie),
- `src/pdf` — PDF dla klienta, `src/ui` — scena 3D, panele, kreator,
- `src/store` (Zustand, undo/redo), `src/db` (IndexedDB/Dexie).
