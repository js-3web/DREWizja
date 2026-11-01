/**
 * Konwersja odczytu szkicu (cm, kolejność szafek) → projekt (mm, geometria) — DETERMINISTYCZNIE.
 * Ten sam odczyt = zawsze ten sam projekt (SPEC sekcja 2).
 *
 * Zasady:
 *  - cm → mm: zaokrąglenie do pełnego milimetra (386,5 cm → 3865 mm),
 *  - brakujące wymiary → wartości domyślne z ustawień i komunikat „przyjęto domyślne” (SPEC 8: oznaczaj domyślne),
 *  - szafki „floor” dzielone na ciągi: dolne (z blatem) i słupki (bez blatu); „gap” = przerwa,
 *  - kontrola sum łańcuchów wymiarowych → ostrzeżenia z wartościami (SPEC 4.3), nic nie jest poprawiane po cichu.
 */
import { makeFronts, scaleHeights } from '../geometry/fronts'
import { MATERIAL_LIBRARY } from '../materials/library'
import {
  SCHEMA_VERSION,
  type CabinetT,
  type FrontLayoutT,
  type FrontT,
  type ProjectT,
  type RunT,
  type WallIdT,
} from '../model/schema'
import type { SettingsT } from '../model/settings'
import { missingWidths, type ReadingCabinetT, type SketchReadingT } from './reading'

export const cmToMm = (cm: number) => Math.round(cm * 10)

/** Tolerancja przy porównaniu sum wymiarów (0,5 cm). */
const SUM_TOL_MM = 5

export interface ConvertInput {
  id: string
  name: string
  client?: string
  roomMm: { width: number; depth: number; height: number }
}

export interface ConvertResult {
  project: ProjectT
  /** Ostrzeżenia z konwersji (sumy, przyjęte wartości domyślne) — trafiają też do project.sourceSketch.warnings. */
  warnings: string[]
  /** Informacje o przyjętych wartościach domyślnych (nie ostrzeżenia, ale widoczne na ekranie weryfikacji). */
  defaultsUsed: string[]
}

function frontLayoutFor(c: ReadingCabinetT, heightMm: number, warnings: string[], id: string): FrontLayoutT {
  const f = c.fronts
  switch (f.kind) {
    case 'door':
    case 'glass':
      return { kind: 'door' }
    case 'doors2':
      return { kind: 'doors2' }
    case 'flap':
      return { kind: 'flap' }
    case 'none':
      return { kind: 'none' }
    case 'drawers': {
      if (f.heights_cm?.length) {
        const mmH = f.heights_cm.map(cmToMm)
        const sum = mmH.reduce((a, b) => a + b, 0)
        if (Math.abs(sum - heightMm) > SUM_TOL_MM) {
          warnings.push(
            `Szafka ${id}: suma wysokości szuflad ze szkicu ${fmtMm(sum)} cm ≠ wysokość korpusu ${fmtMm(heightMm)} cm — wysokości przeskalowano proporcjonalnie.`,
          )
        }
        return {
          kind: 'drawers',
          heights: scaleHeights(mmH, heightMm),
          as: c.appliance === 'fridge' ? 'door-right' : undefined,
        }
      }
      const n = f.count ?? 2
      const each = Math.floor(heightMm / n)
      const heights = Array.from({ length: n }, (_, i) => (i === n - 1 ? heightMm - each * (n - 1) : each))
      return { kind: 'drawers', heights, as: c.appliance === 'fridge' ? 'door-right' : undefined }
    }
  }
}

