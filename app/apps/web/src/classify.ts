/**
 * Client for the /api/classify BYOK relay (specs/intent_grammar.md §5).
 * Defense in depth before any classifier value reaches app state:
 *   1. HTTP error → generic outcome (no upstream detail enters the app).
 *   2. normalizeClassified: strict schema gate — intent enum, param enums,
 *      numeric bounds; unknown keys dropped; out-of-range numbers treated as
 *      ABSENT (NaN) so the deterministic slot gate asks instead of trusting.
 *   3. Unit math (cm→in, over-span→per-inch) happens HERE in code, never in
 *      the model. The classifier parses; the engine computes.
 * The heuristic in intents.ts remains the offline fallback (no key / API down).
 */
import type { Pattern } from '@knitting/schema'
import type { Intent, ModificationRequest } from '@knitting/shared'
import { cmToIn } from '@knitting/parser'
import { getLlmKey } from './api'

// ── Pattern summary (intent grammar §5 input) ───────────────────────────────

export interface PatternSummary {
  name?: string
  construction?: string
  sizes?: string[]
  gauge?: string
  sections?: string[]
}

export function summarizePattern(pattern: Pattern): PatternSummary {
  const g = pattern.gauge.find((x) => x.primary) ?? pattern.gauge[0]
  return {
    name: pattern.meta.name,
    construction: pattern.construction.type,
    sizes: pattern.sizing.labels,
    ...(g
      ? {
          gauge:
            g.raw ??
            `${g.stsOver} sts / ${g.overIn}"${g.rowsOver != null ? ` & ${g.rowsOver} rows` : ''}`,
        }
      : {}),
    ...(pattern.sections.length > 0 ? { sections: pattern.sections.map((s) => s.id) } : {}),
  }
}

// ── Pre-state gate ──────────────────────────────────────────────────────────

export type ClassifyError = 'no-key' | 'bad-key' | 'too-large' | 'api-unavailable' | 'malformed-response'

export type ClassifyResult =
  | {
      status: 'ok'
      intent: Intent
      params: ModificationRequest['params']
      /** What the classifier says is still missing FROM THE REQUEST (the
       *  profile-based slot gate in intents.ts stays the deterministic
       *  authority for what blocks execution). */
      missingSlots: string[]
      clarifyingQuestion: string | null
    }
  | { status: 'unsupported'; clarifyingQuestion: string | null; missingSlots: string[] }
  | { status: 'error'; error: ClassifyError }

const INTENTS = new Set<Intent>([
  'size_ease_selection',
  'bust_accommodation',
  'body_length_change',
  'sleeve_length_change',
  'gauge_conversion',
])

const round2 = (x: number) => Math.round(x * 100) / 100
const fin = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** Deterministic unit handling — the model passes numbers through as stated. */
const toInches = (value: number, unit: unknown): number => (unit === 'cm' ? round2(cmToIn(value)) : round2(value))
const capStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string' || v.length === 0) return null
  return v.length > max ? v.slice(0, max) : v
}

/** Length delta bounds after inch-normalization; outside → treated as absent. */
const MAX_DELTA_IN = 24
const MAX_EASE_IN = 15

/**
 * Strict normalization of the classifier JSON. Returns null when the shape is
 * unusable (caller treats as malformed). Invalid/out-of-range numbers become
 * absent fields (NaN) — the slot gate then asks; a bad number never enters
 * state silently.
 */
