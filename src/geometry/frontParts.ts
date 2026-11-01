/**
 * Geometria frontu zależna od stylu (SPEC sekcja 7.2) — czysta funkcja, bez Three.js.
 *
 * Układ współrzędnych jak dla szafki (mm), ale z = 0 to lico korpusu (front leży na z = 0..T).
 *  - flat        — jedna płyta,
 *  - shaker      — MDF frezowany: rama (stojaki + poprzeczki) na pełną grubość + zagłębiona płycina,
 *  - frame-panel — ramiak z drewna/forniru: osobne stojaki i poprzeczki + płycina.
 * Kierunek usłojenia: stojaki PIONOWO, poprzeczki POZIOMO, płycina pionowo (SPEC: „to pierwsze, co zauważy klient”).
 */
import type { FrontT } from '../model/schema'

export const FRONT_THICKNESS = 18

export type Grain = 'vertical' | 'horizontal'
export type FrontPartRole = 'slab' | 'stile' | 'rail' | 'panel'

export interface FrontPart {
  role: FrontPartRole
  name: string
  sx: number
  sy: number
  sz: number
  cx: number
  cy: number
  cz: number
  grain: Grain
}

export interface FrontStyleParams {
  /** Szerokość ramy (stojaka/poprzeczki). */
  frame: number
  /** Głębokość frezu/zagłębienia płyciny od lica. */
  recess: number
  /** Grubość płyciny. */
  panelThickness: number
}

export const STYLE_PARAMS: Record<'shaker' | 'frame-panel', FrontStyleParams> = {
  shaker: { frame: 70, recess: 6, panelThickness: 12 },
  'frame-panel': { frame: 80, recess: 6, panelThickness: 10 },
}

/** Najmniejsza sensowna szerokość ramy; węższy front = płaski (np. niska szuflada, blenda). */
export const MIN_FRAME = 30
/** Najmniejsza widoczna płycina. */
export const MIN_PANEL = 60

/** Szerokość ramy dopasowana do małych frontów (np. szuflada 157 mm → rama 48 mm). */
export function effectiveFrame(width: number, height: number, frame: number): number {
  const limit = Math.floor((Math.min(width, height) - MIN_PANEL) / 2)
  return Math.min(frame, limit)
}

export function frontParts(f: FrontT, T = FRONT_THICKNESS): FrontPart[] {
  const { x, y, width: W, height: H } = f
  const slabGrain: Grain = f.kind === 'drawer' ? 'horizontal' : 'vertical'
  const slab: FrontPart[] = [
    { role: 'slab', name: 'Front', sx: W, sy: H, sz: T, cx: x + W / 2, cy: y + H / 2, cz: T / 2, grain: slabGrain },
  ]
  if (f.style === 'flat' || f.kind === 'glass' || f.kind === 'blind') return slab

  const p = STYLE_PARAMS[f.style]
  const F = effectiveFrame(W, H, p.frame)
  if (F < MIN_FRAME) return slab

  const innerW = W - 2 * F
  const innerH = H - 2 * F
  const panelFront = T - p.recess // lico płyciny
  return [
    {
      role: 'stile',
      name: 'Stojak lewy',
      sx: F,
      sy: H,
      sz: T,
      cx: x + F / 2,
      cy: y + H / 2,
      cz: T / 2,
      grain: 'vertical',
    },
    {
      role: 'stile',
      name: 'Stojak prawy',
      sx: F,
      sy: H,
      sz: T,
      cx: x + W - F / 2,
      cy: y + H / 2,
      cz: T / 2,
      grain: 'vertical',
    },
    {
      role: 'rail',
      name: 'Poprzeczka dolna',
      sx: innerW,
      sy: F,
      sz: T,
      cx: x + W / 2,
      cy: y + F / 2,
      cz: T / 2,
      grain: 'horizontal',
    },
    {
      role: 'rail',
      name: 'Poprzeczka górna',
      sx: innerW,
      sy: F,
      sz: T,
      cx: x + W / 2,
      cy: y + H - F / 2,
      cz: T / 2,
      grain: 'horizontal',
    },
    {
      role: 'panel',
      name: 'Płycina',
      sx: innerW,
      sy: innerH,
      sz: p.panelThickness,
      cx: x + W / 2,
      cy: y + H / 2,
      cz: panelFront - p.panelThickness / 2,
      grain: 'vertical',
    },
  ]
}
