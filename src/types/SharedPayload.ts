import type { Grid } from "./Grid";

export interface DecodedShareState {
    grid: Grid;
    seedText: string;
    symmetry: boolean;
    colorEffects: number[];
    postEffectsEnabled: boolean[];
}