/**
 * Format odczytu szkicu przez AI („SketchReading”) — POŚREDNI, prostszy niż JSON projektu.
 *
 * Dlaczego osobny format? Czat AI (Claude, ChatGPT) lepiej wypełnia krótki opis „jak na szkicu”
 * (centymetry, kolejność szafek wzdłuż ściany) niż pełny model 3D. Geometrię i wartości domyślne
 * dolicza deterministycznie aplikacja (convert.ts) — zgodnie z SPEC sekcja 2: „AI nie rysuje 3D”.
 *
 * Walidacja jest łagodna dla liczb: „60,5” albo "60" (tekst) zostaną zamienione na 60.5 / 60.
 */
import { z } from 'zod'

const num = z.preprocess((v) => (typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v), z.number().finite())
const numPos = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v),
  z.number().finite().positive(),
)
const optNum = z.preprocess((v) => (v === '' || v === undefined ? null : v), num.nullable()).default(null)

export const ReadingWall = z.enum(['A', 'B', 'C', 'D'])

export const ReadingCabinet = z.object({
  label: z.string().optional(),
  type: z.enum(['base', 'corner', 'tall', 'wall', 'open', 'filler', 'gap', 'appliance']),
  width_cm: numPos,
  /** Wysokość KORPUSU, jeśli podana wprost na szkicu; inaczej null (aplikacja przyjmie domyślną). */
  height_cm: optNum,
  depth_cm: optNum,
  fronts: z
    .object({
      kind: z.enum(['door', 'doors2', 'drawers', 'flap', 'glass', 'none']),
      count: z.number().int().positive().optional(),
      heights_cm: z.array(numPos).optional(),
    })
    .default({ kind: 'door' }),
  appliance: z.enum(['hob', 'oven', 'fridge', 'dishwasher', 'sink', 'hood', 'microwave']).nullable().default(null),
  /** Płyta grzewcza w blacie nad tą szafką (np. szafka z piekarnikiem). */
  hob_above: z.boolean().default(false),
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
        kind: z.enum(['murek', 'window', 'door', 'pipe', 'radiator', 'other']),
        wall: ReadingWall,
        x_cm: num,
        y_cm: num.default(0),
        w_cm: numPos,
        h_cm: numPos,
        d_cm: num.default(0),
        label: z.string().optional(),
      }),
    )
    .default([]),
  dimension_chains: z
    .array(
      z.object({
        wall: ReadingWall,
        layer: z.enum(['floor', 'upper', 'overall']),
        segments_cm: z.array(num).default([]),
        total_cm: optNum,
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
})

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
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(całość)'}: ${i.message}`) }
}
