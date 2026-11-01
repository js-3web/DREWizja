import { describe, expect, it } from 'vitest'
import { exampleProject } from './example'
import { migrateAndValidate } from './migrate'
import { validateProject } from './schema'

describe('schemat projektu (Zod)', () => {
  it('przykładowy projekt przechodzi walidację', () => {
    const r = validateProject(exampleProject())
    if (!r.ok) console.error(r.errors)
    expect(r.ok).toBe(true)
  })
  it('przeżywa zapis do JSON i odczyt (tak jak w bazie/pliku)', () => {
    const r = migrateAndValidate(JSON.parse(JSON.stringify(exampleProject())))
    expect(r.ok).toBe(true)
  })
  it('odrzuca wymiar niecałkowity (mm muszą być całkowite)', () => {
    const p = exampleProject()
    p.runs[0].layers.base![0].width = 340.5
    const r = validateProject(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('runs.0.layers.base.0.width')
  })
  it('odrzuca ujemną szerokość pokoju', () => {
    const p = exampleProject()
    p.room.width = -1
    expect(validateProject(p).ok).toBe(false)
  })
  it('odrzuca projekt z nowszej wersji schematu', () => {
    const r = migrateAndValidate({ ...exampleProject(), version: 99 })
    expect(r.ok).toBe(false)
  })
})
