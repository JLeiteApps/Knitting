import { INTENT_LABELS } from '../intents'
import { fmtLen } from '../units'
import type { StoredResult } from '../store'
import type { ScreenProps } from '../App'

export default function SheetScreen({
  result,
  store,
  go,
}: ScreenProps & { result: StoredResult | undefined }) {
  if (!result) {
    return (
      <section className="card">
        <h2>Modification sheet</h2>
        <p className="muted">No sheet found — run a modification first.</p>
        <button className="primary" onClick={() => go({ name: 'library' })}>
          ← Library
        </button>
      </section>
    )
  }

  const { sheet, validation } = result
  const status = validation.status ?? (validation.pass ? 'verified' : 'blocked')
  const statusLabel = status === 'verified' ? 'verified' : status === 'advisory' ? 'advisory' : 'blocked'

  return (
    <>
      {/* Standalone header on paper: the printed sheet must identify itself. */}
      <header className="print-header print-only">
        <strong>Knit Adapt — modification sheet</strong>
        <span>
          {INTENT_LABELS[sheet.intent]} · {result.patternName} · size {result.sizeLabel} ·{' '}
          {new Date(sheet.createdAt).toLocaleDateString()} ·{' '}
          {statusLabel}
        </span>
      </header>

      <section className="card no-print">
        <div className="card-head">
          <h2>Modification sheet</h2>
          <button onClick={() => go({ name: 'library' })}>← Library</button>
        </div>
        <p className="muted small">
          {INTENT_LABELS[sheet.intent]} · {result.patternName} · size {result.sizeLabel} ·{' '}
          {new Date(sheet.createdAt).toLocaleString()}
        </p>
        {result.raw && <p className="muted small">Request: “{result.raw}”</p>}
        <div className="row">
          <button className="primary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Validation gate</h3>
        {status === 'verified' ? (
          <div className="panel ok">
            PASSED — every Σ-check exact and every dimension within {fmtLen(0.25, store.displayUnit)} drift
            ({validation.dimensionChecks.length} dimension
            {validation.dimensionChecks.length === 1 ? '' : 's'}, {validation.sumChecks.length} Σ-check
            {validation.sumChecks.length === 1 ? '' : 's'}).
          </div>
        ) : status === 'advisory' ? (
          <div className="panel warn">
            ADVISORY — the available evidence is incomplete, so this sheet is not a verified knitting certificate.
          </div>
        ) : (
          <div className="panel err">
            FAILED — the sheet is BLOCKED: fix the diagnostics below before knitting.
            Steps are withheld until the modified pattern recomputes cleanly.
          </div>
        )}

        <details className="about-checks no-print">
          <summary>What these checks mean</summary>
          <ul>
            <li>
              <strong>Σ-checks</strong> (“Σ” is math shorthand for a sum): knitting instructions are
              a chain of stitch counts — cast on, increases and decreases, bind off. A Σ-check
              re-adds each section of that chain and requires it to land on the next count
              <em> exactly</em>. If the counts don’t reconcile, the instructions are wrong, so the
              sheet won’t render.
            </li>
            <li>
              <strong>Schematic recompute (drift)</strong>: the modified garment’s measurements are
              recomputed from the new stitch counts and compared with what you asked for. Anything
              off by more than {fmtLen(0.25, store.displayUnit)} is flagged — small rounding in
              knitting is normal, silent drift is not.
            </li>
          </ul>
        </details>

        {validation.dimensionChecks.length > 0 && (
          <>
            <h4>Schematic recompute (drift)</h4>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Target</th>
                    <th>Recomputed</th>
                    <th>Drift</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {validation.dimensionChecks.map((d, i) => (
                    <tr key={i}>
                      <td>
                        <code>{d.dimension}</code>
                      </td>
                      <td>{fmtLen(d.targetIn, store.displayUnit)}</td>
                      <td>{fmtLen(d.recomputedIn, store.displayUnit)}</td>
                      <td>{fmtLen(d.driftIn, store.displayUnit)}</td>
                      <td>
                        <span className={d.pass ? 'chip ok' : 'chip err'}>
                          {d.pass ? 'pass' : `≥ ${fmtLen(0.25, store.displayUnit)}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {validation.sumChecks.length > 0 && (
          <>
            <h4>Σ-checks</h4>
            <ul className="sum-list">
              {validation.sumChecks.map((s, i) => (
                <li key={i}>
                  <span className={s.ok ? 'chip ok' : 'chip err'}>{s.ok ? 'Σ ok' : 'Σ FAIL'}</span>{' '}
                  <code>{s.path}</code> <span className="mono">{s.detail}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {validation.dimensionChecks.length === 0 && validation.sumChecks.length === 0 && (
          <p className="muted small">
            Advisory mode: no schematic/sections to recompute (NO_SCHEMATIC draft).
          </p>
        )}
        {validation.reasons.length > 0 && (
          <ul className="muted small">
            {validation.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
          </ul>
        )}
      </section>

      <section className="card print-area">
        <h3>Steps</h3>
        {status !== 'verified' && <p className="muted">Withheld — only verified sheets contain actionable instructions.</p>}
        {status === 'verified' && sheet.warnings.length > 0 && (
          <div className="panel warn">
            <strong>Warnings</strong>
            <ul>
              {sheet.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {status === 'verified' && sheet.steps.length === 0 && (
          <p className="muted">No steps were needed for this request.</p>
        )}
        {status === 'verified' &&
          sheet.steps.map((step, i) => (
            <article key={step.id} className="step">
              <h4>
                {i + 1}. {step.title}
              </h4>
              <p>{step.instruction}</p>
              {step.math.length > 0 && (
                <pre className="math">
                  {step.math.join('\n')}
                </pre>
              )}
              {step.refs.length > 0 && (
                <p className="muted small refs">
                  Sources: {step.refs.join(' · ')}
                  {step.sectionId ? ` · pattern section: ${step.sectionId}` : ''}
                </p>
              )}
            </article>
          ))}
      </section>
    </>
  )
}
