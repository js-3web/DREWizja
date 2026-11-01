/**
 * Magazyn stanu aplikacji (Zustand).
 *
 * „Stan” = dane, które aktualnie pokazuje aplikacja (otwarty projekt, zaznaczona szafka…).
 * Komponenty React „subskrybują” wybrane pola i odświeżają się same, gdy pole się zmieni.
 *
 * Historia undo/redo działa na poziomie całego JSON projektu (SPEC sekcja 5):
 * każda zmiana odkłada poprzednią wersję na stos `past`.
 */
import { create } from 'zustand'
import type { ProjectT } from '../model/schema'
import { defaultSettings, type SettingsT } from '../model/settings'

const HISTORY_LIMIT = 50

export type CameraPreset = 'iso' | 'front-A' | 'front-B' | 'eye'

interface State {
  project: ProjectT | null
  past: ProjectT[]
  future: ProjectT[]
  selectedCabinetId: string | null
  showWalls: boolean
  cameraPreset: { name: CameraPreset; nonce: number }
  settings: SettingsT
  setSettings: (s: SettingsT) => void
  /** Ustawia projekt; record=false przy otwieraniu (nie dokłada do historii). */
  setProject: (p: ProjectT, record?: boolean) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  toggleWalls: () => void
  setCamera: (name: CameraPreset) => void
}

const touch = (p: ProjectT): ProjectT => ({ ...p, updatedAt: new Date().toISOString() })

export const useStore = create<State>((set, get) => ({
  project: null,
  past: [],
  future: [],
  selectedCabinetId: null,
  showWalls: true,
  cameraPreset: { name: 'iso', nonce: 0 },
  settings: defaultSettings(),
  setSettings: (settings) => set({ settings }),

  setProject: (p, record = true) => {
    const cur = get().project
    if (record && cur) {
      set({ project: touch(p), past: [...get().past, cur].slice(-HISTORY_LIMIT), future: [] })
    } else {
      set({ project: p, past: [], future: [], selectedCabinetId: null })
    }
  },
  undo: () => {
    const { past, project, future } = get()
    if (!past.length || !project) return
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] })
  },
  redo: () => {
    const { past, project, future } = get()
    if (!future.length || !project) return
    set({ project: future[0], past: [...past, project], future: future.slice(1) })
  },
  select: (id) => set({ selectedCabinetId: id }),
  toggleWalls: () => set({ showWalls: !get().showWalls }),
  setCamera: (name) => set({ cameraPreset: { name, nonce: get().cameraPreset.nonce + 1 } }),
}))