export function convertReading(reading: SketchReadingT, input: ConvertInput, settings: SettingsT): ConvertResult {
  const missing = missingWidths(reading)
  if (missing.length) {
    throw new Error(`Uzupełnij szerokości (nieczytelne na szkicu): ${missing.join('; ')}.`)
  }
  const d = settings.defaults
  const warnings: string[] = []
  const layoutWarnings: string[] = []
  const defaultsUsed: string[] = []
  const { width: W, depth: D, height: H } = input.roomMm
  const wallLen = (w: WallIdT) => (w === 'A' || w === 'C' ? W : D)
  const ids = new Set<string>()
  const uid = (base: string) => {
    let id = base
    let n = 2
    while (ids.has(id)) id = `${base}-${n++}`
    ids.add(id)
    return id
  }

  // Wymiary pokoju z odczytu vs podane przez stolarza (podane = pewne).
  const rr = reading.room
  for (const [label, ai, given] of [
    ['szerokość', rr.width_cm, W],
    ['głębokość', rr.depth_cm, D],
    ['wysokość', rr.height_cm, H],
  ] as const) {
    if (ai !== null && Math.abs(cmToMm(ai) - given) > SUM_TOL_MM) {
      warnings.push(`Pokój — ${label}: AI odczytało ${fmt(ai)} cm, podano ${fmtMm(given)} cm. Przyjęto wartość podaną.`)
    }
  }

  const style = d.frontStyle
  const fronts = (id: string, w: number, h: number, layout: FrontLayoutT, glass: boolean): FrontT[] => {
    const fs = makeFronts(id, w, h, layout, { style, materialId: d.frontMaterialId, gap: d.frontGap })
    return glass ? fs.map((f) => ({ ...f, kind: 'glass' as const, style: 'flat' as const })) : fs
  }

  const runs: RunT[] = []
  let runNo = 0

  for (const rrun of reading.runs) {
    const wall = rrun.wall
    const startOffset = cmToMm(rrun.start_offset_cm)

    // --- Wysokość korpusów dolnych: z wysokości blatu, z szafki albo domyślna.
    let baseHeight = d.baseHeight
    if (rrun.worktop_height_cm !== null) {
      baseHeight = cmToMm(rrun.worktop_height_cm) - d.plinthHeight - d.worktopThickness
      defaultsUsed.push(
        `Ściana ${wall}: korpus dolny ${baseHeight} mm = blat ${cmToMm(rrun.worktop_height_cm)} − cokół ${d.plinthHeight} (domyślny) − blat ${d.worktopThickness} (domyślny).`,
      )
    } else {
      defaultsUsed.push(
        `Ściana ${wall}: wysokość korpusów dolnych ${d.baseHeight} mm i cokół ${d.plinthHeight} mm — domyślne.`,
      )
    }
    const upperElev = rrun.upper_bottom_cm !== null ? cmToMm(rrun.upper_bottom_cm) : d.wallElevation
    if (rrun.upper_bottom_cm === null && rrun.upper.length) {
      defaultsUsed.push(`Ściana ${wall}: dół szafek górnych na ${d.wallElevation} mm — domyślne.`)
    }

    // --- Szafki podłogowe: grupy ciągłe dolnych / słupków; przerwy przesuwają pozycję.
    let along = startOffset
    let group: { layer: 'base' | 'tall'; start: number; cabs: CabinetT[]; hob: boolean[] } | null = null
    const flush = () => {
      if (!group || !group.cabs.length) return
      runNo++
      const run: RunT = {
        id: `${wall}${runNo}`,
        wallId: wall,
        startOffset: group.start,
        plinthHeight: d.plinthHeight,
        plinthSetback: 50,
        layers: { [group.layer]: group.cabs },
      }
      if (group.layer === 'base') {
        // Wycięcia w blacie: płyta nad szafką z hob_above/hob, zlew nad szafką ze zlewem.
        let x = 0
        const cutouts: NonNullable<RunT['worktop']>['cutouts'] = []
        for (const [k, c] of group.cabs.entries()) {
          if (c.appliance === 'sink')
            cutouts.push({ kind: 'sink', x: x + 50, width: Math.max(300, c.width - 100), depth: 480 })
          if (group.hob[k] || c.appliance === 'hob')
            cutouts.push({ kind: 'hob', x: x + 20, width: Math.max(300, Math.min(c.width - 40, 760)), depth: 490 })
          x += c.width
        }
        run.worktop = {
          thickness: d.worktopThickness,
          overhangFront: d.worktopOverhang,
          materialId: d.worktopMaterialId,
          cutouts,
        }
      }
      runs.push(run)
      group = null
    }

    rrun.floor.forEach((c, i) => {
      const w = cmToMm(c.width_cm ?? 0) // null wykluczone na początku funkcji
      if (c.type === 'gap') {
        flush()
        along += w
        return
      }
      // Blenda dołącza do sąsiedniej grupy (np. blenda przy lodówce = część ciągu słupków).
      const layer: 'base' | 'tall' =
        c.type === 'tall' || c.appliance === 'fridge' ? 'tall' : c.type === 'filler' && group ? group.layer : 'base'
      if (!group || group.layer !== layer) {
        flush()
        group = { layer, start: along, cabs: [], hob: [] }
      }
      const id = uid(`${wall}-${layer === 'tall' ? 's' : 'd'}${i + 1}`)
      const tallDefault = upperElev + d.wallHeight - d.plinthHeight
      let height: number
      if (c.height_cm !== null) {
        height = cmToMm(c.height_cm)
        if (layer === 'base' && height > 800) {
          warnings.push(
            `Szafka ${id}: wysokość ${height} mm wygląda na wysokość całkowitą (do blatu), a nie korpusu — sprawdź. Przyjęto korpus ${baseHeight} mm.`,
          )
          height = baseHeight
        }
      } else {
        height = layer === 'tall' ? tallDefault : baseHeight
        if (layer === 'tall')
          defaultsUsed.push(`Słupek ${id}: wysokość ${tallDefault} mm (do linii szafek górnych) — domyślna.`)
      }
      const depth = c.depth_cm !== null ? cmToMm(c.depth_cm) : layer === 'tall' ? d.tallDepth : d.baseDepth
      const layout = frontLayoutFor(c, height, warnings, id)
      const type: CabinetT['type'] =
        c.type === 'corner'
          ? 'corner'
          : c.type === 'filler'
            ? 'filler'
            : c.type === 'open'
              ? 'open'
              : layer === 'tall'
                ? 'tall'
                : 'base'
      const cab: CabinetT = {
        id,
        type,
        width: w,
        height,
        depth,
        elevation: d.plinthHeight,
        carcass: { boardThickness: 18, backThickness: 3 },
        carcassMaterialId: d.carcassMaterialId,
        layout: type === 'open' ? { kind: 'none' } : layout,
        fronts: type === 'open' ? [] : fronts(id, w, height, layout, c.fronts.kind === 'glass'),
        appliance: c.appliance ?? undefined,
        handle: { type: 'bar', position: 'top' },
        confidence: c.confidence,
      }
      group!.cabs.push(cab)
      group!.hob.push(c.hob_above)
      along += w
    })
    flush()
    const floorEnd = along

    // --- Szafki wiszące: każda przerwa zaczyna nowy ciąg.
    along = startOffset
    let upper: CabinetT[] = []
    let upperStart = along
    const flushUpper = () => {
      if (!upper.length) return
      runNo++
      runs.push({
        id: `${wall}${runNo}`,
        wallId: wall,
        startOffset: upperStart,
        plinthHeight: 0,
        plinthSetback: 50,
        layers: { wall: upper },
      })
      upper = []
    }
    rrun.upper.forEach((c, i) => {
      const w = cmToMm(c.width_cm ?? 0) // null wykluczone na początku funkcji
      if (c.type === 'gap') {
        flushUpper()
        along += w
        upperStart = along
        return
      }
      const id = uid(`${wall}-g${i + 1}`)
      const isHood = c.appliance === 'hood'
      const height = c.height_cm !== null ? cmToMm(c.height_cm) : isHood ? 360 : d.wallHeight
      const elevation = isHood ? upperElev + d.wallHeight - height : upperElev
      const layout = frontLayoutFor(c, height, warnings, id)
      upper.push({
        id,
        type: isHood ? 'appliance' : c.type === 'open' ? 'open' : c.type === 'filler' ? 'filler' : 'wall',
        width: w,
        height,
        depth: c.depth_cm !== null ? cmToMm(c.depth_cm) : d.wallDepth,
        elevation,
        carcass: { boardThickness: 18, backThickness: 3 },
        carcassMaterialId: d.carcassMaterialId,
        layout: c.type === 'open' ? { kind: 'none' } : layout,
        fronts: c.type === 'open' ? [] : fronts(id, w, height, layout, c.fronts.kind === 'glass'),
        appliance: c.appliance ?? undefined,
        handle: { type: 'bar', position: 'bottom' },
        confidence: c.confidence,
      })
      along += w
    })
    flushUpper()

    // --- Kontrola: koniec ciągu vs długość ściany (tylko na ekran weryfikacji — w projekcie sprawdza to
    // walidacja geometrii na bieżąco, więc nie zapisujemy tego jako trwałej uwagi do szkicu).
    const len = wallLen(wall)
    // Bez tolerancji: każdy milimetr ponad ścianę to fizyczny problem.
    if (floorEnd > len) {
      layoutWarnings.push(
        `Ściana ${wall}: szafki dolne kończą się na ${fmtMm(floorEnd)} cm, a ściana ma ${fmtMm(len)} cm (o ${fmtMm(floorEnd - len)} cm za dużo).`,
      )
    }
    if (along > len) {
      layoutWarnings.push(
        `Ściana ${wall}: szafki górne kończą się na ${fmtMm(along)} cm, a ściana ma ${fmtMm(len)} cm (o ${fmtMm(along - len)} cm za dużo).`,
      )
    }
  }

  // --- Łańcuchy wymiarowe ze szkicu (SPEC 4.3).
  for (const ch of reading.dimension_chains) {
    const segSum = ch.segments_cm.reduce((a, b) => a + b, 0)
    const len = wallLen(ch.wall)
    if (ch.total_cm !== null && ch.segments_cm.length && Math.abs(cmToMm(segSum) - cmToMm(ch.total_cm)) > SUM_TOL_MM) {
      warnings.push(
        `Ściana ${ch.wall} (${CHAIN_PL[ch.layer]}): suma segmentów ${fmt(segSum)} cm ≠ wymiar całkowity ${fmt(ch.total_cm)} cm (różnica ${fmt(ch.total_cm - segSum)} cm).`,
      )
    }
    if (ch.total_cm !== null && cmToMm(ch.total_cm) > len + SUM_TOL_MM) {
      warnings.push(
        `Ściana ${ch.wall} (${CHAIN_PL[ch.layer]}): wymiar całkowity ${fmt(ch.total_cm)} cm > długość ściany ${fmtMm(len)} cm.`,
      )
    }
    // Suma odczytanych szafek vs łańcuch.
    const rrun = reading.runs.find((r) => r.wall === ch.wall)
    if (rrun && ch.layer !== 'overall' && ch.total_cm !== null) {
      const list = ch.layer === 'floor' ? rrun.floor : rrun.upper
      const cabSum = list.reduce((s, c) => s + (c.width_cm ?? 0), 0)
      if (list.length && Math.abs(cmToMm(cabSum) - cmToMm(ch.total_cm)) > SUM_TOL_MM) {
        warnings.push(
          `Ściana ${ch.wall} (${CHAIN_PL[ch.layer]}): suma szerokości odczytanych szafek ${fmt(cabSum)} cm ≠ wymiar całkowity ${fmt(ch.total_cm)} cm.`,
        )
      }
    }
  }

  // --- Przeszkody: brakujące wymiary uzupełniamy jawnie (z ostrzeżeniem), nie po cichu.
  const OBST_PL = {
    murek: 'murek',
    window: 'okno',
    door: 'drzwi',
    pipe: 'pion',
    radiator: 'grzejnik',
    other: 'przeszkoda',
  } as const
  const obstacles: ProjectT['room']['obstacles'] = []
  reading.obstacles.forEach((o, i) => {
    const name = `${OBST_PL[o.kind]}${o.label ? ` „${o.label}”` : ''} (ściana ${o.wall})`
    if (o.w_cm === null) {
      warnings.push(`Przeszkoda ${name}: brak szerokości — pominięta. Dodaj ją ręcznie lub popraw odczyt.`)
      return
    }
    const opening = o.kind === 'window' || o.kind === 'door'
    if (o.x_cm === null) warnings.push(`Przeszkoda ${name}: brak położenia — przyjęto 0 cm od lewego narożnika.`)
    if (o.h_cm === null) warnings.push(`Przeszkoda ${name}: brak wysokości — przyjęto do sufitu (${fmtMm(H)} cm).`)
    if (o.d_cm === null && !opening)
      warnings.push(
        `Przeszkoda ${name}: brak głębokości — przyjęto 0 cm, więc NIE będzie sprawdzana na kolizje z szafkami.`,
      )
    const y = o.y_cm === null ? 0 : cmToMm(o.y_cm)
    obstacles.push({
      id: `${o.kind}-${i + 1}`,
      kind: o.kind,
      wallId: o.wall,
      x: o.x_cm === null ? 0 : Math.max(0, cmToMm(o.x_cm)),
      y: Math.max(0, y),
      w: cmToMm(o.w_cm),
      h: o.h_cm === null ? Math.max(1, H - y) : cmToMm(o.h_cm),
      d: o.d_cm === null || opening ? 0 : Math.max(0, cmToMm(o.d_cm)),
      label: o.label,
    })
  })

  // Uwagi „o szkicu” (rozbieżności łańcuchów, szuflady, pokój) zostają w projekcie; uwagi o układzie — tylko na ekranie weryfikacji.
  const sketchWarnings = [...reading.warnings.map((w) => `AI: ${w}`), ...warnings]
  const now = new Date().toISOString()
  const usedIds = new Set([d.frontMaterialId, d.carcassMaterialId, d.worktopMaterialId])
  const project: ProjectT = {
    id: input.id,
    name: input.name,
    client: input.client || undefined,
    createdAt: now,
    updatedAt: now,
    version: SCHEMA_VERSION,
    units: 'mm',
    room: {
      width: W,
      depth: D,
      height: H,
      walls: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, length: wallLen(id) })),
      obstacles,
    },
    runs,
    materials: MATERIAL_LIBRARY.filter((m) => usedIds.has(m.id)),
    sourceSketch: {
      aiModel: 'zewnętrzny czat AI (Asystent AI)',
      aiRawJson: reading,
      warnings: sketchWarnings,
      questions: reading.questions,
    },
  }
  return { project, warnings: [...sketchWarnings, ...layoutWarnings], defaultsUsed }
}

const CHAIN_PL = { floor: 'szafki dolne', upper: 'szafki górne', overall: 'całość' } as const
const fmtMm = (mm: number) => fmt(mm / 10)
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
