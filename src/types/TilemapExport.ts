export interface TilemapExportData {
    version: number;
    dimensions: { width: number; height: number };
    palette: { index: number; hex: string; label: string }[];
    tilemap: number[];  // flat row-major, -1 = não resolvido
    metadata: {
        seed: string;
        symmetry: boolean;
        patternSize: number;
        inputSize: { rows: number; cols: number };
    };
}
