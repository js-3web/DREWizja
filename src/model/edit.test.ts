import { describe, expect, it } from 'vitest'
import { MATERIAL_LIBRARY } from '../materials/library'
import { materialSummary, setCarcass, setFronts, setWorktop } from '../materials/assign'
import { findCabinet, removeCabinet, setCabinetLayout, updateCabinetDims } from './edit'
import { exampleProject } from './example'
import { validateProject } from './schema'

const mat = (id: string) => MATERIAL_LIBRARY.find((m) => m.id === id)!

describe('edycja szafki', () => {
  it('poszerzenie A-d2 z 600 do 800: fronty 797 mm, kolejne szafki przesunięte (ciąg ciągły)', () => {
    const p = updateCabinetDims(exampleProject(), 'A-d2', { width: 800 }, 3)
    const c = findCabinet(p, 'A-d2')!.cab
    expect(c.fronts.every((f) => f.width === 797)).toBe(true)
    expect(validateProject(p).ok).toBe(true)
  })
  it('zmiana układu frontów na 4 szuflady', () => {
    const p = setCabinetLayout(exampleProject(), 'A-d1', { kind: 'drawers', heights: [180, 180, 180, 180] }, 3)
    expect(findCabinet(p, 'A-d1')!.cab.fronts).toHaveLength(4)
  })
  it('usunięcie szafki', () => {
    const p = removeCabinet(exampleProject(), 'A-d1')
    expect(findCabinet(p, 'A-d1')).toBeNull()
  })
  it('oryginalny projekt się nie zmienia (niemutowalność → cofnij/ponów)', () => {
    const p0 = exampleProject()
    updateCabinetDims(p0, 'A-d2', { width: 800 }, 3)
    expect(findCabinet(p0, 'A-d2')!.cab.width).toBe(600)
  })
})

describe('materiały', () => {
  it('dąb lity na wszystkie fronty + styl ramiakowy', () => {
    const p = setFronts(
      exampleProject(),
      { kind: 'all' },
      { material: mat('dab-naturalny-ol73'), style: 'frame-panel' },
    )
    const fronts = p.runs
      .flatMap((r) => [...(r.layers.base ?? []), ...(r.layers.wall ?? []), ...(r.layers.tall ?? [])])
      .flatMap((c) => c.fronts)
    expect(fronts.every((f) => f.materialId === 'dab-naturalny-ol73' && f.style === 'frame-panel')).toBe(true)
    expect(p.materials.some((m) => m.id === 'dab-naturalny-ol73')).toBe(true)
  })
  it('ramiak z laminatu niedozwolony → front zostaje gładki', () => {
    const p = setFronts(
      exampleProject(),
      { kind: 'cabinet', id: 'A-d1' },
      { material: mat('carcass-white'), style: 'frame-panel' },
    )
    expect(findCabinet(p, 'A-d1')!.cab.fronts[0].style).toBe('flat')
  })
  it('tylko szafki górne → antracyt; dolne bez zmian', () => {
    const p = setFronts(exampleProject(), { kind: 'layer', layer: 'wall' }, { material: mat('lak-antracyt') })
    expect(findCabinet(p, 'A-g1')!.cab.fronts[0].materialId).toBe('lak-antracyt')
    expect(findCabinet(p, 'A-d1')!.cab.fronts[0].materialId).toBe('front-white-lacquer')
  })
  it('korpusy i blat + podsumowanie do PDF', () => {
    let p = setCarcass(exampleProject(), { kind: 'all' }, mat('lam-grafit'))
    p = setWorktop(p, mat('blat-kwarc-bialy'))
    const rows = materialSummary(p)
    expect(rows.find((r) => r.use === 'Blat')!.material!.id).toBe('blat-kwarc-bialy')
    expect(rows.find((r) => r.use === 'Korpusy')!.material!.id).toBe('lam-grafit')
  })
})
