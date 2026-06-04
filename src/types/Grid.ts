// Cada célula do grid armazena o índice da cor na paleta
export type CellValue = number;

// Grid é uma matriz 2D: grid[row][col] = índice da cor
export type Grid = CellValue[][];

export type DrawingTool = 'brush' | 'bucket';

// Uma cor na paleta
export interface PaletteColor {
    index: number;
    hex: string;
    label: string;
}

export interface ColorPaletteProps {
    palette: PaletteColor[];
    selectedIndex: number;
    onSelect: (index: number) => void;
}

export interface DrawingGridProps {
    rows?: number;
    cols?: number;
    palette?: PaletteColor[];
    onGridChange?: (grid: Grid) => void;
}


