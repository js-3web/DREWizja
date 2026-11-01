/**
 * Operacje przypisania materiałów (SPEC 10.2): „dla elementu / dla wszystkich frontów / dla grupy”.
 * Czyste funkcje: biorą projekt, zwracają NOWY projekt (stary zostaje bez zmian — dzięki temu działa cofnij/ponów).
 */
import type { CabinetT, FrontT, MaterialT, ProjectT, RunT } from '../model/schema'
import { MATERIAL_LIBRARY, styleAllowed } from './library'

export type Scope =
  { kind: 'cabinet'; id: string } | { kind: 'all' } | { kind: 'layer'; layer: 'base' | 'wall' | 'tall' }

const LAYERS = ['base', 'tall', 'wall'] as const

function mapCabinets(p: ProjectT, scope: Scope, fn: (c: CabinetT) => CabinetT): ProjectT {
  const runs: RunT[] = p.runs.map((r) => {
    const layers = { ...r.layers }
    for (const layer of LAYERS) {
      const list = r.layers[layer]
      if (!list) continue
      if (scope.kind === 'layer' && scope.layer !== layer) continue
      layers[layer] = list.map((c) => (scope.kind === 'cabinet' && c.id !== scope.id ? c : fn(c)))
    }
    return { ...r, layers }
  })
  return { ...p, runs }
}

/** Dopisuje materiał do listy projektu, jeśli go tam nie ma (projekt jest samowystarczalny — też po eksporcie). */
export function ensureMaterial(p: ProjectT, m: MaterialT): ProjectT {
  if (p.materials.some((x) => x.id === m.id)) return p
  return { ...p, materials: [...p.materials, m] }
}

export function findMaterial(p: Pick<ProjectT, 'materials'>, id: string | undefined): MaterialT | undefined {
  if (!id) return undefined
  return p.materials.find((m) => m.id === id) ?? MATERIAL_LIBRARY.find((m) => m.id === id)
}

/**
 * Zmienia materiał i/lub styl frontów w zakresie. Jeśli styl jest niedozwolony dla materiału
 * (np. ramiak z laminatu), front dostaje pierwszy dozwolony styl — zamiast cichego złamania reguły.
 */
export function setFronts(
  p: ProjectT,
  scope: Scope,
  change: { material?: MaterialT; style?: FrontT['style'] },
): ProjectT {
  let out = change.material ? ensureMaterial(p, change.material) : p
  out = mapCabinets(out, scope, (c) => ({
    ...c,
    fronts: c.fronts.map((f) => {
      const material = change.material ?? findMaterial(out, f.materialId)
      let style = change.style ?? f.style
      if (material && !styleAllowed(material, style)) style = material.frontStyles?.[0] ?? 'flat'
      return { ...f, materialId: change.material?.id ?? f.materialId, style }
    }),
  }))
  return out
}

export function setCarcass(p: ProjectT, scope: Scope, material: MaterialT): ProjectT {
  return mapCabinets(ensureMaterial(p, material), scope, (c) => ({ ...c, carcassMaterialId: material.id }))
}

export function setWorktop(p: ProjectT, material: MaterialT): ProjectT {
  const out = ensureMaterial(p, material)
  return {
    ...out,
    runs: out.runs.map((r) => (r.worktop ? { ...r, worktop: { ...r.worktop, materialId: material.id } } : r)),
  }
}

/** Uchwyty: typ dla zakresu. */
export function setHandles(p: ProjectT, scope: Scope, type: NonNullable<CabinetT['handle']>['type']): ProjectT {
  return mapCabinets(p, scope, (c) => ({ ...c, handle: { ...c.handle, type } }))
}

/** Usuwa z listy materiały, których nic już nie używa (porządek przed PDF/eksportem). */
export function pruneMaterials(p: ProjectT): ProjectT {
  const used = new Set<string>()
  for (const r of p.runs) {
    if (r.worktop) used.add(r.worktop.materialId)
    for (const layer of LAYERS)
      for (const c of r.layers[layer] ?? []) {
        if (c.carcassMaterialId) used.add(c.carcassMaterialId)
        c.fronts.forEach((f) => used.add(f.materialId))
      }
  }
  return { ...p, materials: p.materials.filter((m) => used.has(m.id)) }
}

/** Podsumowanie materiałów do PDF: co, gdzie, w jakim stylu. */
export function materialSummary(p: ProjectT) {
  const rows = new Map<string, { use: string; material?: MaterialT; styles: Set<string>; count: number }>()
  const add = (use: string, id: string | undefined, style?: string) => {
    if (!id) return
    const key = `${use}|${id}`
    const row = rows.get(key) ?? { use, material: findMaterial(p, id), styles: new Set<string>(), count: 0 }
    row.count++
    if (style) row.styles.add(style)
    rows.set(key, row)
  }
  const LAYER_PL = { base: 'Fronty dolne', wall: 'Fronty górne', tall: 'Fronty słupków' } as const
  for (const r of p.runs) {
    if (r.worktop) add('Blat', r.worktop.materialId)
    for (const layer of LAYERS)
      for (const c of r.layers[layer] ?? []) {
        add('Korpusy', c.carcassMaterialId)
        c.fronts.forEach((f) => add(LAYER_PL[layer], f.materialId, f.style))
      }
  }
  return [...rows.values()]
}
