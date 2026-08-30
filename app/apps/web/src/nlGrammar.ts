import type { Intent, ModificationRequest } from '@knitting/shared'
import { cmToIn } from '@knitting/parser'

/**
 * Deterministic natural-language → intent grammar (NO LLM). Implements the
 * intent_grammar §5 contract as code: routes free text to one of the 5 MVP
 * intents with parameters, and reports CONFIDENCE. 'exact' is claimed only
 * when the intent is unambiguous AND every parameter came from the text; any
 * missing amount, missing direction, cup-only phrasing, bare volume word, or
 * competing intents downgrade confidence and surface reasons — the UI then
 * OFFERS the optional LLM pass instead of silently guessing.
 * Pure functions; the engine still computes everything downstream.
 */

export type NlConfidence = 'exact' | 'probable' | 'unclear'

export interface NlDraft {
  intent: Intent
  params: ModificationRequest['params']
  confidence: NlConfidence
  /** Why this is not 'exact' (empty when exact). */
  reasons: string[]
  /** Notes for the intent card (parse results, KB caveats). */
  notes: string[]
}

const round2 = (x: number) => Math.round(x * 100) / 100

const RE = {
  gaugeSignal:
    /\bgauge\b|\bswatch\b|sts\s*\/\s*in|stitches?\s*per\s*inch|different\s+(?:yarn|needle)|thinner|thicker|substitut/i,
  sleeveSignal: /\bsleeves?\b|\barms?\b|\bbicep\b/i,
  bustSignal: /\bbust\b|\bcups?\b|\bdarts?\b/i,
  bodySignal: /\blonger\b|\bshorter\b|\blength(?:en|en(ed)ing)?\b|\bcrop\b|\btunic\b|\bhem\b|\bextend\b/i,
  bodyAnchor: /\bbody\b|\bhem\b|\btunic\b|\btorso\b|\bsweater\b/i,
  sizeSignal:
    /\bsizes?\b|\bease\b|\bbigger\b|\blarger\b|\bsmaller\b|\broomier\b|\boversized\b|\bslim\b|\bfitted\b|\bcomfort\b|\bfit\b/i,
  /** Fit-problem phrasings from real knitter diagnostics (Radcliffe §25.5 corpus). */
  fitProblem: /\btoo\s+(?:tight|loose|big|small|wide|narrow|short|long)\b|\bwider\b|\bnarrower\b/i,
  /** Volume words that alone are the classic frame-vs-cup ambiguity (KB §11). */
  volumeOnly: /\bbigger\b|\blarger\b|\bsmaller\b|\bmore room\b/i,
  growWords: /longer|lengthen|extend|bigger|larger|more|roomier|looser|add\b|taller|too\s+(?:long|big|loose|wide)/i,
  shrinkWords: /shorter|shorten|less\b|smaller|tighter|crop|remove|take (?:up|in)|slim|too\s+(?:short|small|tight|narrow)/i,
  tierFitted: /fitted|slim\b|close\b/i,
  tierOversized: /oversized|roomy\b|roomier|loose\b|baggy|slouch/i,
  bustBasis: /full[- ]bust|by bust/i,
  explicitSize: /\bsizes?\b|\bease\b/i,
} as const

