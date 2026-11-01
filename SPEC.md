# SPECYFIKACJA DLA CLAUDE CODE — aplikacja „Szkic → Meble 3D” (robocza nazwa: TEK-MEBLE3D)

> Ten plik jest materiałem wejściowym dla Claude Code. Umieść go w katalogu projektu jako `SPEC.md`
> (a skrót zasad pracy jako `CLAUDE.md`, sekcja 14). Claude Code: czytaj całość przed pierwszym kodem,
> pracuj etapami z sekcji 12, po każdym etapie zatrzymaj się i pokaż wynik do akceptacji.

---

## 1. Cel i użytkownik

**Cel:** skrócić czas przygotowania prezentacji mebli (kuchnie, zabudowy, garderoby) dla klienta
z godzin do minut i poprawić komunikację stolarz ↔ klient.

**Użytkownik główny:** stolarz / projektant mebli. Pracuje na telefonie lub tablecie, często u klienta,
nie jest programistą ani grafikiem 3D.

**Użytkownik pośredni:** klient — ogląda model 3D (link), zmienia kolory, akceptuje wariant.

**Przepływ docelowy (happy path):**
1. Stolarz robi zdjęcie ręcznego szkicu (widoki ścian + rzut, wymiary w cm).
2. Podaje wymiary pomieszczenia: szerokość, długość/głębokość, wysokość (+ opcjonalnie okna, drzwi, „murki”).
3. AI (Claude API, vision) odczytuje szkic → zwraca **ustrukturyzowany JSON** zgodny ze schematem z sekcji 5.
4. Aplikacja pokazuje **ekran weryfikacji** (odczytane szafki, wymiary, ostrzeżenia) — stolarz poprawia/akceptuje.
5. Aplikacja generuje model 3D (obrót, zoom, przesuwanie).
6. Tapnięcie elementu → panel materiału: rodzaj (płyta laminowana, MDF lakierowany, fornir, lite drewno),
   wzór frontu (gładki, frezowany, ramiakowy), kolor/dekor, wykończenie (mat/połysk).
7. Zapis wariantów, udostępnienie klientowi linkiem, eksport PNG/PDF z widokami.

---

## 2. Kluczowe założenie architektoniczne (NAJWAŻNIEJSZE)

**AI nie rysuje 3D.** AI tylko *odczytuje szkic* i zwraca dane (JSON). Geometrię 3D generuje
**deterministyczny kod** aplikacji z tych danych.

Uzasadnienie:
- ten sam JSON = zawsze ten sam model (powtarzalność, brak „halucynacji” w geometrii),
- JSON da się edytować ręcznie, wersjonować, wyliczyć z niego listę formatek (etap 2),
- błędy odczytu AI są widoczne i poprawialne na ekranie weryfikacji, zanim pójdą do klienta.

```
[zdjęcie szkicu] --(Claude vision + schemat)--> [JSON projektu] --(walidacja + korekta człowieka)-->
[JSON zatwierdzony] --(generator parametryczny)--> [scena 3D] --(materiały)--> [prezentacja]
```

---

## 3. Stos technologiczny (rekomendacja)

| Warstwa | Technologia | Dlaczego |
|---|---|---|
| Frontend | **React + TypeScript + Vite** | standard, dobre wsparcie Claude Code, typy łapią błędy |
| 3D | **Three.js przez React Three Fiber + @react-three/drei** | WebGL w przeglądarce, działa na telefonie bez instalacji |
| Stan | **Zustand** | prosty magazyn stanu projektu |
| Walidacja danych | **Zod** | jeden schemat = walidacja JSON od AI + typy TS |
| Forma dystrybucji | **PWA** (instalowalna strona) | jeden kod na Android/iOS/PC, link dla klienta |
| Backend (cienki) | **Cloudflare Workers** lub Node (Hono/Express) | ukrycie klucza API, wywołania Claude, przechowywanie projektów |
| AI | **Claude API — model z vision** (`claude-sonnet-5-5` domyślnie, `claude-opus-5-5` dla trudnych szkiców) | odczyt szkicu, wyjście przez *tool use* wymuszające schemat JSON |
| Magazyn | Cloudflare R2 / S3 (zdjęcia, tekstury) + KV/SQLite (projekty) | tanie, proste |

