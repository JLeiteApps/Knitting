import type { Pattern, ConstructionType, WorkingMethod } from '@knitting/schema'
import { buildSections } from './sectionBuilder.js'
import { detectMeasurementBasis, type MeasurementBasis, type ParsedGauge } from './notation.js'
import { extractSectionCandidates } from './instructions.js'

export interface DraftBuilderInput {
  text: string
  name: string
  pdfRef?: string | null
  unit?: 'in' | 'cm'
  bustOrChestIn?: number[] | null
  labels?: string[] | null
  gauge?: ParsedGauge | null
  parserConfidence?: number
  status?: 'draft' | 'accepted'
  measurementBasis?: MeasurementBasis
  reviewNotes?: string[]
}

export interface DraftBuilderResult {
  pattern: Pattern
  notes: string[]
}

/** Build the editable Pattern IR from local notation results. This is kept
 * outside React so real extracted text can be tested through the same path as
 * the review screen. It preserves unknown construction/basis as review notes
 * rather than quietly selecting top-down raglan. */
export function buildPatternDraft(input: DraftBuilderInput): DraftBuilderResult {
  const unit = input.unit ?? 'in'
  const bust = input.bustOrChestIn && input.bustOrChestIn.length > 0 ? input.bustOrChestIn : null
  const candidates = extractSectionCandidates(input.text)
  const inferred = Math.max(1, ...candidates.flatMap((c) => [c.startsWith?.sts.length ?? 0, ...c.checkpoints.map((cp) => cp.values.length)].filter((n) => n > 1)))
  const sizeCount = bust?.length ?? inferred
  const basis = input.measurementBasis ?? detectMeasurementBasis(input.text)
  const construction = inferConstruction(input.text)
  const built = buildSections(candidates, { sizeCount, unit, method: construction.method })
  const notes = [...built.notes, ...construction.notes]
  const labels = input.labels && input.labels.length === sizeCount
    ? input.labels
    : Array.from({ length: sizeCount }, (_, i) => `Size ${i + 1}`)
  // Missing measurements stay missing.  Padding with zero would look like a
  // real bust value in review and could leak an invented width into a sheet.
  const normalizedBust = bust ?? []
  const schematic = basis === 'finished' && bust
    ? [{ piece: 'back', dimension: 'width_at_chest', in: bust.map((v) => Math.round((v / 2) * 100) / 100), src: 'sizing evidence: finished bust ÷ 2' }]
    : []
  if (basis !== 'finished') notes.push('Finished schematic width was not derived because the measurement basis is not explicitly finished.')
  if (!bust) notes.push('No per-size bust/chest measurements were found; enter them in review before accepting this draft.')
  const pattern: Pattern = {
    schemaVersion: '0.1',
    meta: {
      name: input.name.trim() || 'Untitled pattern',
      parseDate: new Date().toISOString().slice(0, 10),
      ...(input.pdfRef ? { pdfRef: input.pdfRef } : {}),
      ...(input.parserConfidence !== undefined ? { parserConfidence: input.parserConfidence } : {}),
      status: input.status ?? 'draft',
    },
    sizing: {
      labels,
      sizeCount,
      measurementBasis: basis,
      bustOrChestIn: normalizedBust,
      notes: `${unit === 'cm' ? 'Pattern declared cm; lengths converted ÷2.54 at the parse boundary. ' : ''}Editable parser draft — review construction, sizing, gauge and section checkpoints before accepting.${input.reviewNotes?.length ? ` Corrections: ${input.reviewNotes.join(' ')}` : ''}`,
    },
    gauge: input.gauge ? [{ primary: true, stitchPatternRef: input.gauge.stitchPattern ?? 'stockinette', worked: construction.method, stsOver: input.gauge.stsOver, rowsOver: input.gauge.rowsOver, overIn: input.gauge.overIn, stsPerIn: input.gauge.stsPerIn, rowsPerIn: input.gauge.rowsPerIn }] : [],
    construction: {
      direction: construction.direction,
      working: [{ scope: 'garment', method: construction.method }],
      type: construction.type,
      pieces: [...new Set(built.sections.map((s) => s.piece).filter(Boolean))],
    },
    schematic,
    stitchPatterns: [],
    sections: built.sections,
  }
  return { pattern, notes }
}

function inferConstruction(text: string): { type: ConstructionType; direction: 'bottom_up' | 'top_down'; method: WorkingMethod; notes: string[] } {
  const t = text.toLowerCase()
  const notes: string[] = []
  const direction = /top[ -]?down|from the top/.test(t) ? 'top_down' : /bottom[ -]?up|from the bottom/.test(t) ? 'bottom_up' : null
  const method: WorkingMethod = /in the round|in-the-round|seamless|circular/.test(t)
    ? 'in_the_round'
    : /\bworked?\s+(?:back and forth|flat)\b|\bflat[- ]?worked\b/.test(t)
      ? 'flat'
      : 'unknown'
  let type: ConstructionType
  if (/bottom[ -]?up[\s\S]{0,50}yoke/.test(t)) type = 'bottom_up_yoke'
  else if (/raglan/.test(t)) type = direction === 'top_down' ? 'top_down_raglan' : 'flat_raglan'
  else if (/set[ -]?in/.test(t)) type = direction === 'top_down' ? 'top_down_set_in' : 'flat_set_in'
  else if (/saddle/.test(t)) type = direction === 'top_down' ? 'top_down_saddle' : 'flat_saddle'
  else if (/dolman|kimono|batwing/.test(t)) type = 'dolman_kimono'
  else if (/yoke/.test(t)) type = direction === 'top_down' ? 'top_down_yoke' : 'unknown'
  else type = 'unknown'
  if (!direction) type = 'unknown'
  if (!direction) notes.push('Construction direction was not explicit; review it before accepting this draft.')
  if (method === 'unknown') notes.push('Working method was not explicit; choose flat or in the round before accepting this draft.')
  if (type === 'unknown') notes.push('Construction family was not found in source text; choose a supported family before accepting this draft.')
  return { type, direction: direction ?? 'bottom_up', method, notes }
}
