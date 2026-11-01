/**
 * Główny ekran aplikacji: pasek narzędzi + scena 3D + panel boczny (na telefonie: dolny).
 *
 * Komponent React = funkcja, która zwraca opis fragmentu ekranu (JSX). Gdy zmienia się stan,
 * React wywołuje ją ponownie i aktualizuje tylko to, co się zmieniło.
 */
import { useEffect, useRef, useState } from 'react'
import { deleteProject, listProjects, loadSettings, requestPersistence, saveProject, type ProjectRow } from './db/db'
import { hasBlockingErrors, validateGeometry } from './geometry/validate'
import { exampleProject } from './model/example'
import { migrateAndValidate } from './model/migrate'
import type { ProjectT } from './model/schema'
import { useStore, type CameraPreset } from './store/projectStore'
import { Scene } from './ui/Scene'
import { SettingsDialog } from './ui/SettingsDialog'
import { SidePanel } from './ui/SidePanel'
import { SketchWizard } from './ui/SketchWizard'
import './App.css'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function download(name: string, data: string | Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: 'application/json' }) : data)
  a.download = name
  // Safari wymaga, żeby link był w dokumencie w chwili kliknięcia.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))

export default function App() {
  const project = useStore((s) => s.project)
  const setProject = useStore((s) => s.setProject)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const toggleWalls = useStore((s) => s.toggleWalls)
  const setCamera = useStore((s) => s.setCamera)
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [persisted, setPersisted] = useState<boolean | null>(null)
  // Na telefonie panel domyślnie schowany — więcej miejsca na 3D.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 800)
  const [msg, setMsg] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pdf, setPdf] = useState<{ busy: boolean; file?: File }>({ busy: false })
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const online = useOnline()

  const refresh = async () => setRows(await listProjects())

  // Start: wczytaj listę projektów z lokalnej bazy; gdy pusta — wstaw przykład.
  useEffect(() => {
    ;(async () => {
      let list = await listProjects()
      if (!list.length) {
        await saveProject(exampleProject())
        list = await listProjects()
      }
      setRows(list)
      const r = migrateAndValidate(list[0].data)
      if (r.ok) setProject(r.project, false)
      else setMsg('Nie udało się otworzyć projektu: ' + r.errors.join('; '))
      setSettings(await loadSettings())
      setPersisted(await requestPersistence())
    })()
  }, [setProject, setSettings])

  // Autozapis: 600 ms po ostatniej zmianie projekt trafia do IndexedDB.
  useEffect(() => {
    if (!project) return
    const t = setTimeout(() => {
      saveProject(project).then(refresh)
    }, 600)
    return () => clearTimeout(t)
  }, [project])

  const openProject = (id: string) => {
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const r = migrateAndValidate(row.data)
    if (r.ok) setProject(r.project, false)
    else setMsg(r.errors.join('\n'))
  }

  const duplicate = () => {
    if (!project) return
    const now = new Date().toISOString()
    setProject({ ...project, id: newId(), name: project.name + ' (kopia)', createdAt: now, updatedAt: now }, false)
  }

  const newExample = () => {
    const now = new Date().toISOString()
    setProject(
      { ...exampleProject(), id: newId(), name: 'Nowy projekt ' + now.slice(0, 10), createdAt: now, updatedAt: now },
      false,
    )
  }

  const remove = async () => {
    if (!project || !confirm(`Usunąć projekt „${project.name}” z tego urządzenia? Tego nie da się cofnąć.`)) return
    await deleteProject(project.id)
    const list = await listProjects()
    setRows(list)
    if (list.length) openProject(list[0].id)
    else newExample()
  }

  const exportJson = () => {
    if (!project) return
    download(`${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json`, JSON.stringify(project, null, 2))
  }

  const importJson = async (file: File) => {
    try {
      const r = migrateAndValidate(JSON.parse(await file.text()))
      if (!r.ok) return setMsg('Plik nie jest poprawnym projektem:\n' + r.errors.slice(0, 10).join('\n'))
      // Jeśli projekt o tym id już istnieje, import nadpisze go — pytamy.
      if (
        rows.some((x) => x.id === r.project.id) &&
        !confirm(`Projekt „${r.project.name}” już istnieje na tym urządzeniu. Nadpisać?`)
      )
        return
      setProject(r.project, false)
      setMsg(`Zaimportowano „${r.project.name}”.`)
    } catch (e) {
      setMsg('Błąd odczytu pliku: ' + (e as Error).message)
    }
  }

  const apply = (p: ProjectT) => setProject(p)

  const createFromSketch = async (p: ProjectT) => {
    setProject(p, false)
    await saveProject(p)
    await refresh()
    setPanelOpen(true)
    setMsg('Projekt utworzony ze szkicu. Sprawdź zakładkę „Kontrola” i otwarte pytania w „Projekt”.')
  }

  const makePdf = async () => {
    if (!project) return
    const issues = validateGeometry(project)
    if (hasBlockingErrors(issues)) {
      setPanelOpen(true)
      setMsg(
        'PDF zablokowany — projekt ma błędy (zakładka „Kontrola”):\n' +
          issues
            .filter((i) => i.severity === 'error')
            .slice(0, 5)
            .map((i) => '• ' + i.message)
            .join('\n'),
      )
      return
    }
    setMsg(null) // jeden komunikat naraz — nie nakładają się na siebie
    setPdf({ busy: true })
    useStore.getState().select(null)
    try {
      // Dwie klatki animacji: scena odświeża się bez podświetlenia zaznaczonej szafki.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const { buildClientPdf } = await import('./pdf/pdf')
      const blob = await buildClientPdf(project, settings)
      const name = `${project.name.replace(/[^\p{L}\p{N}_-]+/gu, '_')}.pdf`
      setPdf({ busy: false, file: new File([blob], name, { type: 'application/pdf' }) })
    } catch (e) {
      setPdf({ busy: false })
      setMsg('Nie udało się utworzyć PDF: ' + (e as Error).message)
    }
  }

  const sharePdf = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: file.name })
    } catch {
      /* anulowane przez użytkownika */
    }
  }

  if (!project) return <div className="loading">Wczytywanie…</div>
  const errorCount = validateGeometry(project).filter((i) => i.severity === 'error').length
  const canShareFiles =
    !!pdf.file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [pdf.file] })

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <header className="toolbar">
        <strong className="brand">DREWizja</strong>
        <select value={project.id} onChange={(e) => openProject(e.target.value)} aria-label="Projekt">
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          {!rows.some((r) => r.id === project.id) && <option value={project.id}>{project.name}</option>}
        </select>
        <button
          className="primary"
          onClick={() => setWizardOpen(true)}
          title="Nowy projekt ze zdjęcia szkicu (Asystent AI)"
        >
          📷 Ze szkicu
        </button>
        <button onClick={newExample} title="Nowy projekt z szablonu (przykład kuchni w L)">
          ＋ Szablon
        </button>
        <button onClick={duplicate} title="Duplikuj projekt (wariant)">
          ⧉ Kopia
        </button>
        <button onClick={undo} disabled={!canUndo} title="Cofnij">
          ↶
        </button>
        <button onClick={redo} disabled={!canRedo} title="Ponów">
          ↷
        </button>
        <select
          aria-label="Widok kamery"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) setCamera(e.target.value as CameraPreset)
            e.target.value = ''
          }}
        >
          <option value="" disabled>
            Widok…
          </option>
          <option value="iso">Izometria</option>
          <option value="front-A">Front ściany A</option>
          <option value="front-B">Front ściany B</option>
          <option value="eye">Wzrok człowieka (160 cm)</option>
        </select>
        <button onClick={toggleWalls} title="Pokaż/ukryj ściany">
          Ściany
        </button>
        <button onClick={makePdf} disabled={pdf.busy} title="PDF dla klienta: izometria, rzuty ścian, materiały">
          {pdf.busy ? 'Tworzę PDF…' : '📄 PDF'}
        </button>
        <button onClick={exportJson} title="Zapisz plik JSON (kopia zapasowa)">
          ⭳ Eksport
        </button>
        <button onClick={() => fileInput.current?.click()} title="Wczytaj plik JSON">
          ⭱ Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.target.value = ''
          }}
        />
        <button onClick={remove} className="danger" title="Usuń projekt z tego urządzenia">
          🗑
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Ustawienia warsztatu">
          ⚙
        </button>
        <button onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? 'Ukryj panel' : 'Panel'}</button>
        <span className={`status ${online ? 'on' : 'off'}`} title="Stan połączenia i zapisu lokalnego">
          {online ? 'online' : 'offline'} ·{' '}
          {persisted ? 'zapis trwały' : persisted === false ? 'zapis nietrwały' : 'zapis lokalny'} · wersja{' '}
          {__APP_VERSION__}
        </span>
      </header>

      <main className="viewport">
        <Scene project={project} />
        {errorCount > 0 && (
          <div className="warnings" onClick={() => setPanelOpen(true)}>
            ⚠ Błędy w projekcie: {errorCount} — szczegóły w panelu, zakładka „Kontrola”.
          </div>
        )}
        {pdf.file && (
          <div className="toast pdf">
            <span>PDF gotowy: {pdf.file.name}</span>
            <button onClick={() => download(pdf.file!.name, pdf.file!)}>Pobierz</button>
            {canShareFiles && <button onClick={() => sharePdf(pdf.file!)}>Udostępnij…</button>}
            <button className="link" onClick={() => setPdf({ busy: false })}>
              ✕
            </button>
          </div>
        )}
        {msg && (
          <div className="toast" onClick={() => setMsg(null)}>
            {msg}
            <small> (dotknij, aby zamknąć)</small>
          </div>
        )}
      </main>

      {panelOpen && <SidePanel project={project} onApply={apply} />}
      {wizardOpen && <SketchWizard onClose={() => setWizardOpen(false)} onCreate={createFromSketch} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
