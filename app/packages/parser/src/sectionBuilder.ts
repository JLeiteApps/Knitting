/**
 * Section builder — maps deterministic SectionCandidates (instructions.ts)
 * into Pattern IR sections (specs/parser_grammar.md §3 "Instructions" target).
 * Deterministic only: every rule below is a documented convention; anything
 * the rules can't place is left OUT (for the LLM/review stage), never guessed.
 *
 * Rules:
 *  - Split-point candidates ("separate body and sleeves") seed the following
 *    body section's start; they are not emitted as sections.
 *  - startsWith: explicit cast-on/pickup (underarm pickup-count lists on
 *    sleeves are noise → skipped) → sleeve runs share the first variant's
 *    resolved start → yoke/general carry the previous section's end.
 *  - endsAt: the section's "total sts" checkpoints, merged per size — full
 *    sizeCount lists set all sizes, later sub-lists ("Sizes XL (…) only")
 *    override their trailing sizes; else the last full-size checkpoint.
 *  - Events: duplicate bracket/repeat pairs are deduplicated; sub-sizeCount
 *    repeat lists follow the trailing-sizes convention (noted for review).
 */
import type { Section, ShapingEvent, WorkingMethod } from '@knitting/schema';
import type {
  CandidateEvent,
  SectionCandidate,
} from './instructions.js';

export interface BuildOptions {
  sizeCount: number;
  /** Garment working method (Flax: in_the_round). Per-section overrides later. */
  method?: WorkingMethod;
  /** Pattern-declared unit: 'cm' converts length lists /2.54 (dropdown declaration). */
  unit?: 'in' | 'cm';
}

export interface BuildResult {
  sections: Section[];
  /** Review flags: conventions applied, candidates skipped, odd deltas dropped. */
  notes: string[];
}

const SPLIT_POINT_LABEL = 'separate body and sleeves';

export function buildSections(candidates: SectionCandidate[], opts: BuildOptions): BuildResult {
  const n = opts.sizeCount;
  const method = opts.method ?? 'in_the_round';
  const toIn = (v: number) => (opts.unit === 'cm' ? Math.round((v / 2.54) * 100) / 100 : v);
  const notes: string[] = [];
  const sections: Section[] = [];
  let sleeveRunStart: Section['startsWith'] | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i]!;

    if (cand.label.toLowerCase() === SPLIT_POINT_LABEL) {
      const bodyCp = cand.checkpoints.find((c) => c.role === 'body');
      const nextBody = candidates.find((c, k) => k > i && c.id === 'body' && c.label.toLowerCase() !== SPLIT_POINT_LABEL);
      if (bodyCp && nextBody && !nextBody.startsWith) {
        (nextBody as { startsWith?: SectionCandidate['startsWith'] }).startsWith = {
          event: 'separation',
          sts: bodyCp.values,
          evidence: bodyCp.evidence,
        };
        notes.push('body startsWith seeded from the split-point body-sts checkpoint');
      }
      continue;
    }

    const starts = resolveStart(cand, candidates[i - 1], sleeveRunStart, notes);
    if (cand.id === 'sleeve' && starts && !sleeveRunStart) sleeveRunStart = starts;
    const ends = resolveEndsAt(cand, n, nextIsSplit(candidates, i));

    const events: ShapingEvent[] = [];
    for (const ev of cand.events) {
      // NOTE: identical-looking brackets on consecutive rounds are DISTINCT
      // events (each applies per repeat — the printed phase totals prove it,
      // e.g. Flax rounds 3 AND 4 each "[8 sts inc]"). Never deduplicate.
      const perSide = perSideArray(ev, n, notes, cand.label);
      if (!perSide) continue;
      events.push({
        type: ev.type,
        location: 'each_side',
        perSideSts: perSide,
        schedule: {
          cadence: 'every',
          intervalRows: align(ev.intervalRows, n),
          times: align(ev.times, n),
        },
        src: ev.evidence.slice(0, 120),
      });
      if (ev.times.length < n) {
        notes.push(
          `${cand.label}: repeat applies to the TRAILING ${ev.times.length} size(s) only [conv — "Sizes … only" convention]`,
        );
      }
    }

    const section: Section = {
      id: cand.id,
      piece: cand.id,
      method,
      startsWith: starts ?? { event: 'unparsed', sts: [] },
      endsAt: ends ?? { event: 'unparsed' }, // no sts → Σ reconciliation skipped
      events,
      src: `header "${cand.label}"`,
    };
    // First length statement in the block ("until body measures N (…)”"),
    // aligned to sizeCount via the trailing-sizes convention.
    if (cand.lengthIn && cand.lengthIn.length > 1) {
      const vals = cand.lengthIn.map(toIn);
      section.length = { in: vals.length === n ? vals : padTrailing(vals, n) };
    }
    sections.push(section);
  }
  return { sections, notes };
}

