import { describe, expect, it } from 'vitest'
import { exampleProject } from '../model/example'
import type { ProjectT } from '../model/schema'
import { hasBlockingErrors, validateGeometry } from './validate'

const codes = (p: ProjectT) => validateGeometry(p).map((i) => `${i.severity}:${i.code}`)

describe('validateGeometry — poprawny przykład', () => {
  it('przykładowa kuchnia w L: brak błędów, są tylko przypomnienia', () => {
    const issues = validateGeometry(exampleProject())
    expect(issues.filter((i) => i.severity !== 'info')).toEqual([])
    expect(issues.map((i) => i.code)).toContain('hob-clearance')
    expect(issues.map((i) => i.code)).toContain('anchor-tall')
  })
})

describe('validateGeometry — celowo błędne projekty', () => {
  it('ciąg dłuższy niż ściana → błąd z nadmiarem w mm', () => {
    const p = exampleProject()
    p.runs[0].startOffset = 300
    const i = validateGeometry(p).find((x) => x.code === 'run-overflow')!
    expect(i.severity).toBe('error')
    expect(i.message).toContain('o 95 mm za dużo')
  })

  it('szafka wyżej niż sufit − 10 mm → błąd', () => {
    const p = exampleProject()
    p.room.height = 2175 // szafki górne kończą się na 2170 mm, a limit = 2175 − 10 = 2165
    expect(codes(p)).toContain('error:too-high')
  })

  it('narożnik L bez przesunięcia ciągu B → kolizja (podwójne liczenie głębokości)', () => {
    const p = exampleProject()
    p.runs[1].startOffset = 0
    const i = validateGeometry(p).find((x) => x.code === 'collision')!
    expect(i.message).toContain('narożnik')
  })

  it('zmywarka 500 mm → ostrzeżenie (typowo 450 lub 600)', () => {
    const p = exampleProject()
    const dw = p.runs[0].layers.base!.find((c) => c.appliance === 'dishwasher')!
    dw.width = 500
    const i = validateGeometry(p).find((x) => x.code === 'appliance-width')!
    expect(i.severity).toBe('warning')
    expect(i.message).toContain('450 lub 600')
  })

  it('front wychodzący poza korpus → błąd', () => {
    const p = exampleProject()
    p.runs[0].layers.base![0].fronts[0].width = 400
    expect(codes(p)).toContain('error:front-outside')
  })

  it('nakładające się fronty → błąd', () => {
    const p = exampleProject()
    const f = p.runs[0].layers.base![1].fronts
    f[1].y = f[0].y + 10
    expect(codes(p)).toContain('error:front-overlap')
  })

  it('szafka wchodząca w murek → błąd', () => {
    const p = exampleProject()
    p.runs[0].startOffset = 100 // murek ma 205 mm
    expect(codes(p)).toContain('error:obstacle')
  })

  it('szafka górna zasłaniająca okno → ostrzeżenie', () => {
    const p = exampleProject()
    p.runs[1].layers.wall = [{ ...p.runs[0].layers.wall![0], id: 'B-g1', width: 900 }]
    p.runs[1].startOffset = 1500
    p.runs[1].layers.base = []
    expect(codes(p)).toContain('warning:opening')
  })

  it('niezgodna długość ściany w danych → ostrzeżenie, nie błąd', () => {
    const p = exampleProject()
    p.room.walls[0].length = 4000
    expect(codes(p)).toContain('warning:wall-length')
    expect(hasBlockingErrors(validateGeometry(p))).toBe(false)
  })
})
