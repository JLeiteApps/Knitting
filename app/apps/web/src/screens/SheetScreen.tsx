import { INTENT_LABELS } from '../intents'
import type { StoredResult } from '../store'
import type { ScreenProps } from '../App'

export default function SheetScreen({
  result,
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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `modification-sheet-${sheet.intent}-${result.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
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
          <button onClick={() => window.print()}>Print</button>
          <button onClick={exportJson}>Export JSON</button>
        </div>
      </section>

      <section className="card">
        <h3>Validation gate</h3>
        {validation.pass ? (
          <div className="panel ok">
            PASSED — every Σ-check exact and every dimension within 0.25&Prime; drift
            ({validation.dimensionChecks.length} dimension
            {validation.dimensionChecks.length === 1 ? '' : 's'}, {validation.sumChecks.length} Σ-check
            {validation.sumChecks.length === 1 ? '' : 's'}).
          </div>
        ) : (
          <div className="panel err">
            FAILED — the sheet is BLOCKED (app plan §2): fix the diagnostics below before knitting.
            Steps are withheld until the modified pattern recomputes cleanly.
          </div>
        )}

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
                      <td>{d.targetIn}"</td>
                      <td>{d.recomputedIn}"</td>
                      <td>{d.driftIn}"</td>
                      <td>
                        <span className={d.pass ? 'chip ok' : 'chip err'}>
                          {d.pass ? 'pass' : '≥ 0.25"'}
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
      </section>

      <section className="card print-area">
        <h3>Steps</h3>
        {!validation.pass && <p className="muted">Withheld — validation gate failed.</p>}
        {validation.pass && sheet.warnings.length > 0 && (
          <div className="panel warn">
            <strong>Warnings</strong>
            <ul>
              {sheet.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {validation.pass && sheet.steps.length === 0 && (
          <p className="muted">No steps were needed for this request.</p>
        )}
        {validation.pass &&
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
