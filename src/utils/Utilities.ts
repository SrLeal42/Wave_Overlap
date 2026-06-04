import type { Grid, CellValue } from '../types/Grid';

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


/** Pinta uma única célula — já é basicamente o que paintCell faz */
export function brushPaint(grid: Grid, row: number, col: number, color: CellValue): Grid {
    const next = grid.map(r => [...r]);
    next[row][col] = color;
    return next;
}

/** Flood fill clássico (BFS) a partir de (row, col) */
export function bucketFill(grid: Grid, row: number, col: number, fillColor: CellValue): Grid {
    const rows = grid.length;
    const cols = grid[0].length;
    const targetColor = grid[row][col];

    // Sem efeito se a cor alvo já é a cor de preenchimento
    if (targetColor === fillColor) return grid;

    const next = grid.map(r => [...r]);
    const queue: [number, number][] = [[row, col]];

    while (queue.length > 0) {

        const [r, c] = queue.shift()!;

        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        if (next[r][c] !== targetColor) continue;

        next[r][c] = fillColor;
        queue.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    return next;
}