**Zasada bezpieczeństwa:** klucz API Claude NIGDY nie trafia do kodu frontendu. Frontend → backend → Claude.

---

## 4. Konwencje szkicu (analiza dostarczonego przykładu)

Przykładowy szkic zawiera:
- **dwa widoki ścian (elewacje)** zabudowy kuchennej, narysowane **obrócone o 90°** (tekst czytany bokiem),
- **rzut z góry** (prawy górny róg) — układ w kształcie **L**, wymiary ok. 386,5 cm i 170,5 cm,
- **łańcuchy wymiarowe w cm** (np. szerokości modułów 34 / 60 / 60 / 45 / 80 …, wysokości 90 / 85 / 100),
- wymiary sumaryczne (366, 386,5, 170,5),
- strefy **„murek”** (przeszkoda budowlana pod/za zabudową, ok. 21 cm),
- pola **kreskowane** (znaczenie niejednoznaczne: witryna/szkło, półka otwarta, okap, blenda — AI MUSI zapytać),
- symbole: płyta grzewcza (kółka), zlew, uchwyty, podział frontów na szuflady/drzwi, lodówka/słupek.

Wymagania dla modułu odczytu:
1. Wykryj orientację tekstu i obrót kartki; obsłuż szkic obrócony o 90/180/270°.
2. Odróżnij widok ściany od rzutu; przypisz każdą elewację do ściany z rzutu (A, B, C…).
3. **Kontrola sum łańcuchów wymiarowych**: suma segmentów vs wymiar całkowity vs wymiar pomieszczenia
   podany przez użytkownika. Każda rozbieżność → ostrzeżenie z wartościami (nie „cicha” korekta).
4. Każdy element ma pole `confidence` (0–1). Elementy < 0,7 podświetlone na ekranie weryfikacji.
5. Symbole niejednoznaczne → lista `questions[]` do użytkownika, zamiast zgadywania.
6. Domyślne jednostki szkicu: cm; wewnętrznie aplikacja liczy w **mm** (liczby całkowite).

Aplikacja ma mieć ekran „Legenda symboli” (edytowalny), który jest dołączany do promptu AI —
stolarz może zdefiniować własne konwencje (np. „kreskowanie = szkło”).

---

## 5. Model danych (JSON projektu) — rdzeń aplikacji

Zdefiniuj w Zod (`src/model/schema.ts`). Szkic struktury:

```ts
Project {
  id, name, client?, createdAt, version
  units: "mm"
  room: {
    width, depth, height            // podane przez użytkownika
    walls: Wall[]                   // A, B, C, D z długością i kolejnością
    obstacles: Obstacle[]           // murek, okno, drzwi, pion, grzejnik: ściana, x, y, w, h, d
  }
  runs: Run[]                       // ciągi zabudowy przy ścianie
  materials: MaterialAssignment[]   // przypisania materiałów do grup/elementów
  sourceSketch?: { imageUrl, aiModel, aiRawJson, warnings[], questions[] }
}

Run {
  id, wallId, startOffset           // odległość od narożnika
  layers: {
    base?:  Cabinet[]               // szafki dolne
    tall?:  Cabinet[]               // słupki
    wall?:  Cabinet[]               // szafki górne
  }
  worktop?: { thickness, overhangFront, material, cutouts[] }   // zlew, płyta
  plinthHeight, ceilingGap?
}

Cabinet {
  id, type: "base"|"wall"|"tall"|"corner"|"appliance"|"open"|"filler"
  width, height, depth, elevation   // elevation = wysokość dolnej krawędzi od podłogi
  carcass: { boardThickness: 18, backThickness: 3|8|18 }
  fronts: Front[]                   // podział na drzwi/szuflady/klapy
  appliance?: "hob"|"oven"|"fridge"|"dishwasher"|"sink"|"hood"|"microwave"
  handle?: { type: "bar"|"knob"|"none"|"gola"|"push", position }
  confidence?: number
}

Front {
  id, kind: "door-left"|"door-right"|"drawer"|"flap-up"|"glass"|"blind"
  x, y, width, height               // względem korpusu
  style: FrontStyleId               // np. "flat", "shaker", "frame-panel-raised", "frame-oak"
  materialId
}
```

