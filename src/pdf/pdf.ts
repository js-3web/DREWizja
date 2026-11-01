/**
 * PDF prezentacji dla klienta (wybór użytkownika: zamiast linku — plik PDF):
 *  1. strona tytułowa: widok izometryczny + dane projektu,
 *  2. rzut każdej ściany z zabudową + łańcuchy wymiarów (cm),
 *  3. zestawienie materiałów i kolorów.
 *
 * Każdą stronę rysujemy najpierw na płótnie (canvas) — tekst rysuje przeglądarka, więc polskie znaki
 * (ą, ę, ł…) działają bez osadzania czcionek — a potem wkładamy ją jako obraz do PDF (biblioteka jsPDF,
 * ładowana dopiero przy eksporcie, żeby nie spowalniać startu aplikacji).
 */
import { placeRun } from '../geometry/layout'
import { materialSummary } from '../materials/assign'
import { CATEGORY_PL, FINISH_PL, STYLE_PL } from '../materials/library'
import type { ProjectT, WallIdT } from '../model/schema'
import type { SettingsT } from '../model/settings'
import { captureViews, type Shot } from '../ui/capture'

// A4 poziomo przy ~150 dpi.
const PW = 1754
const PH = 1240
const M = 70 // margines strony w px
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const INK = '#1f2328'
const MUTED = '#6b7280'
const DIM = '#b45309'

const cm = (mm: number) => {
  const v = Math.round(mm) / 10
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',')
}

function newPage() {
  const c = document.createElement('canvas')
  c.width = PW
  c.height = PH
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PW, PH)
  ctx.textBaseline = 'alphabetic'
  return { c, ctx }
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  opts: { weight?: number; color?: string; align?: CanvasTextAlign } = {},
) {
  ctx.font = `${opts.weight ?? 400} ${size}px ${FONT}`
  ctx.fillStyle = opts.color ?? INK
  ctx.textAlign = opts.align ?? 'left'
  ctx.fillText(s, x, y)
}

function header(
  ctx: CanvasRenderingContext2D,
  p: ProjectT,
  s: SettingsT,
  title: string,
  pageNo: number,
  pages: number,
) {
  text(ctx, s.workshopName || 'DREWizja', M, M, 26, { weight: 700 })
  if (s.workshopContact) text(ctx, s.workshopContact, M, M + 32, 18, { color: MUTED })
  text(ctx, `${p.name}${p.client ? ' — ' + p.client : ''}`, PW - M, M, 22, { align: 'right', weight: 600 })
  text(ctx, title, PW - M, M + 32, 18, { align: 'right', color: MUTED })
  ctx.strokeStyle = '#d0d7de'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(M, M + 50)
  ctx.lineTo(PW - M, M + 50)
  ctx.stroke()
  text(ctx, `Strona ${pageNo}/${pages} · ${new Date().toLocaleDateString('pl-PL')}`, PW - M, PH - 30, 16, {
    align: 'right',
    color: MUTED,
  })
  text(
    ctx,
    'Wizualizacja poglądowa. Kolory i usłojenie orientacyjne — ostateczny dobór na próbkach materiałów.',
    M,
    PH - 30,
    16,
    { color: MUTED },
  )
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Nie udało się wczytać obrazu widoku 3D.'))
    img.src = src
  })
}

/** Dopasowanie obrazu do prostokąta z zachowaniem proporcji. */
function fit(w: number, h: number, maxW: number, maxH: number) {
  const k = Math.min(maxW / w, maxH / h)
  return { w: w * k, h: h * k, k }
}

/** Łańcuch wymiarowy poziomy: kreski graniczne + wartości w cm nad linią. */
function hChain(ctx: CanvasRenderingContext2D, xs: number[], values: number[], y: number, labelAbove: boolean) {
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(xs[0], y)
  ctx.lineTo(xs[xs.length - 1], y)
  for (const x of xs) {
    ctx.moveTo(x, y - 9)
    ctx.lineTo(x, y + 9)
  }
  ctx.stroke()
  for (let i = 0; i < values.length; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2
    const width = xs[i + 1] - xs[i]
    const size = width < 40 ? 13 : 17
    text(ctx, cm(values[i]), mid, labelAbove ? y - 8 : y + 24, size, { align: 'center', color: DIM, weight: 600 })
  }
}

