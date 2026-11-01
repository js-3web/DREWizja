/**
 * Automatyczny podział frontów z uwzględnieniem szczelin (SPEC sekcja 7.3).
 * Fronty są nakładane na korpus („nakładkowe”), więc zewnętrzny obrys = obrys korpusu minus pół szczeliny z każdej strony.
 */
import type { FrontT } from '../model/schema'

export const DEFAULT_GAP = 3

export type FrontLayout =
  | { kind: 'door' } // jedne drzwi (zawias wg szerokości: lewy)
  | { kind: 'doors2' } // dwoje drzwi
  | { kind: 'drawers'; heights: number[]; as?: FrontT['kind'] } // fronty jeden nad drugim, od dołu; wysokości „w osiach” sumują się do wysokości korpusu (as = np. 'door-right' dla lodówki)
  | { kind: 'flap' } // klapa do góry

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
