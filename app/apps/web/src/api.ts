/**
 * Client for the secretless BYOK extract relay. The user's LLM key lives on
 * THIS device (localStorage), is sent per-request over TLS in the
 * `x-llm-key` header, and is never stored anywhere else.
 *
 * Defense in depth, IN ORDER, before any field reaches app state:
 *   1. HTTP error → generic outcome (no upstream detail enters the app).
 *   2. Strict shape validation of the LLM response (schemaValidate).
 *   3. Verbatim-evidence gate (enforceEvidence from @knitting/parser).
 * Only kept fields are returned.
 */
import { enforceEvidence, type ExtractedField, type LlmFieldSpec } from '@knitting/parser'

const KEY_STORAGE = 'knitting.llm-key'

export function getLlmKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setLlmKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    // private mode: key lives for the session only (in the caller's state)
  }
}

const CONFIDENCES = new Set(['high', 'medium', 'low'])

/** Strict response shape check — malformed LLM output never enters state. */
function schemaValidate(body: unknown): ExtractedField[] {
  if (typeof body !== 'object' || body === null) return []
  const fields = (body as { fields?: unknown }).fields
  if (!Array.isArray(fields) || fields.length > 24) return []
  const out: ExtractedField[] = []
  for (const f of fields) {
    if (typeof f !== 'object' || f === null) continue
    const { path, value, confidence, evidence } = f as Record<string, unknown>
    const valueOk =
      typeof value === 'number' ||
      typeof value === 'string' ||
      (Array.isArray(value) && value.every((v) => typeof v === 'number'))
    if (
      typeof path !== 'string' ||
      path.length > 64 ||
      !valueOk ||
      (typeof evidence !== 'string' && typeof evidence !== 'undefined') ||
      (typeof evidence === 'string' && evidence.length > 200) ||
      typeof confidence !== 'string' ||
      !CONFIDENCES.has(confidence)
    ) {
      continue // drop malformed entries — they are data, never trusted
    }
    out.push({
      path,
      value: value as ExtractedField['value'],
      confidence: confidence as ExtractedField['confidence'],
      evidence: typeof evidence === 'string' ? evidence : '',
    })
  }
  return out
}

export interface ExtractOutcome {
  ok: boolean
  /** Schema-valid, evidence-gated fields — empty unless ok. */
  kept?: ExtractedField[]
  dropped?: Array<{ path: string; reason: string }>
  error?: string
}

export async function callExtractViaApi(
  segmentText: string,
  segmentKind: string,
  fields: LlmFieldSpec[],
): Promise<ExtractOutcome> {
  const key = getLlmKey()
  if (!key) return { ok: false, error: 'no-key' }
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-llm-key': key },
      body: JSON.stringify({ segmentText, segmentKind, fields }),
    })
    if (!res.ok) {
      // Generic outcomes only — upstream/endpoint detail never renders.
      return { ok: false, error: res.status === 401 ? 'bad-key' : res.status === 413 ? 'too-large' : 'api-unavailable' }
    }
    const validated = schemaValidate(await res.json())
    if (validated.length === 0) return { ok: false, error: 'malformed-response' }
    const gate = enforceEvidence(validated, segmentText)
    return { ok: true, kept: gate.kept, dropped: gate.dropped }
  } catch {
    return { ok: false, error: 'api-unavailable' }
  }
}
