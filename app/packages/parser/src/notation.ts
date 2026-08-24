/**
 * Deterministic notation layer — specs/parser_grammar.md §2 (KB §12, §13.9d).
 * Runs BEFORE any LLM call; regex/tokenizer only, no guessing: every function
 * either returns a confident result or `null` (route to the LLM / review UI).
 */

const FRACTIONS: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1 / 6,
  '1/2': 0.5, '1/4': 0.25, '3/4': 0.75, '3/8': 0.375, '5/8': 0.625, '7/8': 0.875,
  '1/3': 1 / 3, '2/3': 2 / 3,
};

/** "7½" | "7 1/2" | "7.5" | "7" → 7.5 … ; null when not a number. */
export function normalizeNumber(token: string): number | null {
  const t = token.trim();
  const simple = Number(t);
  if (Number.isFinite(simple) && /^-?[\d.]+$/.test(t)) return simple;
  const m = t.match(/^(\d+)\s*([½¼¾⅜⅝⅞⅓⅔⅕⅖⅗⅘⅙]|1\/2|1\/4|3\/4|3\/8|5\/8|7\/8|2\/3|1\/3)$/);
  if (m) {
    const frac = FRACTIONS[m[2]!] ?? Number(m[2]);
    return Number.isFinite(frac) ? Number(m[1]) + frac : null;
  }
  const lone = FRACTIONS[t];
  return lone !== undefined ? lone : null;
}

/** cm → inches (KB §12 units; inches canonical [policy A2]). */
export function cmToIn(cm: number): number {
  return cm / 2.54;
}

/** Extract a multi-size list: `66 (72, 78, 84) sts` → [66, 72, 78, 84]. */
export function parseSizeList(text: string): number[] | null {
  const m = text.match(/(\d+(?:\s*[½¼¾⅜⅝⅞]\d*|\.\d+)?)\s*\(([\d\s.,½¼¾⅜⅝⅞]+)\)/);
  if (!m) return null;
  const first = normalizeNumber(m[1]!);
  const rest = m[2]!
    .split(',')
    .map((s) => normalizeNumber(s.replace(/sts?\.?$/i, '')));
  if (first === null || rest.some((r) => r === null)) return null;
  return [first, ...(rest as number[])];
}

export type BracketKind = 'sizes' | 'repeat_group' | 'repeat_unit' | 'unknown';

/**
 * A1 disambiguation rule (KB §12): brackets containing only comma-separated
 * numbers whose count == sizeCount = size alternatives; a verb/instruction
 * context = repeat group; `[ ]` = repeat unit.
 */
export function classifyBracket(
  inner: string,
  sizeCount: number,
): BracketKind {
  const trimmed = inner.trim();
  const numbers = trimmed.split(',').map((s) => normalizeNumber(s));
  const allNumbers = numbers.every((n) => n !== null);
  if (allNumbers && numbers.length === sizeCount && sizeCount > 1) return 'sizes';
  if (/[a-z]/i.test(trimmed)) return 'repeat_group'; // verb/instruction context
  if (allNumbers) return 'unknown'; // numbers but wrong count → surface, don't guess
  return 'unknown';
}

export interface ParsedGauge {
  stsOver: number;
  rowsOver: number | null;
  overIn: number;
  stsPerIn: number;
  rowsPerIn: number | null;
  stitchPattern: string | null;
}

/** `18 sts & 28 rows = 4" (10 cm) in St st` → normalized gauge block fields.
 * Also accepts in-the-round phrasing (TCK golden: `18 sts & 24 rounds / 4"`). */
export function parseGaugeStatement(text: string): ParsedGauge | null {
  const sts = text.match(/(\d+(?:\.\d+)?)\s*sts/i);
  const rows = text.match(/(\d+(?:\.\d+)?)\s*(?:rows|rounds)\b/i);
  const over = text.match(/=\s*(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inches)/i)
    ?? text.match(/over\s+(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inches)/i)
    ?? text.match(/\/\s*(\d+(?:\.\d+)?)\s*(?:"|”|in\b|inches)/i);
  const perIn = text.match(/(\d+(?:\.\d+)?)\s*sts\s*(?:\/|per)\s*in/i);
  if (!sts && !perIn) return null;
  const stitch = text.match(/in\s+([A-Za-z][A-Za-z .]+?)(?:\.|,|$)/);
  if (perIn && !over) {
    const sp = Number(perIn[1]);
    const rp = rows ? Number(rows[1]) : null;
    return {
      stsOver: Math.round(sp * 4), rowsOver: rp === null ? null : Math.round(rp * 4),
      overIn: 4, stsPerIn: sp, rowsPerIn: rp, stitchPattern: stitch?.[1]?.trim() ?? null,
    };
  }
  if (!sts || !over) return null;
  const overIn = Number(over[1]);
  const stsOver = Number(sts[1]);
  const rowsOver = rows ? Number(rows[1]) : null;
  return {
    stsOver, rowsOver, overIn,
    stsPerIn: stsOver / overIn,
    rowsPerIn: rowsOver === null ? null : rowsOver / overIn,
    stitchPattern: stitch?.[1]?.trim() ?? null,
  };
}

export type MeasurementBasis = 'to_fit' | 'finished' | 'unknown';

/** A3 lexicon starter — phrasings seen across our sources (VK, TCK, Budd). */
export function detectMeasurementBasis(text: string): MeasurementBasis {
  const t = text.toLowerCase();
  if (/\bto fit\b|\bfits (bust|chest|head|hand|foot|waist|hip)/.test(t)) return 'to_fit';
  if (/\bfinished (bust|chest|circumference|measurement|size|length|back)s?\b/.test(t)
    || /finished garment measurements/.test(t)) return 'finished';
  return 'unknown';
}

/** Segment a raw pattern text into KB §12 document blocks (best-effort, page-tagged). */
export interface Segment {
  kind:
    | 'sizing' | 'gauge' | 'materials' | 'instructions' | 'finishing' | 'construction_note' | 'other';
  text: string;
  page?: number;
}

const HEADERS: Array<[Segment['kind'], RegExp]> = [
  ['sizing', /^(sizes|sizing|to fit|finished (bust|chest|measurements?))/i],
  ['gauge', /^(gauge|tension)\b/i],
  ['materials', /^(yarn|needles|notions|materials)\b/i],
  ['instructions', /^(instructions|directions|notes|body|sleeves|collar|back|front)\b/i],
  ['finishing', /^finishing\b/i],
  ['construction_note', /(worked (in the round|flat|from|top|bottom)|seamless)/i],
];

export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let page = 1;
  for (const raw of text.split(/\n{2,}/)) {
    const m = raw.match(/^##\s*PDF page\s+(\d+)/im);
    if (m) page = Number(m[1]);
    const firstLine = raw.trim().split('\n')[0]?.trim() ?? '';
    const kind = HEADERS.find(([, re]) => re.test(firstLine))?.[0] ?? 'other';
    out.push({ kind, text: raw.trim(), page });
  }
  return out;
}
