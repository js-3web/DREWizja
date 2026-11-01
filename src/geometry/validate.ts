/**
 * Walidacja geometryczna projektu (SPEC sekcja 9) — przed generowaniem PDF dla klienta.
 *
 * Poziomy:
 *  - error   — blokuje PDF dla klienta (np. szafka nie mieści się na ścianie, kolizja),
 *  - warning — widoczne, nie blokuje (np. nietypowa szerokość zmywarki),
 *  - info    — przypomnienia (odległość nad płytą wg instrukcji AGD, kotwienie słupków).
 * Każdy komunikat po polsku i z wartościami w mm.
 */
import type { CabinetT, ProjectT } from '../model/schema'
import { FRONT_THICKNESS } from './frontParts'
import { placeRun, wallFrame, type PlacedCabinet } from './layout'

export type Severity = 'error' | 'warning' | 'info'
export interface Issue {
  severity: Severity
  code: string
  message: string
  cabinetIds?: string[]
}

/** Zapas montażowy pod sufitem. */
export const CEILING_MARGIN = 10

interface Box3 {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

/** Prostopadłościan zajmowany przez szafkę w pokoju (z frontem), osiowo — ściany są pod kątem 90°. */
export function cabinetBox(pc: PlacedCabinet, room: ProjectT['room']): Box3 {
  const f = wallFrame(pc.wallId, room)
  const c = pc.cabinet
  const depth = c.depth + (c.fronts.length ? FRONT_THICKNESS : 0)
  // Normalna do wnętrza = oś z szafki po obrocie.
  const nx = Math.round(Math.sin(f.rotY))
  const nz = Math.round(Math.cos(f.rotY))
  const ax = pc.x
  const az = pc.z
  const bx = pc.x + f.dx * c.width
  const bz = pc.z + f.dz * c.width
  const xs = [ax, bx, ax + nx * depth, bx + nx * depth]
  const zs = [az, bz, az + nz * depth, bz + nz * depth]
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
    y0: c.elevation,
    y1: c.elevation + c.height,
  }
}

/** Część wspólna dwóch przedziałów (w mm); > 0 = nachodzą na siebie. */
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)

function boxesCollide(a: Box3, b: Box3, tol = 1) {
  return (
    overlap(a.x0, a.x1, b.x0, b.x1) > tol &&
    overlap(a.z0, a.z1, b.z0, b.z1) > tol &&
    overlap(a.y0, a.y1, b.y0, b.y1) > tol
  )
}

const APPLIANCE_WIDTHS: Partial<Record<NonNullable<CabinetT['appliance']>, number[]>> = {
  dishwasher: [450, 600],
  oven: [600],
  fridge: [600],
}
const APPLIANCE_PL: Record<NonNullable<CabinetT['appliance']>, string> = {
  hob: 'płyta grzewcza',
  oven: 'piekarnik',
  fridge: 'lodówka',
  dishwasher: 'zmywarka',
  sink: 'zlew',
  hood: 'okap',
  microwave: 'mikrofala',
}

