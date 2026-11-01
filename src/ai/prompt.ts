/**
 * Generator promptu dla zewnętrznego czatu AI (Claude, ChatGPT…) — tryb „Asystent AI”.
 *
 * Przepływ: aplikacja składa prompt → użytkownik wkleja go w czacie AI RAZEM ZE ZDJĘCIEM szkicu →
 * kopiuje odpowiedź (JSON) → wkleja do aplikacji → ekran weryfikacji.
 * Prompt zawiera: rolę, konwencje szkicu (SPEC 4), legendę użytkownika, wymiary pokoju, układ ścian,
 * dokładny format odpowiedzi i zasadę „nie zgaduj — pytaj”.
 */
import type { SettingsT } from '../model/settings'
import type { SketchReadingT } from './reading'

export interface PromptInput {
  roomWidthCm: number
  roomDepthCm: number
  roomHeightCm: number
  notes: string
}

const FORMAT = `{
  "sketch_summary": "krótki opis: co widać na szkicu (np. zabudowa w L na ścianach A i B)",
  "room": { "width_cm": 386.5, "depth_cm": 300, "height_cm": 260 },
  "runs": [
    {
      "wall": "A",
      "start_offset_cm": 21,
      "worktop_height_cm": 90,
      "upper_bottom_cm": null,
      "floor": [
        { "label": "cargo", "type": "base", "width_cm": 34, "height_cm": null, "depth_cm": null,
          "fronts": { "kind": "door" }, "appliance": null, "hob_above": false, "confidence": 0.9 },
        { "type": "base", "width_cm": 60, "height_cm": null, "depth_cm": null,
          "fronts": { "kind": "drawers", "count": 3, "heights_cm": [30, 26, 16] }, "appliance": null,
          "hob_above": false, "confidence": 0.8 },
        { "type": "base", "width_cm": 60, "fronts": { "kind": "drawers", "count": 2 }, "appliance": "oven",
          "hob_above": true, "confidence": 0.85 },
        { "type": "tall", "width_cm": 60, "height_cm": 207, "fronts": { "kind": "drawers", "count": 2 },
          "appliance": "fridge", "hob_above": false, "confidence": 0.7 }
      ],
      "upper": [
        { "type": "wall", "width_cm": 34, "height_cm": 72, "fronts": { "kind": "door" }, "appliance": null, "confidence": 0.9 },
        { "type": "gap", "width_cm": 60, "fronts": { "kind": "none" }, "appliance": null, "confidence": 0.6,
          "note": "przerwa nad płytą — okap?" }
      ]
    }
  ],
  "obstacles": [
    { "kind": "murek", "wall": "A", "x_cm": 0, "y_cm": 0, "w_cm": 21, "h_cm": 90, "d_cm": 21, "label": "murek" }
  ],
  "dimension_chains": [
    { "wall": "A", "layer": "floor", "segments_cm": [34, 60, 60, 45, 80], "total_cm": 366 }
  ],
  "warnings": ["Suma segmentów na ścianie A (279 cm) ≠ wymiar całkowity 366 cm"],
  "questions": ["Pole kreskowane nad zlewem: witryna (szkło), półka otwarta czy blenda?"]
}`

