import { useEffect, useRef, useState } from 'react'
import { applyIntent, capabilityFor, cmToIn, inToCm } from '@knitting/engine'
import { garmentEligibility } from '@knitting/schema'
import { fmtLen, fromCanonicalInches, toCanonicalInches } from '../units'
import type { FitProfile, Intent, ModificationRequest } from '@knitting/shared'
import { INTENT_BACKING, INTENT_LABELS, INTENT_ORDER, missingSlots } from '../intents'
import { classifyDeterministic } from '../nlGrammar'
import { classifyViaApi, summarizePattern } from '../classify'
import { getLlmKey } from '../api'
import { newId } from '../store'
import type { ScreenProps } from '../App'
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from '../sessionDrafts'

function defaultParams(intent: Intent): ModificationRequest['params'] {
  switch (intent) {
    case 'size_ease_selection':
      return { kind: 'size_ease', basis: 'upper_torso', tier: 'average' }
    case 'bust_accommodation':
      return { kind: 'bust', method: 'auto', tightness: 'average' }
    case 'body_length_change':
      return { kind: 'body_length', deltaIn: NaN }
    case 'sleeve_length_change':
      return { kind: 'sleeve_length', deltaIn: NaN }
    case 'gauge_conversion':
      return { kind: 'gauge', userStsPerIn: NaN }
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

interface GaugeEntry {
  stitches: string
  rows: string
  span: string
  unit: 'in' | 'cm'
}

interface RequestDraft {
  raw: string
  intent: Intent
  params: ModificationRequest['params']
  notes: string[]
  llmOffer: string[] | null
  sizeIndex: number
  profileId: string
  gauge: GaugeEntry
}

const emptyGauge = (): GaugeEntry => ({ stitches: '', rows: '', span: '', unit: 'in' })

export default function NewModification({
  store,
  patternId,
  go,
}: ScreenProps & { patternId: string }) {
  const pattern = store.patterns.find((p) => p.meta.name === patternId)
  const draftKey = `newmod:${patternId}`
  const restored = readSessionDraft<RequestDraft>(draftKey)
  const [raw, setRaw] = useState(restored?.raw ?? '')
  const [intent, setIntent] = useState<Intent>(restored?.intent ?? 'size_ease_selection')
  const [params, setParams] = useState<ModificationRequest['params']>(restored?.params ?? defaultParams('size_ease_selection'))
  const [notes, setNotes] = useState<string[]>(restored?.notes ?? [])
  /** When the deterministic grammar is not 100% sure: reasons + the LLM offer. */
  const [llmOffer, setLlmOffer] = useState<string[] | null>(restored?.llmOffer ?? null)
  const [sizeIndex, setSizeIndex] = useState(restored?.sizeIndex ?? 0)
  const [profileId, setProfileId] = useState(restored?.profileId ?? store.activeProfileId ?? '')
  const [gauge, setGauge] = useState<GaugeEntry>(restored?.gauge ?? emptyGauge())
  const [error, setError] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftDirty, setDraftDirty] = useState(Boolean(restored))
  const inputRevision = useRef(0)
  const llmRun = useRef(0)
  const markDirty = () => { inputRevision.current += 1; setDraftDirty(true); setDrafting(false) }

  useEffect(() => () => { llmRun.current += 1 }, [])

  useEffect(() => {
    if (!draftDirty) return
    writeSessionDraft(draftKey, { raw, intent, params, notes, llmOffer, sizeIndex, profileId, gauge })
  }, [draftKey, draftDirty, gauge, intent, llmOffer, notes, params, profileId, raw, sizeIndex])

  if (!pattern) {
    return (
      <section className="card">
        <h2>New modification</h2>
        {draftDirty && <p className="note">Unsaved request changes are kept only while this browser tab stays open.</p>}
        <p className="muted">No pattern selected — add one first.</p>
        <button className="primary" onClick={() => go({ name: 'add' })}>
          Add pattern
        </button>
      </section>
    )
  }

  const profile = store.profiles.find((p) => p.id === profileId)
  const missing = missingSlots(intent, params, profile)
  const selectionError = !Number.isInteger(sizeIndex) || sizeIndex < 0 || sizeIndex >= pattern.sizing.labels.length
    ? 'The selected size is no longer available for this pattern.'
    : profileId && !profile
      ? 'The selected fit profile is no longer available. Choose another profile or select none.'
      : ''
  const backing = INTENT_BACKING[intent]
  const garment = garmentEligibility(pattern)
  const capability = capabilityFor(intent, pattern)

  /** Deterministic first — no LLM involved unless the user accepts the offer. */
  const draft = () => {
    if (!garment.eligible) {
      setError(garment.reason ?? 'This pattern is unavailable for modification.')
      return
    }
    markDirty()
    setError('')
    setLlmOffer(null)
    const d = classifyDeterministic(raw)
    if (!d) {
      setNotes(['No intent recognized from the text — pick one below and set its parameters.'])
      setLlmOffer(['Nothing in the text mapped to an available modification path.'])
      return
    }
    setIntent(d.intent)
    setParams(d.params)
    if (d.params.kind === 'gauge') {
      setGauge(Number.isFinite(d.params.userStsPerIn)
        ? { stitches: String(d.params.userStsPerIn), rows: d.params.userRowsPerIn === undefined ? '' : String(d.params.userRowsPerIn), span: '1', unit: 'in' }
        : emptyGauge())
    }
    const nextNotes = [...d.notes]
    if (d.confidence === 'exact') {
      nextNotes.push('Understood by the deterministic grammar — no LLM used. Review and run.')
    }
    setNotes(nextNotes)
    setLlmOffer(d.confidence === 'exact' ? null : d.reasons)
  }

  /** Optional LLM pass — the user chose "let the LLM try" on the offer panel. */
  const draftWithLlm = async () => {
    if (!garment.eligible) {
      setError(garment.reason ?? 'This pattern is unavailable for modification.')
      return
    }
    const startRevision = inputRevision.current
    const runId = ++llmRun.current
    setError('')
    setDrafting(true)
    try {
      const result = await classifyViaApi(raw, summarizePattern(pattern))
      if (runId !== llmRun.current || startRevision !== inputRevision.current) return
      if (result.status === 'ok') {
        setIntent(result.intent)
        setParams(result.params)
        if (result.params.kind === 'gauge') {
          setGauge(Number.isFinite(result.params.userStsPerIn)
            ? { stitches: String(result.params.userStsPerIn), rows: result.params.userRowsPerIn === undefined ? '' : String(result.params.userRowsPerIn), span: '1', unit: 'in' }
            : emptyGauge())
        }
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
          result.clarifyingQuestion ?? 'That request is outside the available modification paths for now.',
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
      if (runId === llmRun.current && startRevision === inputRevision.current) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (runId === llmRun.current) setDrafting(false)
    }
  }

  const pickIntent = (next: Intent) => {
    markDirty()
    setIntent(next)
    setParams(defaultParams(next))
    setNotes([])
    setLlmOffer(null)
    setGauge(emptyGauge())
    setDrafting(false)
  }

  const updateGauge = (next: GaugeEntry) => {
    markDirty()
    setGauge(next)
    const stitches = next.stitches.trim() === '' ? null : Number(next.stitches)
    const span = next.span.trim() === '' ? null : Number(next.span)
    const rows = next.rows.trim() === '' ? null : Number(next.rows)
    const overIn = span !== null && Number.isFinite(span) && span > 0 ? (next.unit === 'cm' ? cmToIn(span) : span) : NaN
    const validStitches = stitches !== null && Number.isFinite(stitches) && stitches > 0
    const validRows = rows === null || Number.isFinite(rows) && rows > 0
    const complete = validStitches && validRows && Number.isFinite(overIn) && overIn > 0
    setParams({ kind: 'gauge', userStsPerIn: complete ? stitches / overIn : NaN,
      ...(complete && rows !== null ? { userRowsPerIn: rows / overIn } : {}) })
  }

  const discard = () => {
    llmRun.current += 1
    inputRevision.current += 1
    setRaw('')
    setIntent('size_ease_selection')
    setParams(defaultParams('size_ease_selection'))
    setNotes([])
    setLlmOffer(null)
    setSizeIndex(0)
    setProfileId(store.activeProfileId ?? '')
    setGauge(emptyGauge())
    setDrafting(false)
    setError('')
    setDraftDirty(false)
    clearSessionDraft(draftKey)
  }

  const confirm = () => {
    setError('')
    if (!garment.eligible) {
      setError(garment.reason ?? 'This pattern is unavailable for modification.')
      return
    }
    if (selectionError || missing.length > 0) {
      setError(selectionError || 'Complete the required inputs before running this modification.')
      return
    }
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
          {pattern.meta.name} · {garment.resolution.kind} · {pattern.construction.type.replaceAll('_', ' ')}
        </p>
        {!garment.eligible && (
          <div className="panel warn">
            <strong>Modification unavailable.</strong> {garment.reason}
          </div>
        )}
        <div className="form-grid">
          <label className="field">
            <span>Size to knit</span>
            <select value={sizeIndex} onChange={(e) => { markDirty(); setSizeIndex(Number(e.target.value)) }}>
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
                markDirty()
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
            onChange={(e) => { markDirty(); setRaw(e.target.value) }}
            placeholder='e.g. "make this about 2 inches longer in the body" or "convert to my gauge, 22 sts over 4 inches"'
          />
        </label>
        <div className="row">
          <button onClick={draft} disabled={!garment.eligible || raw.trim().length === 0}>
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
                    onChange={(e) => { markDirty(); setParams({ ...params, basis: e.target.value as 'upper_torso' | 'bust' }) }}
                  >
                    <option value="upper_torso">Upper torso (Herzog)</option>
                    <option value="bust">Full bust</option>
                  </select>
                </label>
                <label className="field">
                  <span>Ease tier</span>
                  <select
                    value={params.tier}
                    onChange={(e) => {
                      markDirty(); setParams({
                        ...params,
                        tier: e.target.value as 'fitted' | 'average' | 'oversized',
                      })
                    }}
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
                    onChange={(e) => {
                      markDirty(); setParams({
                        ...params,
                        targetEaseIn:
                          e.target.value === ''
                            ? undefined
                            : toCanonicalInches(Number(e.target.value), store.displayUnit),
                      })
                    }}
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
                    onChange={(e) => { markDirty(); setParams({ ...params, method: e.target.value as typeof params.method }) }}
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
                    onChange={(e) => { markDirty(); setParams({ ...params, tightness: e.target.value as typeof params.tightness }) }}
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
                  value={Number.isFinite(params.deltaIn) ? fromCanonicalInches(params.deltaIn, store.displayUnit) : ''}
                  onChange={(e) =>
                    { markDirty(); setParams({
                      ...params,
                      deltaIn:
                        e.target.value === '' ? NaN : toCanonicalInches(Number(e.target.value), store.displayUnit),
                    } as typeof params) }
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
                  onChange={(e) => { markDirty(); setParams({ ...params, deltaIn: e.target.value === '' ? NaN : toCanonicalInches(Number(e.target.value), store.displayUnit) } as typeof params) }}
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
                  onChange={(e) => { markDirty(); setParams({ ...params, landmarkIn: e.target.value === '' ? NaN : toCanonicalInches(Number(e.target.value), store.displayUnit) }) }}
                />
              </label>
            )}
            {params.kind === 'gauge' && (
              <>
                <label className="field">
                  <span>Stitches measured</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={gauge.stitches}
                    onChange={(e) => updateGauge({ ...gauge, stitches: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Rows measured (optional)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={gauge.rows}
                    onChange={(e) => updateGauge({ ...gauge, rows: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Measured span</span>
                  <input type="number" step="0.1" min="0" value={gauge.span} onChange={(e) => updateGauge({ ...gauge, span: e.target.value })} />
                </label>
                <label className="field">
                  <span>Span unit</span>
                  <select value={gauge.unit} onChange={(e) => {
                    const unit = e.target.value as 'in' | 'cm'
                    const current = Number(gauge.span)
                    const span = gauge.span.trim() === '' || !Number.isFinite(current) ? gauge.span : String(unit === 'cm' ? inToCm(gauge.unit === 'cm' ? cmToIn(current) : current) : gauge.unit === 'cm' ? cmToIn(current) : current)
                    updateGauge({ ...gauge, unit, span })
                  }}>
                    <option value="in">Inches</option>
                    <option value="cm">Centimeters</option>
                  </select>
                </label>
                {Number.isFinite(params.userStsPerIn) && (
                  <p className="note">Normalized gauge: {params.userStsPerIn} sts/in{params.userRowsPerIn === undefined ? '' : ` · ${params.userRowsPerIn} rows/in`}.</p>
                )}
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
                <button className="primary" disabled={!garment.eligible || drafting} onClick={() => void draftWithLlm()}>
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
          {selectionError && <div className="panel err">{selectionError}</div>}
          <div className="row">
            <button className="primary" disabled={!garment.eligible || missing.length > 0 || Boolean(selectionError)} onClick={confirm}>
              Run modification
            </button>
            {draftDirty && <button onClick={discard}>Discard unsaved request</button>}
          </div>
        </div>
      </section>
    </>
  )
}
