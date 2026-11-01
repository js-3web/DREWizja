/**
 * Ustawienia warsztatu: wartości domyślne (SPEC sekcja 8) i legenda symboli (SPEC sekcja 4).
 * Wartości domyślne są używane TYLKO, gdy szkic ich nie podaje — i wtedy są oznaczane jako „domyślne”.
 * To robocze wartości branżowe do weryfikacji przez użytkownika (norma PN-EN 1116 — z jej aktualnego egzemplarza).
 */
import { z } from 'zod'

const mm = z.number().int().nonnegative()

export const Settings = z.object({
  workshopName: z.string().default(''),
  workshopContact: z.string().default(''),
  legend: z.string().default(''),
  defaults: z.object({
    plinthHeight: mm.default(100),
    baseHeight: mm.default(720),
    baseDepth: mm.default(560),
    worktopThickness: mm.default(38),
    worktopOverhang: mm.default(20),
    wallDepth: mm.default(320),
    wallElevation: mm.default(1450),
    wallHeight: mm.default(720),
    tallDepth: mm.default(560),
    frontGap: mm.default(3),
    frontStyle: z.enum(['flat', 'shaker', 'frame-panel']).default('flat'),
    frontMaterialId: z.string().default('front-white-lacquer'),
    carcassMaterialId: z.string().default('carcass-white'),
    worktopMaterialId: z.string().default('worktop-oak'),
  }),
})

export type SettingsT = z.infer<typeof Settings>

export const DEFAULT_LEGEND = `- Wymiary na szkicu w centymetrach.
- Kółka na blacie = płyta grzewcza; prostokąt z zaokrągleniem/kranem = zlew.
- Ukośna kreska na froncie = drzwi (wierzchołek kąta wskazuje stronę zawiasów); poziome podziały = szuflady.
- „Murek” = przeszkoda budowlana (wymiar przy nim = szerokość/głębokość murku).
- Pola kreskowane — znaczenie NIEJEDNOZNACZNE (szkło / półka otwarta / okap / blenda) — zawsze zapytaj.`

export function defaultSettings(): SettingsT {
  return Settings.parse({ legend: DEFAULT_LEGEND, defaults: {} })
}