Zasady:
- **jedno źródło prawdy** = ten JSON; scena 3D to tylko jego wizualizacja,
- każda zmiana (UI lub AI) przechodzi przez walidację Zod,
- historia zmian (undo/redo) na poziomie JSON,
- wersjonowanie schematu (`version`) + migracje — projekty mają się otwierać po aktualizacji aplikacji.

---

## 6. Moduł AI — odczyt szkicu

**Endpoint backendu:** `POST /api/parse-sketch` (zdjęcie + wymiary pokoju + legenda).

Wymagania:
1. Wstępne przetworzenie zdjęcia po stronie klienta: korekcja perspektywy (wykrycie kartki),
   kontrast, kompresja do rozsądnego rozmiaru (dłuższy bok ok. 2000 px). Zachowaj oryginał.
2. Wywołanie Claude z **tool use**: zdefiniuj narzędzie `submit_furniture_layout` ze schematem JSON
   generowanym z Zod (`zod-to-json-schema`). Wymuś użycie narzędzia — to gwarantuje strukturę odpowiedzi.
3. Prompt systemowy zawiera: rolę (projektant-stolarz), konwencje z sekcji 4, legendę użytkownika,
   wymiary pokoju, normy domyślne z sekcji 8, polecenie: *„Nie zgaduj — niejasności zgłaszaj w questions[]”*.
4. Po odpowiedzi: walidacja Zod → kontrole geometryczne (sekcja 9) → ekran weryfikacji.
5. Możliwość **dialogu korygującego**: użytkownik pisze np. „szafka 45 to zmywarka, kreskowanie to szkło”
   → kolejne wywołanie AI z aktualnym JSON + uwagą → nowy JSON (diff pokazany na ekranie).
6. Logowanie: zapisz surową odpowiedź AI, model, czas, koszt (tokeny) — do późniejszego strojenia promptu.
7. Zestaw testowy: folder `test-sketches/` z przykładami + oczekiwanym JSON; skrypt porównujący
   (regresja jakości odczytu po zmianie promptu/modelu).

Wybór modelu, limity i ceny API **zweryfikować w aktualnej dokumentacji**: https://docs.claude.com

---

## 7. Generator 3D (parametryczny)

1. Każdy typ szafki = funkcja `buildCabinet(cabinet, materials) → Group` w Three.js.
   Korpus z rzeczywistych płyt (boki, wieniec, dno, plecy, półki) o realnej grubości — nie jeden „klocek”.
2. **Fronty mają geometrię zależną od stylu**, a nie tylko teksturę:
   - `flat` — płyta z zaokrągloną krawędzią,
   - `shaker` (frezowany MDF, jak próbka biała i czarna) — rama + zagłębiona płycina, parametry: szerokość ramy, głębokość frezu, profil,
   - `frame-panel` (ramiakowy, lity/fornirowany dąb, jak próbki Wiech DIMARC OL73 i ciemny dąb) — osobne ramiaki z kierunkiem usłojenia (pion na stojakach, poziom na poprzeczkach!) + płycina.
   Kierunek usłojenia tekstury MUSI być zgodny z kierunkiem elementu — to pierwsze, co klient i stolarz zauważą.
3. Szczeliny między frontami (domyślnie 2–3 mm, parametr), cokół, blat z wycięciami, uchwyty.
4. Uproszczone bryły AGD (płyta, piekarnik, lodówka, okap, zlew) — biblioteka GLB do podmiany.
5. Ściany pomieszczenia półprzezroczyste / wyłączalne, podłoga, „murki” i przeszkody z sekcji 5.
6. Kamera: orbit (obrót, zoom, pan), presety: „front ściany A/B”, „izometria”, „wzrok człowieka (160 cm)”.
7. Wydajność na telefonie: instancjonowanie powtarzalnych elementów, tekstury max 2048 px (KTX2/Basis),
   cel ≥ 30 FPS na średnim telefonie z Androidem.
8. Wymiarowanie w 3D (opcjonalnie włączane): łańcuchy wymiarowe na widoku frontowym.

---

## 8. Wartości domyślne i normy (do weryfikacji przez użytkownika)

Wymiary koordynacyjne mebli kuchennych i AGD określa norma **PN-EN 1116:2018** (EN 1116:2018,
aktualna wg katalogów norm). Aplikacja używa wartości domyślnych **tylko gdy szkic ich nie podaje**
i zawsze oznacza je jako „domyślne”, nie „odczytane”. Konkretne wartości liczbowe z normy
**do wprowadzenia z jej aktualnego egzemplarza** (zakup przez PKN) — nie z pamięci AI.

