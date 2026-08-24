/**
 * Standard measurement tables — Craft Yarn Council official values,
 * visually/source verified 2026-08-24 (KB §2). Grade-by-table is the engine's
 * only sanctioned grading mode (A4 recommendation; linear scaling forbidden).
 */

export interface CycSizeRow {
  size: string;
  chest: [number, number];
  crossBack?: [number, number];
  armholeDepth?: [number, number];
  upperArm?: [number, number];
  /** Single value for women/children/youth/baby; a range for men (as printed). */
  backWaistLength?: number | [number, number];
}

export interface CycTable {
  demographic: 'women' | 'men' | 'children' | 'youth' | 'baby';
  rows: CycSizeRow[];
}

/** Women XS–5X [CYC-web; waist row corrected vs earlier snapshots]. */
export const CYC_WOMEN: CycTable = {
  demographic: 'women',
  rows: [
    { size: 'XS', chest: [28, 30], crossBack: [14, 14.5], armholeDepth: [6, 6.5], upperArm: [9.75, 9.75], backWaistLength: 16.5 },
    { size: 'S', chest: [32, 34], crossBack: [14.5, 15], armholeDepth: [6.5, 7], upperArm: [10.25, 10.25], backWaistLength: 17 },
    { size: 'M', chest: [36, 38], crossBack: [15.5, 16], armholeDepth: [7, 7.5], upperArm: [11, 11], backWaistLength: 17.25 },
    { size: 'L', chest: [40, 42], crossBack: [16.5, 17], armholeDepth: [7.5, 8], upperArm: [12, 12], backWaistLength: 17.5 },
    { size: 'XL', chest: [44, 46], crossBack: [17.5, 17.5], armholeDepth: [8, 8.5], upperArm: [13.5, 13.5], backWaistLength: 17.75 },
    { size: '2X', chest: [48, 50], crossBack: [18, 18], armholeDepth: [8.5, 9], upperArm: [15.5, 15.5], backWaistLength: 18 },
    { size: '3X', chest: [52, 54], crossBack: [18, 18], armholeDepth: [9, 9.5], upperArm: [17, 17], backWaistLength: 18 },
    { size: '4X', chest: [56, 58], crossBack: [18.5, 18.5], armholeDepth: [9.5, 10], upperArm: [18.5, 18.5], backWaistLength: 18.5 },
    { size: '5X', chest: [60, 62], crossBack: [18.5, 18.5], armholeDepth: [10, 10.5], upperArm: [18.5, 18.5], backWaistLength: 18.5 },
  ],
};

/** Men S–5X [CYC-web]. */
export const CYC_MEN: CycTable = {
  demographic: 'men',
  rows: [
    { size: 'S', chest: [34, 36], crossBack: [15.5, 16], armholeDepth: [8.5, 9], upperArm: [12, 12], backWaistLength: [23, 24] },
    { size: 'M', chest: [38, 40], crossBack: [16.5, 17], armholeDepth: [9, 9.5], upperArm: [13, 13], backWaistLength: [25, 26] },
    { size: 'L', chest: [42, 44], crossBack: [17.5, 18], armholeDepth: [9.5, 10], upperArm: [15, 15], backWaistLength: [26, 27] },
    { size: 'XL', chest: [46, 48], crossBack: [18, 18.5], armholeDepth: [10, 10.5], upperArm: [15.5, 15.5], backWaistLength: 28 },
    { size: '2X', chest: [50, 52], crossBack: [19, 20], armholeDepth: [11, 11], upperArm: [16.5, 16.5], backWaistLength: 29 },
    { size: '3X', chest: [54, 56], crossBack: [20, 21], armholeDepth: [11.5, 11.5], upperArm: [17.5, 17.5], backWaistLength: 30 },
    { size: '4X', chest: [58, 60], crossBack: [21, 21.5], armholeDepth: [12, 12], upperArm: [18.5, 18.5], backWaistLength: 30 },
    { size: '5X', chest: [62, 64], crossBack: [22, 22.5], armholeDepth: [12.5, 12.5], upperArm: [20, 20], backWaistLength: 31 },
  ],
};

/** Children 2–10 [CYC-web; matches Paden appendix exactly incl. armhole ladder]. */
export const CYC_CHILDREN: CycTable = {
  demographic: 'children',
  rows: [
    { size: '2', chest: [21, 21], crossBack: [9.25, 9.25], armholeDepth: [4.25, 4.25], upperArm: [7, 7], backWaistLength: 8.5 },
    { size: '4', chest: [23, 23], crossBack: [9.75, 9.75], armholeDepth: [4.75, 4.75], upperArm: [7.5, 7.5], backWaistLength: 9.5 },
    { size: '6', chest: [25, 25], crossBack: [10.25, 10.25], armholeDepth: [5, 5], upperArm: [8, 8], backWaistLength: 10.5 },
    { size: '8', chest: [26.5, 26.5], crossBack: [10.75, 10.75], armholeDepth: [5.5, 5.5], upperArm: [8.5, 8.5], backWaistLength: 12.5 },
    { size: '10', chest: [28, 28], crossBack: [11.25, 11.25], armholeDepth: [6, 6], upperArm: [8.75, 8.75], backWaistLength: 14 },
  ],
};

/** Youth 12–16 [CYC-web]. */
export const CYC_YOUTH: CycTable = {
  demographic: 'youth',
  rows: [
    { size: '12', chest: [30, 30], crossBack: [12, 12], armholeDepth: [6.5, 6.5], upperArm: [9, 9], backWaistLength: 15 },
    { size: '14', chest: [31.5, 31.5], crossBack: [12.25, 12.25], armholeDepth: [7, 7], upperArm: [9.25, 9.25], backWaistLength: 15.5 },
    { size: '16', chest: [32.5, 32.5], crossBack: [13, 13], armholeDepth: [7.5, 7.5], upperArm: [9.5, 9.5], backWaistLength: 16 },
  ],
};

/** Baby 3–24 months [CYC-web]. */
export const CYC_BABY: CycTable = {
  demographic: 'baby',
  rows: [
    { size: '3 mo', chest: [16, 16], crossBack: [7.25, 7.25], armholeDepth: [3.25, 3.25], upperArm: [5.5, 5.5], backWaistLength: 6 },
    { size: '6 mo', chest: [17, 17], crossBack: [7.75, 7.75], armholeDepth: [3.5, 3.5], upperArm: [6, 6], backWaistLength: 7 },
    { size: '12 mo', chest: [18, 18], crossBack: [8.25, 8.25], armholeDepth: [3.75, 3.75], upperArm: [6.5, 6.5], backWaistLength: 7.5 },
    { size: '18 mo', chest: [19, 19], crossBack: [8.5, 8.5], armholeDepth: [4, 4], upperArm: [7, 7], backWaistLength: 8 },
    { size: '24 mo', chest: [20, 20], crossBack: [8.75, 8.75], armholeDepth: [4.25, 4.25], upperArm: [7.5, 7.5], backWaistLength: 8.5 },
  ],
};

export const CYC_TABLES: CycTable[] = [
  CYC_WOMEN,
  CYC_MEN,
  CYC_CHILDREN,
  CYC_YOUTH,
  CYC_BABY,
];