function vChain(ctx: CanvasRenderingContext2D, ys: number[], values: number[], x: number) {
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, ys[0])
  ctx.lineTo(x, ys[ys.length - 1])
  for (const y of ys) {
    ctx.moveTo(x - 9, y)
    ctx.lineTo(x + 9, y)
  }
  ctx.stroke()
  for (let i = 0; i < values.length; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2
    ctx.save()
    ctx.translate(x + 26, mid)
    ctx.rotate(-Math.PI / 2)
    text(ctx, cm(values[i]), 0, 0, 16, { align: 'center', color: DIM, weight: 600 })
    ctx.restore()
  }
}

async function wallPage(p: ProjectT, s: SettingsT, wallId: WallIdT, shot: Shot, pageNo: number, pages: number) {
  const { c, ctx } = newPage()
  header(ctx, p, s, `Widok ściany ${wallId} · wymiary w cm · rzut od strony pomieszczenia`, pageNo, pages)
  const img = await loadImage(shot.dataUrl)
  const top = M + 120
  const box = fit(shot.width, shot.height, PW - 2 * M - 120, PH - top - 230)
  const ox = M + 10
  const oy = top
  ctx.drawImage(img, ox, oy, box.w, box.h)

  const map = shot.map!
  const k = map.pxPerMm * box.k // px strony na 1 mm
  const X = (along: number) => ox + (along + map.marginMm) * k
  const Y = (h: number) => oy + (map.roomHeight + map.marginMm - h) * k

  const placed = p.runs.filter((r) => r.wallId === wallId).flatMap((r) => placeRun(r, p.room))
  const floor = placed.filter((x) => x.layer !== 'wall').sort((a, b) => a.along - b.along)
  const upper = placed.filter((x) => x.layer === 'wall').sort((a, b) => a.along - b.along)

  const chain = (items: typeof placed) => {
    const xs: number[] = []
    const vals: number[] = []
    let last: number | null = null
    for (const it of items) {
      if (last !== null && it.along > last) {
        // Przerwa między szafkami — też wymiarujemy.
        xs.push(X(last))
        vals.push(it.along - last)
      }
      xs.push(X(it.along))
      vals.push(it.cabinet.width)
      last = it.along + it.cabinet.width
    }
    if (last !== null) xs.push(X(last))
    return { xs, vals }
  }

  // Szafki dolne: łańcuch pod rysunkiem + wymiar całkowity niżej.
  if (floor.length) {
    const { xs, vals } = chain(floor)
    hChain(ctx, xs, vals, oy + box.h + 30, false)
    const start = floor[0].along
    const end = Math.max(...floor.map((f) => f.along + f.cabinet.width))
    hChain(ctx, [X(start), X(end)], [end - start], oy + box.h + 90, false)
    if (start > 0) hChain(ctx, [X(0), X(start)], [start], oy + box.h + 90, false)
  }
  // Szafki górne: łańcuch nad rysunkiem.
  if (upper.length) {
    const { xs, vals } = chain(upper)
    hChain(ctx, xs, vals, oy - 14, true)
  }
  // Wysokości po prawej: cokół, korpus+blat, przestrzeń robocza, szafki górne, do sufitu.
  const base = floor.find((x) => x.layer === 'base')?.cabinet
  const run = p.runs.find((r) => r.wallId === wallId && r.worktop)
  const levels = new Set<number>([0])
  if (base) {
    levels.add(base.elevation)
    levels.add(base.elevation + base.height + (run?.worktop?.thickness ?? 0))
  }
  // Góra słupków (np. zabudowa lodówki) — też wymiarujemy.
  for (const t of floor.filter((x) => x.layer === 'tall')) levels.add(t.cabinet.elevation + t.cabinet.height)
  const up = upper.find((x) => x.cabinet.type === 'wall')?.cabinet ?? upper[0]?.cabinet
  if (up) {
    levels.add(up.elevation)
    levels.add(up.elevation + up.height)
  }
  levels.add(p.room.height)
  const ls = [...levels].sort((a, b) => a - b)
  vChain(
    ctx,
    ls.map((h) => Y(h)),
    ls.slice(1).map((h, i) => h - ls[i]),
    ox + box.w + 30,
  )
  return c
}

async function coverPage(p: ProjectT, s: SettingsT, iso: Shot, pages: number) {
  const { c, ctx } = newPage()
  header(ctx, p, s, 'Prezentacja projektu', 1, pages)
  text(ctx, p.name, M, M + 120, 44, { weight: 700 })
  const sub = [
    p.client && `Klient: ${p.client}`,
    `Pomieszczenie: ${cm(p.room.width)} × ${cm(p.room.depth)} × ${cm(p.room.height)} cm`,
  ]
    .filter(Boolean)
    .join('   ·   ')
  text(ctx, sub, M, M + 165, 22, { color: MUTED })
  const img = await loadImage(iso.dataUrl)
  const top = M + 195
  const box = fit(iso.width, iso.height, PW - 2 * M, PH - top - 80)
  ctx.drawImage(img, (PW - box.w) / 2, top, box.w, box.h)
  return c
}

