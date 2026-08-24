/**
 * LLM extraction stage — specs/parser_grammar.md §3.
 * Builds the structured prompt and enforces the evidence gate:
 * every extracted number must quote the segment verbatim or it is DROPPED.
 * The model extracts; it never computes.
 */

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
    kept.push(f);
  }
  return { kept, dropped };
}

/** True when a page's text is too thin to hold a field (scanned-page detection, spec §1). */
export function looksScanned(pageText: string): boolean {
  return pageText.replace(/\s+/g, '').length < 20;
}
