import type { Grid } from '../types/Grid';

/**
 * Achata um Grid 2D para Uint8Array (row-major).
 * Usado para enviar dados ao Go/WASM sem serialização JSON.
 */
export function gridToFlat(grid: Grid): Uint8Array {
    const rows = grid.length;
    const cols = grid[0].length;
    const flat = new Uint8Array(rows * cols);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            flat[r * cols + c] = grid[r][c];
        }
    }

    return flat;
}
