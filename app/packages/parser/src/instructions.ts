/**
 * Deterministic instruction layer — specs/parser_grammar.md §2/§4.
 * Pre-LLM extraction of the reliable structure inside instruction prose:
 * multi-size count lists (with the label that follows them), repeat
 * statements, and section headers. Everything returns evidence verbatim;
 * nothing is computed, guessed, or rounded.
 */
import { normalizeNumber } from './notation.js';

export interface SizeListMatch {
  /** Aligned per-size values as printed (first size outside parens). */
  values: number[];
  /** Character offset in the input (for ordering/provenance). */
  index: number;
  /** ~40 chars following the list — the semantic label lives here
   *  ("total sts", "sts at each sleeve", "body sts on the needles"). */
  contextAfter: string;
  /** ~30 chars preceding the list — verb context ("cast on", "pick up"). */
  contextBefore: string;
  evidence: string;
}

const SIZE_LIST_RE = /(\d+(?:\s*[½¼¾⅜⅝⅞]\d*|\.\d+)?)\s*\(([\d\s.,½¼¾⅜⅝⅞]+)\)/g;

/**
 * Every multi-size list occurrence in an instruction line, in document order.
 * Numbers-only parens are size alternatives per the A1 rule (verb repeat
 * groups contain letters and never match this grammar).
 */
/** Collapse OCR digit-splits inside a numbers-only token ("3 8" → "38") —
 * spec §5 failure mode; unambiguous within a size-list entry. */
function deGarble(token: string): string {
  return token.replace(/(\d)\s+(?=\d)/g, '$1');
}

export function findSizeLists(text: string, sizeCount?: number): SizeListMatch[] {
  const out: SizeListMatch[] = [];
  for (const m of text.matchAll(SIZE_LIST_RE)) {
    const first = normalizeNumber(deGarble(m[1] ?? ''));
    const rest = (m[2] ?? '')
      .split(',')
      .map((s) => normalizeNumber(deGarble(s.replace(/sts?\.?$/i, '').trim())));
    if (first === null || rest.some((r) => r === null)) continue;
    const values = [first, ...(rest as number[])];
    if (sizeCount !== undefined && values.length !== sizeCount) continue;
    const end = (m.index ?? 0) + m[0].length;
    out.push({
      values,
      index: m.index ?? 0,
      contextAfter: text.slice(end, end + 40).trim(),
      contextBefore: text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0).trim(),
      evidence: m[0],
    });
  }
  return out;
}

export type CheckpointRole = 'total' | 'sleeve' | 'front_back' | 'body' | 'cuff' | 'plain_sts' | 'unknown';

/** Classify a count by the label DIRECTLY FOLLOWING it (Flax convention;
 * A3-family lexicon). Anchored to the context start — later prose mentioning
 * other pieces must not hijack the role. */
export function classifyCheckpointLabel(contextAfter: string): CheckpointRole {
  const t = contextAfter.toLowerCase().trimStart();
  if (/^total sts|^sts total/.test(t)) return 'total';
  if (/^sts at each sleeve|^sleeve sts/.test(t)) return 'sleeve';
  if (/^sts at each front and back/.test(t)) return 'front_back';
  if (/^body sts/.test(t)) return 'body';
  if (/^cuff/.test(t)) return 'cuff';
  if (/^sts/.test(t)) return 'plain_sts';
  return 'unknown';
}

export interface RepeatStatement {
  /** Rows/rounds between repeats, per size, when stated ("these 6 (7, …) rounds"). */
  intervalRounds?: number[];
  /** Repeat counts, per size. */
  times: number[];
  /** Named pair being repeated, e.g. "rounds 1-2". */
  rounds?: string;
  evidence: string;
}