function parseDelta(raw: string): { mag: number | null; explicitDir: 1 | -1 | null } {
  const cm = raw.match(/([+-]?\d+(?:\.\d+)?)\s*cm\b/i)
  const inch = raw.match(/([+-]?\d+(?:\.\d+)?)\s*(?:"|”|″|inch(?:es)?\b|\bin\b)/i)
  const bare = raw.match(/([+-]?\d+(?:\.\d+)?)/)
  const m = cm ?? inch ?? bare
  if (!m) return { mag: null, explicitDir: null }
  let mag = Number(m[1])
  if (cm) mag = round2(cmToIn(mag))
  if (m[1].startsWith('-')) return { mag, explicitDir: -1 }
  if (m[1].startsWith('+')) return { mag, explicitDir: 1 }
  return { mag, explicitDir: null }
}

function wordDir(raw: string): 1 | -1 | null {
  if (RE.shrinkWords.test(raw)) return -1
  if (RE.growWords.test(raw)) return 1
  return null
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

/** Which intent families the text signals, after cross-claiming is resolved. */
function matchedIntents(text: string): Intent[] {
  const out: Intent[] = []
  if (RE.gaugeSignal.test(text)) out.push('gauge_conversion')
  const sleeve = RE.sleeveSignal.test(text)
  const body = RE.bodySignal.test(text) && (RE.bodyAnchor.test(text) || !sleeve)
  if (sleeve) out.push('sleeve_length_change')
  if (RE.bustSignal.test(text)) out.push('bust_accommodation')
  if (body) out.push('body_length_change')
  const size =
    (RE.sizeSignal.test(text) || RE.fitProblem.test(text)) && !RE.bustSignal.test(text) && !sleeve
  if (size) out.push('size_ease_selection')
  return out
}

function lengthDraft(
  intent: 'body_length_change' | 'sleeve_length_change',
  text: string,
): NlDraft {
  const reasons: string[] = []
  const notes: string[] = []
  const { mag, explicitDir } = parseDelta(text)
  const wDir = wordDir(text)
  const dir = explicitDir ?? wDir
  let deltaIn: number
  if (mag === null) {
    deltaIn = dir === -1 ? -2 : 2
    reasons.push(
      `No amount stated — drafted as ${deltaIn > 0 ? '+' : '−'}2″ (direction from your words). Set the real change on the card.`,
    )
  } else if (dir === null) {
    deltaIn = mag
    reasons.push('Amount found but no longer/shorter direction — assumed longer (+).')
  } else {
    deltaIn = dir === -1 ? -mag : mag
  }
  if (mag !== null) {
    notes.push(`Delta parsed from text: ${deltaIn}″${dir === null ? ' (direction assumed)' : ''}.`)
  }
  notes.push(
    intent === 'sleeve_length_change'
      ? 'Taper is re-rated, never dropped (KB §16.2).'
      : 'Plain-span change only: worked outside shaping (KB §11 hem rule).',
  )
  return {
    intent,
    params: { kind: intent === 'body_length_change' ? 'body_length' : 'sleeve_length', deltaIn },
    confidence: reasons.length === 0 ? 'exact' : 'probable',
    reasons,
    notes,
  }
}

export function classifyDeterministic(raw: string): NlDraft | null {
  const text = raw.trim()
  if (!text) return null

  const matched = matchedIntents(text)

  // Bare volume word with no specifier (the ONLY signal being "bigger" etc.):
  // the §11 frame-vs-cup question — check before size claims it as ordinary.
  const bareVolume =
    RE.volumeOnly.test(text) &&
    !RE.explicitSize.test(text) &&
    !RE.tierFitted.test(text) &&
    !RE.tierOversized.test(text) &&
    !RE.sleeveSignal.test(text) &&
    !RE.bustSignal.test(text) &&
    !RE.bodySignal.test(text) &&
    !RE.bodyAnchor.test(text)
  if (bareVolume) {
    return {
      intent: 'size_ease_selection',
      params: { kind: 'size_ease', basis: 'upper_torso', tier: 'average' },
      confidence: 'unclear',
      reasons: [
        '“Bigger” alone can mean a bigger FRAME (size/ease) or more CUP volume (bust darts) — the KB §11 disambiguation.',
        'Drafted as size/ease by default; switch to Bust accommodation if you meant cup volume.',
      ],
      notes: [],
    }
  }

  if (matched.length === 0) return null

  // Two changes at once: draft the strongest (precedence order), say so.
  if (matched.length > 1) {
    const first = matched[0]!
    const draft = singleIntentDraft(first, text)
    const labels = matched.map((m) => m.replaceAll('_', ' ')).join(' + ')
    return {
      ...draft,
      confidence: 'probable',
      reasons: [
        `Two changes detected: ${labels}. Modifications apply one at a time — drafted ${first.replaceAll('_', ' ')} first; run again for the other.`,
      ],
    }
  }

  return singleIntentDraft(matched[0]!, text)
}

function singleIntentDraft(intent: Intent, text: string): NlDraft {
  switch (intent) {
    case 'gauge_conversion': {
      const g = parseGauge(text)
      const reasons: string[] = []
      if (g.stsPerIn === null) {
        reasons.push('No stitch gauge found in the text — defaulted to 5 sts/in; set your swatch gauge.')
      }
      return {
        intent: 'gauge_conversion',
        params: {
          kind: 'gauge',
          userStsPerIn: g.stsPerIn ?? 5,
          ...(g.rowsPerIn ? { userRowsPerIn: g.rowsPerIn } : {}),
        },
        confidence: reasons.length === 0 ? 'exact' : 'probable',
        reasons,
        notes: [
          g.stsPerIn === null
            ? 'No gauge parsed from text.'
            : `Swatch gauge parsed from text: ${g.stsPerIn} sts/in.`,
        ],
      }
    }
    case 'sleeve_length_change':
      return lengthDraft('sleeve_length_change', text)
    case 'body_length_change':
      return lengthDraft('body_length_change', text)
    case 'bust_accommodation': {
      const reasons: string[] = []
      const cupOnly = /\bcups?\b/i.test(text) && !/\bbust\b|\bdarts?\b/i.test(text)
      if (cupOnly) {
        reasons.push(
          'Cup phrasing without measurements — the measurement path is preferred (Herzog §19); the 1″-per-cup shortcut is an unverified [conv] fallback.',
        )
      }
      return {
        intent: 'bust_accommodation',
        params: { kind: 'bust', method: 'auto', tightness: 'average' },
        confidence: reasons.length === 0 ? 'exact' : 'probable',
        reasons,
        notes: [],
      }
    }
    case 'size_ease_selection': {
      const tier = RE.tierFitted.test(text)
        ? ('fitted' as const)
        : RE.tierOversized.test(text)
          ? ('oversized' as const)
          : ('average' as const)
      const reasons: string[] = []
      if (tier === 'average' && !RE.tierFitted.test(text) && !RE.tierOversized.test(text)) {
        reasons.push('No ease preference stated — defaulted to the average tier.')
      }
      if (/\btoo\s+(?:tight|small|narrow)\b|\bwider\b/i.test(text)) {
        reasons.push(
          '"Too tight/small/wider" reads as wanting MORE room — review the tier and consider a larger size.',
        )
      }
      if (/\btoo\s+(?:loose|big|wide)\b|\bnarrower\b/i.test(text)) {
        reasons.push(
          '"Too loose/big/narrower" reads as wanting LESS room — review the tier and consider a smaller size.',
        )
      }
      if (/\bwider\b|\bnarrower\b|\btoo\s+(?:wide|narrow)\b/i.test(text)) {
        reasons.push(
          'A WIDTH change on the body is a post-MVP intent — drafted as size/ease, the closest available fit.',
        )
      }
      return {
        intent: 'size_ease_selection',
        params: {
          kind: 'size_ease',
          basis: RE.bustBasis.test(text) ? 'bust' : 'upper_torso',
          tier,
        },
        confidence: reasons.length === 0 ? 'exact' : 'probable',
        reasons,
        notes: ['Sizes by upper torso (Herzog §19.1) — the profile needs that measurement.'],
      }
    }
  }
}