export function buildReadingPrompt(input: PromptInput, settings: SettingsT): string {
  const d = settings.defaults
  return `Jesteś doświadczonym projektantem-stolarzem mebli kuchennych i na wymiar. Odczytaj załączone zdjęcie RĘCZNEGO SZKICU zabudowy i opisz je w ściśle określonym formacie JSON. Nie rysujesz niczego — tylko odczytujesz dane. Model 3D zbuduje z nich program.

## Pomieszczenie (podane przez stolarza — traktuj jako pewne)
- szerokość = długość ściany A i C: ${input.roomWidthCm} cm
- głębokość = długość ściany B i D: ${input.roomDepthCm} cm
- wysokość: ${input.roomHeightCm} cm
${input.notes.trim() ? `- uwagi stolarza: ${input.notes.trim()}` : ''}

## Oznaczenie ścian i kierunek wymiarowania (BARDZO WAŻNE)
- Ściany oznacz literami A, B, C, D zgodnie z ruchem wskazówek zegara patrząc na rzut z góry: A = ściana u góry rzutu, B = prawa, C = dolna, D = lewa.
- Stojąc w pokoju TWARZĄ do danej ściany, odległości mierz od jej LEWEGO narożnika. Ściana B jest po prawej stronie ściany A.
- Jeśli szkic ma rzut z góry, użyj go do przypisania widoków ścian (elewacji) do liter.
- Dla zabudowy w L: narożnik A/B to koniec ściany A i początek ściany B. Ciąg na ścianie B zaczyna się zwykle po głębokości ciągu A (start_offset_cm ≈ 60) — NIE licz głębokości narożnika dwa razy.

## Konwencje szkicu
- Wymiary w centymetrach. Widoki ścian mogą być narysowane obrócone o 90° (tekst czytany bokiem) — wykryj orientację.
- Łańcuchy wymiarowe: zapisz każdy w "dimension_chains" (segmenty + wymiar całkowity, jeśli jest).
- KONTROLA SUM: porównaj sumę segmentów z wymiarem całkowitym i z długością ściany. Każdą rozbieżność zapisz w "warnings" Z WARTOŚCIAMI. Niczego nie poprawiaj „po cichu”.
- Wysokości typu 90 / 85 / 100 przy szafkach dolnych to zwykle wysokość BLATU od podłogi → wpisz do "worktop_height_cm", a "height_cm" szafki zostaw null. "height_cm" podawaj tylko, gdy szkic jednoznacznie podaje wysokość korpusu.
- Legenda symboli tego warsztatu:
${settings.legend.trim() || '(brak)'}

## Zasady
1. NIE ZGADUJ. Niejednoznaczne symbole (np. pola kreskowane, nieczytelne liczby) → wpisz pytanie do "questions" i nadaj elementowi niską pewność.
2. Każda szafka ma "confidence" od 0 do 1 (jak pewny jest odczyt jej wymiaru i rodzaju). Poniżej 0.7 = do sprawdzenia przez stolarza.
3. Szafki stojące na podłodze (dolne, narożne, słupki, lodówka w zabudowie, blendy przy nich) → "floor", w kolejności od lewego narożnika ściany. Szafki wiszące, okap, blendy górne → "upper". Puste miejsce między szafkami (np. nad płytą bez okapu, nad lodówką) → element "type": "gap" z szerokością.
4. "type": base | corner | tall | wall | open (półka otwarta) | filler (blenda) | gap (przerwa) | appliance (np. okap w zabudowie).
5. "fronts.kind": door (1 drzwi) | doors2 (2 drzwi) | drawers (szuflady, podaj "count" i jeśli są — "heights_cm" od DOŁU) | flap (klapa) | glass (drzwi szklane/witryna) | none.
6. "appliance": hob | oven | fridge | dishwasher | sink | hood | microwave | null. Płyta grzewcza nad szafką → "hob_above": true. Zlew → "appliance": "sink" przy szafce pod zlewem.
7. Wymiary nieodczytane → null (program przyjmie wartości domyślne: cokół ${d.plinthHeight / 10} cm, korpus dolny ${d.baseHeight / 10} cm, głębokość dolnych ${d.baseDepth / 10} cm, górnych ${d.wallDepth / 10} cm). Nie wpisuj tych wartości sam.
8. "obstacles": murki, okna, drzwi, piony, grzejniki — x_cm od lewego narożnika ściany, y_cm od podłogi, w/h szerokość/wysokość, d_cm odstawanie od ściany (okno/drzwi = 0).
9. Szerokość szafki nieczytelna → "width_cm": null + pytanie w "questions" (stolarz ją uzupełni). Nie wyliczaj jej „na siłę” z różnicy łańcucha.
10. Wymiar przeszkody nieznany → null (np. "h_cm": null, "d_cm": null) + pytanie. Nie pomijaj pól.
11. Używaj WYŁĄCZNIE wartości wymienionych w formacie: "layer" w "dimension_chains" to tylko "floor" (szafki stojące), "upper" (wiszące) albo "overall" (całość ściany/pomieszczenia); "wall" to tylko A, B, C lub D.

## Format odpowiedzi
Odpowiedz WYŁĄCZNIE jednym blokiem kodu \`\`\`json zawierającym obiekt dokładnie w tej strukturze (wartości poniżej to tylko przykład):

\`\`\`json
${FORMAT}
\`\`\`

Jeżeli na zdjęciu nie ma szkicu albo jest nieczytelny — zwróć ten sam format z pustymi szafkami i wyjaśnieniem w "questions".`
}

/** Prompt korygujący (SPEC 6.5): aktualny odczyt + uwagi stolarza → poprawiony kompletny JSON. */
export function buildCorrectionPrompt(reading: SketchReadingT, remarks: string): string {
  return `Popraw poniższy odczyt szkicu zgodnie z uwagami stolarza. Zachowaj dokładnie ten sam format JSON i wszystkie zasady z poprzedniej wiadomości (nie zgaduj, rozbieżności do "warnings", wątpliwości do "questions"). Jeśli uwaga rozwiązuje pytanie z "questions" — usuń to pytanie.

## Uwagi stolarza
${remarks.trim()}

## Aktualny odczyt
\`\`\`json
${JSON.stringify(reading, null, 2)}
\`\`\`

Odpowiedz WYŁĄCZNIE jednym blokiem \`\`\`json z kompletnym, poprawionym obiektem.`
}
