import { useState } from 'react'
import { applyIntent } from '@knitting/engine'
import type { FitProfile, Intent, ModificationRequest } from '@knitting/shared'
import { INTENT_BACKING, INTENT_LABELS, INTENT_ORDER, draftIntent, missingSlots } from '../intents'
import { newId } from '../store'
import type { ScreenProps } from '../App'

function defaultParams(intent: Intent): ModificationRequest['params'] {
  switch (intent) {
    case 'size_ease_selection':
      return { kind: 'size_ease', basis: 'upper_torso', tier: 'average' }
    case 'bust_accommodation':
      return { kind: 'bust', method: 'auto', tightness: 'average' }
    case 'body_length_change':
      return { kind: 'body_length', deltaIn: 2 }
    case 'sleeve_length_change':
      return { kind: 'sleeve_length', deltaIn: 2 }
    case 'gauge_conversion':
      return { kind: 'gauge', userStsPerIn: 5 }
  }
}

const NO_PROFILE: FitProfile = { id: 'none', label: '(no profile)', displayUnit: 'in' }

export default function NewModification({
  store,
  patternId,
  go,
}: ScreenProps & { patternId: string }) {
  const pattern = store.patterns.find((p) => p.meta.name === patternId) ?? store.patterns[0]
  const [raw, setRaw] = useState('')
  const [intent, setIntent] = useState<Intent>('size_ease_selection')
  const [params, setParams] = useState<ModificationRequest['params']>(defaultParams('size_ease_selection'))
  const [notes, setNotes] = useState<string[]>([])
  const [sizeIndex, setSizeIndex] = useState(0)
  const [profileId, setProfileId] = useState(store.profiles[0]?.id ?? '')
  const [error, setError] = useState('')

  if (!pattern) {
    return (
      <section className="card">
        <h2>New modification</h2>
        <p className="muted">No pattern selected — add one first.</p>
        <button className="primary" onClick={() => go({ name: 'add' })}>
          Add pattern
        </button>
      </section>
    )
  }

  const profile = store.profiles.find((p) => p.id === profileId)
  const missing = missingSlots(intent, params, profile)
  const backing = INTENT_BACKING[intent]

  const draft = () => {
    const d = draftIntent(raw)
    if (d) {
      setIntent(d.intent)
      setParams(d.params)
      setNotes(d.notes)
    } else {
      setNotes(['No intent recognized from the text — pick one below and set its parameters.'])
    }
  }

  const pickIntent = (next: Intent) => {
    setIntent(next)
    setParams(defaultParams(next))
    setNotes([])
  }

  const confirm = () => {
    setError('')
    const id = newId()
    try {
      const request: ModificationRequest = {
        intent,
        patternId: pattern.meta.name,
        sizeIndex,
        profileId: profile?.id,
        raw,
        params,
      }
      const { sheet, validation } = applyIntent(pattern, request, profile ?? NO_PROFILE)
      store.actions.addResult({
        id,
        patternName: pattern.meta.name,
        sizeLabel: pattern.sizing.labels[sizeIndex] ?? `#${sizeIndex + 1}`,
        raw,
        sheet,
        validation,
      })
      go({ name: 'sheet', resultId: id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <section className="card">
        <h2>New modification</h2>
        <p className="muted small">
          {pattern.meta.name} · {pattern.construction.type.replaceAll('_', ' ')}
        </p>
        <div className="form-grid">
          <label className="field">
            <span>Size to knit</span>
            <select value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))}>
              {pattern.sizing.labels.map((l, i) => (
                <option key={i} value={i}>
                  {l}
                  {pattern.sizing.bustOrChestIn[i] ? ` — ${pattern.sizing.bustOrChestIn[i]}" bust` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Fit profile</span>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <option value="">— none —</option>
              {store.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>What do you want to change?</span>
          <textarea
            rows={3}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='e.g. "make this about 2 inches longer in the body" or "convert to my gauge, 22 sts over 4 inches"'
          />
        </label>
        <div className="row">
          <button onClick={draft}>Draft intent from text</button>
        </div>
        <p className="muted small">
          Heuristic drafting (placeholder for the /api classifier) — review the card below before
          confirming.
        </p>
      </section>

      <section className="card">
        <h2>Intent</h2>
        <div className="chip-row wrap">
          {INTENT_ORDER.map((i) => (
            <button
              key={i}
              className={i === intent ? 'chip-btn active' : 'chip-btn'}
              onClick={() => pickIntent(i)}
            >
              {INTENT_LABELS[i]}
            </button>
          ))}
        </div>

        <div className="intent-card">
          <div className="form-grid">
            {params.kind === 'size_ease' && (
              <>
                <label className="field">
                  <span>Measure by</span>
                  <select
                    value={params.basis}
                    onChange={(e) => setParams({ ...params, basis: e.target.value as 'upper_torso' | 'bust' })}
                  >
                    <option value="upper_torso">Upper torso (Herzog)</option>
                    <option value="bust">Full bust</option>
                  </select>
                </label>
                <label className="field">
                  <span>Ease tier</span>
                  <select
                    value={params.tier}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        tier: e.target.value as 'fitted' | 'average' | 'oversized',
                      })
                    }
                  >
                    <option value="fitted">Fitted</option>
                    <option value="average">Average</option>
                    <option value="oversized">Oversized</option>
                  </select>
                </label>
                <label className="field">
                  <span>Target ease (in) — overrides tier</span>
                  <input
                    type="number"
                    step="0.5"
                    value={params.targetEaseIn ?? ''}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        targetEaseIn: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </>
            )}
            {params.kind === 'bust' && (
              <>
                <label className="field">
                  <span>Method</span>
                  <select
                    value={params.method}
                    onChange={(e) =>
                      setParams({ ...params, method: e.target.value as typeof params.method })
                    }
                  >
                    <option value="auto">Auto (by stitch texture)</option>
                    <option value="vertical_darts">Vertical darts</option>
                    <option value="short_rows">Short rows</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tightness</span>
                  <select
                    value={params.tightness}
                    onChange={(e) =>
                      setParams({ ...params, tightness: e.target.value as typeof params.tightness })
                    }
                  >
                    <option value="tight">Tight</option>
                    <option value="average">Average</option>
                    <option value="loose">Loose</option>
                  </select>
                </label>
              </>
            )}
            {(params.kind === 'body_length' || params.kind === 'sleeve_length') && (
              <label className="field">
                <span>Change (inches; negative shortens)</span>
                <input
                  type="number"
                  step="0.5"
                  value={params.deltaIn}
                  onChange={(e) =>
                    setParams({ ...params, deltaIn: Number(e.target.value) } as typeof params)
                  }
                />
              </label>
            )}
            {params.kind === 'gauge' && (
              <>
                <label className="field">
                  <span>Your stitch gauge (sts per inch)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="1"
                    value={params.userStsPerIn}
                    onChange={(e) =>
                      setParams({ ...params, userStsPerIn: Number(e.target.value) } as typeof params)
                    }
                  />
                </label>
                <label className="field">
                  <span>Your row gauge (rows per inch, optional)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="1"
                    value={params.userRowsPerIn ?? ''}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        userRowsPerIn: e.target.value === '' ? undefined : Number(e.target.value),
                      } as typeof params)
                    }
                  />
                </label>
              </>
            )}
          </div>

          {notes.map((n) => (
            <p key={n} className="note">
              {n}
            </p>
          ))}
          {missing.length > 0 ? (
            <div className="panel warn">
              <strong>Before this can run:</strong>
              <ul>
                {missing.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="panel info small">
              Engine: <code>{backing.engine}</code> · Knowledge base: {backing.refs} · Every schedule
              Σ-verified before the sheet renders.
            </div>
          )}
          {error && <div className="panel err">{error}</div>}
          <div className="row">
            <button className="primary" disabled={missing.length > 0} onClick={confirm}>
              Run modification
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
