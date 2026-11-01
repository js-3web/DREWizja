/**
 * Rozkład korpusu szafki na rzeczywiste płyty (SPEC sekcja 7.1) — czysta funkcja, bez Three.js.
 * Dzięki temu da się ją przetestować liczbami i później użyć do listy formatek (etap 7).
 *
 * Układ współrzędnych SZAFKI (mm):
 *   x — wzdłuż ściany, od lewego boku (0) do prawego (width),
 *   y — w górę, od dołu korpusu (0) do góry (height),
 *   z — od ściany (0, tył) w stronę pokoju (depth, czoło korpusu).
 * Panel opisujemy środkiem (cx, cy, cz) i wymiarami (sx, sy, sz) wzdłuż osi.
 */
import type { CabinetT } from '../model/schema'

export type PanelRole = 'side' | 'bottom' | 'top' | 'rail' | 'back' | 'shelf'

export interface Panel {
  name: string
  role: PanelRole
  /** Wymiary bryły wzdłuż osi x, y, z. */
  sx: number
  sy: number
  sz: number
  /** Środek bryły. */
  cx: number
  cy: number
  cz: number
}

/** Szerokość trawersu (listwy górnej) w szafkach dolnych. */
export const RAIL_WIDTH = 100

/**
 * Konstrukcja (typowa w polskich warsztatach, do potwierdzenia przez użytkownika):
 *  - boki na pełną wysokość korpusu,
 *  - dno i wieniec górny WPUSZCZONE między boki (szerokość = width − 2·t),
 *  - szafki dolne/narożne: zamiast wieńca górnego dwa trawersy (przód i tył) po 100 mm — pod blat,
 *  - plecy (HDF 3 mm) nabite z tyłu na całą wysokość i szerokość; boki/dno skrócone o grubość plecy,
 *  - jedna półka w połowie wysokości dla szafek wyższych niż 400 mm (bez AGD).
 */
export function carcassPanels(cab: CabinetT): Panel[] {
  const t = cab.carcass.boardThickness
  const b = cab.carcass.backThickness
  const { width: W, height: H, depth: D } = cab
  // Głębokość „pudła” bez plecy — plecy są nabite od tyłu, więc boki zaczynają się od z = b.
  const boxD = D - b
  const innerW = W - 2 * t
  const zMid = b + boxD / 2
  const panels: Panel[] = []

  if (cab.type === 'filler') {
    // Blenda/wypełnienie: pojedyncza płyta frontowa, bez korpusu.
    return panels
  }

  panels.push(
    { name: 'Bok lewy', role: 'side', sx: t, sy: H, sz: boxD, cx: t / 2, cy: H / 2, cz: zMid },
    { name: 'Bok prawy', role: 'side', sx: t, sy: H, sz: boxD, cx: W - t / 2, cy: H / 2, cz: zMid },
    { name: 'Dno', role: 'bottom', sx: innerW, sy: t, sz: boxD, cx: W / 2, cy: t / 2, cz: zMid },
  )

  const isUnderWorktop = cab.type === 'base' || cab.type === 'corner'
  if (isUnderWorktop) {
    panels.push(
      {
        name: 'Trawers przedni',
        role: 'rail',
        sx: innerW,
        sy: t,
        sz: RAIL_WIDTH,
        cx: W / 2,
        cy: H - t / 2,
        cz: D - RAIL_WIDTH / 2,
      },
      {
        name: 'Trawers tylny',
        role: 'rail',
        sx: innerW,
        sy: t,
        sz: RAIL_WIDTH,
        cx: W / 2,
        cy: H - t / 2,
        cz: b + RAIL_WIDTH / 2,
      },
    )
  } else {
    panels.push({
      name: 'Wieniec górny',
      role: 'top',
      sx: innerW,
      sy: t,
      sz: boxD,
      cx: W / 2,
      cy: H - t / 2,
      cz: zMid,
    })
  }

  if (b > 0) {
    panels.push({ name: 'Plecy', role: 'back', sx: W, sy: H, sz: b, cx: W / 2, cy: H / 2, cz: b / 2 })
  }

  const hasAppliance = cab.appliance !== undefined || cab.type === 'appliance'
  if (H > 400 && !hasAppliance) {
    // Półka cofnięta 20 mm od czoła, żeby nie ocierała o front.
    const shelfD = boxD - 20
    panels.push({
      name: 'Półka',
      role: 'shelf',
      sx: innerW,
      sy: t,
      sz: shelfD,
      cx: W / 2,
      cy: H / 2,
      cz: b + shelfD / 2,
    })
  }
  return panels
}
