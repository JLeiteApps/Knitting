import { validatePattern } from '@knitting/schema'
import { INTENT_LABELS } from '../intents'
import type { ScreenProps } from '../App'

export default function Library({ store, go }: ScreenProps) {
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Pattern library</h2>
          <button className="primary" onClick={() => go({ name: 'add' })}>
            + Add pattern
          </button>
        </div>

        {store.patterns.length === 0 && (
          <p className="muted">No patterns yet — add a PDF or paste pattern text.</p>
        )}

        <ul className="item-list">
          {store.patterns.map((p) => {
            const diags = validatePattern(p)
            const errors = diags.filter((d) => d.level === 'error')
            const warnings = diags.filter((d) => d.level === 'warning')
            const gauge = p.gauge.find((g) => g.primary)
            const bust = p.sizing.bustOrChestIn
            return (
              <li key={p.meta.name} className="item">
                <div className="item-body">
                  <strong>{p.meta.name}</strong>
                  <div className="muted small">
                    {p.construction.type.replaceAll('_', ' ')} · sizes {p.sizing.labels.join(' / ')}
                    {bust.length > 0 && ` · bust ${bust[0]}–${bust[bust.length - 1]}"`}
                    {gauge && ` · ${gauge.stsPerIn} sts/in · ${p.sizing.measurementBasis}`}
                  </div>
                  <div className="chip-row">
                    {errors.length === 0 ? (
                      <span className="chip ok">Σ clean</span>
                    ) : (
                      <span className="chip err">
                        {errors.length} error{errors.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {warnings.map((w) => (
                      <span key={w.code} className="chip warn">
                        {w.code}
                      </span>
                    ))}
                    {p.sections.length === 0 && <span className="chip info">draft — sections pending</span>}
                  </div>
                </div>
                <div className="item-actions">
                  <button className="primary" onClick={() => go({ name: 'newmod', patternId: p.meta.name })}>
                    Modify
                  </button>
                  <button className="danger" onClick={() => store.actions.removePattern(p.meta.name)}>
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Modification sheets</h2>
        {store.results.length === 0 && (
          <p className="muted">No sheets yet — open a pattern and request a modification.</p>
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
                  <span className={r.validation.pass ? 'chip ok' : 'chip err'}>
                    {r.validation.pass ? 'validation passed' : 'validation FAILED'}
                  </span>
                  {r.sheet.warnings.length > 0 && (
                    <span className="chip warn">{r.sheet.warnings.length} warning(s)</span>
                  )}
                </div>
              </div>
              <div className="item-actions">
                <button onClick={() => go({ name: 'sheet', resultId: r.id })}>Open</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