Robocze wartości startowe (typowe w branży, edytowalne w ustawieniach):
- głębokość szafki dolnej / blatu: 560–600 / 600–620 mm,
- wysokość blatu: z rysunku lub ustawień (typowo 850–950 mm),
- głębokość szafki górnej: 300–350 mm,
- grubość płyty korpusu: 18 mm, plecy HDF 3 mm,
- odległość szafek górnych nad płytą grzewczą / okap: **wg instrukcji producenta AGD** (aplikacja tylko ostrzega).

Bezpieczeństwo mebli (stateczność, mocowanie słupków) — EN 14749 — poza zakresem wizualizacji,
ale aplikacja może dodawać przypomnienie o kotwieniu wysokich szafek.

---

## 9. Walidacja geometryczna (automatyczna, przed generowaniem 3D)

Lista kontroli (każda z komunikatem po polsku, z wartościami):
- suma szerokości modułów w ciągu ≤ długość ściany (z uwzględnieniem narożnika i przeszkód),
- wysokość zabudowy ≤ wysokość pomieszczenia (z zapasem na montaż, parametr, np. 10 mm),
- kolizje szafek ze sobą, z oknami, drzwiami, „murkami”,
- narożnik L: brak podwójnego liczenia głębokości w narożu,
- AGD w szafce o niepasującej szerokości (np. zmywarka ≠ 450/600),
- fronty wychodzą poza korpus / nakładają się,
- rozbieżności sum łańcuchów wymiarowych ze szkicu (z sekcji 4).

Błędy blokują eksport do klienta; ostrzeżenia nie blokują, ale są widoczne.

---

## 10. Materiały i wzorniki

**Struktura biblioteki** (`/materials/*.json` + tekstury):
```ts
Material {
  id, name, manufacturer?, code?          // np. "Wiech", "DIMARC OL73"
  category: "laminate"|"lacquer"|"veneer"|"solid-wood"|"acrylic"|"glass"|"stone"|"metal"
  finish: "matt"|"satin"|"gloss"|"structured"
  pbr: { baseColor | albedoMap, normalMap?, roughness | roughnessMap, metalness }
  grain?: { direction: "length"|"width"|"none", scaleMm }
  allowedFor: ("front"|"carcass"|"worktop"|"side"|"plinth")[]
  frontStyles?: FrontStyleId[]           // np. lakier → shaker/flat; lity dąb → frame-panel
  priceGroup?
}
```

Zasady:
1. Tapnięcie elementu → panel: **rodzaj materiału → styl frontu → dekor/kolor → wykończenie**.
   Niedozwolone kombinacje wyszarzone (np. ramiak z laminatu).
2. Zmiana „dla elementu / dla wszystkich frontów / dla grupy (dół, góra, słupki)”.
3. Paleta lakierów: wpis kodu RAL/NCS → kolor; mat/połysk przez parametr roughness.
4. **Zdjęcie próbki ≠ tekstura.** Zdjęcia próbek z telefonu (jak dołączone) mają odblaski, perspektywę
   i nie są „bezszwowe”. Do realistycznego renderu potrzebne są tekstury kaflowane (seamless) + mapy PBR.
   Źródła do wdrożenia: pliki dekorów udostępniane przez producentów płyt (sprawdzić licencję każdego),
   własne skany płaskie, lub narzędzie w aplikacji „zrób teksturę z próbki” (prostowanie + wycięcie + kafelkowanie) — etap późniejszy.
5. Licencje tekstur producentów: przed publikacją sprawdzić warunki użycia dla każdego dostawcy.

---

## 11. Udostępnianie klientowi i eksport

- link „tylko podgląd + zmiana kolorów z dozwolonej listy” (bez edycji wymiarów),
- klient zaznacza wybrany wariant → stolarz dostaje powiadomienie,
- eksport: PNG z presetów kamery, PDF prezentacji (widoki + lista materiałów + logo stolarza),
- etap 2: **lista formatek** (rozkrój: wymiary płyt, okleinowanie krawędzi, materiał) → CSV/XLSX
  do programu optymalizacji rozkroju; zestawienie okuć. To jest największa wartość biznesowa dla stolarza po wizualizacji.

