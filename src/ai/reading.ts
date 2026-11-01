/**
 * Format odczytu szkicu przez AI („SketchReading”) — POŚREDNI, prostszy niż JSON projektu.
 *
 * Dlaczego osobny format? Czat AI (Claude, ChatGPT) lepiej wypełnia krótki opis „jak na szkicu”
 * (centymetry, kolejność szafek wzdłuż ściany) niż pełny model 3D. Geometrię i wartości domyślne
 * dolicza deterministycznie aplikacja (convert.ts) — zgodnie z SPEC sekcja 2: „AI nie rysuje 3D”.
 *
 * Walidacja jest łagodna, bo różne czaty AI (Claude, ChatGPT…) piszą ten sam format trochę inaczej:
 *  - liczby jako tekst („60,5”, "60") → 60.5 / 60,
 *  - znane synonimy (np. warstwa łańcucha "base" → "floor", typ "upper" → "wall") → wartość kanoniczna,
 *  - wymiar nieodczytany (null) → zostaje null i jest podświetlony do uzupełnienia na ekranie weryfikacji.
 * Nieznane wartości (bez synonimu) nadal są błędem — aplikacja nie zgaduje.
 */
import { z } from 'zod'

const num = z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v), z.number().finite())
const numPos = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v),
  z.number().finite().positive(),
)
const optNum = z.preprocess((v) => (v === '' || v === undefined ? null : v), num.nullable()).default(null)
/** Dodatni wymiar albo null (= nieodczytany, do uzupełnienia przez stolarza). */
const optPos = z.preprocess(
  (v) => (v === '' || v === undefined ? null : typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v),
  z.number().finite().positive().nullable(),
)

/**
 * Enum z synonimami: wartość jest normalizowana (małe litery, bez spacji/myślników) i tłumaczona przez słownik.
 * Przykład: chainLayer("Base") → "floor".
 */
function synonymEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  synonyms: Record<string, T[number]>,
  /** Wartość zastępcza dla nieznanych wartości — tylko tam, gdzie pomyłka jest nieszkodliwa. */
  fallback?: T[number],
) {
  return z.preprocess((v) => {
    if (typeof v !== 'string') return v
    const k = v
      .toLowerCase()
      .trim()
      .replace(/[\s_-]+/g, '')
    const direct = values.find((x) => x.toLowerCase().replace(/[\s_-]+/g, '') === k)
    return direct ?? synonyms[k] ?? fallback ?? v
  }, z.enum(values))
}

const CABINET_TYPE = synonymEnum(['base', 'corner', 'tall', 'wall', 'open', 'filler', 'gap', 'appliance'] as const, {
  lower: 'base',
  bottom: 'base',
  dolna: 'base',
  sink: 'base',
  drawer: 'base',
  upper: 'wall',
  top: 'wall',
  hanging: 'wall',
  gorna: 'wall',
  górna: 'wall',
  wallcabinet: 'wall',
  column: 'tall',
  pantry: 'tall',
  slupek: 'tall',
  słupek: 'tall',
  fridge: 'tall',
  blind: 'filler',
  blenda: 'filler',
  panel: 'filler',
  space: 'gap',
  empty: 'gap',
  przerwa: 'gap',
  shelf: 'open',
  hood: 'appliance',
  okap: 'appliance',
})

const FRONT_KIND = synonymEnum(['door', 'doors2', 'drawers', 'flap', 'glass', 'none'] as const, {
  doors: 'doors2',
  doubledoor: 'doors2',
  door2: 'doors2',
  '2doors': 'doors2',
  drawer: 'drawers',
  szuflady: 'drawers',
  lift: 'flap',
  liftup: 'flap',
  klapa: 'flap',
  witryna: 'glass',
  glassdoor: 'glass',
  open: 'none',
  brak: 'none',
})

const APPLIANCE = synonymEnum(['hob', 'oven', 'fridge', 'dishwasher', 'sink', 'hood', 'microwave'] as const, {
  cooktop: 'hob',
  induction: 'hob',
  plyta: 'hob',
  płyta: 'hob',
  refrigerator: 'fridge',
  lodowka: 'fridge',
  lodówka: 'fridge',
  fridgefreezer: 'fridge',
  zmywarka: 'dishwasher',
  zlew: 'sink',
  extractor: 'hood',
  okap: 'hood',
  piekarnik: 'oven',
  mikrofala: 'microwave',
})

const OBSTACLE_KIND = synonymEnum(['murek', 'window', 'door', 'pipe', 'radiator', 'other'] as const, {
  wall: 'murek',
  wallstub: 'murek',
  pillar: 'murek',
  column: 'murek',
  okno: 'window',
  drzwi: 'door',
  pion: 'pipe',
  riser: 'pipe',
  grzejnik: 'radiator',
  heater: 'radiator',
})

const CHAIN_LAYER = synonymEnum(
  ['floor', 'upper', 'overall'] as const,
  {
    base: 'floor',
    lower: 'floor',
    bottom: 'floor',
    dolne: 'floor',
    wall: 'upper',
    top: 'upper',
    gorne: 'upper',
    górne: 'upper',
    total: 'overall',
    room: 'overall',
    plan: 'overall',
    wallsegment: 'overall',
    całość: 'overall',
    calosc: 'overall',
  },
  // Łańcuch służy wyłącznie do kontroli sum — nieznana warstwa (np. "front", "elevation") liczy się jako „całość”.
  'overall',
)

export const ReadingWall = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.enum(['A', 'B', 'C', 'D']),
)

