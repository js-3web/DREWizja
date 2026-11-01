/**
 * Kreator „Nowy ze szkicu” — tryb Asystent AI (bez API, bez klucza):
 *  1. dane pomieszczenia → 2. prompt do skopiowania (wklejasz w czacie AI razem ze zdjęciem szkicu)
 *  → 3. wklejenie odpowiedzi → 4. ekran weryfikacji (poprawki, pytania, ostrzeżenia) → projekt.
 *
 * Szkic kreatora zapisuje się w lokalnej bazie przy każdej zmianie: na iPhonie przełączenie do aplikacji
 * czatu może zamknąć DREWizję w tle — po powrocie kreator wraca w tym samym miejscu.
 */
import { useEffect, useMemo, useState } from 'react'
import { convertReading } from '../ai/convert'
import { buildCorrectionPrompt, buildReadingPrompt } from '../ai/prompt'
import { parseReading, type ReadingCabinetT, type SketchReadingT } from '../ai/reading'
import { kvGet, kvSet } from '../db/db'
import type { ProjectT } from '../model/schema'
import { useStore } from '../store/projectStore'

interface Draft {
  step: 1 | 2 | 3 | 4
  name: string
  client: string
  widthCm: string
  depthCm: string
  heightCm: string
  notes: string
  response: string
  reading: SketchReadingT | null
  remarks: string
}

const EMPTY: Draft = {
  step: 1,
  name: '',
  client: '',
  widthCm: '',
  depthCm: '',
  heightCm: '260',
  notes: '',
  response: '',
  reading: null,
  remarks: '',
}

const DRAFT_KEY = 'wizardDraft'
const num = (s: string) => Number(s.replace(',', '.'))

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const TYPES: ReadingCabinetT['type'][] = ['base', 'corner', 'tall', 'wall', 'open', 'filler', 'gap', 'appliance']
const TYPE_PL: Record<ReadingCabinetT['type'], string> = {
  base: 'dolna',
  corner: 'narożna',
  tall: 'słupek',
  wall: 'górna',
  open: 'otwarta',
  filler: 'blenda',
  gap: 'przerwa',
  appliance: 'AGD/okap',
}
const FRONT_PL = {
  door: 'drzwi',
  doors2: '2 drzwi',
  drawers: 'szuflady',
  flap: 'klapa',
  glass: 'witryna',
  none: 'brak',
} as const
const APPL_PL = {
  hob: 'płyta',
  oven: 'piekarnik',
  fridge: 'lodówka',
  dishwasher: 'zmywarka',
  sink: 'zlew',
  hood: 'okap',
  microwave: 'mikrofala',
} as const

