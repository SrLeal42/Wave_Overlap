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
    colorEffects?: ColorEffect[];       // [paletteIdx] → efeito ativo (length=palette.length)
    postEffects?: PostEffectConfig[];    // lista de post-effects com enabled/params
}



// === CAMADA 2: Per-Color Effects ===

export const ColorEffect = {
    None: 0,
    Pulse: 1,
    Rotate: 2,
    Wave: 3,
    Breathe: 4,
    Glitch: 5,
    Stellar: 6,
} as const;
export type ColorEffect = typeof ColorEffect[keyof typeof ColorEffect];

/** Pairing pré-definido: (paletteIndex, efeito, label para UI) */
export interface ColorEffectPreset {
    paletteIndex: number;
    effect: ColorEffect;
    label: string;
}

/**
 * Lista fixa de pairings disponíveis.
 * Cada um aparece como checkbox na UI.
 * Ativar um desativa outros efeitos na mesma cor (radio-button per color).
 */
export const COLOR_EFFECT_PRESETS: ColorEffectPreset[] = [
    { paletteIndex: 0, effect: ColorEffect.Stellar, label: 'Dark Stellar' },
    { paletteIndex: 1, effect: ColorEffect.Pulse, label: 'Red Pulse' },
    { paletteIndex: 2, effect: ColorEffect.Breathe, label: 'Green Breathe' },
    { paletteIndex: 3, effect: ColorEffect.Wave, label: 'Blue Wave' },
    { paletteIndex: 5, effect: ColorEffect.Glitch, label: 'White Glitch' },
    { paletteIndex: 6, effect: ColorEffect.Rotate, label: 'Cyan Rotate' },
    { paletteIndex: 7, effect: ColorEffect.Pulse, label: 'Strong Red Pulse' },
    { paletteIndex: 8, effect: ColorEffect.Wave, label: 'Orange Wave' },
    { paletteIndex: 9, effect: ColorEffect.Breathe, label: 'Yellow Breathe' },
    { paletteIndex: 10, effect: ColorEffect.Glitch, label: 'Pink Glitch' },
];


export const NUM_COLOR_EFFECTS = Math.max(...(Object.values(ColorEffect) as number[]));


/**
 * Parâmetros dos efeitos per-color.
 * Cada efeito recebe um vec4 (até 4 params).
 * Indexado por (ColorEffect - 1), já que None=0 não precisa de params.
 */
export interface EffectParams {
    speed: number;
    param1: number;
    param2: number;
    param3: number;
}


export const DEFAULT_FX_PARAMS: Record<number, EffectParams> = {
    //                        speed   param1        param2         param3
    [ColorEffect.Pulse]: { speed: 2.0, param1: 0.8, param2: 0.3, param3: 0.0 },
    // Pulse: brilho oscila entre param1 e param1+param2 na velocidade speed

    [ColorEffect.Rotate]: { speed: 1.5, param1: 3.0, param2: 1.0, param3: 0.0 },
    // Rotate: speed=velocidade angular, param1=nBraços do moinho, param2=range de hue (1.0=ciclo completo)

    [ColorEffect.Wave]: { speed: 3.0, param1: 0.5, param2: 0.4, param3: 0.15 },
    // Wave: speed=velocidade, param1=freqX, param2=freqY, param3=amplitude

    [ColorEffect.Breathe]: { speed: 1.5, param1: 0.7, param2: 0.3, param3: 0.0 },
    // Breathe: chroma oscila entre param1 e param1+param2 na velocidade speed

    [ColorEffect.Glitch]: { speed: 0.29, param1: .998, param2: 0.0, param3: 0.0 },
    // Glitch: param1=threshold de probabilidade (0.92 = ~8% do tempo)

    [ColorEffect.Stellar]: { speed: 0.3, param1: 0.1, param2: 4.0, param3: 0.0 },
    // Stellar: speed=velocidade de avanço, param1=densidade (0.1~0.5), param2=numCamadas de profundidade
};





// === CAMADA 3: Post-Processing ===


export const BLOOM_THRESHOLD = 0.15;//0.35  0.55;
export const BLOOM_INTENSITY = 0.5;

export const VIGNETTE_RADIUS = 0.95;
export const VIGNETTE_SOFTNESS = 0.65;

export const PostEffectType = {
    Bloom: 'bloom',
    Vignette: 'vignette',
} as const;
export type PostEffectType = typeof PostEffectType[keyof typeof PostEffectType];

export interface PostEffectConfig {
    type: PostEffectType;
    enabled: boolean;
    params: Record<string, number>;
}

export const DEFAULT_POST_EFFECTS: PostEffectConfig[] = [
    { type: 'bloom', enabled: true, params: { threshold: BLOOM_THRESHOLD, intensity: BLOOM_INTENSITY } },
    { type: 'vignette', enabled: false, params: { radius: VIGNETTE_RADIUS, softness: VIGNETTE_SOFTNESS } },
];


export const RenderMode = {
    RGBAverage: 0,
    OKLab: 1,
    Dithering: 2,
    DiagonalAnimated: 3
} as const;

export type RenderMode = typeof RenderMode[keyof typeof RenderMode];

export const RENDER_MODES: { value: RenderMode; label: string }[] = [
    { value: RenderMode.RGBAverage, label: 'RGB Average' },
    { value: RenderMode.OKLab, label: 'OKLab Blend' },
    { value: RenderMode.Dithering, label: 'Dithering' },
    { value: RenderMode.DiagonalAnimated, label: 'Diagonal Animated' },
];
