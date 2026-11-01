/**
 * Panel materiałów (SPEC 10.1): rodzaj materiału → styl frontu → dekor/kolor → wykończenie,
 * z zakresem „ta szafka / wszystkie / dolne / górne / słupki”. Niedozwolone kombinacje są wyszarzone.
 */
import { useState } from 'react'
import { findMaterial, setCarcass, setFronts, setHandles, setWorktop, type Scope } from '../materials/assign'
import {
  CATEGORY_PL,
  FINISH_PL,
  MATERIAL_LIBRARY,
  STYLE_PL,
  customLacquer,
  materialAllowed,
  styleAllowed,
} from '../materials/library'
import { findCabinet } from '../model/edit'
import type { CabinetT, FrontT, MaterialT, ProjectT } from '../model/schema'

type StyleId = FrontT['style']
const STYLES: StyleId[] = ['flat', 'shaker', 'frame-panel']

function Swatch({
  m,
  active,
  disabled,
  onClick,
}: {
  m: MaterialT
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`swatch ${active ? 'active' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={m.note ?? m.name}
    >
      <span className={`chip ${m.texture === 'wood' ? 'wood' : ''}`} style={{ background: m.color }} />
      <span className="swatch-name">{m.name}</span>
      <span className="swatch-meta">{FINISH_PL[m.finish]}</span>
    </button>
  )
}

export function MaterialPanel({
  project,
  selectedId,
  apply,
}: {
  project: ProjectT
  selectedId: string | null
  apply: (p: ProjectT) => void
}) {
  const found = findCabinet(project, selectedId)
  const [scopeKey, setScopeKey] = useState<'cabinet' | 'all' | 'base' | 'wall' | 'tall'>('cabinet')
  const effectiveKey = scopeKey === 'cabinet' && !found ? 'all' : scopeKey
  const scope: Scope =
    effectiveKey === 'cabinet'
      ? { kind: 'cabinet', id: found!.cab.id }
      : effectiveKey === 'all'
        ? { kind: 'all' }
        : { kind: 'layer', layer: effectiveKey }

  // Aktualny front w zakresie (do podświetlenia wyboru).
  const sample: CabinetT | undefined =
    found?.cab && effectiveKey === 'cabinet'
      ? found.cab
      : project.runs
          .flatMap((r) =>
            effectiveKey === 'all'
              ? [...(r.layers.base ?? []), ...(r.layers.wall ?? []), ...(r.layers.tall ?? [])]
              : (r.layers[effectiveKey as 'base'] ?? []),
          )
          .find((c) => c.fronts.length)
  const curFront = sample?.fronts[0]
  const curMat = findMaterial(project, curFront?.materialId)
  const [category, setCategory] = useState<MaterialT['category'] | null>(null)
  const cat = category ?? curMat?.category ?? 'lacquer'
  const frontMats = MATERIAL_LIBRARY.filter((m) => materialAllowed(m, 'front'))
  const categories = [...new Set(frontMats.map((m) => m.category))]
  const curStyle: StyleId = curFront?.style ?? 'flat'

  const [code, setCode] = useState('')
  const [color, setColor] = useState('#8a9a7b')
  const [finish, setFinish] = useState<MaterialT['finish']>('matt')

  const customs = project.materials.filter(
    (m) => !MATERIAL_LIBRARY.some((l) => l.id === m.id) && materialAllowed(m, 'front') && m.category === cat,
  )

  return (
    <div className="matpanel">
      <label className="field wide">
        <span>Zastosuj dla</span>
        <select value={effectiveKey} onChange={(e) => setScopeKey(e.target.value as typeof scopeKey)}>
          {found && <option value="cabinet">Ta szafka ({found.cab.id})</option>}
          <option value="all">Wszystkie szafki</option>
          <option value="base">Szafki dolne</option>
          <option value="wall">Szafki górne</option>
          <option value="tall">Słupki</option>
        </select>
      </label>

      <h4>Fronty — 1. rodzaj materiału</h4>
      <div className="chips">
        {categories.map((c) => (
          <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCategory(c)}>
            {CATEGORY_PL[c]}
          </button>
        ))}
      </div>

      <h4>2. styl frontu</h4>
      <div className="chips">
        {STYLES.map((s) => {
          const ok = curMat ? styleAllowed(curMat, s) : true
          return (
            <button
              key={s}
              className={s === curStyle ? 'on' : ''}
              disabled={!ok}
              title={ok ? '' : `Niedostępne dla: ${curMat?.name}`}
              onClick={() => apply(setFronts(project, scope, { style: s }))}
            >
              {STYLE_PL[s]}
            </button>
          )
        })}
      </div>

      <h4>3. dekor / kolor</h4>
      <div className="swatches">
        {[...frontMats.filter((m) => m.category === cat), ...customs].map((m) => (
          <Swatch
            key={m.id}
            m={m}
            active={m.id === curMat?.id}
            onClick={() => {
              const style = styleAllowed(m, curStyle) ? curStyle : (m.frontStyles?.[0] ?? 'flat')
              apply(setFronts(project, scope, { material: m, style }))
            }}
          />
        ))}
      </div>
      {cat === 'lacquer' && (
        <details className="custom">
          <summary>Własny kolor lakieru (RAL / NCS)</summary>
          <div className="row wrap">
            <label className="field">
              <span>Kod</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="np. RAL 7016" />
            </label>
            <label className="field">
              <span>Kolor (dobierz wizualnie)</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <label className="field">
              <span>Wykończenie</span>
              <select value={finish} onChange={(e) => setFinish(e.target.value as MaterialT['finish'])}>
                <option value="matt">mat</option>
                <option value="satin">satyna</option>
                <option value="gloss">połysk</option>
              </select>
            </label>
            <button onClick={() => apply(setFronts(project, scope, { material: customLacquer(code, color, finish) }))}>
              Zastosuj
            </button>
          </div>
          <p className="hint">
            Aplikacja nie przelicza kodów RAL/NCS na kolor — ekran i tak go nie odda wiernie. Kod trafi do PDF.
          </p>
        </details>
      )}

      <h4>Korpusy</h4>
      <div className="swatches">
        {MATERIAL_LIBRARY.filter((m) => materialAllowed(m, 'carcass')).map((m) => (
          <Swatch
            key={m.id}
            m={m}
            active={m.id === sample?.carcassMaterialId}
            onClick={() => apply(setCarcass(project, scope, m))}
          />
        ))}
      </div>

      <h4>Blat (wszystkie ciągi)</h4>
      <div className="swatches">
        {MATERIAL_LIBRARY.filter((m) => materialAllowed(m, 'worktop') && m.allowedFor?.includes('worktop')).map((m) => (
          <Swatch
            key={m.id}
            m={m}
            active={project.runs.some((r) => r.worktop?.materialId === m.id)}
            onClick={() => apply(setWorktop(project, m))}
          />
        ))}
      </div>

      <h4>Uchwyty</h4>
      <div className="chips">
        {(
          [
            ['bar', 'reling'],
            ['knob', 'gałka'],
            ['gola', 'gola'],
            ['push', 'push'],
            ['none', 'brak'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            className={sample?.handle?.type === t ? 'on' : ''}
            onClick={() => apply(setHandles(project, scope, t))}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
