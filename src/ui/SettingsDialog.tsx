/**
 * Ustawienia warsztatu: dane do PDF, legenda symboli (trafia do promptu AI) i wartości domyślne (SPEC 8).
 */
import { useState } from 'react'
import { saveSettings } from '../db/db'
import { MATERIAL_LIBRARY, STYLE_PL, materialAllowed } from '../materials/library'
import { DEFAULT_LEGEND, type SettingsT } from '../model/settings'
import { useStore } from '../store/projectStore'

const DEFAULT_FIELDS: [keyof SettingsT['defaults'], string][] = [
  ['plinthHeight', 'Cokół'],
  ['baseHeight', 'Korpus dolny — wysokość'],
  ['baseDepth', 'Korpus dolny — głębokość'],
  ['worktopThickness', 'Blat — grubość'],
  ['worktopOverhang', 'Blat — nawis z przodu'],
  ['wallDepth', 'Szafka górna — głębokość'],
  ['wallHeight', 'Szafka górna — wysokość'],
  ['wallElevation', 'Szafka górna — dół od podłogi'],
  ['tallDepth', 'Słupek — głębokość'],
  ['frontGap', 'Szczelina między frontami'],
]

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [s, setS] = useState<SettingsT>(current)
  const d = s.defaults
  const setD = (patch: Partial<SettingsT['defaults']>) => setS({ ...s, defaults: { ...d, ...patch } })

  const save = async () => {
    setSettings(s)
    await saveSettings(s)
    onClose()
  }

  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-head">
          <strong>Ustawienia warsztatu</strong>
          <button onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <h4>Dane w nagłówku PDF</h4>
          <div className="grid4">
            <label className="field">
              <span>Nazwa warsztatu</span>
              <input value={s.workshopName} onChange={(e) => setS({ ...s, workshopName: e.target.value })} />
            </label>
            <label className="field">
              <span>Kontakt (tel., e-mail)</span>
              <input value={s.workshopContact} onChange={(e) => setS({ ...s, workshopContact: e.target.value })} />
            </label>
          </div>

          <h4>Legenda symboli na szkicach (dołączana do promptu AI)</h4>
          <textarea rows={6} value={s.legend} onChange={(e) => setS({ ...s, legend: e.target.value })} />
          <button className="link" onClick={() => setS({ ...s, legend: DEFAULT_LEGEND })}>
            Przywróć domyślną legendę
          </button>

          <h4>Wartości domyślne (mm) — używane tylko, gdy szkic ich nie podaje</h4>
          <p className="hint">
            Robocze wartości branżowe. Wymiary koordynacyjne mebli kuchennych określa PN-EN 1116 — sprawdź z aktualnym
            egzemplarzem normy.
          </p>
          <div className="grid4">
            {DEFAULT_FIELDS.map(([k, label]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <input
                  inputMode="numeric"
                  value={String(d[k])}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value))
                    if (Number.isFinite(v) && v >= 0) setD({ [k]: v })
                  }}
                />
              </label>
            ))}
          </div>
          <div className="grid4">
            <label className="field">
              <span>Domyślny styl frontu</span>
              <select
                value={d.frontStyle}
                onChange={(e) => setD({ frontStyle: e.target.value as SettingsT['defaults']['frontStyle'] })}
              >
                {Object.entries(STYLE_PL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['frontMaterialId', 'front', 'Domyślny materiał frontów'],
                ['carcassMaterialId', 'carcass', 'Domyślny materiał korpusów'],
                ['worktopMaterialId', 'worktop', 'Domyślny blat'],
              ] as const
            ).map(([k, use, label]) => (
              <label className="field" key={k}>
                <span>{label}</span>
                <select value={d[k]} onChange={(e) => setD({ [k]: e.target.value })}>
                  {MATERIAL_LIBRARY.filter(
                    (m) => materialAllowed(m, use) && (use !== 'worktop' || m.allowedFor?.includes('worktop')),
                  ).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Anuluj</button>
          <button className="primary" onClick={save}>
            Zapisz
          </button>
        </footer>
      </div>
    </div>
  )
}