export function validateGeometry(p: ProjectT): Issue[] {
  const issues: Issue[] = []
  const { room } = p

  // 1. Długości ścian w JSON vs wymiary pokoju.
  for (const w of room.walls) {
    const expected = wallFrame(w.id, room).length
    if (w.length !== expected) {
      issues.push({
        severity: 'warning',
        code: 'wall-length',
        message: `Ściana ${w.id}: długość w danych ${w.length} mm ≠ wynikająca z wymiarów pokoju ${expected} mm. Aplikacja używa ${expected} mm.`,
      })
    }
  }

  const placed = p.runs.flatMap((r) => placeRun(r, room))

  // 2. Ciąg mieści się na ścianie.
  for (const r of p.runs) {
    const f = wallFrame(r.wallId, room)
    for (const layer of ['base', 'tall', 'wall'] as const) {
      const cabs = r.layers[layer] ?? []
      if (!cabs.length) continue
      const end = r.startOffset + cabs.reduce((s, c) => s + c.width, 0)
      if (end > f.length) {
        issues.push({
          severity: 'error',
          code: 'run-overflow',
          message: `Ciąg ${r.id} (${LAYER_PL[layer]}) na ścianie ${r.wallId}: koniec ${end} mm > długość ściany ${f.length} mm (o ${end - f.length} mm za dużo).`,
          cabinetIds: cabs.map((c) => c.id),
        })
      }
    }
  }

  for (const pc of placed) {
    const c = pc.cabinet
    // 3. Wysokość pod sufitem.
    const top = c.elevation + c.height
    if (top > room.height - CEILING_MARGIN) {
      issues.push({
        severity: 'error',
        code: 'too-high',
        message: `Szafka ${c.id}: góra na ${top} mm, a sufit ${room.height} mm (wymagany zapas montażowy ${CEILING_MARGIN} mm).`,
        cabinetIds: [c.id],
      })
    }
    // 4. AGD w szafce o nietypowej szerokości.
    const widths = c.appliance && APPLIANCE_WIDTHS[c.appliance]
    if (c.appliance && widths && !widths.includes(c.width)) {
      issues.push({
        severity: 'warning',
        code: 'appliance-width',
        message: `Szafka ${c.id} (${APPLIANCE_PL[c.appliance]}): szerokość ${c.width} mm — typowo ${widths.join(' lub ')} mm. Sprawdź wymiary zabudowy w karcie urządzenia.`,
        cabinetIds: [c.id],
      })
    }
    // 5. Fronty poza korpusem / nakładające się.
    for (const fr of c.fronts) {
      if (fr.x < 0 || fr.y < 0 || fr.x + fr.width > c.width || fr.y + fr.height > c.height) {
        issues.push({
          severity: 'error',
          code: 'front-outside',
          message: `Szafka ${c.id}: front ${fr.id} (${fr.width}×${fr.height} mm na x=${fr.x}, y=${fr.y}) wychodzi poza korpus ${c.width}×${c.height} mm.`,
          cabinetIds: [c.id],
        })
      }
    }
    for (let i = 0; i < c.fronts.length; i++)
      for (let j = i + 1; j < c.fronts.length; j++) {
        const a = c.fronts[i]
        const b = c.fronts[j]
        if (
          overlap(a.x, a.x + a.width, b.x, b.x + b.width) > 0 &&
          overlap(a.y, a.y + a.height, b.y, b.y + b.height) > 0
        ) {
          issues.push({
            severity: 'error',
            code: 'front-overlap',
            message: `Szafka ${c.id}: fronty ${a.id} i ${b.id} nachodzą na siebie.`,
            cabinetIds: [c.id],
          })
        }
      }
  }

  // 6. Kolizje szafek (m.in. narożnik L — podwójne liczenie głębokości).
  const boxes = placed.map((pc) => ({ pc, box: cabinetBox(pc, room) }))
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (boxesCollide(a.box, b.box)) {
        const corner = a.pc.runId !== b.pc.runId
        issues.push({
          severity: 'error',
          code: 'collision',
          message: `Kolizja: ${a.pc.cabinet.id} i ${b.pc.cabinet.id}${corner ? ' (narożnik — sprawdź przesunięcie startowe drugiego ciągu o głębokość pierwszego)' : ''}.`,
          cabinetIds: [a.pc.cabinet.id, b.pc.cabinet.id],
        })
      }
    }

  // 7. Kolizje z przeszkodami: murki/piony (bryły) i okna/drzwi (otwory w ścianie).
  for (const o of room.obstacles) {
    const f = wallFrame(o.wallId, room)
    for (const { pc, box } of boxes) {
      if (o.d > 0) {
        const nx = Math.round(Math.sin(f.rotY))
        const nz = Math.round(Math.cos(f.rotY))
        const ax = f.ox + f.dx * o.x
        const az = f.oz + f.dz * o.x
        const bx = ax + f.dx * o.w
        const bz = az + f.dz * o.w
        const xs = [ax, bx, ax + nx * o.d, bx + nx * o.d]
        const zs = [az, bz, az + nz * o.d, bz + nz * o.d]
        const ob = {
          x0: Math.min(...xs),
          x1: Math.max(...xs),
          z0: Math.min(...zs),
          z1: Math.max(...zs),
          y0: o.y,
          y1: o.y + o.h,
        }
        if (boxesCollide(box, ob)) {
          issues.push({
            severity: 'error',
            code: 'obstacle',
            message: `Szafka ${pc.cabinet.id} koliduje z przeszkodą „${o.label ?? o.kind}” (ściana ${o.wallId}, ${o.x}–${o.x + o.w} mm).`,
            cabinetIds: [pc.cabinet.id],
          })
        }
      } else {
        // Otwór w ścianie: liczy się tylko szafka przy TEJ ścianie.
        if (pc.wallId !== o.wallId) continue
        const c = pc.cabinet
        if (
          overlap(pc.along, pc.along + c.width, o.x, o.x + o.w) > 0 &&
          overlap(c.elevation, c.elevation + c.height, o.y, o.y + o.h) > 0
        ) {
          issues.push({
            severity: o.kind === 'door' ? 'error' : 'warning',
            code: 'opening',
            message: `Szafka ${c.id} zasłania ${o.kind === 'door' ? 'drzwi' : o.kind === 'window' ? 'okno' : 'otwór'} „${o.label ?? o.id}” na ścianie ${o.wallId}.`,
            cabinetIds: [c.id],
          })
        }
      }
    }
  }

  // 8. Przypomnienia: odległość nad płytą grzewczą + kotwienie słupków (EN 14749 — poza zakresem wizualizacji).
  for (const r of p.runs) {
    for (const cut of r.worktop?.cutouts ?? []) {
      if (cut.kind !== 'hob') continue
      const hobX0 = r.startOffset + cut.x
      const hobX1 = hobX0 + cut.width
      const worktopTop =
        Math.max(0, ...(r.layers.base ?? []).map((c) => c.elevation + c.height)) + (r.worktop?.thickness ?? 0)
      for (const pc of placed.filter((x) => x.layer === 'wall' && x.wallId === r.wallId)) {
        if (overlap(pc.along, pc.along + pc.cabinet.width, hobX0, hobX1) > 0) {
          issues.push({
            severity: 'info',
            code: 'hob-clearance',
            message: `Nad płytą grzewczą: ${pc.cabinet.id} (${pc.cabinet.appliance === 'hood' ? 'okap' : 'szafka'}) ${pc.cabinet.elevation - worktopTop} mm nad blatem — sprawdź minimalną odległość w instrukcji producenta płyty i okapu.`,
            cabinetIds: [pc.cabinet.id],
          })
        }
      }
    }
  }
  if (placed.some((pc) => pc.layer === 'tall')) {
    issues.push({
      severity: 'info',
      code: 'anchor-tall',
      message: 'Słupki/wysokie szafki: zaplanuj kotwienie do ściany (stateczność mebli — EN 14749).',
    })
  }

  // 9. Rozbieżności wymiarów ze szkicu (zapisane przy imporcie odczytu AI).
  for (const w of p.sourceSketch?.warnings ?? []) issues.push({ severity: 'warning', code: 'sketch', message: w })

  return issues
}

const LAYER_PL = { base: 'dolne', tall: 'słupki', wall: 'górne' } as const

export function hasBlockingErrors(issues: Issue[]) {
  return issues.some((i) => i.severity === 'error')
}
