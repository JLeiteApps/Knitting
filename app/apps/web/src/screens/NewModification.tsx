import { useState } from 'react'
import { applyIntent, capabilityFor } from '@knitting/engine'
import { fmtLen, fromCanonicalInches, toCanonicalInches } from '../units'
import type { FitProfile, Intent, ModificationRequest } from '@knitting/shared'
import { INTENT_BACKING, INTENT_LABELS, INTENT_ORDER, missingSlots } from '../intents'
import { classifyDeterministic } from '../nlGrammar'
import { classifyViaApi, summarizePattern } from '../classify'
import { getLlmKey } from '../api'
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
    case 'waist_shape_reposition':
      return { kind: 'waist_reposition', deltaIn: NaN, landmarkIn: NaN }
    case 'hip_width_change':
      return { kind: 'hip_width', deltaIn: NaN }
    case 'upper_arm_width_change':
      return { kind: 'upper_arm_width', deltaIn: NaN }
    case 'back_neck_raise':
      return { kind: 'back_neck_raise', deltaIn: NaN }
    default:
      throw new Error('unsupported intent')
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
  /** When the deterministic grammar is not 100% sure: reasons + the LLM offer. */
  const [llmOffer, setLlmOffer] = useState<string[] | null>(null)
  const [sizeIndex, setSizeIndex] = useState(0)
  const [profileId, setProfileId] = useState(store.profiles[0]?.id ?? '')
  const [error, setError] = useState('')
  const [drafting, setDrafting] = useState(false)

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
  const capability = capabilityFor(intent, pattern.construction.type)

  /** Deterministic first — no LLM involved unless the user accepts the offer. */
  const draft = () => {
    setError('')
    setLlmOffer(null)
    const d = classifyDeterministic(raw)
    if (!d) {
      setNotes(['No intent recognized from the text — pick one below and set its parameters.'])
      setLlmOffer(['Nothing in the text mapped to the five supported modifications.'])
      return
    }
    setIntent(d.intent)
    setParams(d.params)
    const nextNotes = [...d.notes]
    if (d.confidence === 'exact') {
      nextNotes.push('Understood by the deterministic grammar — no LLM used. Review and run.')
    }
    setNotes(nextNotes)
    setLlmOffer(d.confidence === 'exact' ? null : d.reasons)
  }

  /** Optional LLM pass — the user chose "let the LLM try" on the offer panel. */
  const draftWithLlm = async () => {
    setError('')
    setDrafting(true)
    try {
      const result = await classifyViaApi(raw, summarizePattern(pattern))
      if (result.status === 'ok') {
        setIntent(result.intent)
        setParams(result.params)
        const nextNotes: string[] = []
        if (result.clarifyingQuestion) nextNotes.push(result.clarifyingQuestion)
        for (const slot of result.missingSlots) nextNotes.push(`Still needed: ${slot}`)
        nextNotes.push('Drafted by the LLM classifier — review the card before running.')
        setNotes(nextNotes)
        setLlmOffer(null)
        return
      }
      if (result.status === 'unsupported') {
        setNotes([
          result.clarifyingQuestion ?? 'That request is outside the five supported modifications for now.',
          'Pick the closest intent below and adjust its parameters, or rephrase.',
        ])
        setLlmOffer(null)
        return
      }
      // LLM unavailable — the deterministic draft stands.
      const reason =
        result.error === 'no-key'
          ? 'No LLM key set — add one on the Add pattern screen to use the LLM. The deterministic draft stands; adjust the card manually if needed.'
          : `LLM unavailable (${result.error}) — the deterministic draft stands; adjust the card manually.`
      setLlmOffer(null)
      setNotes((ns) => [...ns, reason])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDrafting(false)
    }
  }

  const pickIntent = (next: Intent) => {
    setIntent(next)
    setParams(defaultParams(next))
    setNotes([])
    setLlmOffer(null)
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
      const { sheet, validation, modified } = applyIntent(pattern, request, profile ?? NO_PROFILE, {
        unit: store.displayUnit,
      })
      store.actions.addResult({
        id,
        patternName: pattern.meta.name,
        sizeLabel: pattern.sizing.labels[sizeIndex] ?? `#${sizeIndex + 1}`,
        raw,
        sheet,
        validation,
        request,
        modifiedPattern: modified,
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
                  {pattern.sizing.bustOrChestIn[i] ? ` — ${fmtLen(pattern.sizing.bustOrChestIn[i]!, store.displayUnit)} bust` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Fit profile</span>
            <select
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value)
                store.actions.setActiveProfile(e.target.value || null)
              }}
            >
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
          <button onClick={draft} disabled={raw.trim().length === 0}>
            Draft intent from text
          </button>
        </div>
        <p className="muted small">
          Deterministic first — your request is parsed by a rule grammar, no LLM involved. When it
          can't claim 100% of the meaning you'll be offered the LLM (your key, per request). The
          engine always computes the math.
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
                  <span>Target ease ({store.displayUnit === 'cm' ? 'cm' : 'in'}) — overrides tier</span>
                  <input
                    type="number"
                    step="0.5"
                    value={params.targetEaseIn === undefined ? '' : fromCanonicalInches(params.targetEaseIn, store.displayUnit)}
                    onChange={(e) =>
                      setParams({
                        ...params,
                        targetEaseIn:
                          e.target.value === ''
                            ? undefined
                            : toCanonicalInches(Number(e.target.value), store.displayUnit),
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
                <span>
                  Change ({store.displayUnit === 'cm' ? 'cm' : 'inches'}; negative shortens)
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={fromCanonicalInches(params.deltaIn, store.displayUnit)}
                  onChange={(e) =>
                    setParams({
                      ...params,
                      deltaIn:
                        e.target.value === '' ? 0 : toCanonicalInches(Number(e.target.value), store.displayUnit),
                    } as typeof params)
                  }
                />
              </label>
            )}
            {(params.kind === 'waist_reposition' || params.kind === 'hip_width' || params.kind === 'upper_arm_width' || params.kind === 'back_neck_raise') && (
              <label className="field">
                <span>
                  Change ({store.displayUnit === 'cm' ? 'cm' : 'inches'}; negative narrows/lowers)
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={Number.isFinite(params.deltaIn) ? fromCanonicalInches(params.deltaIn, store.displayUnit) : ''}
                  onChange={(e) => setParams({ ...params, deltaIn: e.target.value === '' ? NaN : toCanonicalInches(Number(e.target.value), store.displayUnit) } as typeof params)}
                />
              </label>
            )}
            {params.kind === 'waist_reposition' && (
              <label className="field">
                <span>Waist landmark from hem ({store.displayUnit === 'cm' ? 'cm' : 'inches'})</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={Number.isFinite(params.landmarkIn) ? fromCanonicalInches(params.landmarkIn, store.displayUnit) : ''}
                  onChange={(e) => setParams({ ...params, landmarkIn: e.target.value === '' ? NaN : toCanonicalInches(Number(e.target.value), store.displayUnit) })}
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
          {llmOffer && (
            <div className="panel warn">
              <strong>Not 100% sure this captures your meaning — no LLM was used:</strong>
              <ul>
                {llmOffer.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="row">
                <button className="primary" disabled={drafting} onClick={() => void draftWithLlm()}>
                  {drafting
                    ? 'Asking the LLM…'
                    : getLlmKey()
                      ? 'Let the LLM try this one'
                      : 'Let the LLM try (needs your API key)'}
                </button>
                <button onClick={() => setLlmOffer(null)}>Keep this draft</button>
              </div>
              <p className="note">
                Uses your key via the BYOK relay, sent per request. The LLM drafts the request only
                — every number is still computed by the deterministic engine.
              </p>
            </div>
          )}
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
          <div className={`panel ${capability.status === 'implemented' ? 'info' : capability.status === 'advisory' ? 'warn' : 'err'} small`}>
            Capability: <strong>{capability.status}</strong> for <code>{pattern.construction.type}</code>.
            Required: {capability.requiredMeasurements.join('; ') || 'none listed'}.
          </div>
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
