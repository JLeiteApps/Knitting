import { cmToIn } from './units'

export interface ReviewGaugeInput {
  stsOver: number
  rowsOver: number | null
  overIn: number
  stsPerIn: number
  rowsPerIn: number | null
  stitchPattern: string | null
}

export interface ReviewInputResult {
  errors: string[]
  labels: string[] | null
  bustOrChestIn: number[] | null
  gauge: ReviewGaugeInput | null
}

function finitePositive(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/** Parse a comma/space/slash separated review measurement without dropping
 * malformed tokens. Blank means "leave the source value unchanged"; any
 * nonblank invalid token is surfaced to the save gate. */
export function parseReviewMeasurements(raw: string, unit: 'in' | 'cm'): { value: number[] | null; error?: string } {
  if (raw.trim() === '') return { value: null }
  const tokens = raw.trim().split(/[,/\s]+/)
  if (tokens.length === 0 || tokens.some((token) => token === '')) return { value: null, error: 'Measurements must contain only positive numbers separated by commas, spaces, or slashes.' }
  const values = tokens.map((token) => finitePositive(token))
  if (values.some((value) => value === null)) return { value: null, error: 'Measurements must contain only positive finite numbers.' }
  const canonical = (values as number[]).map((value) => unit === 'cm' ? Math.round(cmToIn(value) * 100) / 100 : value)
  return { value: canonical }
}

/** Validate editable parse-review corrections before they can enter a draft. */
export function validateReviewInputs(input: {
  labels: string
  bust: string
  stsOver: string
  rowsOver: string
  span: string
}, unit: 'in' | 'cm', sizeCount: number | null): ReviewInputResult {
  const errors: string[] = []
  const bustResult = parseReviewMeasurements(input.bust, unit)
  if (bustResult.error) errors.push(`Bust/chest correction: ${bustResult.error}`)
  const bustOrChestIn = bustResult.value
  // A valid correction can establish the size count for a new source whose
  // instruction text has no readable size table. Reopened drafts retain their
  // declared count (a non-null sizeCount) and must match it explicitly.
  const effectiveSizeCount = sizeCount ?? bustOrChestIn?.length ?? 1
  if (bustOrChestIn && sizeCount !== null && bustOrChestIn.length !== sizeCount) {
    errors.push(`Bust/chest correction must contain exactly ${sizeCount} values to match the pattern size count.`)
  }
  let labels: string[] | null = null
  if (input.labels.trim() !== '') {
    const rawLabels = input.labels.split(',').map((label) => label.trim())
    if (rawLabels.some((label) => label === '')) errors.push('Size labels must be non-empty and comma-separated.')
    else if (rawLabels.length !== effectiveSizeCount) errors.push(`Enter exactly ${effectiveSizeCount} size labels to match the pattern size count.`)
    else labels = rawLabels
  }

  const gaugeSupplied = [input.stsOver, input.rowsOver, input.span].some((value) => value.trim() !== '')
  let gauge: ReviewGaugeInput | null = null
  if (gaugeSupplied) {
    const sts = finitePositive(input.stsOver)
    const span = finitePositive(input.span)
    const rows = input.rowsOver.trim() === '' ? null : finitePositive(input.rowsOver)
    if (sts === null) errors.push('Gauge correction: stitches over span must be a positive finite number.')
    if (span === null) errors.push('Gauge correction: declared span must be a positive finite number.')
    if (input.rowsOver.trim() !== '' && rows === null) errors.push('Gauge correction: rows over span must be a positive finite number when supplied.')
    if (sts !== null && span !== null && (input.rowsOver.trim() === '' || rows !== null)) {
      const overIn = unit === 'cm' ? cmToIn(span) : span
      gauge = {
        stsOver: sts,
        rowsOver: rows,
        overIn,
        stsPerIn: sts / overIn,
        rowsPerIn: rows === null ? null : rows / overIn,
        stitchPattern: null,
      }
    }
  }
  return { errors, labels, bustOrChestIn, gauge }
}
