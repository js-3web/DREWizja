/**
 * Model danych projektu (SPEC sekcja 5) — JEDNO ŹRÓDŁO PRAWDY.
 *
 * Zod = biblioteka, w której opisujemy kształt danych raz, a dostajemy dwie rzeczy:
 *  1) walidację w czasie działania (np. JSON od AI albo wczytany z pliku),
 *  2) typy TypeScript (z.infer) — edytor podpowiada pola i łapie literówki.
 *
 * Wszystkie wymiary w milimetrach, liczby całkowite.
 */
import { z } from 'zod'

export const SCHEMA_VERSION = 1

/** Wymiar w mm: liczba całkowita, nieujemna. */
const mm = z.number().int().nonnegative()
/** Wymiar w mm, który musi być > 0 (np. szerokość szafki). */
const mmPos = z.number().int().positive()
const confidence = z.number().min(0).max(1)

export const WallId = z.enum(['A', 'B', 'C', 'D'])

export const Wall = z.object({
  id: WallId,
  /** Długość ściany w mm (wyliczana z wymiarów pokoju, ale zapisywana jawnie). */
  length: mmPos,
})

export const Obstacle = z.object({
  id: z.string().min(1),
  kind: z.enum(['murek', 'window', 'door', 'pipe', 'radiator', 'other']),
  wallId: WallId,
  /** Odległość od początku ściany (narożnika) wzdłuż ściany. */
  x: mm,
  /** Wysokość dolnej krawędzi od podłogi. */
  y: mm,
  w: mmPos,
  h: mmPos,
  /** Głębokość (odstawanie od ściany w głąb pokoju). Dla okien/drzwi = 0. */
  d: mm,
  label: z.string().optional(),
})

export const FrontStyleId = z.enum(['flat', 'shaker', 'frame-panel'])

export const Front = z.object({
  id: z.string().min(1),
  kind: z.enum(['door-left', 'door-right', 'drawer', 'flap-up', 'glass', 'blind']),
  /** Pozycja i wymiar względem lewego-dolnego narożnika korpusu (widok od frontu). */
  x: z.number().int(),
  y: z.number().int(),
  width: mmPos,
  height: mmPos,
  style: FrontStyleId,
  materialId: z.string().min(1),
})

export const Cabinet = z.object({
  id: z.string().min(1),
  type: z.enum(['base', 'wall', 'tall', 'corner', 'appliance', 'open', 'filler']),
  width: mmPos,
  /** Wysokość korpusu (bez cokołu i blatu). */
  height: mmPos,
  depth: mmPos,
  /** Wysokość dolnej krawędzi korpusu od podłogi (dla dolnych = wysokość cokołu). */
  elevation: mm,
  carcass: z.object({
    boardThickness: mmPos.default(18),
    backThickness: z.union([z.literal(3), z.literal(8), z.literal(18)]).default(3),
  }),
  fronts: z.array(Front).default([]),
  appliance: z.enum(['hob', 'oven', 'fridge', 'dishwasher', 'sink', 'hood', 'microwave']).optional(),
  handle: z
    .object({
      type: z.enum(['bar', 'knob', 'none', 'gola', 'push']),
      position: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
    })
    .optional(),
  carcassMaterialId: z.string().optional(),
  confidence: confidence.optional(),
})

export const Worktop = z.object({
  thickness: mmPos.default(38),
  overhangFront: mm.default(20),
  materialId: z.string().min(1),
  cutouts: z
    .array(
      z.object({
        kind: z.enum(['sink', 'hob']),
        /** Odległość od początku ciągu. */
        x: mm,
        width: mmPos,
        depth: mmPos,
      }),
    )
    .default([]),
})

export const Run = z.object({
  id: z.string().min(1),
  wallId: WallId,
  /** Odległość pierwszej szafki od początku ściany (narożnika). */
  startOffset: mm,
  layers: z.object({
    base: z.array(Cabinet).optional(),
    tall: z.array(Cabinet).optional(),
    wall: z.array(Cabinet).optional(),
  }),
  worktop: Worktop.optional(),
  plinthHeight: mm.default(100),
  /** Cofnięcie cokołu względem frontu korpusu. */
  plinthSetback: mm.default(50),
  ceilingGap: mm.optional(),
})

export const Material = z.object({
  id: z.string().min(1),
  name: z.string(),
  category: z.enum(['laminate', 'lacquer', 'veneer', 'solid-wood', 'acrylic', 'glass', 'stone', 'metal']),
  finish: z.enum(['matt', 'satin', 'gloss', 'structured']),
  /** Kolor bazowy w formacie #rrggbb (etap 1 — bez tekstur). */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1).default(0),
})

export const Project = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  client: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.literal(SCHEMA_VERSION),
  units: z.literal('mm'),
  room: z.object({
    width: mmPos,
    depth: mmPos,
    height: mmPos,
    walls: z.array(Wall),
    obstacles: z.array(Obstacle).default([]),
  }),
  runs: z.array(Run),
  materials: z.array(Material),
  sourceSketch: z
    .object({
      imageUrl: z.string().optional(),
      aiModel: z.string().optional(),
      aiRawJson: z.unknown().optional(),
      warnings: z.array(z.string()).default([]),
      questions: z.array(z.string()).default([]),
    })
    .optional(),
})

export type WallIdT = z.infer<typeof WallId>
export type WallT = z.infer<typeof Wall>
export type ObstacleT = z.infer<typeof Obstacle>
export type FrontT = z.infer<typeof Front>
export type CabinetT = z.infer<typeof Cabinet>
export type RunT = z.infer<typeof Run>
export type MaterialT = z.infer<typeof Material>
export type ProjectT = z.infer<typeof Project>

/** Wynik walidacji z komunikatami po polsku-ish (ścieżka pola + opis Zod). */
export function validateProject(data: unknown): { ok: true; project: ProjectT } | { ok: false; errors: string[] } {
  const r = Project.safeParse(data)
  if (r.success) return { ok: true, project: r.data }
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join('.') || '(główny obiekt)'}: ${i.message}`),
  }
}
