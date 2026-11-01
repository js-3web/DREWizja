/**
 * Główny ekran aplikacji: pasek narzędzi + scena 3D + panel boczny (na telefonie: dolny).
 *
 * Komponent React = funkcja, która zwraca opis fragmentu ekranu (JSX). Gdy zmienia się stan,
 * React wywołuje ją ponownie i aktualizuje tylko to, co się zmieniło.
 */
import { useEffect, useRef, useState } from 'react'
import { deleteProject, listProjects, requestPersistence, saveProject, type ProjectRow } from './db/db'
import { exampleProject } from './model/example'
import { migrateAndValidate } from './model/migrate'
import type { ProjectT } from './model/schema'
import { runOverflow } from './geometry/layout'
import { useStore, type CameraPreset } from './store/projectStore'
import { Scene } from './ui/Scene'
import { SidePanel } from './ui/SidePanel'
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

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
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
      setPersisted(await requestPersistence())
    })()
  }, [setProject])

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

  if (!project) return <div className="loading">Wczytywanie…</div>
  const warnings = project.runs.flatMap((r) => runOverflow(r, project.room))

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
        <button onClick={newExample} title="Nowy projekt (z przykładu)">
          ＋ Nowy
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
        <button onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? 'Ukryj panel' : 'Panel'}</button>
        <span className={`status ${online ? 'on' : 'off'}`} title="Stan połączenia i zapisu lokalnego">
          {online ? 'online' : 'offline'} ·{' '}
          {persisted ? 'zapis trwały' : persisted === false ? 'zapis nietrwały' : 'zapis lokalny'}
        </span>
      </header>

      <main className="viewport">
        <Scene project={project} />
        {warnings.length > 0 && (
          <div className="warnings">
            {warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
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
    </div>
  )
}
