import type { FitProfile, Intent, ModificationRequest } from '@knitting/shared'
import { cmToIn } from '@knitting/parser'

/**
 * Heuristic natural-language → ModificationRequest drafting for the shell.
 * PLACEHOLDER for the /api classifier (specs/intent_grammar.md §5): keyword
 * routing + simple number parsing only. The UI always shows an editable
 * intent card before anything reaches the engine — the engine computes,
 * never this file.
 */

export const INTENT_LABELS: Record<Intent, string> = {
  size_ease_selection: 'Size & ease',
  bust_accommodation: 'Bust accommodation',
  body_length_change: 'Body length',
  sleeve_length_change: 'Sleeve length',
  gauge_conversion: 'Gauge conversion',
}

export const INTENT_ORDER: Intent[] = [
  'size_ease_selection',
  'bust_accommodation',
  'body_length_change',
  'sleeve_length_change',
  'gauge_conversion',
]

/** Confirmation-card backing (intent grammar §6): engine functions + KB refs. */
export const INTENT_BACKING: Record<Intent, { engine: string; refs: string }> = {
  size_ease_selection: { engine: 'recommendSizeByUpperTorso', refs: 'Herzog §19.1; KB §2' },
  bust_accommodation: {
    engine: 'verticalDart · shortRowDartAmount · shortRowPlacement · negativeEaseLengthCompensation',
    refs: 'Herzog §19.2–§19.5',
  },
  body_length_change: { engine: 'plain-span work-to-length recompute', refs: 'KB §11 hem rule; §17.2' },
  sleeve_length_change: { engine: 'taperSchedule', refs: 'KB §16.2' },
  gauge_conversion: { engine: 'convertCount · convertRows · §6 rebalance', refs: 'KB §2/§6; §17.2 drift policy' },
};

export interface IntentDraft {
  intent: Intent
  params: ModificationRequest['params']
  /** Drafting notes shown on the intent card (heuristic caveats, [conv] flags). */
  notes: string[]
}

const round2 = (x: number) => Math.round(x * 100) / 100

