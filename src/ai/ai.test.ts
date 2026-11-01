import { describe, expect, it } from 'vitest'
import { validateGeometry } from '../geometry/validate'
import { validateProject } from '../model/schema'
import { defaultSettings } from '../model/settings'
import { cmToMm, convertReading } from './convert'
import { buildCorrectionPrompt, buildReadingPrompt } from './prompt'
import { parseReading, type SketchReadingT } from './reading'

/** Odpowiedź AI w stylu czatu: tekst + blok ```json (liczby czasem jako tekst z przecinkiem). */
export const SAMPLE_AI_RESPONSE = `Oto odczyt szkicu:

\`\`\`json
{
  "sketch_summary": "Zabudowa w L na ścianach A i B",
  "room": { "width_cm": 386.5, "depth_cm": 300, "height_cm": 260 },
  "runs": [
    {
      "wall": "A", "start_offset_cm": 21, "worktop_height_cm": 90, "upper_bottom_cm": 145,
      "floor": [
        { "type": "base", "width_cm": 34, "height_cm": null, "depth_cm": null, "fronts": { "kind": "door" }, "appliance": null, "confidence": 0.9 },
        { "type": "base", "width_cm": 60, "fronts": { "kind": "drawers", "count": 3, "heights_cm": [30, 26, 16] }, "appliance": null, "confidence": 0.8 },
        { "type": "base", "width_cm": "60", "fronts": { "kind": "drawers", "count": 2 }, "appliance": "oven", "hob_above": true, "confidence": 0.85 },
        { "type": "base", "width_cm": 45, "fronts": { "kind": "door" }, "appliance": "dishwasher", "confidence": 0.6 },
        { "type": "base", "width_cm": 80, "fronts": { "kind": "doors2" }, "appliance": "sink", "confidence": 0.9 },
        { "type": "corner", "width_cm": "87", "fronts": { "kind": "door" }, "appliance": null, "confidence": 0.7 }
      ],
      "upper": [
        { "type": "wall", "width_cm": 34, "height_cm": 72, "fronts": { "kind": "door" }, "confidence": 0.9 },
        { "type": "wall", "width_cm": 60, "height_cm": 72, "fronts": { "kind": "doors2" }, "confidence": 0.9 },
        { "type": "appliance", "width_cm": 60, "fronts": { "kind": "flap" }, "appliance": "hood", "confidence": 0.5 },
        { "type": "gap", "width_cm": 45, "fronts": { "kind": "none" }, "confidence": 0.5, "note": "pole kreskowane" },
        { "type": "wall", "width_cm": 80, "height_cm": 72, "fronts": { "kind": "glass" }, "confidence": 0.6 },
        { "type": "wall", "width_cm": 87, "height_cm": 72, "fronts": { "kind": "door" }, "confidence": 0.8 }
      ]
    },
    {
      "wall": "B", "start_offset_cm": 60, "worktop_height_cm": 90,
      "floor": [
        { "type": "base", "width_cm": 45, "fronts": { "kind": "drawers", "count": 3 }, "confidence": 0.8 },
        { "type": "tall", "width_cm": 60, "fronts": { "kind": "drawers", "count": 2 }, "appliance": "fridge", "confidence": 0.7 },
        { "type": "filler", "width_cm": "5,5", "fronts": { "kind": "door" }, "confidence": 0.6 }
      ],
      "upper": []
    }
  ],
  "obstacles": [ { "kind": "murek", "wall": "A", "x_cm": 0, "y_cm": 0, "w_cm": 21, "h_cm": 90, "d_cm": 21, "label": "murek" } ],
  "dimension_chains": [
    { "wall": "A", "layer": "floor", "segments_cm": [34, 60, 60, 45, 80, 87], "total_cm": 366 },
    { "wall": "B", "layer": "overall", "segments_cm": [60, 45, 60, 5.5], "total_cm": 170.5 }
  ],
  "warnings": [],
  "questions": ["Pole kreskowane nad zmywarką: witryna, półka otwarta czy blenda?"]
}
\`\`\`
Daj znać, jeśli coś poprawić.`

const settings = defaultSettings()
const input = { id: 'p1', name: 'Test', roomMm: { width: 3865, depth: 3000, height: 2600 } }

function readSample(): SketchReadingT {
  const r = parseReading(SAMPLE_AI_RESPONSE)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.reading
}