---

## 12. Plan realizacji (etapy z kryteriami akceptacji)

| Etap | Zakres | Kryterium „gotowe” |
|---|---|---|
| **0** | Repo, Vite+React+TS, ESLint/Prettier, Zod-schema z sekcji 5, testy jednostkowe (Vitest) | `npm run dev` działa, schemat przechodzi testy |
| **1** | Generator 3D z **ręcznie wpisanego JSON** (przykład: kuchnia L ze szkicu) | obrót/zoom na telefonie, korpusy z płyt, fronty flat |
| **2** | Style frontów shaker + frame-panel, materiały PBR, panel po tapnięciu | zmiana materiału elementu/grupy w < 1 s |
| **3** | Walidacja geometryczna (sekcja 9) + ekran ostrzeżeń | testy z celowo błędnymi JSON |
| **4** | Backend + Claude vision + tool use → JSON + ekran weryfikacji | przykładowy szkic odczytany, rozbieżności zgłoszone |
| **5** | Dialog korygujący z AI, legenda symboli, zestaw testowych szkiców | regresja jakości odczytu w skrypcie |
| **6** | Zapis projektów, warianty, link dla klienta, eksport PNG/PDF | klient otwiera link na telefonie |
| **7** | Lista formatek / eksport rozkroju, biblioteka wzorników producentów | CSV zgodny z wybranym programem rozkroju |

Etapy 1–3 celowo **bez AI** — najpierw solidny model danych i 3D; AI dokładamy do działającego rdzenia.

---

## 13. Ryzyka i otwarte pytania (do decyzji przed etapem 4)

1. **Jakość odczytu odręcznych szkiców** — główne ryzyko projektu. Mitigacja: weryfikacja człowieka,
   pytania AI, kontrola sum, zestaw testowy. Nie obiecywać klientom „automatu bez poprawek”.
2. **Koszt API** na jeden szkic (z dialogiem korygującym) — zmierzyć w etapie 4, zanim powstanie model cenowy.
3. **Prywatność**: zdjęcia z mieszkań klientów → RODO (informacja dla klienta, okres przechowywania, usuwanie).
4. Odbiorca: tylko własny warsztat czy produkt dla wielu stolarzy (SaaS)? Wpływa na konta, multi-tenant, płatności.
5. Konkurencja: istnieją programy do projektowania mebli z wizualizacją i rozkrojem — przed etapem 6
   zrobić porównanie, co wyróżnia tę aplikację (szybkość od szkicu do linku dla klienta).
6. Licencje tekstur producentów (sekcja 10).

---

## 14. Zasady pracy dla Claude Code (skopiuj do `CLAUDE.md`)

- Pracuj etapami z sekcji 12; po każdym etapie: podsumowanie, jak uruchomić, co przetestować, pytania.
- Użytkownik **nie jest programistą** i chce się uczyć IT: przy każdej nowej koncepcji (komponent React,
  stan, WebGL, API, schemat, PBR) dodaj 2–4 zdania wyjaśnienia „co to jest i po co tu jest”.
- Komentarze w kodzie po polsku przy logice biznesowej (meble, wymiary), nazwy w kodzie po angielsku.
- Jednostki wewnętrzne: mm, liczby całkowite. Konwersja tylko na wejściu/wyjściu.
- Żadnych sekretów w repo (`.env` w `.gitignore`).
- Każda funkcja geometryczna ma test jednostkowy z liczbami (np. szafka 600 → boki, wieniec, plecy).
- Nie dodawaj zależności bez uzasadnienia w jednym zdaniu.
- Wątpliwość co do wymagań → zapytaj, nie zgaduj.

---

## Załącznik A — przykładowe próbki frontów (od użytkownika)

1. Biały, MDF frezowany typu shaker (rama + płycina z profilem), lakier mat/satyna.
2. Dąb naturalny, ramiakowy z płyciną — **Wiech, wzór DIMARC, kolor OL 73**.
3. Czarny/antracytowy, MDF frezowany shaker, lakier mat.
4. Dąb bejcowany ciemny brąz, ramiakowy z płaską płyciną.

Wniosek dla implementacji: od pierwszego dnia potrzebne są **dwa parametryczne style frontów**
(shaker MDF i frame-panel drewno), nie tylko płaskie fronty z teksturą.
