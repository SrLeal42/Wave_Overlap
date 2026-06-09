import type { PaletteColor } from "../types/Grid";


export const GRID_ROWS = 16;
export const GRID_COLS = 16;
export const GRID_OUT_ROWS = 128;//64;
export const GRID_OUT_COLS = 128;//64;
export const GRID_PATTERN_SIZE = 3;

export const WFC_MAX_RETRIES = 10;

// Paleta padrão — 6 cores suficientes para padrões interessantes com P=3
export const DEFAULT_PALETTE: PaletteColor[] = [
    { index: 0, hex: '#0a0a13ff', label: 'Dark' },
    { index: 1, hex: '#eb5058ff', label: 'Red' },
    { index: 2, hex: '#53d886ff', label: 'Green' },
    { index: 3, hex: '#0e4d9bff', label: 'Blue' },
    { index: 4, hex: '#16213e', label: 'Navy' },
    { index: 5, hex: '#f5f5f5', label: 'White' },
    { index: 6, hex: '#18e4ffff', label: 'Cyan' },
    { index: 7, hex: '#ff0000ff', label: 'Strong Red' },
    { index: 8, hex: '#ffaf1bff', label: 'Orange' },
    { index: 9, hex: '#fffb00ff', label: 'Yellow' },
    { index: 10, hex: '#ff00eaff', label: 'Pink' },
];

