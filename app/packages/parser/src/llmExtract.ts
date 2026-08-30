/**
 * LLM extraction stage — specs/parser_grammar.md §3.
 * Builds the structured prompt and enforces the evidence gate:
 * every extracted number must quote the segment verbatim or it is DROPPED.
 * The model extracts; it never computes.
 */

import { normalizeNumber } from './notation.js';

export interface ExtractedField<T = unknown> {
  path: string;
  value: T;
  confidence: 'high' | 'medium' | 'low';
  /** Must be a verbatim substring of the segment (checked in code). */
  evidence: string;
}

export interface LlmFieldSpec {
  path: string;
  type: 'number' | 'number[]' | 'string' | 'boolean';
  description: string;
}

export const SYSTEM_RULES = `You extract structured data from knitting pattern text.
Rules:
1. Output ONLY JSON matching the requested fields. No prose.
2. Every number MUST carry "evidence": a VERBATIM substring copied from the input where the number appears.
3. Copy counts exactly. NEVER sum, average, convert, or fix numbers.
4. Unknown or absent → null with confidence "low". Never invent sizes, gauges, or repeats.
5. confidence: "high" = explicitly stated, "medium" = parsed from table/abbreviation context, "low" = inferred from format only.`;

export function buildExtractPrompt(
  segmentText: string,
  segmentKind: string,
  fields: LlmFieldSpec[],
): Array<{ role: 'system' | 'user'; content: string }> {
  const fieldList = fields
    .map((f) => `- ${f.path} (${f.type}): ${f.description}`)
    .join('\n');
  return [
    { role: 'system', content: SYSTEM_RULES },
    {
      role: 'user',
      content:
        `Segment kind: ${segmentKind}\n\nSegment text:\n"""\n${segmentText}\n"""\n\n` +
        `Extract these fields as {"fields":[{"path","value","confidence","evidence"}]}:\n${fieldList}`,
    },
  ];
}

export interface GateResult {
  kept: ExtractedField[];
  dropped: Array<{ path: string; reason: string }>;
}

/**
 * The anti-hallucination gate: evidence must literally occur in the segment
 * (whitespace-flexible). Fields failing it are dropped, not trusted.
 */
export function enforceEvidence(
  extracted: ExtractedField[],
  segmentText: string,
): GateResult {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const hay = norm(segmentText);
  const kept: ExtractedField[] = [];
  const dropped: GateResult['dropped'] = [];
  for (const f of extracted) {
    if (f.value === null || f.value === undefined) {
      dropped.push({ path: f.path, reason: 'null value' });
      continue;
    }
    if (!f.evidence || !hay.includes(norm(f.evidence))) {
      dropped.push({ path: f.path, reason: 'evidence not found verbatim in segment' });
      continue;
    }
    if (!numericEvidenceMatches(f)) {
      dropped.push({ path: f.path, reason: 'numeric value does not match the field-specific number in the quoted evidence' });
      continue;
    }
    kept.push(f);
  }
  return { kept, dropped };
}

function numericEvidenceMatches(field: ExtractedField): boolean {
  const values = typeof field.value === 'number'
    ? [field.value]
    : Array.isArray(field.value) && field.value.every((v) => typeof v === 'number')
      ? field.value as number[]
      : null;
  if (!values) return true;
  const evidence = field.evidence;
  // Unknown/custom paths have no field semantics to select a number from;
  // retain the original substring gate for those callers.  All application
  // paths below are explicitly bound to their labelled numeric tokens.
  const path = field.path.toLowerCase();
  if (!/^(?:gauge\.|sizes\.finished_bust_in$|sizing\.(?:bustOrChestIn|sizeCount)$)/i.test(path)) return true;

  // Keep the full fractional token together.  Stripping `½` from `18½`
  // turns it into 18 and would let an incorrect model value through the
  // evidence gate.  normalizeNumber is the same deterministic parser used by
  // the notation layer, including Unicode and ASCII fractions.
  const fraction = '(?:[½¼¾⅜⅝⅞⅓⅔⅕⅖⅗⅘⅙]|1\\/2|1\\/4|3\\/4|3\\/8|5\\/8|7\\/8|1\\/3|2\\/3)';
  const token = `(?:\\d+(?:\\.\\d+)?(?:\\s*${fraction})?|${fraction})`;
  const numberValues = (matches: RegExpMatchArray[], group?: number): number[] => matches
    .map((m) => normalizeNumber(m[group ?? 0] ?? ''))
    .filter((v): v is number => v !== null);

  let found: number[];
  if (/^gauge\.(?:sts|stitches)(?:_over)?$/i.test(path)) {
    const re = new RegExp(`${token}(?=\\s*(?:sts?|stitches?)\\b)`, 'gi');
    found = numberValues([...evidence.matchAll(re)]);
  } else if (/^gauge\.(?:rows|rounds)(?:_over)?$/i.test(path)) {
    const re = new RegExp(`${token}(?=\\s*(?:rows?|rounds?)\\b)`, 'gi');
    found = numberValues([...evidence.matchAll(re)]);
  } else if (/^gauge\.(?:over|over_in|span|span_in)$/i.test(path)) {
    // Bind the span to its label/unit: in `18 sts and 24 rows over 4 inches`
    // the requested value is 4, never the first count in the quotation.
    // This field is explicitly canonical inches. A metric-only quote must be
    // dropped instead of treating its centimetre number as inches; the
    // notation layer handles declared cm conversion deterministically.
    const re = new RegExp(`(?:over|=|/)\\s*(${token})\\s*(?=(?:"|”|in\\b|inches\\b))`, 'gi');
    found = numberValues([...evidence.matchAll(re)], 1);
  } else {
    // `_in` fields may quote a number followed by cm, but that raw number is
    // not an inch value. Require an inch-safe token by rejecting cm-labelled
    // matches; a paired inch value in the same quote remains eligible.
    const re = new RegExp(`${token}(?!\\s*cm\\b)`, 'gi');
    found = numberValues([...evidence.matchAll(re)]);
  }
  if (found.length === 0) return false;
  return values.every((v) => found.some((x) => Number.isFinite(x) && Math.abs(x - v) < 1e-9));
}

/** True when a page's text is too thin to hold a field (scanned-page detection, spec §1). */
export function looksScanned(pageText: string): boolean {
  return pageText.replace(/\s+/g, '').length < 20;
}