function nextIsSplit(candidates: SectionCandidate[], i: number): boolean {
  return candidates[i + 1]?.label.toLowerCase() === SPLIT_POINT_LABEL;
}

function resolveStart(
  cand: SectionCandidate,
  prev: SectionCandidate | undefined,
  sleeveRunStart: Section['startsWith'] | undefined,
  notes: string[],
): Section['startsWith'] | undefined {
  if (cand.startsWith) {
    const pickupNoise =
      cand.id === 'sleeve' &&
      cand.startsWith.event === 'pickup' &&
      Math.max(...cand.startsWith.sts) < 12;
    if (!pickupNoise) return { event: cand.startsWith.event, sts: cand.startsWith.sts };
    notes.push(`${cand.label}: cast-on list looks like underarm pickup counts — skipped`);
  }
  // Sleeve variants all start from the same picked-up total as the first variant.
  if (cand.id === 'sleeve' && sleeveRunStart) {
    return { event: sleeveRunStart.event, sts: sleeveRunStart.sts };
  }
  // First sleeve variant: the set-up round's printed total — the last plain
  // count in a block with no shaping events (variants with events carry instead).
  if (cand.id === 'sleeve' && cand.events.length === 0) {
    const cp = cand.checkpoints
      .filter((c) => c.role === 'plain_sts' || c.role === 'total')
      .at(-1);
    if (cp) return { event: 'pickup', sts: cp.values };
  }
  // General continuation: yoke etc. start where the previous section ended.
  if (prev?.endsAt) {
    return { event: 'carry_from_previous', sts: prev.endsAt.sts };
  }
  return undefined;
}

/** Section end = the pattern's own "total sts" checkpoints, merged per size. */
function resolveEndsAt(
  cand: SectionCandidate,
  n: number,
  nextIsSplitPoint: boolean,
): Section['endsAt'] | undefined {
  const totals = cand.checkpoints.filter((c) => c.role === 'total' && c.values.length > 1);
  let values: number[] | undefined;
  if (totals.length > 0) {
    values = Array.from({ length: n }, () => 0);
    for (const t of totals) {
      if (t.values.length === n) {
        for (let k = 0; k < n; k++) values[k] = t.values[k]!;
      } else {
        for (let k = 0; k < t.values.length; k++) values[n - t.values.length + k] = t.values[k]!;
      }
    }
    if (values.some((v) => v === 0)) values = undefined;
  }
  if (!values) {
    const full = cand.checkpoints.filter((c) => c.values.length === n);
    const cp = (full.length ? full : cand.checkpoints).at(-1);
    if (!cp) return undefined;
    values = cp.values;
  }
  return {
    event: nextIsSplitPoint ? 'separation' : cand.id === 'yoke' ? 'separation' : 'bind_off',
    sts: values,
  };
}

/** Per-side stitch array for one candidate event; null → skip with a note. */
function perSideArray(
  ev: CandidateEvent,
  n: number,
  notes: string[],
  sectionLabel: string,
): number[] | null {
  const deltas = ev.deltaPerSize ?? Array.from({ length: n }, () => ev.deltaPerRound);
  const out: number[] = [];
  for (const d of deltas) {
    if (d % 2 !== 0) {
      notes.push(`${sectionLabel}: odd per-round delta ${d} dropped (cannot split per side) — review`);
      return null;
    }
    out.push(d / 2);
  }
  return out.length === n ? out : padTrailing(out, n);
}

/** Times/interval arrays: full-length as-is; shorter (TCK "Sizes … only") → trailing sizes. */
function align(values: number[] | undefined, n: number): number[] {
  if (!values) return Array.from({ length: n }, () => 0);
  if (values.length === n) return values;
  if (values.length < n) return padTrailing(values, n);
  return values.slice(0, n);
}

/** [a, b] with sizeCount 4 → [0, 0, a, b] (the convention: sub-lists are trailing sizes). */
function padTrailing(values: number[], n: number): number[] {
  const out = Array.from({ length: n }, () => 0);
  for (let k = 0; k < values.length; k++) out[n - values.length + k] = values[k] ?? 0;
  return out;
}
