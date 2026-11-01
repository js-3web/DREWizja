/**
 * Edycja szafek z panelu (czyste funkcje → nowy projekt; dzięki temu działa cofnij/ponów).
 */
import { rebuildFronts } from '../geometry/fronts'
import type { CabinetT, FrontLayoutT, ProjectT } from './schema'

const LAYERS = ['base', 'tall', 'wall'] as const

export function findCabinet(p: ProjectT, id: string | null) {
  if (!id) return null
  for (const run of p.runs)
    for (const layer of LAYERS) {
      const cab = run.layers[layer]?.find((x) => x.id === id)
      if (cab) return { cab, run, layer }
    }
  return null
}

function mapOne(p: ProjectT, id: string, fn: (c: CabinetT) => CabinetT | null): ProjectT {
  return {
    ...p,
    runs: p.runs.map((r) => {
      const layers = { ...r.layers }
      for (const layer of LAYERS) {
        const list = r.layers[layer]
        if (!list?.some((c) => c.id === id)) continue
        layers[layer] = list.map((c) => (c.id === id ? fn(c) : c)).filter((c): c is CabinetT => c !== null)
      }
      return { ...r, layers }
    }),
  }
}

/**
 * Zmiana wymiarów szafki. Fronty są odtwarzane z przepisu (layout), więc szuflady i drzwi dopasują się same.
 * Szafka bez przepisu (np. wczytana z ręcznego JSON) — fronty skalowane proporcjonalnie.
 */
export function updateCabinetDims(
  p: ProjectT,
  id: string,
  dims: Partial<Pick<CabinetT, 'width' | 'height' | 'depth' | 'elevation'>>,
  gap: number,
): ProjectT {
  return mapOne(p, id, (c) => {
    const next = { ...c, ...dims }
    if (next.layout) return { ...next, fronts: rebuildFronts(next, gap) }
    const kx = next.width / c.width
    const ky = next.height / c.height
    return {
      ...next,
      fronts: c.fronts.map((f) => ({
        ...f,
        x: Math.round(f.x * kx),
        y: Math.round(f.y * ky),
        width: Math.round(f.width * kx),
        height: Math.round(f.height * ky),
      })),
    }
  })
}

export function setCabinetLayout(p: ProjectT, id: string, layout: FrontLayoutT, gap: number): ProjectT {
  return mapOne(p, id, (c) => {
    const next = { ...c, layout }
    // Gdy szafka nie miała frontów, rebuildFronts przyjmie styl/materiał domyślny z pierwszego frontu = brak → 'flat'.
    return { ...next, fronts: rebuildFronts(next, gap) }
  })
}

export function setCabinetAppliance(p: ProjectT, id: string, appliance: CabinetT['appliance']): ProjectT {
  return mapOne(p, id, (c) => ({ ...c, appliance }))
}

/** Usuwa szafkę; kolejne szafki w ciągu przesuwają się (ciąg jest ciągły). */
export function removeCabinet(p: ProjectT, id: string): ProjectT {
  return mapOne(p, id, () => null)
}
