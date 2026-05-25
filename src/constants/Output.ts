import type { PaletteColor } from "../types/Grid";

export interface OutputGridProps {
    /**
     * Buffer de dados para renderizar. Pode ser Uint8Array normal (Fase 1)
     * ou uma view sobre SharedArrayBuffer (Fase 2).
     * Cada byte = índice de cor na paleta, row-major.
     */
    source: Uint8Array | null;
    rows: number;
    cols: number;
    palette: PaletteColor[];
    /** Quando true, re-renderiza continuamente via rAF (Fase 2). */
    live?: boolean;
}
