/**
 * Pattern JSON IR — types implementing specs/pattern_schema.md v0.1.
 * Rule: counts and schedules, never prose. All per-size arrays have length
 * `sizing.sizeCount`. All lengths are inches (float) internally [policy A2].
 */

/** Working method is unknown until the pattern states it or the user confirms it. */
export type WorkingMethod = 'flat' | 'in_the_round' | 'unknown';

export type MeasurementBasis = 'to_fit' | 'finished' | 'unknown';

export interface Sizing {
  /** Size labels exactly as printed, e.g. ["6 mo", "12 mo"] */
  labels: string[];
  /** Convenience: labels.length; every per-size array must match this. */
  sizeCount: number;
  measurementBasis: MeasurementBasis;
  /** Bust or chest circumference per size, inches. The key width axis. */
  bustOrChestIn: number[];
  notes?: string;
}

export interface GaugeBlock {
  primary: boolean;
  /** id into stitchPatterns, or "stockinette" */
  stitchPatternRef: string;
  worked: WorkingMethod;
  /** As printed, e.g. 20 sts over 4" */
  stsOver: number;
  rowsOver: number | null;
  overIn: number;
  /** Normalized floats (per inch); rowsPerIn null when pattern omits row gauge. */
  stsPerIn: number;
  rowsPerIn: number | null;
  raw?: string;
}

export type ConstructionType =
  | 'unknown'
  | 'flat_drop_shoulder'
  | 'flat_set_in'
  | 'flat_raglan'
  | 'flat_saddle'
  | 'steeked_cardigan'
  | 'eps_yoke'
  | 'eps_raglan'
  | 'eps_hybrid'
  | 'kangaroo_cut_armhole'
  | 'top_down_raglan'
  | 'top_down_yoke'
  | 'bottom_up_yoke'
  | 'top_down_set_in'
  | 'contiguous_simultaneous_set_in'
  | 'top_down_saddle'
  | 'dolman_kimono'
  | 'square_set'
  | 'top_down_drop_shoulder'
  | 'modified_drop_shoulder'
  | 'accessory_hat'
  | 'accessory_sock'
  | 'accessory_mitten'
  | 'accessory_glove'
  | 'accessory_scarf'
  | 'accessory_tam';

export interface Construction {
  direction: 'bottom_up' | 'top_down';
  /** Which sections (by id) are worked which way; sections not listed use the garment default. */
  working: Array<{ scope: string; method: WorkingMethod }>;
  type: ConstructionType;
  pieces: string[];
}

export interface SchematicDimension {
  piece: string;
  dimension: string;
  in: number[];
  basis?: 'total' | 'incremental';
  src?: string;
}

export interface StitchPattern {
  id: string;
  name: string;
  stitchRepeat?: number;
  rowRepeat?: number;
  chartRef?: string;
}

export type EventType =
  | 'inc'
  | 'dec'
  | 'bind_off'
  | 'cast_on'
  | 'short_row'
  | 'place_marker'
  | 'divide'
  | 'join'
  | 'steek_plan'
  | 'pickup';

export interface ShapingSchedule {
  cadence: 'every' | 'alternating' | 'at_once' | 'work_to_length';
  /** Per size: rows or rounds between events (per section.method). */
  intervalRows: number[];
  /** Per size: number of times the event repeats. */
  times: number[];
  /** Per size: the N/N+1 interval split (KB §7). Σ(interval×times + variant rows) must cover the span. */
  variantRows?: number[];
  variantTimes?: number[];
}

export interface ShapingEvent {
  type: EventType;
  location: string;
  /** Per size: stitch delta THIS event contributes per side (inc/dec/BO/CO). */
  perSideSts: number[];
  schedule?: ShapingSchedule;
  /** short_row only */
  turnPoints?: number[];
  shortRowMethod?: 'wnt' | 'german' | 'given';
  /** steek_plan only */
  steek?: { sts: number[]; reinforcement: 'machine' | 'crochet' | 'none'; cut: string };
  stitchPatternRef?: string;
  src?: string;
}

export interface Section {
  id: string;
  piece: string;
  method: WorkingMethod;
  startsWith: { event: string; sts: number[] };
  endsAt: { event: string; sts?: number[] };
  /** One of: rows per size, or length in inches per size. */
  length?: { rows?: number[]; in?: number[] };
  stitchPattern?: Array<{ ref: string; exceptCols?: unknown[] }>;
  events: ShapingEvent[];
  src?: string;
}

export interface PatternMeta {
  name: string;
  designer?: string;
  publisher?: string;
  year?: number;
  pdfRef?: string;
  copyrightNote?: string;
  parseDate?: string;
  parserConfidence?: number;
  status?: 'draft' | 'accepted';
  /** Optional identity metadata; current library/backup matching uses meta.name. */
  id?: string;
}

export interface Pattern {
  schemaVersion: '0.1';
  meta: PatternMeta;
  sizing: Sizing;
  gauge: GaugeBlock[];
  construction: Construction;
  schematic: SchematicDimension[];
  stitchPatterns: StitchPattern[];
  sections: Section[];
  finishing?: string;
}
