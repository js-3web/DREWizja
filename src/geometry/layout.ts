/**
 * Rozmieszczenie ciągów zabudowy w pokoju.
 *
 * Układ współrzędnych POKOJU (widok z góry, mm):
 *   x — w prawo, z — „do widza” (w dół rzutu), y — w górę.
 *   Narożnik lewy-górny rzutu = (0, 0). Pokój ma wymiary width (x) × depth (z).
 *
 * Ściany obchodzimy zgodnie z ruchem wskazówek zegara (patrząc na rzut):
 *   A — górna,  od (0,0)           w prawo (+x),  szafki patrzą w +z
 *   B — prawa,  od (width,0)       w dół   (+z),  szafki patrzą w −x
 *   C — dolna,  od (width,depth)   w lewo  (−x),  szafki patrzą w −z
 *   D — lewa,   od (0,depth)       w górę  (−z),  szafki patrzą w +x
 * Dzięki temu dla zabudowy w L (A + B) narożnik to koniec ściany A = początek ściany B.
 */
import type { CabinetT, ProjectT, RunT, WallIdT } from '../model/schema'

export interface WallFrame {
  /** Początek ściany w pokoju. */
  ox: number
  oz: number
  /** Kierunek wzdłuż ściany (wektor jednostkowy). */
  dx: number
  dz: number
  /** Obrót wokół osi Y (radiany) — mapuje oś x szafki na kierunek ściany, oś z na wnętrze pokoju. */
  rotY: number
  length: number
}

export function wallFrame(wallId: WallIdT, room: ProjectT['room']): WallFrame {
  const { width: W, depth: D } = room
  switch (wallId) {
    case 'A':
      return { ox: 0, oz: 0, dx: 1, dz: 0, rotY: 0, length: W }
    case 'B':
      return { ox: W, oz: 0, dx: 0, dz: 1, rotY: -Math.PI / 2, length: D }
    case 'C':
      return { ox: W, oz: D, dx: -1, dz: 0, rotY: Math.PI, length: W }
    case 'D':
      return { ox: 0, oz: D, dx: 0, dz: -1, rotY: Math.PI / 2, length: D }
  }
}

export type Layer = 'base' | 'tall' | 'wall'

export interface PlacedCabinet {
  runId: string
  wallId: WallIdT
  layer: Layer
  cabinet: CabinetT
  /** Odległość lewego boku szafki od początku ściany. */
  along: number
  /** Pozycja lewego-tylnego-dolnego narożnika szafki w pokoju. */
  x: number
  y: number
  z: number
  rotY: number
}

/** Szafki w warstwie stoją jedna obok drugiej, od startOffset ciągu, w kolejności z tablicy. */
export function placeRun(run: RunT, room: ProjectT['room']): PlacedCabinet[] {
  const f = wallFrame(run.wallId, room)
  const out: PlacedCabinet[] = []
  for (const layer of ['base', 'tall', 'wall'] as const) {
    let along = run.startOffset
    for (const cab of run.layers[layer] ?? []) {
      out.push({
        runId: run.id,
        wallId: run.wallId,
        layer,
        cabinet: cab,
        along,
        x: f.ox + f.dx * along,
        y: cab.elevation,
        z: f.oz + f.dz * along,
        rotY: f.rotY,
      })
      along += cab.width
    }
  }
  return out
}

/** Długość warstwy = suma szerokości modułów. */
export function layerLength(run: RunT, layer: Layer): number {
  return (run.layers[layer] ?? []).reduce((s, c) => s + c.width, 0)
}

/** Prosta kontrola (pełna walidacja geometryczna = etap 3): czy ciąg mieści się na ścianie. */
export function runOverflow(run: RunT, room: ProjectT['room']): string[] {
  const f = wallFrame(run.wallId, room)
  const msgs: string[] = []
  for (const layer of ['base', 'tall', 'wall'] as const) {
    const end = run.startOffset + layerLength(run, layer)
    if (end > f.length) {
      msgs.push(
        `Ciąg ${run.id}, warstwa ${layer}: koniec ${end} mm > długość ściany ${run.wallId} ${f.length} mm (o ${end - f.length} mm za dużo)`,
      )
    }
  }
  return msgs
}
