/**
 * Wbudowana biblioteka materiałów (SPEC sekcja 10).
 *
 * UWAGA: kolory są ORIENTACYJNE (dobrane wizualnie, nie z wzorników producentów) — ekran telefonu
 * i tak nie odda koloru 1:1. W PDF dla klienta jest o tym dopisek. Wpis „wg próbki” oznacza materiał
 * z próbek dostarczonych przez użytkownika (Załącznik A) — kod producenta podany tak, jak na próbce.
 *
 * Reguły stylów (SPEC 10.1 „niedozwolone kombinacje wyszarzone”):
 *  - laminat, akryl, szkło → tylko front płaski,
 *  - lakier (MDF) → płaski lub frezowany shaker,
 *  - fornir → płaski, shaker, ramiak,
 *  - drewno lite → shaker lub ramiak.
 */
import type { MaterialT } from '../model/schema'

const lacquer = (id: string, name: string, color: string, finish: MaterialT['finish'] = 'matt'): MaterialT => ({
  id,
  name,
  category: 'lacquer',
  finish,
  color,
  roughness: finish === 'gloss' ? 0.15 : finish === 'satin' ? 0.4 : 0.6,
  metalness: 0,
  allowedFor: ['front', 'plinth'],
  frontStyles: ['flat', 'shaker'],
})

export const MATERIAL_LIBRARY: MaterialT[] = [
  // --- Fronty lakierowane (MDF) ---
  lacquer('front-white-lacquer', 'Lakier biały mat (MDF)', '#f1efe9'),
  lacquer('lak-bialy-satyna', 'Lakier biały satyna (MDF)', '#f3f2ee', 'satin'),
  lacquer('lak-bialy-polysk', 'Lakier biały połysk (MDF)', '#f6f5f2', 'gloss'),
  lacquer('lak-kasmir', 'Lakier kaszmir mat (MDF)', '#d9ccb6'),
  lacquer('lak-szalwia', 'Lakier szałwia mat (MDF)', '#9ba78f'),
  lacquer('lak-granat', 'Lakier granat mat (MDF)', '#2d3d55'),
  lacquer('lak-antracyt', 'Lakier antracyt mat (MDF)', '#34373a'),
  lacquer('lak-czarny', 'Lakier czarny mat (MDF)', '#1d1d1d'),
  // --- Drewno / fornir ---
  {
    id: 'dab-naturalny-ol73',
    name: 'Dąb naturalny (wg próbki Wiech DIMARC OL73)',
    manufacturer: 'Wiech',
    code: 'DIMARC OL73',
    category: 'solid-wood',
    finish: 'satin',
    color: '#c39a63',
    roughness: 0.55,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['front', 'plinth'],
    frontStyles: ['frame-panel', 'shaker'],
    note: 'Kolor orientacyjny — potwierdzić na próbce producenta.',
  },
  {
    id: 'dab-ciemny-braz',
    name: 'Dąb bejcowany ciemny brąz (lite)',
    category: 'solid-wood',
    finish: 'satin',
    color: '#5b3e29',
    roughness: 0.5,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['front', 'plinth'],
    frontStyles: ['frame-panel', 'shaker'],
  },
  {
    id: 'fornir-dab',
    name: 'Fornir dębowy naturalny',
    category: 'veneer',
    finish: 'matt',
    color: '#bc915e',
    roughness: 0.6,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['front', 'carcass', 'plinth'],
    frontStyles: ['flat', 'shaker', 'frame-panel'],
  },
  // --- Laminaty (płyta laminowana) ---
  {
    id: 'carcass-white',
    name: 'Płyta laminowana biała',
    category: 'laminate',
    finish: 'matt',
    color: '#e6e6e3',
    roughness: 0.7,
    metalness: 0,
    allowedFor: ['front', 'carcass', 'plinth'],
    frontStyles: ['flat'],
  },
  {
    id: 'lam-szary',
    name: 'Płyta laminowana szara jasna',
    category: 'laminate',
    finish: 'matt',
    color: '#bdbdb9',
    roughness: 0.7,
    metalness: 0,
    allowedFor: ['front', 'carcass', 'plinth'],
    frontStyles: ['flat'],
  },
  {
    id: 'lam-grafit',
    name: 'Płyta laminowana grafit',
    category: 'laminate',
    finish: 'matt',
    color: '#4a4d50',
    roughness: 0.65,
    metalness: 0,
    allowedFor: ['front', 'carcass', 'plinth'],
    frontStyles: ['flat'],
  },
  {
    id: 'lam-dab-jasny',
    name: 'Płyta laminowana dekor dąb jasny',
    category: 'laminate',
    finish: 'structured',
    color: '#c9a77c',
    roughness: 0.6,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['front', 'carcass', 'plinth'],
    frontStyles: ['flat'],
  },
  // --- Blaty ---
  {
    id: 'worktop-oak',
    name: 'Blat laminowany dąb',
    category: 'laminate',
    finish: 'structured',
    color: '#b08a5a',
    roughness: 0.55,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['worktop'],
  },
  {
    id: 'blat-dab-lity',
    name: 'Blat dąb lity olejowany',
    category: 'solid-wood',
    finish: 'satin',
    color: '#b98b55',
    roughness: 0.45,
    metalness: 0,
    texture: 'wood',
    allowedFor: ['worktop'],
  },
  {
    id: 'blat-kwarc-bialy',
    name: 'Blat konglomerat kwarcowy biały',
    category: 'stone',
    finish: 'gloss',
    color: '#ecebe7',
    roughness: 0.25,
    metalness: 0,
    allowedFor: ['worktop'],
  },
  {
    id: 'blat-czarny',
    name: 'Blat spiek/kamień czarny mat',
    category: 'stone',
    finish: 'matt',
    color: '#232323',
    roughness: 0.5,
    metalness: 0,
    allowedFor: ['worktop'],
  },
  {
    id: 'blat-beton',
    name: 'Blat laminowany beton',
    category: 'laminate',
    finish: 'structured',
    color: '#9d9a95',
    roughness: 0.7,
    metalness: 0,
    allowedFor: ['worktop'],
  },
]

