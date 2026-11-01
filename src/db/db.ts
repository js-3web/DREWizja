/**
 * Lokalna baza danych w przeglądarce (IndexedDB) przez bibliotekę Dexie.
 *
 * IndexedDB = wbudowana w każdą przeglądarkę (także Safari na iPhonie) baza „klucz → obiekt”.
 * Dane leżą na urządzeniu użytkownika, działają bez internetu, nie wychodzą na żaden serwer.
 * Dexie to cienka nakładka, która zamienia niewygodne API IndexedDB na proste: db.projects.put(...).
 *
 * Ograniczenie: dane są przypisane do adresu strony i przeglądarki. Inna przeglądarka/telefon = inna baza.
 * Dlatego jest eksport/import pliku JSON (kopia zapasowa i przenoszenie między urządzeniami).
 */
import Dexie, { type EntityTable } from 'dexie'
import type { ProjectT } from '../model/schema'

export interface ProjectRow {
  id: string
  name: string
  updatedAt: string
  data: ProjectT
}

export const db = new Dexie('drewizja') as Dexie & { projects: EntityTable<ProjectRow, 'id'> }

// Wersja 1 struktury bazy: tabela projects, klucz id, indeksy name i updatedAt (do sortowania listy).
db.version(1).stores({ projects: 'id, name, updatedAt' })

export async function saveProject(p: ProjectT) {
  await db.projects.put({ id: p.id, name: p.name, updatedAt: p.updatedAt, data: p })
}

export async function listProjects() {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function deleteProject(id: string) {
  await db.projects.delete(id)
}

/**
 * Prośba o „trwałe” przechowywanie: przeglądarka nie usunie danych przy braku miejsca.
 * Na iPhonie Safari przyznaje to głównie aplikacji dodanej do ekranu początkowego.
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