function parseDeltaIn(raw: string): number | null {
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm\b/i)
  if (cm) return round2(cmToIn(Number(cm[1])))
  const inch = raw.match(/([+]?\d+(?:\.\d+)?)\s*(?:"|”|″|inch(?:es)?\b|\bin\b)/i)
  if (inch) return Number(inch[1])
  const bare = raw.match(/(\d+(?:\.\d+)?)/)
  return bare ? Number(bare[1]) : null
}

function signed(raw: string, mag: number | null): number | null {
  if (mag === null) return null
  return /(shorter|less|smaller|tighter|crop|remove|take (up|in))/i.test(raw) ? -mag : mag
}

function parseGauge(raw: string): { stsPerIn: number | null; rowsPerIn: number | null } {
  const stPerIn = raw.match(/(\d+(?:\.\d+)?)\s*(?:sts|stitches|st)\s*(?:\/|per)\s*(?:in|inch)/i)
  const rowsPerIn = raw.match(/(\d+(?:\.\d+)?)\s*rows\s*(?:\/|per)\s*(?:in|inch)/i)
  const overForm = raw.match(/(\d+)\s*(?:sts|stitches)\b[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*(?:"|”|inch)/i)
  if (stPerIn) {
    return {
      stsPerIn: Number(stPerIn[1]),
      rowsPerIn: rowsPerIn ? Number(rowsPerIn[1]) : null,
    }
  }
  if (overForm) {
    return {
      stsPerIn: round2(Number(overForm[1]) / Number(overForm[2])),
      rowsPerIn: rowsPerIn ? Number(rowsPerIn[1]) : null,
    }
  }
  return { stsPerIn: null, rowsPerIn: rowsPerIn ? Number(rowsPerIn[1]) : null }
}

export function draftIntent(raw: string): IntentDraft | null {
  const text = raw.trim()
  if (!text) return null

  if (/\bgauge\b|\bswatch\b|sts\s*\/\s*in|stitches per inch|different (yarn|needle)|thinner|thicker|substitut/i.test(text)) {
    const g = parseGauge(text)
    return {
      intent: 'gauge_conversion',
      params: {
        kind: 'gauge',
        userStsPerIn: g.stsPerIn ?? 5,
        ...(g.rowsPerIn ? { userRowsPerIn: g.rowsPerIn } : {}),
      },
      notes: [
        g.stsPerIn === null
          ? 'No stitch gauge found in the text — set your swatch gauge manually.'
          : `Swatch gauge parsed from text: ${g.stsPerIn} sts/in.`,
      ],
    }
  }

  if (/\bsleeve|\bsleeves\b|\barm\b|\barms\b|bicep/i.test(text)) {
    const delta = signed(text, parseDeltaIn(text))
    return {
      intent: 'sleeve_length_change',
      params: { kind: 'sleeve_length', deltaIn: delta ?? 2 },
      notes: [
        delta === null
          ? 'No length found — enter the change in inches (negative shortens).'
          : `Delta parsed as ${delta}". Taper is re-rated, never dropped (KB §16.2).`,
      ],
    }
  }

  if (/\bbust\b|\bcup\b|\bdart/i.test(text)) {
    const notes: string[] = []
    if (/\bcup\b/i.test(text) && !/\b\d+\s*(?:"|inch)/i.test(text)) {
      notes.push('Cup phrasing without measurements: the measurement path is preferred [Herzog §19]; the 1"-per-cup shortcut stays a [conv] fallback.')
    }
    return {
      intent: 'bust_accommodation',
      params: { kind: 'bust', method: 'auto', tightness: 'average' },
      notes,
    }
  }

  if (/longer|shorter|\blength\b|crop|tunic|hem\b/i.test(text)) {
    const delta = signed(text, parseDeltaIn(text))
    return {
      intent: 'body_length_change',
      params: { kind: 'body_length', deltaIn: delta ?? 2 },
      notes: [
        delta === null
          ? 'No length found — enter the change in inches (negative shortens).'
          : `Delta parsed as ${delta}". Plain-span change only: worked outside shaping (KB §11 hem rule).`,
      ],
    }
  }

  if (/size|ease|bigger|larger|smaller|roomier|oversized|slim|fitted|comfort|fit/i.test(text)) {
    const tier = /fitted|slim|close/i.test(text)
      ? 'fitted'
      : /oversized|roomy|loose|baggy/i.test(text)
        ? 'oversized'
        : 'average'
    return {
      intent: 'size_ease_selection',
      params: { kind: 'size_ease', basis: 'upper_torso', tier },
      notes: ['Sizes by upper torso (Herzog §19.1) — the profile needs that measurement.'],
    }
  }

  return null
}

/**
 * Slot-filling gate (intent grammar §3): required inputs that are still
 * missing. Any non-empty result blocks the confirm button.
 */
export function missingSlots(
  intent: Intent,
  params: ModificationRequest['params'],
  profile: FitProfile | undefined,
): string[] {
  const q: string[] = []
  const has = (v: number | undefined | null) => v !== undefined && v !== null && v > 0
  switch (intent) {
    case 'size_ease_selection':
      if (params.kind === 'size_ease' && params.basis === 'bust') {
        if (!has(profile?.fullBustIn)) q.push('What is your full-bust measurement?')
      } else if (!has(profile?.upperTorsoIn)) {
        q.push('What is your upper-torso measurement? (Around the fullest part of the upper back and chest, above the bust — Herzog §19.1.)')
      }
      break
    case 'bust_accommodation':
      if (params.kind === 'bust' && params.method === 'short_rows') {
        if (!has(profile?.frontHemToShoulderIn) || !has(profile?.backHemToShoulderIn)) {
          q.push('Measure front and back hem-to-shoulder over the fullest bust — short-row darts need both (Herzog §19.4).')
        }
      } else {
        if (!has(profile?.upperTorsoIn)) q.push('What is your upper-torso measurement? (Vertical darts need it — Herzog §19.3.)')
        if (!has(profile?.fullBustIn)) q.push('What is your full-bust measurement?')
      }
      break
    case 'body_length_change':
      if (params.kind === 'body_length' && !Number.isFinite(params.deltaIn)) {
        q.push('How much longer or shorter, in inches?')
      }
      break
    case 'sleeve_length_change':
      if (params.kind === 'sleeve_length' && !Number.isFinite(params.deltaIn)) {
        q.push('How much longer or shorter, in inches?')
      }
      break
    case 'gauge_conversion':
      if (params.kind === 'gauge' && !(params.userStsPerIn > 0)) {
        q.push("What's your swatch gauge in stitches per inch?")
      }
      break
  }
  return q
}
