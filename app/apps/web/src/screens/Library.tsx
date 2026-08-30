import { useRef } from 'react'
import { validatePattern } from '@knitting/schema'
import { INTENT_LABELS } from '../intents'
import { fmtLen } from '../units'
import { toast } from '../toast'
import ConfirmButton from '../ConfirmButton'
import { backupFilename, downloadJson, parseBackup } from '../backup'
import type { ScreenProps } from '../App'

/** Plain-language labels for validator codes (code shown in the tooltip). */
const DIAG_LABELS: Record<string, string> = {
  SIZE_ARRAY_LENGTH: 'size data mismatch',
  UNRESOLVED_STITCH_PATTERN: 'unknown stitch pattern',
  NO_SCHEMATIC: 'no schematic — checks limited',
  BAD_GAUGE: 'gauge problem',
  GAUGE_NORMALIZATION_MISMATCH: 'gauge mismatch',
  SUM_CHECK_FAILED: "stitch counts don't add up",
  SCHEDULE_EXCEEDS_SPAN: 'shaping overflows its span',
}

export default function Library({ store, go }: ScreenProps) {
  const restoreInput = useRef<HTMLInputElement>(null)

  const downloadBackup = async () => {
    try {
      const backup = await store.actions.createBackup()
      downloadJson(backupFilename(), backup)
      toast(
        `Backup downloaded — ${backup.patterns.length} pattern${backup.patterns.length === 1 ? '' : 's'}, ` +
          `${backup.profiles.length} profile${backup.profiles.length === 1 ? '' : 's'}, ` +
          `${backup.results.length} sheet${backup.results.length === 1 ? '' : 's'}`,
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup could not be created; keep this page open and retry.')
    }
  }

  const restoreFrom = async (file: File) => {
    const backup = parseBackup(await file.text())
    if (!backup) {
      toast('That file is not a Knit Adapt backup')
      return
    }
    if (store.actions.restoreBackup(backup)) {
      toast(`Backup restored — ${backup.patterns.length} pattern${backup.patterns.length === 1 ? '' : 's'}, ` +
        `${backup.profiles.length} profile${backup.profiles.length === 1 ? '' : 's'} ` +
        `(duplicates skipped)`)
    } else {
      toast('Backup was not restored: an existing vault or identity conflict needs review.')
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Pattern library</h2>
          <button className="primary" onClick={() => go({ name: 'add' })}>
            + Add pattern
          </button>
        </div>

        <details className="how-it-works">
          <summary>How this app works</summary>
          <ol>
            <li>
              <strong>Add a pattern</strong> — its PDF is parsed on this device, or paste the text.
            </li>
            <li>
              <strong>Fill your fit profile</strong> — a few measurements; optional, but needed for
              size and bust advice.
            </li>
            <li>
              <strong>Request a change</strong> in plain words — the engine computes it
              deterministically and shows its work.
            </li>
          </ol>
          <p className="note">
            Every sheet is checked before it renders: stitch counts must add up exactly and the
            modified measurements must land within {fmtLen(0.25, store.displayUnit)} of the target.
            If a check fails you get the diagnosis, never broken instructions.
          </p>
        </details>

        {store.patterns.length === 0 && (
          <div className="panel info empty-state">
            <strong>No patterns yet.</strong>
            <p className="note">
              Add a knitting-pattern PDF (or paste its text) and review what the parser read — the
              draft lands here once saved.
            </p>
            <button className="primary" onClick={() => go({ name: 'add' })}>
              Add your first pattern
            </button>
          </div>
        )}

        <ul className="item-list">
          {store.patterns.map((p) => {
            const diags = validatePattern(p)
            const errors = diags.filter((d) => d.level === 'error')
            const warnings = diags.filter((d) => d.level === 'warning')
            const gauge = p.gauge.find((g) => g.primary)
            const bust = p.sizing.bustOrChestIn.filter((value) => Number.isFinite(value) && value > 0)
            return (
              <li key={p.meta.name} className="item">
                <div className="item-body">
                  <strong>{p.meta.name}</strong>
                  <div className="muted small">
                    {p.construction.type.replaceAll('_', ' ')} · sizes {p.sizing.labels.join(' / ')}
                    {bust.length > 0 && ` · bust ${fmtLen(bust[0]!, store.displayUnit)}–${fmtLen(bust[bust.length - 1]!, store.displayUnit)}`}
                    {gauge && ` · ${gauge.stsPerIn} sts/in · ${p.sizing.measurementBasis}`}
                  </div>
                  <div className="chip-row">
                    {errors.length === 0 ? (
                      <span className="chip ok" title="Every stitch-count checkpoint adds up exactly (Σ = sum).">
                        Σ clean
                      </span>
                    ) : (
                      <span className="chip err">
                        {errors.length} error{errors.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {warnings.map((w) => (
                      <span key={w.code} className="chip warn" title={w.message}>
                        {DIAG_LABELS[w.code] ?? w.code}
                      </span>
                    ))}
                    {p.sections.length === 0 && (
                      <span className="chip info" title="No instruction sections were built — modifications will be advisory only.">
                        draft — sections pending
                      </span>
                    )}
                    {p.meta.status === 'draft' && p.sections.length > 0 && (
                      <span className="chip info" title="This pattern was saved for review and can be edited before acceptance.">
                        draft — review pending
                      </span>
                    )}
                  </div>
                </div>
                <div className="item-actions">
                  {p.meta.status === 'draft' && (
                    <button onClick={() => go({ name: 'add', patternName: p.meta.name })}>Edit draft</button>
                  )}
                  <button className="primary" onClick={() => go({ name: 'newmod', patternId: p.meta.name })}>
                    Modify
                  </button>
                  <ConfirmButton
                    label="Delete"
                    onConfirm={() => {
                      store.actions.removePattern(p.meta.name)
                      toast(`Deleted “${p.meta.name}”`)
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Modification sheets</h2>
        {store.results.length === 0 && (
          <p className="muted">
            No sheets yet — open a pattern and request a modification. Sheets are regenerated in
            seconds, so this history is just convenience.
          </p>
        )}
        <ul className="item-list">
          {store.results.map((r) => (
            <li key={r.id} className="item">
              <div className="item-body">
                <strong>
                  {INTENT_LABELS[r.sheet.intent]} · {r.patternName} ({r.sizeLabel})
                </strong>
                <div className="muted small">
                  {new Date(r.sheet.createdAt).toLocaleString()} · {r.sheet.steps.length} step
                  {r.sheet.steps.length === 1 ? '' : 's'}
                </div>
                <div className="chip-row">
                  <span
                    className={(r.validation.status ?? (r.validation.pass ? 'verified' : 'blocked')) === 'verified' ? 'chip ok' : (r.validation.status ?? 'blocked') === 'advisory' ? 'chip warn' : 'chip err'}
                    title={r.validation.status === 'advisory' ? 'Evidence is incomplete; open the sheet for the missing checks.' : r.validation.status === 'verified' ? 'All stitch-count and measurement checks passed.' : 'A check failed — open the sheet for the diagnosis.'}
                  >
                    {r.validation.status ?? (r.validation.pass ? 'verified' : 'blocked')}
                  </span>
                  {r.sheet.warnings.length > 0 && (
                    <span className="chip warn">{r.sheet.warnings.length} warning(s)</span>
                  )}
                </div>
              </div>
              <div className="item-actions">
                <button onClick={() => go({ name: 'sheet', resultId: r.id })}>Open</button>
                <ConfirmButton
                  label="Delete"
                  onConfirm={() => {
                    store.actions.removeResult(r.id)
                    toast('Sheet deleted')
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          Everything lives on this device only — there are no accounts. Download a backup before
          clearing browser data or to move your library to another device or browser; restore it
          here afterwards. Sheets you want to knit from are saved as PDF via their Print button.
        </p>
        <div className="row">
          <button onClick={downloadBackup}>Download backup</button>
          <button onClick={() => restoreInput.current?.click()}>Restore backup…</button>
          <input
            ref={restoreInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void restoreFrom(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>
    </>
  )
}
