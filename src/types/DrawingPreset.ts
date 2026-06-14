import type { Grid } from "../types/Grid";

export interface DrawingPreset {
    id: string;
    label: string;
    grid: Grid;  // a mesma Grid (CellValue[][]) que o DrawingGrid usa
}