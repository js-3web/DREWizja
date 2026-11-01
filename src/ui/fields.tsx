/**
 * Małe pola formularzy wielokrotnego użytku.
 * NumField zatwierdza wartość dopiero po wyjściu z pola / Enter — żeby nie przebudowywać 3D przy każdej cyfrze.
 */
import { useState } from 'react'

export function NumField(props: {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  integer?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(props.value)
  const commit = () => {
    if (draft === null) return
    const v = Number(draft.replace(',', '.'))
    setDraft(null)
    if (!Number.isFinite(v)) return
    const clamped = Math.min(
      props.max ?? Infinity,
      Math.max(props.min ?? -Infinity, props.integer === false ? v : Math.round(v)),
    )
    if (clamped !== props.value) props.onCommit(clamped)
  }
  return (
    <label className="field">
      <span>{props.label}</span>
      <span className="field-input">
        <input
          inputMode="decimal"
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setDraft(null)
          }}
        />
        {props.suffix && <em>{props.suffix}</em>}
      </span>
    </label>
  )
}

export function TextField(props: {
  label: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? props.value
  const commit = () => {
    if (draft !== null && draft !== props.value) props.onCommit(draft)
    setDraft(null)
  }
  return (
    <label className="field wide">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea
          value={shown}
          placeholder={props.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
        />
      ) : (
        <input
          value={shown}
          placeholder={props.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
    </label>
  )
}
