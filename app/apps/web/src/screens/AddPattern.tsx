import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConstructionType, Pattern, WorkingMethod } from '@knitting/schema'
import { validatePattern } from '@knitting/schema'
import type { ExtractedField, LlmFieldSpec } from '@knitting/parser'
import {
  buildSections,
  buildPatternDraft,
  classifyCheckpointLabel,
  detectMeasurementBasis,
  extractSectionCandidates,
  findSectionHeaders,
  findSizeLists,
  looksScanned,
  parseGaugeStatement,
  parseRepeatStatement,
  parseSizeList,
  segment,
  type ParsedGauge,
  type MeasurementBasis,
  type Segment,
} from '@knitting/parser'
import { pdfToText } from '../pdf'
import { callExtractViaApi, getLlmKey, setLlmKey } from '../api'
import { cmToIn, fmtLen, inToCm } from '../units'
import { validateReviewInputs } from '../reviewInputs'
import { toast } from '../toast'
import type { ScreenProps } from '../App'
import { clearSessionDraft, readSessionDraft, writeSessionDraft } from '../sessionDrafts'

/**
 * Add-pattern flow (parser grammar staged pipeline): PDF text layer (client,
 * pdf.js) → notation layer (segment, deterministic parses) → LLM extract via
 * /api with the verbatim-evidence gate → draft Pattern IR → validatePattern
 * diagnostics + Σ panel → save to library.
 */

type Stage = 'source' | 'review'

interface LlmOutcome {
  status: 'idle' | 'running' | 'done' | 'error'
  kept: ExtractedField[]
  dropped: Array<{ path: string; reason: string }>
  error?: string
}

interface AddPatternDraft {
  stage: Stage
  text: string
  name: string
  pdfName: string | null
  paste: string
  constructionOverride: ConstructionType | null
  methodOverride: WorkingMethod | null
  directionOverride: 'top_down' | 'bottom_up' | null
  basisOverride: MeasurementBasis | null
  labelsOverride: string
  bustOverride: string
  manualStsOver: string
  manualRowsOver: string
  manualGaugeSpan: string
  editingPattern: Pattern | null
  patternUnit: 'in' | 'cm'
  llmSizing: LlmOutcome | null
  llmGauge: LlmOutcome | null
}

const SIZING_FIELDS: LlmFieldSpec[] = [
  { path: 'sizes.labels', type: 'string', description: 'Size labels exactly as printed, comma-separated' },
  { path: 'sizes.finished_bust_in', type: 'number[]', description: 'Finished bust circumference in inches, one per size, in printed order' },
  { path: 'sizing.basis', type: 'string', description: 'Either "to_fit" or "finished", as the pattern words it' },
]

const GAUGE_FIELDS: LlmFieldSpec[] = [
  { path: 'gauge.sts', type: 'number', description: 'Stitch count stated in the gauge sentence' },
  { path: 'gauge.rows', type: 'number', description: 'Row count stated in the gauge sentence' },
  { path: 'gauge.over_in', type: 'number', description: 'Inches the gauge is measured over (e.g. 4)' },
]

function gaugeFromFields(fields: ExtractedField[]): ParsedGauge | null {
  const get = (path: string): ExtractedField | undefined => fields.find((f) => f.path === path)
  const sts = get('gauge.sts')
  const over = get('gauge.over_in')
  if (!sts || typeof sts.value !== 'number' || !over || typeof over.value !== 'number' || over.value <= 0) {
    return null
  }
  const rows = get('gauge.rows')
  const rowsOver = rows && typeof rows.value === 'number' ? rows.value : null
  return {
    stsOver: sts.value,
    rowsOver,
    overIn: over.value,
    stsPerIn: sts.value / over.value,
    rowsPerIn: rowsOver === null ? null : rowsOver / over.value,
    stitchPattern: null,
  }
}

function bustFromFields(fields: ExtractedField[]): number[] | null {
  const f = fields.find((x) => x.path === 'sizes.finished_bust_in')
  if (!f || !Array.isArray(f.value) || f.value.length === 0) return null
  return f.value.every((v) => typeof v === 'number' && v > 10 && v < 90) ? (f.value as number[]) : null
}

/** Convert only a wholly valid manual list; malformed review text stays visible
 * for the validation gate instead of being silently changed. */
function convertMeasurementList(raw: string, from: 'in' | 'cm', to: 'in' | 'cm'): string {
  if (from === to || raw.trim() === '') return raw
  const numbers = raw.trim().split(/[,/\s]+/)
  if (numbers.length === 0 || numbers.some((part) => part === '' || !Number.isFinite(Number(part)) || Number(part) <= 0)) return raw
  return numbers.map((part) => String(to === 'cm' ? inToCm(Number(part)) : cmToIn(Number(part)))).join(', ')
}

function convertSpan(raw: string, from: 'in' | 'cm', to: 'in' | 'cm'): string {
  if (from === to || raw.trim() === '') return raw
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return raw
  return String(to === 'cm' ? inToCm(value) : cmToIn(value))
}

