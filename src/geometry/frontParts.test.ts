import { describe, expect, it } from 'vitest'
import { effectiveFrame, frontParts } from './frontParts'
import { rebuildFronts, scaleHeights } from './fronts'
import type { CabinetT, FrontT } from '../model/schema'

const door = (style: FrontT['style'], w = 597, h = 717, kind: FrontT['kind'] = 'door-left'): FrontT => ({
  id: 'f',
  kind,
  x: 2,
  y: 2,
  width: w,
  height: h,
  style,
  materialId: 'm',
})

describe('frontParts — style frontów', () => {
  it('flat: jedna płyta 597 × 717 × 18', () => {
    const p = frontParts(door('flat'))
    expect(p).toHaveLength(1)
    expect([p[0].sx, p[0].sy, p[0].sz]).toEqual([597, 717, 18])
  })

  it('shaker 597 × 717: stojaki 70 × 717, poprzeczki 457 × 70, płycina 457 × 577 × 12 cofnięta o 6 mm', () => {
    const p = frontParts(door('shaker'))
    const stiles = p.filter((x) => x.role === 'stile')
    const rails = p.filter((x) => x.role === 'rail')
    const panel = p.find((x) => x.role === 'panel')!
    expect(stiles.map((s) => [s.sx, s.sy, s.sz])).toEqual([
      [70, 717, 18],
      [70, 717, 18],
    ])
    expect(rails.map((s) => [s.sx, s.sy])).toEqual([
      [457, 70],
      [457, 70],
    ])
    expect([panel.sx, panel.sy, panel.sz]).toEqual([457, 577, 12])
    expect(panel.cz + panel.sz / 2).toBe(12) // lico płyciny 6 mm za licem ramy (18)
  })

  it('ramiak: usłojenie stojaków pionowo, poprzeczek poziomo', () => {
    const p = frontParts(door('frame-panel'))
    expect(p.filter((x) => x.role === 'stile').every((x) => x.grain === 'vertical')).toBe(true)
    expect(p.filter((x) => x.role === 'rail').every((x) => x.grain === 'horizontal')).toBe(true)
    expect(p.find((x) => x.role === 'stile')!.sx).toBe(80)
  })

  it('rama + płycina pokrywają dokładnie obrys frontu (pole powierzchni)', () => {
    const p = frontParts(door('frame-panel'))
    const area = p.reduce((s, x) => s + x.sx * x.sy, 0)
    expect(area).toBe(597 * 717)
  })

  it('niska szuflada 597 × 157 (shaker): rama zwężona do 48 mm', () => {
    expect(effectiveFrame(597, 157, 70)).toBe(48)
    const p = frontParts(door('shaker', 597, 157, 'drawer'))
    expect(p.find((x) => x.role === 'stile')!.sx).toBe(48)
  })

  it('bardzo wąski front 52 mm (blenda) → płaska płyta zamiast ramy', () => {
    const p = frontParts(door('shaker', 52, 2067))
    expect(p).toHaveLength(1)
    expect(p[0].role).toBe('slab')
  })

  it('płaska szuflada z drewna ma usłojenie poziome', () => {
    expect(frontParts(door('flat', 597, 297, 'drawer'))[0].grain).toBe('horizontal')
  })
})

describe('rebuildFronts — zmiana wymiarów szafki', () => {
  const cab: CabinetT = {
    id: 'c',
    type: 'base',
    width: 600,
    height: 720,
    depth: 560,
    elevation: 100,
    carcass: { boardThickness: 18, backThickness: 3 },
    fronts: [door('shaker')],
    layout: { kind: 'drawers', heights: [300, 260, 160] },
  }
  it('szafka poszerzona do 800 → fronty 797 mm, styl zachowany', () => {
    const fs = rebuildFronts({ ...cab, width: 800 })
    expect(fs.every((f) => f.width === 797 && f.style === 'shaker')).toBe(true)
  })
  it('wysokość 720 → 760: szuflady skalowane, suma = 760', () => {
    expect(scaleHeights([300, 260, 160], 760).reduce((a, b) => a + b, 0)).toBe(760)
    const fs = rebuildFronts({ ...cab, height: 760 })
    expect(fs).toHaveLength(3)
  })
})
