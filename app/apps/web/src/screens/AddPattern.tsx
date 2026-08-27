import { useEffect, useMemo, useState } from 'react'
import type { Pattern } from '@knitting/schema'
import { validatePattern } from '@knitting/schema'
import type { ExtractedField, LlmFieldSpec } from '@knitting/parser'
import {
  buildSections,
  classifyCheckpointLabel,
  detectMeasurementBasis,
  enforceEvidence,
  extractSectionCandidates,
  findSectionHeaders,
  findSizeLists,
  looksScanned,
  parseGaugeStatement,
  parseRepeatStatement,
  parseSizeList,
  segment,
  type ParsedGauge,
  type Segment,
} from '@knitting/parser'
import { pdfToText } from '../pdf'
import { callExtractViaApi } from '../api'
import { cmToIn } from '../units'
import type { ScreenProps } from '../App'

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

export default function AddPattern({ store, go }: ScreenProps) {
  const [stage, setStage] = useState<Stage>('source')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [llmSizing, setLlmSizing] = useState<LlmOutcome>({ status: 'idle', kept: [], dropped: [] })
  const [llmGauge, setLlmGauge] = useState<LlmOutcome>({ status: 'idle', kept: [], dropped: [] })
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const extracted = await pdfToText(file, (p) => setProgress(`Extracting text — page ${p.done}/${p.total}`))
      setText(extracted.text)
      setPdfName(file.name)
      setName(file.name.replace(/\.pdf$/i, ''))
      setStage('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setProgress('')
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
    const scannedPages = segments
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

  // LLM stage: one call per available head segment, gated by enforceEvidence.
  useEffect(() => {
    if (stage !== 'review') return
    const segs: Array<{ kind: 'sizing' | 'gauge'; seg: Segment; fields: LlmFieldSpec[] }> = []
    if (analysis.sizingSeg) segs.push({ kind: 'sizing', seg: analysis.sizingSeg, fields: SIZING_FIELDS })
    if (analysis.gaugeSeg) segs.push({ kind: 'gauge', seg: analysis.gaugeSeg, fields: GAUGE_FIELDS })
    if (segs.length === 0) return

    let cancelled = false
    const run = async () => {
      for (const { kind, seg, fields } of segs) {
        const setLlm = kind === 'sizing' ? setLlmSizing : setLlmGauge
        setLlm({ status: 'running', kept: [], dropped: [] })
        const out = await callExtractViaApi(seg.text, kind, fields)
        if (cancelled) return
        if (!out.ok || !out.fields) {
          setLlm({ status: 'error', kept: [], dropped: [], error: out.error })
          continue
        }
        const gate = enforceEvidence(out.fields, seg.text)
        setLlm({ status: 'done', kept: gate.kept, dropped: gate.dropped })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [stage, analysis.sizingSeg, analysis.gaugeSeg])

  const draft: Pattern = useMemo(() => {
    const cm = store.patternUnit === 'cm'
    const conv = (v: number) => (cm ? Math.round(cmToIn(v) * 100) / 100 : v)
    const llmBust = llmSizing.status === 'done' ? bustFromFields(llmSizing.kept) : null
    const bustRaw = llmBust ?? analysis.bust
    const bust = bustRaw ? bustRaw.map(conv) : null
    const llmGaugeFields = llmGauge.status === 'done' ? gaugeFromFields(llmGauge.kept) : null
    const g = llmGaugeFields ?? analysis.parsedGauge
    const high = [...llmSizing.kept, ...llmGauge.kept].filter((f) => f.confidence === 'high').length
    const total = [...llmSizing.kept, ...llmGauge.kept].length
    // Deterministic section builder over the instruction text (golden-tested
    // on the real Flax PDF): headers → candidates → sections[] IR. sizeCount
    // from the bust list when parsed, else from the candidates' own arrays
    // (Flax's sizing TABLE is prose rows — no multi-size list to read).
    const cands = extractSectionCandidates(text)
    const inferred = Math.max(
      1,
      ...cands.flatMap((c) =>
        [c.startsWith?.sts.length ?? 0, ...c.checkpoints.map((cp) => cp.values.length)].filter((n) => n > 1),
      ),
    )
    const sizeCount = bust?.length ?? inferred
    const built = buildSections(cands, { sizeCount })
    const realSections = built.sections.filter(
      (sec) => ['yoke', 'body', 'sleeve'].includes(sec.id) && (sec.startsWith.sts.length === sizeCount),
    )
    const topDown = /from the top down|top[- ]down/i.test(text)
    return {
      schemaVersion: '0.1',
      meta: {
        name: name.trim() || 'Untitled pattern',
        parseDate: new Date().toISOString().slice(0, 10),
        ...(pdfName ? { pdfRef: pdfName } : {}),
        ...(total > 0 ? { parserConfidence: Math.round((high / total) * 100) / 100 } : {}),
      },
      sizing: {
        labels: bust?.map((_, i) => `Size ${i + 1}`) ?? ['Size 1'],
        sizeCount: bust?.length ?? 1,
        measurementBasis: analysis.basis,
        bustOrChestIn: bust ?? [0],
        notes:
          (cm ? 'Pattern declared cm — measurements converted ÷2.54 at parse. ' : '') +
          'Draft parse — construction and sections pending review (instruction extraction is the parser milestone).',
      },
      gauge:
        g !== null
          ? [
              {
                primary: true,
                stitchPatternRef: 'stockinette',
                worked: 'flat',
                stsOver: g.stsOver,
                rowsOver: g.rowsOver,
                overIn: g.overIn,
                stsPerIn: g.stsPerIn,
                rowsPerIn: g.rowsPerIn,
                ...(analysis.gaugeSeg ? { raw: analysis.gaugeSeg.text.slice(0, 120) } : {}),
              },
            ]
          : [],
      construction: realSections.length > 0
        ? {
            direction: topDown ? 'top_down' : 'bottom_up',
            working: [{ scope: 'sections:body', method: 'in_the_round' }],
            type: topDown ? 'top_down_raglan' : 'flat_drop_shoulder',
            pieces: [...new Set(realSections.map((sec) => sec.id))],
          }
        : { direction: 'bottom_up', working: [], type: 'flat_drop_shoulder', pieces: [] },
      schematic: bust
        ? [{ piece: 'back', dimension: 'width_at_chest', in: bust.map((b) => Math.round((b / 2) * 100) / 100), src: 'derived: bust/2 (validation gate)' }]
        : [],
      stitchPatterns: [],
      sections: realSections,
    }
  }, [name, pdfName, analysis, llmSizing, llmGauge, store.patternUnit])

  const builderNotes = useMemo(
    () => buildSections(extractSectionCandidates(text), { sizeCount: (analysis.bust ?? [0]).length || 1 }).notes,
    [text, analysis.bust],
  )

  const diagnostics = useMemo(() => validatePattern(draft), [draft])

  const save = () => {
    let unique = draft.meta.name
    let n = 2
    while (store.patterns.some((p) => p.meta.name === unique)) unique = `${draft.meta.name} (${n++})`
    store.actions.addPattern({ ...draft, meta: { ...draft.meta, name: unique } })
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
            value={store.patternUnit}
            onChange={(e) => store.actions.setPatternUnit(e.target.value as 'in' | 'cm')}
          >
            <option value="in">Inches</option>
            <option value="cm">Centimeters</option>
          </select>
          <small className="muted">
            Stored canonically in inches either way — this tells the parser how to read the numbers.
          </small>
        </label>
        <label className="file-drop">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <span>{busy ? progress : 'Choose a pattern PDF…'}</span>
        </label>
        <details className="paste-box">
          <summary>Or paste pattern text</summary>
          <textarea
            rows={8}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Paste the sizing, gauge and instruction blocks.\nInclude "Gauge: 18 sts and 28 rows = 4 in" style lines.'}
          />
          <div className="row">
            <button
              className="primary"
              disabled={paste.trim().length < 10}
              onClick={() => {
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
        store.patternUnit === 'cm'
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
          <button onClick={() => setStage('source')}>← Source</button>
        </div>

        <label className="field">
          <span>Pattern name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        {analysis.scannedPages.length > 0 && (
          <div className="panel warn">
            Scanned page(s) detected — no text layer: {analysis.scannedPages.join(', ')}. Fields from
            those pages can't be extracted in the browser (MVP limitation).
          </div>
        )}

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
                  {o.error} — falling back to the notation layer only. Start the API adapter
                  (apps/api) and retry to get LLM-assisted fields.
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
          <button className="primary" disabled={!name.trim()} onClick={save}>
            Save to library
          </button>
        </div>
        {error && <div className="panel err">{error}</div>}
      </section>
    </>
  )
}