export const ReadingCabinet = z.object({
  label: z.string().optional(),
  type: CABINET_TYPE,
  /** null = szerokość nieczytelna na szkicu — stolarz musi ją uzupełnić na ekranie weryfikacji. */
  width_cm: optPos,
  /** Wysokość KORPUSU, jeśli podana wprost na szkicu; inaczej null (aplikacja przyjmie domyślną). */
  height_cm: optNum,
  depth_cm: optNum,
  fronts: z.preprocess(
    (v) => (v === null || v === undefined ? { kind: 'door' } : v),
    z.object({
      kind: FRONT_KIND,
      count: z.preprocess(
        (v) => (v === null ? undefined : typeof v === 'string' ? Number(v) : v),
        z.number().int().positive().optional(),
      ),
      heights_cm: z.preprocess((v) => (v === null ? undefined : v), z.array(numPos).optional()),
    }),
  ),
  appliance: z.preprocess((v) => (v === '' || v === 'none' ? null : v), APPLIANCE.nullable()).default(null),
  /** Płyta grzewcza w blacie nad tą szafką (np. szafka z piekarnikiem). */
  hob_above: z.preprocess((v) => (v === null ? false : v), z.boolean()).default(false),
  confidence: z.preprocess((v) => (v === null || v === undefined ? 0.5 : v), num.pipe(z.number().min(0).max(1))),
  note: z.string().optional(),
})

export const ReadingRun = z.object({
  wall: ReadingWall,
  start_offset_cm: num.default(0),
  /** Wysokość górnej powierzchni blatu od podłogi, jeśli podana. */
  worktop_height_cm: optNum,
  /** Wysokość dolnej krawędzi szafek górnych od podłogi, jeśli podana. */
  upper_bottom_cm: optNum,
  /** Szafki stojące na podłodze (dolne i słupki) w kolejności od lewego narożnika ściany. */
  floor: z.array(ReadingCabinet).default([]),
  /** Szafki wiszące (górne, okap) w kolejności od lewego narożnika ściany; przerwy jako type "gap". */
  upper: z.array(ReadingCabinet).default([]),
})

export const SketchReading = z.object({
  sketch_summary: z.string().default(''),
  room: z
    .object({ width_cm: optNum, depth_cm: optNum, height_cm: optNum })
    .default({ width_cm: null, depth_cm: null, height_cm: null }),
  runs: z.array(ReadingRun).min(1, 'Odczyt nie zawiera żadnego ciągu szafek.'),
  obstacles: z
    .array(
      z.object({
        kind: OBSTACLE_KIND,
        wall: ReadingWall,
        // null = wymiar nieodczytany: x/y → 0, w → przeszkoda pominięta, h → do sufitu, d → 0 (z ostrzeżeniem).
        x_cm: optNum,
        y_cm: optNum,
        w_cm: optPos.default(null),
        h_cm: optPos.default(null),
        d_cm: optNum,
        label: z.string().optional(),
      }),
    )
    .default([]),
  dimension_chains: z
    .array(
      z.object({
        wall: ReadingWall,
        layer: CHAIN_LAYER,
        segments_cm: z
          .preprocess((v) => (Array.isArray(v) ? v.filter((x) => x !== null) : v), z.array(num))
          .default([]),
        total_cm: optNum,
      }),
    )
    .default([]),
  warnings: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((v) => v ?? []),
  questions: z
    .array(z.string())
    .nullable()
    .default([])
    .transform((v) => v ?? []),
})

/** Szafki z nieodczytaną szerokością — blokują utworzenie projektu, dopóki stolarz ich nie uzupełni. */
export function missingWidths(r: SketchReadingT): string[] {
  const out: string[] = []
  r.runs.forEach((run) =>
    (['floor', 'upper'] as const).forEach((list) =>
      run[list].forEach((c, i) => {
        if (c.width_cm === null)
          out.push(
            `Ściana ${run.wall}, ${list === 'floor' ? 'szafki stojące' : 'szafki wiszące'} #${i + 1}${c.label ? ` (${c.label})` : ''}`,
          )
      }),
    ),
  )
  return out
}

export type SketchReadingT = z.infer<typeof SketchReading>
export type ReadingCabinetT = z.infer<typeof ReadingCabinet>
export type ReadingRunT = z.infer<typeof ReadingRun>

/**
 * Wyciąga JSON z odpowiedzi czatu AI: blok ```json … ```, a jeśli go nie ma — tekst od pierwszego „{” do ostatniego „}”.
 */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  if (!candidate.trim()) throw new Error('Nie znaleziono JSON w odpowiedzi. Skopiuj całą odpowiedź AI.')
  try {
    return JSON.parse(candidate)
  } catch (e) {
    throw new Error('JSON w odpowiedzi jest uszkodzony (' + (e as Error).message + '). Poproś AI o poprawny JSON.')
  }
}

export function parseReading(text: string): { ok: true; reading: SketchReadingT } | { ok: false; errors: string[] } {
  let raw: unknown
  try {
    raw = extractJson(text)
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] }
  }
  const r = SketchReading.safeParse(raw)
  if (r.success) return { ok: true, reading: r.data }
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.') || '(całość)'}: ${i.message}${hint(i.path)}`),
  }
}

/** Podpowiedź po polsku do błędu (co zrobić). */
function hint(path: PropertyKey[]): string {
  const last = String(path[path.length - 1] ?? '')
  if (['type', 'kind', 'layer', 'appliance'].includes(last))
    return ' — wartość spoza listy; poproś AI o użycie wartości z formatu.'
  return ''
}