export function SketchWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (p: ProjectT) => void }) {
  const settings = useStore((s) => s.settings)
  const [d, setD] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    kvGet<Draft>(DRAFT_KEY).then((saved) => setD(saved ?? EMPTY))
  }, [])
  useEffect(() => {
    if (d) kvSet(DRAFT_KEY, d)
  }, [d])

  const roomOk = d && num(d.widthCm) > 50 && num(d.depthCm) > 50 && num(d.heightCm) > 150
  const prompt = useMemo(
    () =>
      d && roomOk
        ? buildReadingPrompt(
            { roomWidthCm: num(d.widthCm), roomDepthCm: num(d.depthCm), roomHeightCm: num(d.heightCm), notes: d.notes },
            settings,
          )
        : '',
    [d, roomOk, settings],
  )
  const preview = useMemo(() => {
    if (!d?.reading || !roomOk) return null
    try {
      return convertReading(
        d.reading,
        {
          id: 'preview',
          name: d.name || 'Projekt',
          roomMm: {
            width: Math.round(num(d.widthCm) * 10),
            depth: Math.round(num(d.depthCm) * 10),
            height: Math.round(num(d.heightCm) * 10),
          },
        },
        settings,
      )
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [d, roomOk, settings])

  if (!d) return null
  const up = (patch: Partial<Draft>) => setD({ ...d, ...patch })

  const share = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        /* anulowane */
      }
    }
    setMsg((await copy(text)) ? 'Skopiowano do schowka.' : 'Nie udało się skopiować — zaznacz tekst ręcznie.')
  }

  const check = () => {
    const r = parseReading(d.response)
    if (!r.ok) {
      setErrors(r.errors)
      return
    }
    setErrors([])
    up({ reading: r.reading, step: 4 })
  }

  const editCab = (ri: number, list: 'floor' | 'upper', ci: number, patch: Partial<ReadingCabinetT>) => {
    if (!d.reading) return
    const runs = d.reading.runs.map((r, i) =>
      i !== ri ? r : { ...r, [list]: r[list].map((c, j) => (j === ci ? { ...c, ...patch, confidence: 1 } : c)) },
    )
    up({ reading: { ...d.reading, runs } })
  }
  const delCab = (ri: number, list: 'floor' | 'upper', ci: number) => {
    if (!d.reading) return
    const runs = d.reading.runs.map((r, i) => (i !== ri ? r : { ...r, [list]: r[list].filter((_, j) => j !== ci) }))
    up({ reading: { ...d.reading, runs } })
  }

  const create = () => {
    if (!d.reading) return
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
    const res = convertReading(
      d.reading,
      {
        id,
        name: d.name.trim() || `Projekt ${new Date().toLocaleDateString('pl-PL')}`,
        client: d.client.trim(),
        roomMm: {
          width: Math.round(num(d.widthCm) * 10),
          depth: Math.round(num(d.depthCm) * 10),
          height: Math.round(num(d.heightCm) * 10),
        },
      },
      settings,
    )
    onCreate(res.project)
    kvSet(DRAFT_KEY, EMPTY)
    onClose()
  }

  const cabTable = (ri: number, list: 'floor' | 'upper', cabs: ReadingCabinetT[]) => (
    <table className="verify">
      <thead>
        <tr>
          <th>#</th>
          <th>Typ</th>
          <th>Szer. cm</th>
          <th>Fronty</th>
          <th>AGD</th>
          <th>Pewność</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {cabs.map((c, ci) => (
          <tr key={ci} className={c.confidence < 0.7 ? 'low' : ''} title={c.note}>
            <td>{ci + 1}</td>
            <td>
              <select
                value={c.type}
                onChange={(e) => editCab(ri, list, ci, { type: e.target.value as ReadingCabinetT['type'] })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_PL[t]}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                key={`${ci}-${c.width_cm}`}
                className="narrow"
                inputMode="decimal"
                defaultValue={String(c.width_cm).replace('.', ',')}
                onBlur={(e) => {
                  const v = num(e.target.value)
                  if (v > 0 && v !== c.width_cm) editCab(ri, list, ci, { width_cm: v })
                }}
              />
            </td>
            <td>
              <select
                value={c.fronts.kind}
                onChange={(e) =>
                  editCab(ri, list, ci, {
                    fronts: { kind: e.target.value as ReadingCabinetT['fronts']['kind'], count: c.fronts.count },
                  })
                }
              >
                {Object.entries(FRONT_PL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {c.fronts.kind === 'drawers' && (
                <select
                  value={c.fronts.count ?? c.fronts.heights_cm?.length ?? 2}
                  onChange={(e) =>
                    editCab(ri, list, ci, { fronts: { kind: 'drawers', count: Number(e.target.value) } })
                  }
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              )}
            </td>
            <td>
              <select
                value={c.appliance ?? ''}
                onChange={(e) =>
                  editCab(ri, list, ci, { appliance: (e.target.value || null) as ReadingCabinetT['appliance'] })
                }
              >
                <option value="">—</option>
                {Object.entries(APPL_PL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {list === 'floor' && (
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={c.hob_above}
                    onChange={(e) => editCab(ri, list, ci, { hob_above: e.target.checked })}
                  />{' '}
                  płyta nad
                </label>
              )}
            </td>
            <td>{Math.round(c.confidence * 100)}%</td>
            <td>
              <button className="link danger" onClick={() => delCab(ri, list, ci)} title="Usuń">
                ✕
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={2}>Suma</td>
          <td>{String(Math.round(cabs.reduce((s, c) => s + c.width_cm, 0) * 10) / 10).replace('.', ',')}</td>
          <td colSpan={4} />
        </tr>
      </tbody>
    </table>
  )

  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-head">
          <strong>Nowy projekt ze szkicu</strong>
          <span className="steps">
            {['Dane', 'Prompt', 'Odpowiedź AI', 'Weryfikacja'].map((s, i) => (
              <button
                key={s}
                className={d.step === i + 1 ? 'on' : ''}
                disabled={(i + 1 === 4 && !d.reading) || (i > 0 && !roomOk)}
                onClick={() => up({ step: (i + 1) as Draft['step'] })}
              >
                {i + 1}. {s}
              </button>
            ))}
          </span>
          <button onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {d.step === 1 && (
            <>
              <div className="grid4">
                <label className="field">
                  <span>Nazwa projektu</span>
                  <input
                    value={d.name}
                    onChange={(e) => up({ name: e.target.value })}
                    placeholder="np. Kuchnia Kowalscy"
                  />
                </label>
                <label className="field">
                  <span>Klient</span>
                  <input value={d.client} onChange={(e) => up({ client: e.target.value })} />
                </label>
              </div>
              <h4>Wymiary pomieszczenia (cm) — pewne, podane przez Ciebie</h4>
              <p className="hint">
                Ściana A = u góry rzutu, B = prawa, C = dolna, D = lewa (zgodnie z ruchem wskazówek zegara).
              </p>
              <div className="grid4">
                <label className="field">
                  <span>Szerokość (ściana A)</span>
                  <input
                    inputMode="decimal"
                    value={d.widthCm}
                    onChange={(e) => up({ widthCm: e.target.value })}
                    placeholder="np. 386,5"
                  />
                </label>
                <label className="field">
                  <span>Głębokość (ściana B)</span>
                  <input
                    inputMode="decimal"
                    value={d.depthCm}
                    onChange={(e) => up({ depthCm: e.target.value })}
                    placeholder="np. 300"
                  />
                </label>
                <label className="field">
                  <span>Wysokość</span>
                  <input inputMode="decimal" value={d.heightCm} onChange={(e) => up({ heightCm: e.target.value })} />
                </label>
              </div>
              <label className="field wide">
                <span>Uwagi dla AI (opcjonalnie)</span>
                <textarea
                  rows={3}
                  value={d.notes}
                  onChange={(e) => up({ notes: e.target.value })}
                  placeholder="np. zabudowa w L na ścianach A i B, lodówka w zabudowie"
                />
              </label>
              <div className="row">
                <button className="primary" disabled={!roomOk} onClick={() => up({ step: 2 })}>
                  Dalej →
                </button>
                {!roomOk && <span className="hint">Podaj wymiary pomieszczenia.</span>}
              </div>
            </>
          )}

          {d.step === 2 && (
            <>
              <ol className="howto">
                <li>
                  Skopiuj prompt (lub <b>Udostępnij</b> → wybierz aplikację Claude / ChatGPT).
                </li>
                <li>
                  W czacie AI <b>dołącz zdjęcie szkicu</b> i wklej prompt. Wyślij.
                </li>
                <li>Skopiuj całą odpowiedź AI i wróć tutaj (krok 3).</li>
              </ol>
              <div className="row">
                <button
                  className="primary"
                  onClick={async () =>
                    setMsg(
                      (await copy(prompt))
                        ? 'Prompt skopiowany. Wklej go w czacie AI razem ze zdjęciem szkicu.'
                        : 'Nie udało się skopiować — zaznacz tekst ręcznie.',
                    )
                  }
                >
                  Kopiuj prompt
                </button>
                {'share' in navigator && <button onClick={() => share(prompt)}>Udostępnij…</button>}
                <button onClick={() => up({ step: 3 })}>Mam odpowiedź →</button>
              </div>
              <textarea className="prompt" readOnly value={prompt} onFocus={(e) => e.target.select()} />
            </>
          )}

          {d.step === 3 && (
            <>
              <p>Wklej całą odpowiedź AI (aplikacja sama znajdzie w niej JSON).</p>
              <div className="row">
                <button
                  onClick={async () => {
                    try {
                      up({ response: await navigator.clipboard.readText() })
                    } catch {
                      setMsg('Przeglądarka nie pozwoliła odczytać schowka — wklej ręcznie (przytrzymaj pole → Wklej).')
                    }
                  }}
                >
                  Wklej ze schowka
                </button>
                <button className="primary" disabled={!d.response.trim()} onClick={check}>
                  Sprawdź odczyt →
                </button>
              </div>
              <textarea
                className="prompt"
                value={d.response}
                onChange={(e) => up({ response: e.target.value })}
                placeholder="```json { … } ```"
              />
              {errors.length > 0 && (
                <ul className="errors">
                  {errors.slice(0, 15).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          {d.step === 4 && d.reading && (
            <>
              {d.reading.sketch_summary && <p className="hint">AI: {d.reading.sketch_summary}</p>}
              {d.reading.questions.length > 0 && (
                <div className="box warn">
                  <b>Pytania AI (wyjaśnij poprawką poniżej lub w tabeli):</b>
                  <ul>
                    {d.reading.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview && 'warnings' in preview && preview.warnings.length > 0 && (
                <div className="box warn">
                  <b>Rozbieżności i ostrzeżenia:</b>
                  <ul>
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview && 'error' in preview && <div className="box err">{preview.error}</div>}
              {d.reading.runs.map((r, ri) => (
                <section key={ri}>
                  <h4>
                    Ściana {r.wall} — start {String(r.start_offset_cm).replace('.', ',')} cm od lewego narożnika
                    {r.worktop_height_cm !== null && `, blat na ${String(r.worktop_height_cm).replace('.', ',')} cm`}
                  </h4>
                  {r.floor.length > 0 && (
                    <>
                      <p className="sub">Szafki stojące (od lewej)</p>
                      {cabTable(ri, 'floor', r.floor)}
                    </>
                  )}
                  {r.upper.length > 0 && (
                    <>
                      <p className="sub">Szafki wiszące (od lewej)</p>
                      {cabTable(ri, 'upper', r.upper)}
                    </>
                  )}
                </section>
              ))}
              {preview && 'defaultsUsed' in preview && preview.defaultsUsed.length > 0 && (
                <details>
                  <summary>Przyjęte wartości domyślne ({preview.defaultsUsed.length})</summary>
                  <ul className="hint">
                    {preview.defaultsUsed.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="hint">
                Wiersze podświetlone = pewność odczytu poniżej 70% — sprawdź ze szkicem. Edycja wiersza ustawia pewność
                na 100%.
              </p>

              <h4>Poprawka przez AI (opcjonalnie)</h4>
              <textarea
                rows={3}
                value={d.remarks}
                onChange={(e) => up({ remarks: e.target.value })}
                placeholder="np. szafka 45 to zmywarka, kreskowanie to szkło, okap nad płytą"
              />
              <div className="row wrap">
                <button
                  disabled={!d.remarks.trim()}
                  onClick={async () => {
                    const t = buildCorrectionPrompt(d.reading!, d.remarks)
                    const ok = await copy(t)
                    up({ step: 3, response: '' })
                    setMsg(
                      ok
                        ? 'Prompt korekty skopiowany — wklej go w TEJ SAMEJ rozmowie z AI, potem wklej tutaj nową odpowiedź.'
                        : 'Nie udało się skopiować.',
                    )
                  }}
                >
                  Kopiuj prompt korekty
                </button>
                <button className="primary" onClick={create}>
                  Utwórz projekt 3D ✓
                </button>
              </div>
            </>
          )}
          {msg && (
            <div className="toast inline" onClick={() => setMsg(null)}>
              {msg}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <button
            className="link"
            onClick={() => {
              if (confirm('Wyczyścić kreator i zacząć od nowa?')) setD(EMPTY)
            }}
          >
            Zacznij od nowa
          </button>
        </footer>
      </div>
    </div>
  )
}
