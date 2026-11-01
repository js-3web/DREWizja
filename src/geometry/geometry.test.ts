import { describe, expect, it } from 'vitest'
import { carcassPanels } from './carcass'
import { makeFronts } from './fronts'
import { layerLength, placeRun, runOverflow, wallFrame } from './layout'
import { exampleProject } from '../model/example'
import type { CabinetT } from '../model/schema'

const base600: CabinetT = {
  id: 't1',
  type: 'base',
  width: 600,
  height: 720,
  depth: 560,
  elevation: 100,
  carcass: { boardThickness: 18, backThickness: 3 },
  fronts: [],
}

describe('carcassPanels — szafka dolna 600×720×560, płyta 18, plecy HDF 3', () => {
  const p = carcassPanels(base600)
  const byName = (n: string) => p.find((x) => x.name === n)!

  it('boki: 18 × 720 × 557 (głębokość minus plecy)', () => {
    for (const n of ['Bok lewy', 'Bok prawy']) {
      expect([byName(n).sx, byName(n).sy, byName(n).sz]).toEqual([18, 720, 557])
    }
    expect(byName('Bok lewy').cx).toBe(9)
    expect(byName('Bok prawy').cx).toBe(591)
  })
  it('dno wpuszczone między boki: 564 × 18 × 557', () => {
    expect([byName('Dno').sx, byName('Dno').sy, byName('Dno').sz]).toEqual([564, 18, 557])
  })
  it('dwa trawersy 564 × 18 × 100 zamiast wieńca górnego', () => {
    const rails = p.filter((x) => x.role === 'rail')
    expect(rails).toHaveLength(2)
    expect(rails.every((r) => r.sx === 564 && r.sy === 18 && r.sz === 100)).toBe(true)
    expect(p.some((x) => x.role === 'top')).toBe(false)
  })
  it('plecy 600 × 720 × 3 na tyle (z = 0..3)', () => {
    const b = byName('Plecy')
    expect([b.sx, b.sy, b.sz, b.cz]).toEqual([600, 720, 3, 1.5])
  })
  it('półka 564 × 18 × 537 (cofnięta 20 mm)', () => {
    const s = byName('Półka')
    expect([s.sx, s.sy, s.sz]).toEqual([564, 18, 537])
  })
  it('nic nie wystaje poza obrys szafki', () => {
    for (const x of p) {
      expect(x.cx - x.sx / 2).toBeGreaterThanOrEqual(0)
      expect(x.cx + x.sx / 2).toBeLessThanOrEqual(600)
      expect(x.cy + x.sy / 2).toBeLessThanOrEqual(720)
      expect(x.cz + x.sz / 2).toBeLessThanOrEqual(560)
    }
  })
})

describe('carcassPanels — szafka górna i AGD', () => {
  it('szafka górna ma wieniec górny, nie trawersy', () => {
    const p = carcassPanels({ ...base600, type: 'wall', height: 720, depth: 320 })
    expect(p.find((x) => x.role === 'top')?.sx).toBe(564)
    expect(p.some((x) => x.role === 'rail')).toBe(false)
  })
  it('szafka pod zmywarkę — bez półki', () => {
    const p = carcassPanels({ ...base600, width: 450, appliance: 'dishwasher' })
    expect(p.some((x) => x.role === 'shelf')).toBe(false)
  })
  it('blenda (filler) — brak korpusu', () => {
    expect(carcassPanels({ ...base600, type: 'filler', width: 55 })).toHaveLength(0)
  })
})

describe('makeFronts — szczelina 3 mm', () => {
  const o = { style: 'flat' as const, materialId: 'm' }
  it('jedne drzwi 600×720 → 597×717 przesunięte o 1,5 → zaokr. 2', () => {
    const [f] = makeFronts('x', 600, 720, { kind: 'door' }, o)
    expect([f.width, f.height]).toEqual([597, 717])
  })
  it('dwoje drzwi 800 → 2 × 397', () => {
    const fs = makeFronts('x', 800, 720, { kind: 'doors2' }, o)
    expect(fs.map((f) => f.width)).toEqual([397, 397])
    expect(fs[1].x - (fs[0].x + fs[0].width)).toBe(3) // szczelina między skrzydłami
  })
  it('szuflady 300/260/160 → wysokości frontów 297/257/157', () => {
    const fs = makeFronts('x', 600, 720, { kind: 'drawers', heights: [300, 260, 160] }, o)
    expect(fs.map((f) => f.height)).toEqual([297, 257, 157])
  })
  it('błędna suma szuflad → wyjątek z wartościami', () => {
    expect(() => makeFronts('x', 600, 720, { kind: 'drawers', heights: [300, 300] }, o)).toThrow(/600 mm.*720 mm/)
  })
})

describe('layout — kuchnia w L (przykład)', () => {
  const p = exampleProject()
  it('ściana B zaczyna się w prawym-górnym narożniku i biegnie w +z', () => {
    expect(wallFrame('B', p.room)).toMatchObject({ ox: 3865, oz: 0, dx: 0, dz: 1 })
  })
  it('ciąg A: 205 (murek) + 3660 = 3865 = długość ściany A', () => {
    const a = p.runs.find((r) => r.id === 'A1')!
    expect(layerLength(a, 'base')).toBe(3660)
    expect(a.startOffset + layerLength(a, 'base')).toBe(3865)
    expect(runOverflow(a, p.room)).toEqual([])
  })
  it('szafki dolne ciągu A stoją kolejno: pierwsza na x=205, druga na x=545', () => {
    const placed = placeRun(p.runs[0], p.room).filter((c) => c.layer === 'base')
    expect(placed[0].x).toBe(205)
    expect(placed[1].x).toBe(545)
  })
  it('ciąg za długi → komunikat z nadmiarem w mm', () => {
    const a = { ...p.runs[0], startOffset: 300 }
    expect(runOverflow(a, p.room)[0]).toMatch(/o 95 mm za dużo/)
  })
})
