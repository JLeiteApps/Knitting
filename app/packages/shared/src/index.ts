/**
 * Shared contracts: fit profile (Herzog protocol), modification request
 * (specs/intent_grammar.md), modification-sheet document model (D1 diff
 * default), and the validation report (specs pattern_schema §5 / app plan §2).
 */

// ── Fit profile ─────────────────────────────────────────────────────────────

export interface FitProfile {
  id: string;
  label: string;
  /** Herzog §19.1: the single most important measurement — sizes the garment. */
  upperTorsoIn?: number;
  fullBustIn?: number;
  /** Short-row dart math §19.4: hem-to-shoulder over fullest bust (front) vs back. */
  frontHemToShoulderIn?: number;
  backHemToShoulderIn?: number;
  /** Belly variant §19.3: front vs back side-seam-to-side-seam at mid-hip. */
  frontMidHipIn?: number;
  backMidHipIn?: number;
  /** Optional short-row placement measurements. These are required before a
   * short-row event can be emitted as verified. */
  apexToApexIn?: number;
  shortRowStartIn?: number;
  shortRowFinishBeforeArmholeIn?: number;
  /** Display preference only; engine works in inches. */
  displayUnit: 'in' | 'cm';
}

export type Tightness = 'tight' | 'average' | 'loose';
export type EaseTierUser = 'fitted' | 'average' | 'oversized';

// ── Modification request (intent grammar §1–§2) ─────────────────────────────

export type Intent =
  | 'size_ease_selection'
  | 'bust_accommodation'
  | 'body_length_change'
  | 'sleeve_length_change'
  | 'gauge_conversion'
  | 'waist_shape_reposition'
  | 'hip_width_change'
  | 'upper_arm_width_change'
  | 'back_neck_raise';

export type BustMethod = 'auto' | 'vertical_darts' | 'short_rows';

export interface ModificationRequest {
  intent: Intent;
  patternId: string;
  sizeIndex?: number;
  profileId?: string;
  raw: string;
  params:
    | { kind: 'size_ease'; basis?: 'upper_torso' | 'bust'; targetEaseIn?: number; tier?: EaseTierUser }
    | { kind: 'bust'; method?: BustMethod; tightness?: Tightness }
    | { kind: 'body_length'; deltaIn: number }
    | { kind: 'sleeve_length'; deltaIn: number }
    | { kind: 'gauge'; userStsPerIn: number; userRowsPerIn?: number }
    | { kind: 'waist_reposition'; deltaIn: number; landmarkIn: number }
    | { kind: 'hip_width'; deltaIn: number }
    | { kind: 'upper_arm_width'; deltaIn: number }
    | { kind: 'back_neck_raise'; deltaIn: number };
}

// ── Modification sheet (D1: diff-style, references the user's own pattern) ──

export interface SheetStep {
  id: string;
  /** Pattern section this step modifies, when applicable. */
  sectionId?: string;
  title: string;
  /** Diff instruction: "at round X, instead of Y do Z". */
  instruction: string;
  /** The deterministic math behind the step, shown in "show the math". */
  math: string[];
  /** Provenance refs into the user's pattern (pages/rows) and KB sections. */
  refs: string[];
}

export interface ModificationSheet {
  patternId: string;
  intent: Intent;
  sizeIndex: number;
  steps: SheetStep[];
  /** Irreversible operations (steeks/cuts) and unverified factors must appear here. */
  warnings: string[];
  createdAt: string;
}

// ── Validation report (validation gate before a sheet renders) ──────────────

export interface DimensionCheck {
  dimension: string;
  sizeIndex: number;
  targetIn: number;
  recomputedIn: number;
  driftIn: number;
  pass: boolean;
}

export interface SumCheck {
  path: string;
  ok: boolean;
  detail: string;
}

export interface ValidationReport {
  dimensionChecks: DimensionCheck[];
  sumChecks: SumCheck[];
  /** Gate: true only when every check passes (drift < 0.25"/dimension, all Σ exact). */
  pass: boolean;
  /** Truthful evidence state. `pass` is retained for older saved sheets; UI
   * must use this field so empty/advisory checks cannot look verified. */
  status: 'verified' | 'advisory' | 'blocked';
  reasons: string[];
}

export interface ModificationResult {
  modifiedPattern: unknown; // Pattern from @knitting/schema (typed at engine level)
  sheet: ModificationSheet;
  validation: ValidationReport;
}
