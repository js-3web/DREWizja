/**
 * Automatyczny podział frontów z uwzględnieniem szczelin (SPEC sekcja 7.3).
 * Fronty są nakładane na korpus („nakładkowe”), więc zewnętrzny obrys = obrys korpusu minus pół szczeliny z każdej strony.
 */
import type { CabinetT, FrontLayoutT, FrontT } from '../model/schema'

export const DEFAULT_GAP = 3

export type FrontLayout = FrontLayoutT

export function makeFronts(
  idPrefix: string,
  width: number,
  height: number,
  layout: FrontLayout,
  opts: { style: FrontT['style']; materialId: string; gap?: number },
): FrontT[] {
  const g = opts.gap ?? DEFAULT_GAP
  const h = g / 2
  const base = { style: opts.style, materialId: opts.materialId }
  const r = (n: number) => Math.round(n)

  switch (layout.kind) {
    case 'none':
      return []
    case 'door':
      return [
        {
          id: `${idPrefix}-f1`,
          kind: 'door-left',
          x: r(h),
          y: r(h),
          width: r(width - g),
          height: r(height - g),
          ...base,
        },
      ]
    case 'flap':
      return [
        {
          id: `${idPrefix}-f1`,
          kind: 'flap-up',
          x: r(h),
          y: r(h),
          width: r(width - g),
          height: r(height - g),
          ...base,
        },
      ]
    case 'doors2': {
      const half = width / 2
      return [
        {
          id: `${idPrefix}-f1`,
          kind: 'door-left',
          x: r(h),
          y: r(h),
          width: r(half - g),
          height: r(height - g),
          ...base,
        },
        {
          id: `${idPrefix}-f2`,
          kind: 'door-right',
          x: r(half + h),
          y: r(h),
          width: r(half - g),
          height: r(height - g),
          ...base,
        },
      ]
    }
    case 'drawers': {
      const sum = layout.heights.reduce((a, b) => a + b, 0)
      if (sum !== height) {
        throw new Error(`Suma wysokości szuflad (${sum} mm) ≠ wysokość korpusu (${height} mm)`)
      }
      let y = 0
      return layout.heights.map((dh, i) => {
        const f: FrontT = {
          id: `${idPrefix}-f${i + 1}`,
          kind: layout.as ?? 'drawer',
          x: r(h),
          y: r(y + h),
          width: r(width - g),
          height: r(dh - g),
          ...base,
        }
        y += dh
        return f
      })
    }
  }
}

/**
 * Odtwarza fronty szafki z jej przepisu (layout) po zmianie wymiarów.
 * Wysokości szuflad są skalowane proporcjonalnie do nowej wysokości korpusu (zaokrąglenie do mm,
 * reszta dopisana do najwyższej szuflady, żeby suma zgadzała się co do milimetra).
 */
export function rebuildFronts(cab: CabinetT, gap = DEFAULT_GAP): FrontT[] {
  if (!cab.layout) return cab.fronts
  const style = cab.fronts[0]?.style ?? 'flat'
  const materialId = cab.fronts[0]?.materialId ?? 'front-white-lacquer'
  let layout: FrontLayoutT = cab.layout
  if (layout.kind === 'drawers') {
    layout = { ...layout, heights: scaleHeights(layout.heights, cab.height) }
  }
  return makeFronts(cab.id, cab.width, cab.height, layout, { style, materialId, gap })
}

/** Skaluje listę wysokości tak, by sumowała się dokładnie do `total`. */
export function scaleHeights(heights: number[], total: number): number[] {
  const sum = heights.reduce((a, b) => a + b, 0)
  if (sum === total) return heights
  const scaled = heights.map((h) => Math.max(1, Math.round((h * total) / sum)))
  const diff = total - scaled.reduce((a, b) => a + b, 0)
  const iMax = scaled.indexOf(Math.max(...scaled))
  scaled[iMax] += diff
  return scaled
}
