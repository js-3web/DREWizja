/**
 * Panel boczny z zakładkami:
 *  - Element  — zaznaczona szafka: wymiary, fronty, AGD + materiały (dla elementu / grupy / wszystkich),
 *  - Projekt  — nazwa, klient, wymiary pokoju, pytania i ostrzeżenia z odczytu szkicu,
 *  - Kontrola — walidacja geometryczna (SPEC 9): błędy blokują PDF dla klienta,
 *  - JSON     — ręczna edycja JSON projektu (każda zmiana przez walidację Zod).
 */
import { useMemo, useState } from 'react'
import { carcassPanels } from '../geometry/carcass'
import { validateGeometry, type Issue } from '../geometry/validate'
import { findCabinet, removeCabinet, setCabinetAppliance, setCabinetLayout, updateCabinetDims } from '../model/edit'
import { migrateAndValidate } from '../model/migrate'
import type { CabinetT, FrontLayoutT, ProjectT } from '../model/schema'
import { useStore } from '../store/projectStore'
import { MaterialPanel } from './MaterialPanel'
import { NumField, TextField } from './fields'

const TYPE_PL: Record<CabinetT['type'], string> = {
  base: 'dolna',
  wall: 'górna',
  tall: 'słupek',
  corner: 'narożna',
  appliance: 'pod AGD',
  open: 'otwarta',
  filler: 'blenda',
}

type Tab = 'element' | 'project' | 'check' | 'json'

function layoutKey(l: FrontLayoutT | undefined): string {
  if (!l) return 'custom'
  return l.kind === 'drawers' ? `drawers${l.heights.length}` : l.kind
}