async function materialsPage(p: ProjectT, s: SettingsT, pageNo: number, pages: number) {
  const { c, ctx } = newPage()
  header(ctx, p, s, 'Materiały i kolory', pageNo, pages)
  text(ctx, 'Materiały i kolory', M, M + 120, 36, { weight: 700 })
  const rows = materialSummary(p)
  const cols = [M, M + 90, M + 380, M + 900, M + 1180, M + 1400]
  let y = M + 190
  const head = ['', 'Element', 'Materiał / dekor', 'Rodzaj', 'Wykończenie', 'Styl frontu']
  head.forEach((h, i) => text(ctx, h, cols[i], y, 18, { weight: 700, color: MUTED }))
  y += 20
  for (const r of rows) {
    y += 70
    if (y > PH - 160) break
    const m = r.material
    ctx.fillStyle = m?.color ?? '#ccc'
    ctx.fillRect(cols[0], y - 44, 60, 60)
    ctx.strokeStyle = '#999'
    ctx.lineWidth = 1
    ctx.strokeRect(cols[0], y - 44, 60, 60)
    text(ctx, r.use, cols[1], y, 20, { weight: 600 })
    text(ctx, m?.name ?? '(brak materiału)', cols[2], y - 8, 20)
    if (m?.code || m?.manufacturer)
      text(ctx, [m.manufacturer, m.code].filter(Boolean).join(' '), cols[2], y + 16, 16, { color: MUTED })
    text(ctx, m ? CATEGORY_PL[m.category] : '', cols[3], y, 19)
    text(ctx, m ? FINISH_PL[m.finish] : '', cols[4], y, 19)
    text(ctx, [...r.styles].map((x) => STYLE_PL[x as keyof typeof STYLE_PL] ?? x).join(', '), cols[5], y, 19)
  }
  // Uchwyty.
  const handles = new Set<string>()
  for (const r of p.runs)
    for (const l of ['base', 'tall', 'wall'] as const)
      for (const c2 of r.layers[l] ?? []) if (c2.handle) handles.add(c2.handle.type)
  const HANDLE_PL: Record<string, string> = {
    bar: 'reling',
    knob: 'gałka',
    none: 'bez uchwytów',
    gola: 'profil gola (frezowany)',
    push: 'system push (bez uchwytów)',
  }
  y += 90
  text(ctx, `Uchwyty: ${[...handles].map((h) => HANDLE_PL[h] ?? h).join(', ') || '—'}`, M, y, 20)
  if (p.notes?.trim()) {
    y += 50
    text(ctx, 'Uwagi:', M, y, 20, { weight: 700 })
    const words = p.notes.trim().split(/\s+/)
    let line = ''
    ctx.font = `400 19px ${FONT}`
    for (const w of words) {
      if (ctx.measureText(line + ' ' + w).width > PW - 2 * M - 100) {
        y += 30
        text(ctx, line, M + 90, y, 19)
        line = w
      } else line = line ? line + ' ' + w : w
    }
    y += 30
    text(ctx, line, M + 90, y, 19)
  }
  return c
}

/** Ściany, przy których stoi jakakolwiek szafka (w kolejności A–D). */
export function wallsWithCabinets(p: ProjectT): WallIdT[] {
  return (['A', 'B', 'C', 'D'] as const).filter((w) =>
    p.runs.some((r) => r.wallId === w && Object.values(r.layers).some((l) => l?.length)),
  )
}

export async function buildClientPdf(p: ProjectT, s: SettingsT): Promise<Blob> {
  const walls = wallsWithCabinets(p)
  const shots = await captureViews(p, [{ kind: 'iso' }, ...walls.map((w) => ({ kind: 'wall' as const, wallId: w }))])
  const pages = 2 + walls.length
  const canvases: HTMLCanvasElement[] = [await coverPage(p, s, shots[0], pages)]
  for (let i = 0; i < walls.length; i++) canvases.push(await wallPage(p, s, walls[i], shots[i + 1], i + 2, pages))
  canvases.push(await materialsPage(p, s, pages, pages))

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: p.name, subject: 'Prezentacja zabudowy meblowej', creator: 'DREWizja' })
  canvases.forEach((cv, i) => {
    if (i > 0) doc.addPage('a4', 'landscape')
    doc.addImage(cv.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 297, 210)
  })
  return doc.output('blob')
}
