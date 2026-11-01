/**
 * Panel boczny: informacje o zaznaczonej szafce + edytor JSON projektu.
 * Edytor JSON = wejście etapu 1 („generator 3D z ręcznie wpisanego JSON”). Każda zmiana przechodzi przez Zod.
 */
import { useMemo, useState } from 'react'
import { carcassPanels } from '../geometry/carcass'
import { migrateAndValidate } from '../model/migrate'
import type { CabinetT, ProjectT } from '../model/schema'
import { useStore } from '../store/projectStore'

const TYPE_PL: Record<CabinetT['type'], string> = {
  base: 'dolna',
  wall: 'górna',
  tall: 'słupek',
  corner: 'narożna',
  appliance: 'pod AGD',
  open: 'otwarta',
  filler: 'blenda',
}

function findCabinet(p: ProjectT, id: string | null) {
  if (!id) return null
  for (const r of p.runs) {
    for (const layer of ['base', 'tall', 'wall'] as const) {
      const c = r.layers[layer]?.find((x) => x.id === id)
      if (c) return { cab: c, run: r }
    }
  }
  return null
}

export function SidePanel({ project, onApply }: { project: ProjectT; onApply: (p: ProjectT) => void }) {
  const selectedId = useStore((s) => s.selectedCabinetId)
  const found = findCabinet(project, selectedId)
  const [draft, setDraft] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)

  // Dopóki nie edytujesz, pole pokazuje aktualny projekt (także po undo / otwarciu innego).
  const current = useMemo(() => JSON.stringify(project, null, 2), [project])
  const text = dirty ? draft : current

  const panels = useMemo(() => (found ? carcassPanels(found.cab) : []), [found])

  const apply = () => {
    try {
      const r = migrateAndValidate(JSON.parse(text))
      if (!r.ok) return setErrors(r.errors)
      setErrors([])
      setDirty(false)
      onApply(r.project)
    } catch (e) {
      setErrors(['Błąd składni JSON: ' + (e as Error).message])
    }
  }

  return (
    <aside className="side">
      <section>
        <h3>Zaznaczony element</h3>
        {found ? (
          <>
            <p>
              <b>{found.cab.id}</b> — szafka {TYPE_PL[found.cab.type]}
              {found.cab.appliance ? ` (${found.cab.appliance})` : ''}, ciąg {found.run.id}, ściana {found.run.wallId}
            </p>
            <p>
              Wymiary korpusu: {found.cab.width} × {found.cab.height} × {found.cab.depth} mm (szer. × wys. × gł.), od
              podłogi {found.cab.elevation} mm
            </p>
            {panels.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Płyta</th>
                    <th>wymiary [mm]</th>
                  </tr>
                </thead>
                <tbody>
                  {panels.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>
                        {/* Formatka: dwa największe wymiary + grubość */}
                        {[p.sx, p.sy, p.sz].sort((a, b) => b - a).join(' × ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">Wybór materiału po tapnięciu — etap 2.</p>
          </>
        ) : (
          <p className="hint">
            Dotknij szafki w widoku 3D. Obrót: 1 palec, zoom: 2 palce, przesuwanie: 2 palce/prawy przycisk.
          </p>
        )}
      </section>

      <section className="json">
        <h3>JSON projektu</h3>
        <textarea
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setDraft(e.target.value)
            setDirty(true)
          }}
        />
        <div className="row">
          <button onClick={apply} disabled={!dirty}>
            Zastosuj
          </button>
          <button
            onClick={() => {
              setDirty(false)
              setErrors([])
            }}
            disabled={!dirty}
          >
            Odrzuć zmiany
          </button>
        </div>
        {errors.length > 0 && (
          <ul className="errors">
            {errors.slice(0, 20).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