function trailingList(token: string): number[] | null {
  // "7" or "7 (8, 8, …)" → per-size values
  const m = token.match(/^(\d+(?:\.\d+)?)\s*(?:\(([\d\s.,½¼¾⅜⅝⅞]+)\))?/);
  if (!m) return null;
  const first = normalizeNumber(deGarble(m[1] ?? ''));
  if (first === null) return null;
  if (!m[2]) return [first];
  const rest = m[2].split(',').map((s) => normalizeNumber(deGarble(s.trim())));
  if (rest.some((r) => r === null)) return null;
  return [first, ...(rest as number[])];
}

/**
 * "Work rounds 1-2 a total of 7 (8, …) times."
 * "Work these 6 (7, …) rounds a total of 3 (2, …) times."
 */
export function parseRepeatStatement(text: string): RepeatStatement | null {
  const pair = text.match(
    /work (rounds?|rows?)\s+(\d+\s*[-–]\s*\d+)\s+(?:a total of|totalling)\s+(\d+(?:\s*\([\d\s.,½¼¾⅜⅝⅞]+\))?)\s+times\.?/i,
  );
  if (pair) {
    const times = trailingList(pair[3] ?? '');
    if (times) {
      return {
        times,
        rounds: `${pair[1]} ${pair[2]}`.toLowerCase(),
        evidence: pair[0],
      };
    }
  }
  const withInterval = text.match(
    /work these\s+(\d+(?:\s*\([\d\s.,½¼¾⅜⅝⅞]+\))?)\s+rounds\s+a total of\s+(\d+(?:\s*\([\d\s.,½¼¾⅜⅝⅞]+\))?)\s+times\.?/i,
  );
  if (withInterval) {
    const intervalRounds = trailingList(withInterval[1] ?? '');
    const times = trailingList(withInterval[2] ?? '');
    if (intervalRounds && times) {
      return { intervalRounds, times, evidence: withInterval[0] };
    }
  }
  return null;
}

export interface SectionHeaderMatch {
  /** Normalized section id: yoke | body | sleeve | finishing | other. */
  id: string;
  label: string;
  index: number;
  evidence: string;
}

const SECTION_HEADER_PATTERNS: Array<{ re: RegExp; id: string }> = [
  { re: /separate body and sleeves\s*:/i, id: 'body' },
  { re: /(?:short sleeves|3\/4 sleeves|long sleeves|sleeves)\s*:/i, id: 'sleeve' },
  { re: /yoke\s*:/i, id: 'yoke' },
  { re: /body\s*:/i, id: 'body' },
  { re: /(?:neckline ribbing|neckline|neckband|collar)\s*:/i, id: 'neckline' },
  { re: /finishing\s*:/i, id: 'finishing' },
];

/** Prose mentions ("two ribbing methods for the neckline:") are not headers. */
const NOT_A_HEADER_BEFORE = /\b(?:the|a|an|for|of|your|at|to|this)\s+$/i;

/**
 * Instruction section boundaries: a known section label followed by ':',
 * preceded by start-of-text or whitespace. Global matching (not
 * line-anchored) because flattened PDF text puts labels mid-line after page
 * chrome ("… icons yoke: Marker set-up …"). Returns matches in document
 * order; the caller slices text between consecutive header positions.
 */
export function findSectionHeaders(text: string): SectionHeaderMatch[] {
  const found: SectionHeaderMatch[] = [];
  for (const { re, id } of SECTION_HEADER_PATTERNS) {
    for (const m of text.matchAll(new RegExp(`(^|\\s)(${re.source})`, 'gi'))) {
      const lead = m[1] ?? '';
      const label = (m[2] ?? '').replace(/\s*:\s*$/, '').trim();
      const before = text.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + lead.length);
      if (NOT_A_HEADER_BEFORE.test(before)) continue;
      found.push({
        id,
        label,
        index: (m.index ?? 0) + lead.length,
        evidence: m[2] ?? '',
      });
    }
  }
  found.sort((a, b) => a.index - b.index);
  // "separate body and sleeves:" also matches the bare "sleeves:" pattern —
  // keep the longest match at any position, drop overlaps.
  const out: SectionHeaderMatch[] = [];
  for (const h of found) {
    const prev = out[out.length - 1];
    if (prev && h.index < prev.index + prev.evidence.length) continue;
    out.push(h);
  }
  return out;
}