describe('parseReading — odpowiedź czatu AI', () => {
  it('wyciąga JSON z bloku ```json i akceptuje liczby jako tekst („5,5”)', () => {
    const r = readSample()
    expect(r.runs).toHaveLength(2)
    expect(r.runs[1].floor[2].width_cm).toBe(5.5)
  })
  it('bez bloku ``` — bierze tekst od { do }', () => {
    const r = parseReading('bla {"runs":[{"wall":"A","floor":[{"type":"base","width_cm":60}]}]} koniec')
    expect(r.ok).toBe(true)
  })
  it('brak JSON → zrozumiały komunikat', () => {
    const r = parseReading('Nie widzę szkicu na zdjęciu.')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('Nie znaleziono JSON')
  })
  it('błędny typ szafki → błąd z ścieżką pola', () => {
    const r = parseReading('{"runs":[{"wall":"A","floor":[{"type":"szafa","width_cm":60}]}]}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('runs.0.floor.0.type')
  })
})

describe('convertReading — odczyt → projekt', () => {
  const res = convertReading(readSample(), input, settings)
  const p = res.project

  it('wynik przechodzi walidację schematu Zod', () => {
    const v = validateProject(p)
    if (!v.ok) console.error(v.errors)
    expect(v.ok).toBe(true)
  })
  it('cm → mm z zaokrągleniem do mm (386,5 → 3865, 5,5 → 55)', () => {
    expect(cmToMm(386.5)).toBe(3865)
    const filler = p.runs.flatMap((r) => r.layers.tall ?? []).find((c) => c.type === 'filler')!
    expect(filler.width).toBe(55)
  })
  it('wysokość korpusu dolnego z blatu 90 cm: 900 − 100 − 38 = 762 mm', () => {
    const a = p.runs.find((r) => r.wallId === 'A' && r.layers.base)!
    expect(a.layers.base![0].height).toBe(762)
  })
  it('ciąg A zaczyna się za murkiem (210 mm) i kończy na 3870 mm', () => {
    const a = p.runs.find((r) => r.wallId === 'A' && r.layers.base)!
    expect(a.startOffset).toBe(210)
    expect(a.startOffset + a.layers.base!.reduce((s, c) => s + c.width, 0)).toBe(3870)
  })
  it('ściana B: szafka dolna = ciąg z blatem, lodówka + blenda = osobny ciąg słupków bez blatu', () => {
    const b = p.runs.filter((r) => r.wallId === 'B')
    expect(b.map((r) => Object.keys(r.layers)[0])).toEqual(['base', 'tall'])
    expect(b[0].worktop).toBeDefined()
    expect(b[1].worktop).toBeUndefined()
    expect(b[1].startOffset).toBe(600 + 450)
  })
  it('przerwa (gap) w szafkach górnych dzieli je na dwa ciągi', () => {
    const upperRuns = p.runs.filter((r) => r.wallId === 'A' && r.layers.wall)
    expect(upperRuns.map((r) => r.startOffset)).toEqual([210, 210 + 340 + 600 + 600 + 450])
  })
  it('płyta nad piekarnikiem i zlew → wycięcia w blacie', () => {
    const a = p.runs.find((r) => r.wallId === 'A' && r.layers.base)!
    expect(a.worktop!.cutouts.map((c) => c.kind)).toEqual(['hob', 'sink'])
    expect(a.worktop!.cutouts[0].x).toBe(340 + 600 + 20)
  })
  it('szuflady 30/26/16 cm = 72 cm vs korpus 76,2 cm → przeskalowane + ostrzeżenie', () => {
    const c = p.runs.flatMap((r) => r.layers.base ?? []).find((x) => x.id === 'A-d2')!
    expect(c.fronts.reduce((s, f) => s + f.height + 3, 0)).toBe(762)
    expect(res.warnings.some((w) => w.includes('A-d2') && w.includes('72 cm'))).toBe(true)
  })
  it('witryna (glass) → fronty szklane', () => {
    const c = p.runs.flatMap((r) => r.layers.wall ?? []).find((x) => x.fronts.some((f) => f.kind === 'glass'))
    expect(c?.width).toBe(800)
  })
  it('kontrola sum: ciąg A 366 cm + start 21 cm > ściana 386,5 cm → ostrzeżenie z wartościami', () => {
    expect(res.warnings.some((w) => w.includes('Ściana A') && w.includes('387 cm'))).toBe(true)
  })
  it('walidacja geometrii wykrywa przekroczenie ściany A o 5 mm jako błąd', () => {
    const errs = validateGeometry(p).filter((i) => i.severity === 'error')
    expect(errs.some((e) => e.message.includes('o 5 mm za dużo'))).toBe(true)
  })
  it('pytania AI trafiają do projektu', () => {
    expect(p.sourceSketch?.questions).toHaveLength(1)
  })
  it('ten sam odczyt = ten sam projekt (determinizm, poza datami)', () => {
    const again = convertReading(readSample(), input, settings).project
    expect({ ...again, createdAt: '', updatedAt: '' }).toEqual({ ...p, createdAt: '', updatedAt: '' })
  })
})

describe('prompty', () => {
  it('prompt zawiera wymiary pokoju, legendę i format', () => {
    const t = buildReadingPrompt(
      { roomWidthCm: 386.5, roomDepthCm: 300, roomHeightCm: 260, notes: 'kuchnia w L' },
      settings,
    )
    expect(t).toContain('386.5 cm')
    expect(t).toContain('Pola kreskowane')
    expect(t).toContain('"dimension_chains"')
    expect(t).toContain('NIE ZGADUJ')
  })
  it('prompt korekty zawiera uwagi i aktualny JSON', () => {
    const t = buildCorrectionPrompt(readSample(), 'kreskowanie to szkło')
    expect(t).toContain('kreskowanie to szkło')
    expect(t).toContain('"wall": "A"')
  })
})

describe('tolerancja na odpowiedzi innych czatów AI (błędy zgłoszone z ChatGPT)', () => {
  // Odtworzenie zgłoszenia: width_cm null, przeszkoda bez h/d, nieznana nazwa warstwy łańcucha.
  const gpt = JSON.stringify({
    runs: [
      {
        wall: 'A',
        start_offset_cm: 0,
        floor: [{ type: 'base', width_cm: 60, fronts: { kind: 'door' }, confidence: 0.9 }],
      },
      {
        wall: 'b',
        start_offset_cm: 60,
        floor: [
          { type: 'lower', width_cm: 45, fronts: { kind: 'drawer', count: '3', heights_cm: null }, confidence: 0.8 },
          { type: 'base', width_cm: null, fronts: null, appliance: 'none', confidence: 0.3 },
          { type: 'column', width_cm: null, fronts: { kind: 'doors' }, appliance: 'refrigerator', confidence: 0.3 },
        ],
      },
    ],
    obstacles: [{ kind: 'murek', wall: 'A', x_cm: 0, y_cm: 0, w_cm: 21, h_cm: null, d_cm: null }],
    dimension_chains: [
      { wall: 'A', layer: 'base', segments_cm: [60], total_cm: 60 },
      { wall: 'B', layer: 'wall', segments_cm: [45, null], total_cm: null },
      { wall: 'A', layer: 'total', segments_cm: [], total_cm: 300 },
    ],
    warnings: null,
    questions: ['Szerokości szafek 2 i 3 na ścianie B nieczytelne'],
  })

  it('odczyt przechodzi walidację, synonimy przetłumaczone', () => {
    const r = parseReading(gpt)
    if (!r.ok) throw new Error(r.errors.join('\n'))
    const b = r.reading.runs[1]
    expect(b.wall).toBe('B')
    expect(b.floor.map((c) => c.type)).toEqual(['base', 'base', 'tall'])
    expect(b.floor[0].fronts).toMatchObject({ kind: 'drawers', count: 3 })
    expect(b.floor[1].fronts.kind).toBe('door')
    expect(b.floor[2].fronts.kind).toBe('doors2')
    expect(b.floor[2].appliance).toBe('fridge')
    expect(r.reading.dimension_chains.map((c) => c.layer)).toEqual(['floor', 'upper', 'overall'])
  })

  it('brakujące szerokości blokują utworzenie projektu z czytelnym komunikatem', () => {
    const r = parseReading(gpt)
    if (!r.ok) throw new Error()
    expect(() => convertReading(r.reading, input, settings)).toThrow(/Ściana B, szafki stojące #2.*#3/)
  })

  it('po uzupełnieniu szerokości: projekt powstaje, murek do sufitu bez głębokości → ostrzeżenia', () => {
    const r = parseReading(gpt)
    if (!r.ok) throw new Error()
    r.reading.runs[1].floor[1].width_cm = 60
    r.reading.runs[1].floor[2].width_cm = 60
    const res = convertReading(r.reading, input, settings)
    expect(validateProject(res.project).ok).toBe(true)
    const murek = res.project.room.obstacles[0]
    expect(murek.h).toBe(2600)
    expect(murek.d).toBe(0)
    expect(res.warnings.some((w) => w.includes('brak wysokości'))).toBe(true)
    expect(res.warnings.some((w) => w.includes('NIE będzie sprawdzana'))).toBe(true)
  })

  it('nieznana wartość bez synonimu nadal jest błędem (aplikacja nie zgaduje)', () => {
    const r = parseReading('{"runs":[{"wall":"A","floor":[{"type":"komoda","width_cm":60}]}]}')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('wartość spoza listy')
  })
})

describe('łańcuch wymiarowy z nieznaną nazwą warstwy', () => {
  it('nieznana warstwa (np. "elevation") → "overall" zamiast odrzucenia całego odczytu', () => {
    const r = parseReading(
      '{"runs":[{"wall":"A","floor":[{"type":"base","width_cm":60}]}],"dimension_chains":[{"wall":"A","layer":"elevation","segments_cm":[60],"total_cm":60}]}',
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.reading.dimension_chains[0].layer).toBe('overall')
  })
})