function ElementTab({ project, apply }: { project: ProjectT; apply: (p: ProjectT) => void }) {
  const selectedId = useStore((s) => s.selectedCabinetId)
  const select = useStore((s) => s.select)
  const gap = useStore((s) => s.settings.defaults.frontGap)
  const found = findCabinet(project, selectedId)
  const panels = useMemo(() => (found ? carcassPanels(found.cab) : []), [found])

  const changeLayout = (key: string) => {
    if (!found) return
    const c = found.cab
    let layout: FrontLayoutT
    if (key.startsWith('drawers')) {
      const n = Number(key.slice(7))
      const each = Math.floor(c.height / n)
      layout = {
        kind: 'drawers',
        heights: Array.from({ length: n }, (_, i) => (i === n - 1 ? c.height - each * (n - 1) : each)),
      }
    } else layout = { kind: key as 'door' | 'doors2' | 'flap' | 'none' }
    apply(setCabinetLayout(project, c.id, layout, gap))
  }

  return (
    <>
      {found ? (
        <section>
          <p>
            <b>{found.cab.id}</b> — szafka {TYPE_PL[found.cab.type]}, ściana {found.run.wallId}
            {found.cab.confidence !== undefined && found.cab.confidence < 0.7 && (
              <span className="badge warn"> niska pewność odczytu ({Math.round(found.cab.confidence * 100)}%)</span>
            )}
          </p>
          <div className="grid4">
            <NumField
              label="Szerokość"
              suffix="mm"
              min={50}
              value={found.cab.width}
              onCommit={(v) => apply(updateCabinetDims(project, found.cab.id, { width: v }, gap))}
            />
            <NumField
              label="Wysokość"
              suffix="mm"
              min={50}
              value={found.cab.height}
              onCommit={(v) => apply(updateCabinetDims(project, found.cab.id, { height: v }, gap))}
            />
            <NumField
              label="Głębokość"
              suffix="mm"
              min={50}
              value={found.cab.depth}
              onCommit={(v) => apply(updateCabinetDims(project, found.cab.id, { depth: v }, gap))}
            />
            <NumField
              label="Od podłogi"
              suffix="mm"
              min={0}
              value={found.cab.elevation}
              onCommit={(v) => apply(updateCabinetDims(project, found.cab.id, { elevation: v }, gap))}
            />
          </div>
          <div className="row wrap">
            <label className="field">
              <span>Fronty</span>
              <select value={layoutKey(found.cab.layout)} onChange={(e) => changeLayout(e.target.value)}>
                <option value="door">1 drzwi</option>
                <option value="doors2">2 drzwi</option>
                <option value="drawers1">1 szuflada</option>
                <option value="drawers2">2 szuflady</option>
                <option value="drawers3">3 szuflady</option>
                <option value="drawers4">4 szuflady</option>
                <option value="flap">klapa</option>
                <option value="none">bez frontu</option>
                {layoutKey(found.cab.layout) === 'custom' && <option value="custom">(z JSON)</option>}
              </select>
            </label>
            <label className="field">
              <span>AGD</span>
              <select
                value={found.cab.appliance ?? ''}
                onChange={(e) =>
                  apply(
                    setCabinetAppliance(project, found.cab.id, (e.target.value || undefined) as CabinetT['appliance']),
                  )
                }
              >
                <option value="">—</option>
                <option value="oven">piekarnik</option>
                <option value="dishwasher">zmywarka</option>
                <option value="sink">zlew</option>
                <option value="fridge">lodówka</option>
                <option value="hood">okap</option>
                <option value="microwave">mikrofala</option>
              </select>
            </label>
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Usunąć szafkę ${found.cab.id}? Kolejne szafki w ciągu przesuną się.`)) {
                  apply(removeCabinet(project, found.cab.id))
                  select(null)
                }
              }}
            >
              Usuń szafkę
            </button>
          </div>
          {panels.length > 0 && (
            <details>
              <summary>Płyty korpusu ({panels.length})</summary>
              <table>
                <tbody>
                  {panels.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td>{[p.sx, p.sy, p.sz].sort((a, b) => b - a).join(' × ')} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>
      ) : (
        <p className="hint">
          Dotknij szafki w widoku 3D, aby zmienić jej wymiary. Materiały poniżej możesz zmienić dla całej zabudowy lub
          grupy.
        </p>
      )}
      <MaterialPanel project={project} selectedId={selectedId} apply={apply} />
    </>
  )
}

function ProjectTab({ project, apply }: { project: ProjectT; apply: (p: ProjectT) => void }) {
  const { room } = project
  const setRoom = (patch: Partial<ProjectT['room']>) => {
    const next = { ...room, ...patch }
    // Długości ścian wynikają z wymiarów pokoju — aktualizujemy razem (jedno źródło prawdy).
    next.walls = next.walls.map((w) => ({ ...w, length: w.id === 'A' || w.id === 'C' ? next.width : next.depth }))
    apply({ ...project, room: next })
  }
  const q = project.sourceSketch?.questions ?? []
  const sw = project.sourceSketch?.warnings ?? []
  return (
    <section>
      <TextField
        label="Nazwa projektu"
        value={project.name}
        onCommit={(v) => v.trim() && apply({ ...project, name: v.trim() })}
      />
      <TextField
        label="Klient"
        value={project.client ?? ''}
        onCommit={(v) => apply({ ...project, client: v.trim() || undefined })}
      />
      <h4>Pomieszczenie</h4>
      <div className="grid4">
        <NumField
          label="Szerokość (ściana A)"
          suffix="mm"
          min={500}
          value={room.width}
          onCommit={(v) => setRoom({ width: v })}
        />
        <NumField
          label="Głębokość (ściana B)"
          suffix="mm"
          min={500}
          value={room.depth}
          onCommit={(v) => setRoom({ depth: v })}
        />
        <NumField
          label="Wysokość"
          suffix="mm"
          min={1500}
          value={room.height}
          onCommit={(v) => setRoom({ height: v })}
        />
      </div>
      <TextField
        label="Uwagi (trafiają do PDF)"
        multiline
        value={project.notes ?? ''}
        onCommit={(v) => apply({ ...project, notes: v || undefined })}
      />
      {q.length > 0 && (
        <>
          <h4>Otwarte pytania z odczytu szkicu</h4>
          <ul className="questions">
            {q.map((x, i) => (
              <li key={i}>
                {x}{' '}
                <button
                  className="link"
                  onClick={() =>
                    apply({
                      ...project,
                      sourceSketch: { ...project.sourceSketch!, questions: q.filter((_, j) => j !== i) },
                    })
                  }
                >
                  wyjaśnione ✓
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {sw.length > 0 && (
        <>
          <h4>Uwagi do szkicu (rozbieżności wymiarów)</h4>
          <ul className="questions">
            {sw.map((x, i) => (
              <li key={i}>
                {x}{' '}
                <button
                  className="link"
                  onClick={() =>
                    apply({
                      ...project,
                      sourceSketch: { ...project.sourceSketch!, warnings: sw.filter((_, j) => j !== i) },
                    })
                  }
                >
                  sprawdzone ✓
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const SEV_PL: Record<Issue['severity'], string> = { error: 'Błąd', warning: 'Ostrzeżenie', info: 'Info' }

function CheckTab({ issues }: { issues: Issue[] }) {
  const select = useStore((s) => s.select)
  if (!issues.length) return <p className="hint">Brak uwag — projekt przeszedł kontrolę geometrii.</p>
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={i.severity} onClick={() => i.cabinetIds?.[0] && select(i.cabinetIds[0])}>
          <b>{SEV_PL[i.severity]}:</b> {i.message}
        </li>
      ))}
      <li className="hint">Błędy blokują PDF dla klienta. Dotknij komunikatu, aby zaznaczyć szafkę.</li>
    </ul>
  )
}

function JsonTab({ project, apply }: { project: ProjectT; apply: (p: ProjectT) => void }) {
  const [draft, setDraft] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const current = useMemo(() => JSON.stringify(project, null, 2), [project])
  const text = dirty ? draft : current
  const doApply = () => {
    try {
      const r = migrateAndValidate(JSON.parse(text))
      if (!r.ok) return setErrors(r.errors)
      setErrors([])
      setDirty(false)
      apply(r.project)
    } catch (e) {
      setErrors(['Błąd składni JSON: ' + (e as Error).message])
    }
  }
  return (
    <section className="json">
      <textarea
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setDraft(e.target.value)
          setDirty(true)
        }}
      />
      <div className="row">
        <button onClick={doApply} disabled={!dirty}>
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
  )
}

export function SidePanel({ project, onApply }: { project: ProjectT; onApply: (p: ProjectT) => void }) {
  const [tab, setTab] = useState<Tab>('element')
  const issues = useMemo(() => validateGeometry(project), [project])
  const errors = issues.filter((i) => i.severity === 'error').length
  const warns = issues.filter((i) => i.severity === 'warning').length
  return (
    <aside className="side">
      <nav className="tabs">
        <button className={tab === 'element' ? 'on' : ''} onClick={() => setTab('element')}>
          Element
        </button>
        <button className={tab === 'project' ? 'on' : ''} onClick={() => setTab('project')}>
          Projekt
        </button>
        <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>
          Kontrola
          {errors ? (
            <span className="badge err">{errors}</span>
          ) : warns ? (
            <span className="badge warn">{warns}</span>
          ) : (
            ' ✓'
          )}
        </button>
        <button className={tab === 'json' ? 'on' : ''} onClick={() => setTab('json')}>
          JSON
        </button>
      </nav>
      {tab === 'element' && <ElementTab project={project} apply={onApply} />}
      {tab === 'project' && <ProjectTab project={project} apply={onApply} />}
      {tab === 'check' && <CheckTab issues={issues} />}
      {tab === 'json' && <JsonTab project={project} apply={onApply} />}
    </aside>
  )
}