export const CATEGORY_PL: Record<MaterialT['category'], string> = {
  laminate: 'Płyta laminowana',
  lacquer: 'MDF lakierowany',
  veneer: 'Fornir',
  'solid-wood': 'Drewno lite',
  acrylic: 'Akryl',
  glass: 'Szkło',
  stone: 'Kamień / konglomerat',
  metal: 'Metal',
}

export const FINISH_PL: Record<MaterialT['finish'], string> = {
  matt: 'mat',
  satin: 'satyna',
  gloss: 'połysk',
  structured: 'struktura',
}

export const STYLE_PL: Record<'flat' | 'shaker' | 'frame-panel', string> = {
  flat: 'gładki',
  shaker: 'frezowany (shaker)',
  'frame-panel': 'ramiakowy z płyciną',
}

export type MaterialUse = 'front' | 'carcass' | 'worktop' | 'plinth'

export function materialAllowed(m: MaterialT, use: MaterialUse) {
  return !m.allowedFor || m.allowedFor.includes(use)
}

export function styleAllowed(m: MaterialT, style: 'flat' | 'shaker' | 'frame-panel') {
  return !m.frontStyles || m.frontStyles.includes(style)
}

/** Własny kolor lakieru (np. wpisany kod RAL/NCS + kolor dobrany wizualnie). */
export function customLacquer(code: string, color: string, finish: MaterialT['finish']): MaterialT {
  const slug =
    code
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .toLowerCase() || color.slice(1)
  return {
    ...lacquer(`lak-${slug}-${finish}`, `Lakier ${code.trim() || color} ${FINISH_PL[finish]} (MDF)`, color, finish),
    code: code.trim() || undefined,
    note: 'Kolor na ekranie orientacyjny — wzorzec RAL/NCS u lakiernika.',
  }
}