export function normalizeClassified(body: unknown): Exclude<ClassifyResult, { status: 'error' }> | null {
  if (typeof body !== 'object' || body === null) return null
  const { intent, params, missingSlots: rawMissing, clarifyingQuestion: rawQ } = body as Record<string, unknown>
  if (typeof intent !== 'string') return null
  const missingSlots = Array.isArray(rawMissing)
    ? rawMissing.filter((s): s is string => typeof s === 'string').slice(0, 6).map((s) => s.slice(0, 120))
    : []
  const clarifyingQuestion = capStr(rawQ, 300)

  if (intent === 'unsupported') {
    return { status: 'unsupported', clarifyingQuestion, missingSlots }
  }
  if (!INTENTS.has(intent as Intent)) return null
  if (typeof params !== 'object' || params === null) return null
  const p = params as Record<string, unknown>
  const intentId = intent as Intent

  switch (intentId) {
    case 'size_ease_selection': {
      const easeRaw = fin(p.targetEase)
      const easeIn = easeRaw === null ? null : toInches(easeRaw, p.easeUnit)
      return {
        status: 'ok',
        intent: intentId,
        params: {
          kind: 'size_ease',
          basis: p.basis === 'bust' ? 'bust' : 'upper_torso',
          tier: p.tier === 'fitted' || p.tier === 'oversized' ? p.tier : 'average',
          ...(easeIn !== null && easeIn !== 0 && Math.abs(easeIn) <= MAX_EASE_IN ? { targetEaseIn: easeIn } : {}),
        },
        missingSlots,
        clarifyingQuestion,
      }
    }
    case 'bust_accommodation':
      return {
        status: 'ok',
        intent: intentId,
        params: {
          kind: 'bust',
          method:
            p.method === 'vertical_darts' || p.method === 'short_rows' ? p.method : 'auto',
          tightness:
            p.tightness === 'tight' || p.tightness === 'loose' ? p.tightness : 'average',
        },
        missingSlots,
        clarifyingQuestion,
      }
    case 'body_length_change':
    case 'sleeve_length_change': {
      const d = fin(p.delta)
      const converted = d === null || d === 0 ? NaN : toInches(d, p.unit)
      const deltaIn = Number.isFinite(converted) && Math.abs(converted) <= MAX_DELTA_IN ? converted : NaN
      return {
        status: 'ok',
        intent: intentId,
        params: { kind: intentId === 'body_length_change' ? 'body_length' : 'sleeve_length', deltaIn },
        missingSlots,
        clarifyingQuestion,
      }
    }
    case 'gauge_conversion': {
      let stsPerIn: number | null = null
      const direct = fin(p.stsPerIn)
      if (direct !== null && direct >= 1 && direct <= 20) {
        stsPerIn = direct
      } else {
        const over = fin(p.stsOver)
        const span = fin(p.spanValue)
        if (over !== null && span !== null && over > 0 && over <= 400) {
          const spanIn = p.spanUnit === 'cm' ? cmToIn(span) : span
          if (spanIn > 0 && spanIn <= 60) {
            const perIn = round2(over / spanIn)
            if (perIn >= 1 && perIn <= 20) stsPerIn = perIn
          }
        }
      }
      const rows = fin(p.rowsPerIn)
      return {
        status: 'ok',
        intent: intentId,
        params: {
          kind: 'gauge',
          userStsPerIn: stsPerIn ?? NaN,
          ...(rows !== null && rows >= 2 && rows <= 60 ? { userRowsPerIn: rows } : {}),
        },
        missingSlots,
        clarifyingQuestion,
      }
    }
  }
}

// ── Relay call ──────────────────────────────────────────────────────────────

export async function classifyViaApi(
  raw: string,
  patternSummary: PatternSummary,
): Promise<ClassifyResult> {
  const key = getLlmKey()
  if (!key) return { status: 'error', error: 'no-key' }
  try {
    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-llm-key': key },
      body: JSON.stringify({ raw, patternSummary }),
    })
    if (!res.ok) {
      // Generic outcomes only — upstream/endpoint detail never renders.
      return {
        status: 'error',
        error: res.status === 401 ? 'bad-key' : res.status === 413 ? 'too-large' : 'api-unavailable',
      }
    }
    const normalized = normalizeClassified(await res.json())
    if (!normalized) return { status: 'error', error: 'malformed-response' }
    return normalized
  } catch {
    return { status: 'error', error: 'api-unavailable' }
  }
}
