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
  evidence: string;
}

const SIZE_LIST_RE = /(\d+(?:\s*[½¼¾⅜⅝⅞]\d*|\.\d+)?)\s*\(([\d\s.,½¼¾⅜⅝⅞]+)\)/g;

/**
 * Every multi-size list occurrence in an instruction line, in document order.
 * Numbers-only parens are size alternatives per the A1 rule (verb repeat
 * groups contain letters and never match this grammar).
 */
export function findSizeLists(text: string, sizeCount?: number): SizeListMatch[] {
  const out: SizeListMatch[] = [];
  for (const m of text.matchAll(SIZE_LIST_RE)) {
    const first = normalizeNumber(m[1] ?? '');
    const rest = (m[2] ?? '')
      .split(',')
      .map((s) => normalizeNumber(s.replace(/sts?\.?$/i, '').trim()));
    if (first === null || rest.some((r) => r === null)) continue;
    const values = [first, ...(rest as number[])];
    if (sizeCount !== undefined && values.length !== sizeCount) continue;
    const end = (m.index ?? 0) + m[0].length;
    out.push({
      values,
      index: m.index ?? 0,
      contextAfter: text.slice(end, end + 40).trim(),
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
  const first = normalizeNumber(m[1] ?? '');
  if (first === null) return null;
  if (!m[2]) return [first];
  const rest = m[2].split(',').map((s) => normalizeNumber(s.trim()));
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

const SECTION_HEADERS: Array<[RegExp, string]> = [
  [/^separate body and sleeves\b/i, 'body'],
  [/^short sleeves\b|^3\/4 sleeves\b|^long sleeves\b|^sleeves\b/i, 'sleeve'],
  [/^yoke\b/i, 'yoke'],
  [/^body\b/i, 'body'],
  [/^neckline\b|^neckband\b|^collar\b/i, 'neckline'],
  [/^finishing\b/i, 'finishing'],
];

/**
 * Instruction section boundaries: a known section label starting a line and
 * immediately followed by ':'. Returns matches in document order; the caller
 * slices segment text between consecutive headers.
 */
export function findSectionHeaders(text: string): SectionHeaderMatch[] {
  const out: SectionHeaderMatch[] = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Za-z][A-Za-z0-9 /¾]*?)\s*:/);
    if (!m) continue;
    const label = m[1] ?? '';
    for (const [re, id] of SECTION_HEADERS) {
      if (re.test(label)) {
        out.push({ id, label, index: line.indexOf(label), evidence: m[0] });
        break;
      }
    }
  }
  return out;
}
