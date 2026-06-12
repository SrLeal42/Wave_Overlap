import type { PaletteColor } from "../types/Grid";

export interface OutputGridProps {
    /**
     * Buffer de dados para renderizar.
     * Uint8Array sobre SharedArrayBuffer contendo color bitmasks.
     * Cada célula ocupa ceil(numColors/8) bytes.
     */
    source: Uint8Array | Uint16Array | null;
    rows: number;
    cols: number;
    palette: PaletteColor[];
    /** Quando true, re-renderiza continuamente via rAF. */
    live?: boolean;
    /** Modo de visualização para células não-colapsadas. */
    renderMode?: RenderMode;
    bloomEnabled?: boolean;
}

export const BLOOM_THRESHOLD = 0.35;//0.55;
export const BLOOM_INTENSITY = 0.6;

export const RenderMode = {
    RGBAverage: 0,
    OKLab: 1,
    Dithering: 2,
    Animated: 3
} as const;

export type RenderMode = typeof RenderMode[keyof typeof RenderMode];

export const RENDER_MODES: { value: RenderMode; label: string }[] = [
    { value: RenderMode.RGBAverage, label: 'RGB Average' },
    { value: RenderMode.OKLab, label: 'OKLab Blend' },
    { value: RenderMode.Dithering, label: 'Dithering' },
    { value: RenderMode.Animated, label: 'Animated' },
];