export default function AddPattern({ store, go, patternName }: ScreenProps & { patternName?: string }) {
  const draftKey = patternName ? `add:existing:${patternName}` : 'add:new'
  const restored = readSessionDraft<AddPatternDraft>(draftKey)
  const [stage, setStage] = useState<Stage>(restored?.stage ?? 'source')
  const [declaredUnit, setDeclaredUnit] = useState<'in' | 'cm'>(restored?.patternUnit ?? store.patternUnit)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [text, setText] = useState(restored?.text ?? '')
  const [name, setName] = useState(restored?.name ?? '')
  const [pdfName, setPdfName] = useState<string | null>(restored?.pdfName ?? null)
  const [paste, setPaste] = useState(restored?.paste ?? '')
  const [dragOver, setDragOver] = useState(false)
  const [llmSizing, setLlmSizing] = useState<LlmOutcome>(restored?.llmSizing ?? { status: 'idle', kept: [], dropped: [] })
  const [llmKey, setLlmKeyState] = useState(getLlmKey())
  const [llmGauge, setLlmGauge] = useState<LlmOutcome>(restored?.llmGauge ?? { status: 'idle', kept: [], dropped: [] })
  const [error, setError] = useState('')
  const [constructionOverride, setConstructionOverride] = useState<ConstructionType | null>(restored?.constructionOverride ?? null)
  const [methodOverride, setMethodOverride] = useState<WorkingMethod | null>(restored?.methodOverride ?? null)
  const [directionOverride, setDirectionOverride] = useState<'top_down' | 'bottom_up' | null>(restored?.directionOverride ?? null)
  const [llmRequested, setLlmRequested] = useState(false)
  const [basisOverride, setBasisOverride] = useState<MeasurementBasis | null>(restored?.basisOverride ?? null)
  const [labelsOverride, setLabelsOverride] = useState(restored?.labelsOverride ?? '')
  const [bustOverride, setBustOverride] = useState(restored?.bustOverride ?? '')
  const [manualStsOver, setManualStsOver] = useState(restored?.manualStsOver ?? '')
  const [manualRowsOver, setManualRowsOver] = useState(restored?.manualRowsOver ?? '')
  const [manualGaugeSpan, setManualGaugeSpan] = useState(restored?.manualGaugeSpan ?? '')
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(restored?.editingPattern ?? null)
  const llmRun = useRef(0)
  const reviewRevision = useRef(0)
  const sourceRun = useRef(0)
  const sourceInitialized = useRef(false)
  const [draftDirty, setDraftDirty] = useState(Boolean(restored))
  const markDirty = () => {
    reviewRevision.current += 1
    setDraftDirty(true)
    // A manual correction wins over an optional extraction. Do not leave a
    // spinner that can no longer legitimately complete into this review.
    setLlmSizing((current) => current.status === 'running' ? { status: 'idle', kept: [], dropped: [] } : current)
    setLlmGauge((current) => current.status === 'running' ? { status: 'idle', kept: [], dropped: [] } : current)
    setLlmRequested(false)
  }
  const switchDeclaredUnit = (next: 'in' | 'cm') => {
    if (next === declaredUnit) return
    markDirty()
    setBustOverride((value) => convertMeasurementList(value, declaredUnit, next))
    setManualGaugeSpan((value) => convertSpan(value, declaredUnit, next))
    setDeclaredUnit(next)
    store.actions.setPatternUnit(next)
  }

  useEffect(() => {
    if (!patternName || restored) return
    const existing = store.patterns.find((p) => p.meta.name === patternName)
    if (!existing) {
      setError('That saved draft is no longer in the library.')
      return
    }
    // Saved drafts may not retain the original source text.  Keep their IR as
    // the editable base until the user attaches a replacement source below.
    setEditingPattern(structuredClone(existing))
    setText('')
    setPaste('')
    setPdfName(existing.meta.pdfRef ?? null)
    setName(existing.meta.name)
    setStage('review')
    setError('')
  }, [patternName])

  useEffect(() => () => {
    // Ignore a relay completion after the review is abandoned/unmounted.
    llmRun.current += 1
    sourceRun.current += 1
  }, [])

  useEffect(() => {
    if (!draftDirty) return
    writeSessionDraft(draftKey, {
      stage, text, name, pdfName, paste, constructionOverride, methodOverride,
      directionOverride, basisOverride, labelsOverride, bustOverride, manualStsOver,
      manualRowsOver, manualGaugeSpan, editingPattern, patternUnit: declaredUnit,
      llmSizing: llmSizing.status === 'done' ? llmSizing : null,
      llmGauge: llmGauge.status === 'done' ? llmGauge : null,
    })
  }, [basisOverride, bustOverride, constructionOverride, declaredUnit, directionOverride, draftDirty, draftKey, editingPattern, labelsOverride, llmGauge, llmSizing, manualGaugeSpan, manualRowsOver, manualStsOver, methodOverride, name, paste, pdfName, stage, text])
  useEffect(() => {
    if (!sourceInitialized.current) {
      sourceInitialized.current = true
      return
    }
    // Corrections belong to the source they were reviewed against.
    setLlmSizing({ status: 'idle', kept: [], dropped: [] })
    setLlmGauge({ status: 'idle', kept: [], dropped: [] })
    setLlmRequested(false)
    setConstructionOverride(null)
    setMethodOverride(null)
    setDirectionOverride(null)
    setBasisOverride(null)
    setLabelsOverride('')
    setBustOverride('')
    setManualStsOver('')
    setManualRowsOver('')
    setManualGaugeSpan('')
    llmRun.current += 1
    reviewRevision.current += 1
  }, [text])

  const handleFile = async (file: File) => {
    markDirty()
    const runId = ++sourceRun.current
    setBusy(true)
    setError('')
    try {
      const extracted = await pdfToText(file, (p) => {
        if (runId === sourceRun.current) setProgress(`Extracting text — page ${p.done}/${p.total}`)
      })
      if (runId !== sourceRun.current) return
      setText(extracted.text)
      setPdfName(file.name)
      setName(file.name.replace(/\.pdf$/i, ''))
      setStage('review')
    } catch (e) {
      if (runId === sourceRun.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (runId === sourceRun.current) {
        setBusy(false)
        setProgress('')
      }
    }
  }

  const analysis = useMemo(() => {
    const segments = segment(text)
    const gaugeSeg: Segment | undefined = segments.find((s) => s.kind === 'gauge')
    const sizingSeg: Segment | undefined = segments.find((s) => s.kind === 'sizing')
    const parsedGauge: ParsedGauge | null = gaugeSeg ? parseGaugeStatement(gaugeSeg.text) : null
    const basis = sizingSeg ? detectMeasurementBasis(sizingSeg.text) : 'unknown'
    const sizeList = sizingSeg ? parseSizeList(sizingSeg.text) : null
    const bust = sizeList && sizeList.every((v) => v >= 20 && v <= 90) ? sizeList : null
    const scannedPages = !text.trim() ? [] : segments
      .filter((s) => s.page !== undefined && looksScanned(s.text))
      .map((s) => s.page!)
    // Instruction layer (deterministic, parser grammar §2): section headers,
    // checkpoint candidates (size lists + their following labels), repeats.
    const sectionHeaders = text ? findSectionHeaders(text) : []
    const checkpointCandidates = (text ? findSizeLists(text) : [])
      .map((l) => ({ ...l, role: classifyCheckpointLabel(l.contextAfter) }))
      .filter((l) => l.role !== 'unknown' && l.values.length > 1)
    const repeats = text
      ? text
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => parseRepeatStatement(sentence))
          .filter((r): r is NonNullable<typeof r> => r !== null)
      : []
    return {
      segments,
      gaugeSeg,
      sizingSeg,
      parsedGauge,
      basis,
      bust,
      scannedPages,
      sectionHeaders,
      checkpointCandidates,
      repeats,
    }
  }, [text])

  const reviewSizeCount = useMemo(() => {
    if (editingPattern && !text.trim()) return editingPattern.sizing.sizeCount
    const inferred = Math.max(1, ...extractSectionCandidates(text).flatMap((candidate) => [
      candidate.startsWith?.sts.length ?? 0,
      ...candidate.checkpoints.map((checkpoint) => checkpoint.values.length),
    ].filter((count) => count > 1)))
    return analysis.bust?.length ?? inferred
  }, [analysis.bust, editingPattern, text])

  const reviewInputs = useMemo(() => validateReviewInputs({
    labels: labelsOverride,
    bust: bustOverride,
    stsOver: manualStsOver,
    rowsOver: manualRowsOver,
    span: manualGaugeSpan,
  }, declaredUnit, !(editingPattern && !text.trim()) && bustOverride.trim() !== '' ? null : reviewSizeCount), [labelsOverride, bustOverride, manualStsOver, manualRowsOver, manualGaugeSpan, declaredUnit, reviewSizeCount, editingPattern, text])

  // LLM extraction is an explicit user action. A remembered key never causes
  // source text to leave the device by itself.
  const requestLlmAssist = () => {
    const segs: Array<{ kind: 'sizing' | 'gauge'; seg: Segment; fields: LlmFieldSpec[] }> = []
    if (analysis.sizingSeg) segs.push({ kind: 'sizing', seg: analysis.sizingSeg, fields: SIZING_FIELDS })
    if (analysis.gaugeSeg) segs.push({ kind: 'gauge', seg: analysis.gaugeSeg, fields: GAUGE_FIELDS })
    if (segs.length === 0) return
    setLlmRequested(true)
    const runId = ++llmRun.current
    const revisionAtStart = reviewRevision.current
    const run = async () => {
      for (const { kind, seg, fields } of segs) {
        const setLlm = kind === 'sizing' ? setLlmSizing : setLlmGauge
        setLlm({ status: 'running', kept: [], dropped: [] })
        const out = await callExtractViaApi(seg.text, kind, fields)
        if (runId !== llmRun.current || revisionAtStart !== reviewRevision.current) return
        if (!out.ok || !out.kept) setLlm({ status: 'error', kept: [], dropped: [], error: out.error })
        else setLlm({ status: 'done', kept: out.kept, dropped: out.dropped ?? [] })
      }
    }
    void run()
  }

  const draft: Pattern = useMemo(() => {
    const cm = declaredUnit === 'cm'
    const conv = (v: number) => (cm ? Math.round(cmToIn(v) * 100) / 100 : v)
    const llmBust = llmSizing.status === 'done' ? bustFromFields(llmSizing.kept) : null
    // API extraction is normalized to canonical inches by the client.  Only
    // notation values still use the document unit conversion here.
    const bust = llmBust ?? (analysis.bust ? analysis.bust.map(conv) : null)
    const llmGaugeFields = llmGauge.status === 'done' ? gaugeFromFields(llmGauge.kept) : null
    const existingMethod = editingPattern?.construction.working[0]?.method
      ?? editingPattern?.gauge.find((gauge) => gauge.primary)?.worked
      ?? 'unknown'
    const g = reviewInputs.gauge ?? llmGaugeFields ?? analysis.parsedGauge
    const reviewLabels = reviewInputs.labels
    const reviewBust = reviewInputs.bustOrChestIn
    const reviewNotes = [
      ...(reviewLabels ? ['size labels corrected in review'] : []),
      ...(reviewBust ? ['size measurements corrected in review'] : []),
      ...(reviewInputs.gauge ? ['gauge counts/span corrected in review'] : []),
      ...(basisOverride ? ['measurement basis corrected in review'] : []),
    ]
    const high = [...llmSizing.kept, ...llmGauge.kept].filter((f) => f.confidence === 'high').length
    const total = [...llmSizing.kept, ...llmGauge.kept].length
    const built = editingPattern && !text.trim()
      ? (() => {
          const preserved = structuredClone(editingPattern)
          const notes = [...(preserved.sizing.notes ? [preserved.sizing.notes] : []), ...reviewNotes]
          const primary = preserved.gauge.findIndex((gauge) => gauge.primary)
          const correctedGauge = reviewInputs.gauge
            ? (primary >= 0
              ? preserved.gauge.map((gauge, index) => index === primary ? {
                  ...gauge,
                  stsOver: reviewInputs.gauge!.stsOver,
                  rowsOver: reviewInputs.gauge!.rowsOver,
                  overIn: reviewInputs.gauge!.overIn,
                  stsPerIn: reviewInputs.gauge!.stsPerIn,
                  rowsPerIn: reviewInputs.gauge!.rowsPerIn,
                } : gauge)
              : [{
                  primary: true,
                  stitchPatternRef: 'stockinette',
                  worked: methodOverride ?? existingMethod,
                  stsOver: reviewInputs.gauge!.stsOver,
                  rowsOver: reviewInputs.gauge!.rowsOver,
                  overIn: reviewInputs.gauge!.overIn,
                  stsPerIn: reviewInputs.gauge!.stsPerIn,
                  rowsPerIn: reviewInputs.gauge!.rowsPerIn,
                }])
            : preserved.gauge
          return {
            ...preserved,
            meta: { ...preserved.meta, name: name.trim() || preserved.meta.name },
            sizing: {
              ...preserved.sizing,
              ...(reviewLabels ? { labels: reviewLabels } : {}),
              ...(reviewBust ? { bustOrChestIn: reviewBust } : {}),
              ...(basisOverride ? { measurementBasis: basisOverride } : {}),
              ...(notes.length > 0 ? { notes: notes.join(' ') } : {}),
            },
            gauge: correctedGauge,
          }
        })()
      : buildPatternDraft({
          text, name, pdfRef: pdfName, unit: declaredUnit, bustOrChestIn: reviewBust ?? bust, gauge: g,
          labels: reviewLabels ?? (llmSizing.status === 'done' ? (llmSizing.kept.find((f) => f.path === 'sizes.labels')?.value as string | undefined)?.split(',').map((x) => x.trim()) : null),
          parserConfidence: total > 0 ? Math.round((high / total) * 100) / 100 : undefined,
          measurementBasis: basisOverride ?? undefined,
          reviewNotes,
        }).pattern
    const existingWorking = editingPattern && !text.trim() && !methodOverride
      ? built.construction.working
      : built.construction.working.map((w) => ({ ...w, method: methodOverride ?? w.method }))
    return {
      ...built,
      construction: {
        ...built.construction,
        type: constructionOverride ?? built.construction.type,
        direction: directionOverride ?? built.construction.direction,
        working: existingWorking.length > 0
          ? existingWorking
          : [{ scope: 'garment', method: methodOverride ?? built.gauge[0]?.worked ?? 'unknown' }],
      },
      gauge: built.gauge.map((x) => ({ ...x, worked: methodOverride ?? x.worked })),
      sections: built.sections.map((section) => ({
        ...section,
        method: methodOverride ?? section.method,
      })),
    }
  }, [name, pdfName, analysis, llmSizing, llmGauge, declaredUnit, constructionOverride, methodOverride, directionOverride, basisOverride, reviewInputs, editingPattern, text])

  const builderNotes = useMemo(
    () => buildSections(extractSectionCandidates(text), { sizeCount: (analysis.bust ?? [0]).length || 1 }).notes,
    [text, analysis.bust],
  )

  const diagnostics = useMemo(() => validatePattern(draft), [draft])

  const primaryGauge = draft.gauge.find((g) => g.primary)
  const errCount = diagnostics.filter((d) => d.level === 'error').length
  const BASIS_TEXT: Record<string, string> = {
    finished: 'finished garment',
    to_fit: 'to fit body',
    unknown: 'basis unclear',
  }
  const bustList = draft.sizing.bustOrChestIn.filter((value) => Number.isFinite(value) && value > 0)
  const range =
    bustList.length > 1
      ? ` — bust ${fmtLen(bustList[0]!, store.displayUnit)}–${fmtLen(bustList[bustList.length - 1]!, store.displayUnit)}`
      : ''
  const unknownReviewFields = [
    draft.sizing.measurementBasis === 'unknown' ? 'measurement basis' : null,
    draft.construction.type === 'unknown' ? 'construction family' : null,
    (draft.construction.working.length === 0
      || draft.construction.working.some((working) => working.method === 'unknown')
      || draft.gauge.some((gauge) => gauge.worked === 'unknown')) ? 'working method' : null,
  ].filter((x): x is string => x !== null)

  const save = (status: 'draft' | 'accepted') => {
    if (reviewInputs.errors.length > 0) {
      setError(`Review corrections need attention: ${reviewInputs.errors.join(' ')}`)
      return
    }
    if (status === 'accepted' && (errCount > 0 || unknownReviewFields.length > 0)) {
      setError(errCount > 0
        ? 'This pattern still has structural errors. Save it as a draft, or correct the review fields before accepting.'
        : `Confirm the ${unknownReviewFields.join(', ')} from the source before accepting this pattern. Save it as a draft if the source is incomplete.`)
      return
    }
    const oldName = editingPattern?.meta.name
    let unique = draft.meta.name.trim() || 'Untitled pattern'
    if (!oldName) {
      let n = 2
      while (store.patterns.some((p) => p.meta.name === unique)) unique = `${draft.meta.name} (${n++})`
    } else if (unique !== oldName && store.patterns.some((p) => p.meta.name === unique)) {
      setError(`A pattern named “${unique}” already exists. Choose another name before saving this draft.`)
      return
    }
    const nextPattern = { ...draft, meta: { ...draft.meta, name: unique, status } }
    const saved = oldName
      ? store.actions.updatePattern(oldName, nextPattern)
      : store.actions.addPattern(nextPattern)
    if (!saved) {
      setError('The draft could not be saved because its JSON shape is unsafe. Correct the review fields and try again.')
      return
    }
    clearSessionDraft(draftKey)
    setDraftDirty(false)
    toast(`${status === 'accepted' ? 'Accepted' : oldName ? 'Updated draft' : 'Saved draft'} “${unique}” to the library`)
    go({ name: 'library' })
  }

  if (stage === 'source') {
    return (
      <section className="card">
        <h2>Add a pattern</h2>
        <p className="muted">
          The PDF never leaves this device — text is extracted in your browser. Scanned PDFs (no
          text layer) are detected and flagged; browser OCR is out of MVP scope.
        </p>
        <label className="field">
          <span>Pattern units (how the document states measurements)</span>
          <select
            value={declaredUnit}
            onChange={(e) => switchDeclaredUnit(e.target.value as 'in' | 'cm')}
          >
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
          </select>
          <small className="muted">
            Stored canonically in inches either way — this tells the parser how to read the numbers.
          </small>
        </label>
        <label className="field">
          <span>Your LLM API key (BYOK)</span>
          <input
            type="password"
            autoComplete="off"
            value={llmKey}
            onChange={(e) => {
              setLlmKeyState(e.target.value)
              setLlmKey(e.target.value)
            }}
            placeholder="sk-… (optional — enables LLM-assisted fields)"
          />
          <small className="muted">
            Stored only on this device; sent per-request to the relay and never saved anywhere else.
          </small>
        </label>
        <label
          className={dragOver ? 'file-drop dragover' : 'file-drop'}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (!f) return
            if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
              setError('That file is not a PDF — drop the pattern PDF itself (text can go in the paste box below).')
              return
            }
            void handleFile(f)
          }}
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <span>{busy ? progress : dragOver ? 'Drop the PDF to parse it' : 'Choose a pattern PDF — or drop it here…'}</span>
        </label>
        <details className="paste-box">
          <summary>Or paste pattern text</summary>
          <textarea
            rows={8}
            value={paste}
            onChange={(e) => { markDirty(); setPaste(e.target.value) }}
            placeholder={'Paste the sizing, gauge and instruction blocks.\nInclude "Gauge: 18 sts and 28 rows = 4 in" style lines.'}
          />
          <div className="row">
            <button
              className="primary"
              disabled={paste.trim().length < 10}
              onClick={() => {
                markDirty()
                sourceRun.current += 1
                setBusy(false)
                setProgress('')
                setText(paste)
                setPdfName(null)
                setName('Pasted pattern')
                setStage('review')
              }}
            >
              Parse pasted text
            </button>
          </div>
        </details>
        {draftDirty && <div className="panel info small">
          <p>This unsaved import draft is kept only while this browser tab stays open.</p>
          <button onClick={() => {
            sourceRun.current += 1
            llmRun.current += 1
            setBusy(false)
            setProgress('')
            clearSessionDraft(draftKey)
            setDraftDirty(false)
            setPaste('')
            setText('')
            setName('')
            setPdfName(null)
            setError('')
          }}>Discard unsaved changes</button>
        </div>}
        {error && <div className="panel err">{error}</div>}
      </section>
    )
  }

  const notationRows: Array<{ path: string; value: string; source: string; note?: string }> = []
  if (analysis.parsedGauge) {
    notationRows.push({
      path: 'gauge',
      value: `${analysis.parsedGauge.stsPerIn} sts/in${analysis.parsedGauge.rowsPerIn ? ` · ${analysis.parsedGauge.rowsPerIn} rows/in` : ''}`,
      source: 'notation',
      note: analysis.gaugeSeg?.text.slice(0, 90),
    })
  }
  if (analysis.bust) {
    notationRows.push({
      path: 'sizes.bust_in',
      value:
        declaredUnit === 'cm'
          ? `${analysis.bust.join(' / ')} cm → ${analysis.bust.map((v) => Math.round(cmToIn(v) * 100) / 100).join(' / ')}"`
          : analysis.bust.join(' / '),
      source: 'notation',
      note: 'first size list in the sizing block, values within bust range',
    })
  }
  notationRows.push({ path: 'sizing.basis', value: analysis.basis, source: 'notation' })

  const llmRows = (o: LlmOutcome) =>
    o.kept.map((f) => ({
      path: f.path,
      value: Array.isArray(f.value) ? f.value.join(' / ') : String(f.value),
      confidence: f.confidence,
      evidence: f.evidence,
    }))

  return (
    <>
      <section className="card">
        <div className="card-head">
        <h2>Parse review</h2>
        {draftDirty && <p className="note">Unsaved review changes are kept only while this browser tab stays open.</p>}
          <button onClick={() => setStage('source')}>← Source</button>
        </div>

        <label className="field">
          <span>Pattern name</span>
          <input value={name} onChange={(e) => { markDirty(); setName(e.target.value) }} />
        </label>

        <div className="panel info">
          <strong>Review sizing and gauge</strong>
          <div className="form-grid">
            <label className="field">
              <span>Measurement basis</span>
              <select value={basisOverride ?? draft.sizing.measurementBasis} onChange={(e) => { markDirty(); setBasisOverride(e.target.value as MeasurementBasis) }}>
                <option value="unknown">Unknown — review source</option>
                <option value="to_fit">To fit body</option>
                <option value="finished">Finished garment</option>
              </select>
            </label>
            <label className="field">
              <span>Size labels (comma-separated)</span>
              <input value={labelsOverride} placeholder={draft.sizing.labels.join(', ')} onChange={(e) => { markDirty(); setLabelsOverride(e.target.value) }} />
            </label>
            <label className="field">
              <span>Finished bust/chest values ({declaredUnit}; comma-separated)</span>
              <input value={bustOverride} placeholder={draft.sizing.bustOrChestIn.filter((v) => Number.isFinite(v) && v > 0).map((v) => declaredUnit === 'cm' ? Math.round(v * 2.54 * 100) / 100 : v).join(', ')} onChange={(e) => { markDirty(); setBustOverride(e.target.value) }} />
            </label>
            <label className="field">
              <span>Stitches over span</span>
              <input type="number" min="1" step="1" value={manualStsOver} placeholder={primaryGauge ? String(primaryGauge.stsOver) : ''} onChange={(e) => { markDirty(); setManualStsOver(e.target.value) }} />
            </label>
            <label className="field">
              <span>Rows over span (optional)</span>
              <input type="number" min="1" step="1" value={manualRowsOver} placeholder={primaryGauge?.rowsOver == null ? '' : String(primaryGauge.rowsOver)} onChange={(e) => { markDirty(); setManualRowsOver(e.target.value) }} />
            </label>
            <label className="field">
              <span>Declared span ({declaredUnit})</span>
              <input type="number" min="0.1" step="0.1" value={manualGaugeSpan} placeholder={primaryGauge ? String(declaredUnit === 'cm' ? Math.round(primaryGauge.overIn * 2.54 * 100) / 100 : primaryGauge.overIn) : ''} onChange={(e) => { markDirty(); setManualGaugeSpan(e.target.value) }} />
            </label>
          </div>
          <small className="muted">Corrections are converted to canonical inches by code, recorded in the draft notes, and run through validation again before acceptance.</small>
          {reviewInputs.errors.length > 0 && (
            <div className="panel err" role="alert">
              <strong>Review corrections need attention.</strong>
              <ul>{reviewInputs.errors.map((message) => <li key={message}>{message}</li>)}</ul>
            </div>
          )}
        </div>

        {/* Digest first, details below: what the parser understood, in one glance. */}
        <div className="panel info parse-summary">
          <div>
            <span className="muted small">Gauge · </span>
            {primaryGauge
              ? `${primaryGauge.stsPerIn} sts/in${primaryGauge.rowsPerIn ? ` · ${primaryGauge.rowsPerIn} rows/in` : ' · row gauge unknown'}`
              : 'not found — check the Gauge block'}
          </div>
          <div>
            <span className="muted small">Sizes · </span>
            {draft.sizing.sizeCount}
            {range} ({BASIS_TEXT[draft.sizing.measurementBasis] ?? draft.sizing.measurementBasis})
          </div>
          <div>
            <span className="muted small">Sections · </span>
            {draft.sections.length > 0
              ? `${draft.sections.length} built (${draft.sections.map((s) => s.id).join(', ')})`
              : 'none — modifications will be advisory'}
          </div>
          <div>
            <span className="muted small">Checks · </span>
            {diagnostics.length === 0 ? (
              <span className="chip ok">no problems found</span>
            ) : (
              `${errCount} error${errCount === 1 ? '' : 's'}, ${diagnostics.length - errCount} warning${
                diagnostics.length - errCount === 1 ? '' : 's'
              }`
            )}
          </div>
        </div>

        {analysis.scannedPages.length > 0 && (
          <div className="panel warn">
            Scanned page(s) detected — no text layer: {analysis.scannedPages.join(', ')}. Fields from
            those pages can't be extracted in the browser (MVP limitation).
          </div>
        )}

        <div className="panel info">
          <strong>Review the parsed construction</strong>
          <div className="form-grid">
            <label className="field">
              <span>Construction family</span>
              <select value={constructionOverride ?? draft.construction.type} onChange={(e) => { markDirty(); setConstructionOverride(e.target.value as ConstructionType) }}>
                {(['unknown', 'flat_drop_shoulder', 'flat_set_in', 'flat_raglan', 'top_down_raglan', 'top_down_yoke', 'bottom_up_yoke', 'top_down_set_in', 'flat_saddle', 'top_down_saddle', 'dolman_kimono'] as ConstructionType[]).map((x) => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Direction</span>
              <select value={directionOverride ?? draft.construction.direction} onChange={(e) => { markDirty(); setDirectionOverride(e.target.value as 'top_down' | 'bottom_up') }}>
                <option value="top_down">Top down</option><option value="bottom_up">Bottom up</option>
              </select>
            </label>
            <label className="field">
              <span>Working method</span>
              <select value={methodOverride ?? (draft.construction.working[0]?.method ?? draft.gauge[0]?.worked ?? 'unknown')} onChange={(e) => { markDirty(); setMethodOverride(e.target.value as WorkingMethod) }}>
                <option value="unknown">Unknown — review source</option><option value="flat">Flat</option><option value="in_the_round">In the round</option>
              </select>
            </label>
          </div>
          <small className="muted">These are editable review fields. Unknown construction, working method, and measurement basis stay blocked until you confirm them from the source.</small>
        </div>

        <h3>Notation layer (deterministic)</h3>
        {notationRows.length === 0 ? (
          <p className="muted">Nothing parsed deterministically — check that a Gauge/Sizes block exists.</p>
        ) : (
          <ul className="field-list">
            {notationRows.map((r) => (
              <li key={r.path}>
                <div className="field-line">
                  <code>{r.path}</code>
                  <span className="chip info">{r.source}</span>
                </div>
                <div>{r.value}</div>
                {r.note && <small className="muted">“{r.note}”</small>}
              </li>
            ))}
          </ul>
        )}

        <h3>LLM extract (via /api, evidence-gated)</h3>
        {!llmRequested && (
          <div className="row">
            <button onClick={requestLlmAssist} disabled={!analysis.sizingSeg && !analysis.gaugeSeg}>
              Ask the LLM to help extract these fields
            </button>
            <span className="muted small">Nothing is sent until you press this button.</span>
          </div>
        )}
        {llmRequested && analysis.sizingSeg && (
          <details className="small"><summary>Text sent for sizing assistance</summary><pre className="math">{analysis.sizingSeg.text}</pre></details>
        )}
        {llmRequested && analysis.gaugeSeg && (
          <details className="small"><summary>Text sent for gauge assistance</summary><pre className="math">{analysis.gaugeSeg.text}</pre></details>
        )}
        {(['sizing', 'gauge'] as const).map((kind) => {
          const o = kind === 'sizing' ? llmSizing : llmGauge
          return (
            <div key={kind} className="llm-block">
              <div className="field-line">
                <strong>{kind}</strong>
                {o.status === 'idle' && <span className="chip info">no segment</span>}
                {o.status === 'running' && <span className="chip info">extracting…</span>}
                {o.status === 'error' && <span className="chip warn">API unavailable</span>}
                {o.status === 'done' && <span className="chip ok">{o.kept.length} kept</span>}
              </div>
              {o.status === 'error' && (
                <p className="muted small">
                  {o.error === 'no-key'
                    ? 'Add your LLM API key above to enable LLM-assisted fields.'
                    : o.error === 'bad-key'
                      ? 'The key was rejected — check it above.'
                      : o.error === 'too-large'
                        ? 'Segment too large — the deterministic layer covers it.'
                        : 'API unavailable — falling back to the notation layer only.'}
                </p>
              )}
              {llmRows(o).map((r, i) => (
                <div key={i} className="field-line">
                  <code>{r.path}</code>
                  <span>{r.value}</span>
                  <span className={`chip ${r.confidence}`}>{r.confidence}</span>
                  <small className="muted evidence">“{r.evidence}”</small>
                </div>
              ))}
              {o.dropped.map((d, i) => (
                <div key={i} className="field-line">
                  <code>{d.path}</code>
                  <span className="chip err">dropped</span>
                  <small className="muted">{d.reason}</small>
                </div>
              ))}
            </div>
          )
        })}

        <h3>Instruction layer (deterministic candidates)</h3>
        <p className="muted small">
          Section headers, checkpoint counts and repeats read straight from the instruction text —
          candidates for the section builder (full instruction assembly is the parser milestone).
        </p>
        {analysis.sectionHeaders.length === 0 &&
        analysis.checkpointCandidates.length === 0 &&
        analysis.repeats.length === 0 ? (
          <p className="muted">Nothing recognized — no instruction prose in this text.</p>
        ) : (
          <>
            {analysis.sectionHeaders.length > 0 && (
              <div className="chip-row wrap">
                {analysis.sectionHeaders.map((h, i) => (
                  <span key={i} className="chip info">
                    {h.label} → {h.id}
                  </span>
                ))}
              </div>
            )}
            {analysis.checkpointCandidates.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Values (first 3 …)</th>
                      <th>Sizes</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.checkpointCandidates.slice(0, 12).map((c, i) => (
                      <tr key={i}>
                        <td>
                          <span className="chip info">{c.role}</span>
                        </td>
                        <td className="mono small">{c.values.slice(0, 3).join(', ')} …</td>
                        <td>{c.values.length}</td>
                        <td>
                          <small className="muted">“{c.evidence.slice(0, 24)}…”</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {analysis.repeats.length > 0 && (
              <ul className="field-list">
                {analysis.repeats.slice(0, 8).map((r, i) => (
                  <li key={i}>
                    <div className="field-line">
                      <span className="chip info">repeat</span>
                      <span className="mono small">
                        {r.rounds
                          ? `${r.rounds} ×${r.times.length} sizes`
                          : `every ${(r.intervalRounds ?? [0])[0]} … ×${r.times.length} sizes`}
                      </span>
                      <small className="muted evidence">“{r.evidence.slice(0, 60)}…”</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <h3>Validation &amp; Σ panel</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Level</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    Draft fields consistent — no diagnostics.
                  </td>
                </tr>
              )}
              {diagnostics.map((d, i) => (
                <tr key={i}>
                  <td>
                    <code>{d.code}</code>
                  </td>
                  <td>
                    <span className={`chip ${d.level === 'error' ? 'err' : 'warn'}`}>{d.level}</span>
                  </td>
                  <td className="small">
                    {d.message} <span className="muted">({d.path})</span>
                  </td>
                </tr>
              ))}
              <tr>
                <td>Σ sections</td>
                <td>
                  <span className="chip info">{draft.sections.length} parsed</span>
                </td>
                <td className="small">
                  Deterministic section builder (headers → checkpoints → events). Builder notes:{' '}
                  {builderNotes.length > 0 ? builderNotes.slice(0, 3).join(' · ') : 'none'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Segments ({analysis.segments.length})</h3>
        <details>
          <summary className="small">Show raw segmentation</summary>
          <ul className="segment-list">
            {analysis.segments.map((s, i) => (
              <li key={i}>
                <span className="chip info">{s.kind}</span>
                {s.page !== undefined && <span className="muted small"> p.{s.page}</span>}{' '}
                <span className="muted small">{s.text.slice(0, 110)}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="row">
          <button disabled={!name.trim() || reviewInputs.errors.length > 0} onClick={() => save('draft')}>Save as draft</button>
          <button className="primary" disabled={!name.trim() || errCount > 0 || unknownReviewFields.length > 0 || reviewInputs.errors.length > 0} onClick={() => save('accepted')}>Accept pattern</button>
          {draftDirty && <button onClick={() => {
            llmRun.current += 1
            sourceRun.current += 1
            setBusy(false)
            setProgress('')
            clearSessionDraft(draftKey)
            setDraftDirty(false)
            go({ name: 'library' })
          }}>Discard unsaved changes</button>}
        </div>
        {error && <div className="panel err">{error}</div>}
      </section>
    </>
  )
}
