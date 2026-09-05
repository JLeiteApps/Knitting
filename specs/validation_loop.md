# SPEC — Validation Loop (v0.2, reviewed 2026-09-05)

The runtime contract is implemented by `schema/validate.ts` and `engine/apply.ts`.
Validation reports contain `status`, `pass`, `reasons`, dimension checks and Σ checks.

## 1. Two tiers

| Tier | Scope | Result |
|---|---|---|
| `validatePattern` / `validatePatternUnknown` | All sizes: runtime shape, finite numbers, enums, positive gauges, aligned arrays, integer checkpoints, nonnegative events, schedule spans, normalization and Σ | Structural errors prevent acceptance and engine execution. Explicitly incomplete drafts can still be saved through a limited allowlist. |
| `validateAgainstSchematic` | Modified pattern plus requested-size dimensions and optional requested length/width targets | `verified`, `advisory` or `blocked`; only verified output exposes instructions. |

An explicit unknown working method is different from a malformed value. Unknown
methods can remain in drafts, but arbitrary invalid methods cannot enter storage.
Starting checkpoints must be positive; a fully closed section may end at zero.
Optional garment identity is shape-validated here: a present malformed value is
an error, while a valid identity/construction conflict is a recoverable warning.
Workflow eligibility remains a separate shared guard used by capability disclosure
and `applyIntent`, so recoverable unsupported drafts cannot enter sweater math.

## 2. Dimension checks

Chest width is recomputed from starting stitches divided by primary stitch gauge.
Tube counts are full circumference and are halved for a back/front width target.
Body/sleeve requests additionally compare section rows divided by row gauge with
the requested length. Missing rows or row gauge leave that check advisory.
The implemented tolerance is strictly less than 0.25 inches per dimension.

Dimensions without a recompute rule are not silently invented. If no supported
schematic dimension can be recomputed, the report names the limitation. This is
not a complete geometric garment simulation; see the capability registry before
enabling a new modification.

## 3. Stitch reconciliation

For each size, `start + Σevents = end` exactly. Shaping uses per-side stitches,
two sides, and schedule repetitions (including variant repetitions). Short rows
do not change stitch counts, so a passing Σ does not prove their placement.
An empty short-row turn-point representation remains advisory.

## 4. States and rendering

- **Verified**: at least one dimension and one Σ check exist, all implemented
  checks pass, and structural errors/warnings or incomplete-evidence reasons do
  not remain. `pass` is true only in this state.
- **Advisory**: evidence is missing without a failed implemented check. Instructions
  are withheld; the report explains what cannot yet be verified.
- **Blocked**: structural errors, failed Σ or excessive dimensional drift.
  Instructions are withheld.

Input shape and request numbers are validated before calculation; malformed inputs
or unsupported geometry may throw a diagnostic before a sheet is created.
After calculation the runtime also validates the modified IR across sizes.

## 5. Saved history and acceptance coverage

Stored booleans are not proof. Reloaded/restored sheets become advisory until the
request is rerun with current inputs; previously blocked/failed sheets stay blocked.
Original pattern/profile snapshots for automatic historical replay are a follow-up.

Golden families cover top-down raglan, flat set-in and bottom-up yoke. Additional
review cases cover malformed imports, missing targets, nonfinite requests, unknown
methods, short-row geometry and false certification from Σ alone. Real PDF text
extraction and partial draft persistence are distinct from hand-verified golden IR.