// ── Section candidates (deterministic skeleton of the section builder) ─────

export interface CandidateEvent {
  type: 'inc' | 'dec';
  /** Stitch delta of ONE repeat of the round/row pair, as printed ("[8 sts inc]"). */
  deltaPerRound: number;
  /** Per-size repeat counts from the associated "… a total of N (…) times". */
  times: number[];
  /** Per-size interval rows when stated ("these 6 (…) rounds"). */
  intervalRows?: number[];
  evidence: string;
}

export interface SectionCandidate {
  id: string;
  label: string;
  /** First cast-on/pick-up count in the section, when present. */
  startsWith?: { event: string; sts: number[]; evidence: string };
  /** Last stitch checkpoint in the section, when present. */
  endsAt?: { event: string; sts: number[]; role: CheckpointRole; evidence: string };
  /** Classified checkpoints in order (provenance for Σ reconciliation). */
  checkpoints: Array<{ role: CheckpointRole; values: number[]; evidence: string }>;
  events: CandidateEvent[];
  srcIndex: number;
}

const BRACKET_DELTA_RE = /\[(\d+)\s*sts\s+(inc|dec)[^\]]*\]/gi;
const CAST_ON_RE = /cast on|pick up and knit|placed? .* on hold|pickup/i;

/**
 * Slice instruction text into section candidates (deterministic layer only):
 * boundaries from findSectionHeaders; within each block — cast-on starts,
 * classified checkpoints, and bracket-delta events associated with the
 * nearest following repeat statement. Nothing is inferred: absent pieces
 * stay absent and go to the LLM/review stage instead.
 */
export function extractSectionCandidates(text: string): SectionCandidate[] {
  const headers = findSectionHeaders(text);
  const candidates: SectionCandidate[] = [];
  for (let h = 0; h < headers.length; h++) {
    const head = headers[h]!;
    const blockStart = head.index + head.evidence.length;
    const block = text.slice(blockStart, headers[h + 1]?.index ?? text.length);

    const lists = findSizeLists(block);
    const checkpoints = lists
      .map((l) => ({ role: classifyCheckpointLabel(l.contextAfter), ...l }))
      .filter((l) => l.role !== 'unknown' && l.values.length > 1);

    const co = lists.find((l) => CAST_ON_RE.test(l.contextBefore));
    const start = co
      ? { event: /pick/i.test(co.contextBefore) ? 'pickup' : 'cast_on', sts: co.values, evidence: co.evidence }
      : undefined;
    const lastCp = checkpoints[checkpoints.length - 1];
    const end = lastCp
      ? { event: 'checkpoint', sts: lastCp.values, role: lastCp.role, evidence: lastCp.evidence }
      : undefined;

    const events: CandidateEvent[] = [];
    for (const m of block.matchAll(BRACKET_DELTA_RE)) {
      const delta = Number(m[1]);
      const type = (m[2] ?? '').toLowerCase() as 'inc' | 'dec';
      if (!Number.isFinite(delta) || delta <= 0) continue;
      // Associate the nearest FOLLOWING repeat statement within 600 chars.
      const after = block.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 600);
      const repeat = parseRepeatStatement(after);
      if (!repeat) continue;
      events.push({
        type,
        deltaPerRound: delta,
        times: repeat.times,
        ...(repeat.intervalRounds ? { intervalRows: repeat.intervalRounds } : {}),
        evidence: `${m[0]} … ${repeat.evidence.slice(0, 40)}`,
      });
    }

    candidates.push({
      id: head.id,
      label: head.label,
      ...(start ? { startsWith: start } : {}),
      ...(end ? { endsAt: end } : {}),
      checkpoints: checkpoints.map((c) => ({ role: c.role, values: c.values, evidence: c.evidence })),
      events,
      srcIndex: head.index,
    });
  }
  return candidates;
}
