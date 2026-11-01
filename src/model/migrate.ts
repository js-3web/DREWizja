/**
 * Migracje schematu (SPEC sekcja 5: „projekty mają się otwierać po aktualizacji aplikacji”).
 *
 * Każdy zapisany projekt ma pole `version`. Gdy w przyszłości zmienimy model (np. version 2),
 * tutaj dopiszemy funkcję, która przerobi stary JSON na nowy — zanim trafi do walidacji Zod.
 */
import { SCHEMA_VERSION, validateProject } from './schema'

type Migration = (old: Record<string, unknown>) => Record<string, unknown>

/** migrations[n] przerabia projekt z wersji n na n+1. Na razie pusto — jest tylko v1. */
const migrations: Record<number, Migration> = {}

export function migrateAndValidate(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false as const, errors: ['To nie jest obiekt JSON projektu.'] }
  }
  let data = raw as Record<string, unknown>
  let v = typeof data.version === 'number' ? data.version : SCHEMA_VERSION
  if (v > SCHEMA_VERSION) {
    return {
      ok: false as const,
      errors: [
        `Projekt zapisany w nowszej wersji (${v}) niż obsługuje aplikacja (${SCHEMA_VERSION}). Zaktualizuj aplikację.`,
      ],
    }
  }
  while (v < SCHEMA_VERSION) {
    const m = migrations[v]
    if (!m) return { ok: false as const, errors: [`Brak migracji z wersji ${v}.`] }
    data = m(data)
    v++
  }
  return validateProject({ ...data, version: SCHEMA_VERSION })
}
