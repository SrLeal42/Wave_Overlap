import type { Grid, CellValue } from '../types/Grid';
import type { DrawingPreset } from '../types/DrawingPreset';
import type { ColorEffect, PostEffectConfig } from '../constants/Output';
import type { DecodedShareState } from '../types/SharedPayload';
import { STORAGE_KEY } from '../constants/DrawingPreset';

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

// Helper: cria grid a partir de uma string visual
// Cada caracter mapeia para um índice de cor
export function gridFromAscii(art: string, charMap: Record<string, number>): Grid {
    return art.trim().split('\n').map(row =>
        [...row.trim()].map(ch => charMap[ch] ?? 0)
    );
}


export function loadSavedPresets(): DrawingPreset[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function savePreset(preset: DrawingPreset): void {
    const saved = loadSavedPresets();

    // Sobrescreve se já existir com mesmo id
    const idx = saved.findIndex(p => p.id === preset.id);

    if (idx >= 0) saved[idx] = preset;
    else saved.push(preset);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function deletePreset(id: string): void {
    const saved = loadSavedPresets().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}


export function printSavedPresetInterface(grid: Grid, label: string): void {

    const usedColors = [...new Set(grid.flat())].sort((a, b) => a - b);
    const charMap: Record<number, string> = {};
    usedColors.forEach(c => { charMap[c] = c.toString(36); }); // 0-9, a-z
    // const art = grid.map(row => row.map(c => charMap[c]).join('')).join('\n');
    const mapStr = usedColors.map(c => `'${charMap[c]}': ${c}`).join(', ');
    console.log(
        `{
        id: '${label.toLowerCase().replace(/\s+/g, '_')}',
        label: '${label}',
        grid: gridFromAscii(\`
    ${grid.map(row => '        ' + row.map(c => charMap[c]).join('')).join('\n')}
        \`, { ${mapStr} }),
    },`
    );

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

/**
 * Utilitários WebGL2: compilação de shaders, criação de program e texturas.
 */

/**
 * Compila um shader GLSL e retorna o WebGLShader.
 * Lança erro com log detalhado se a compilação falhar.
 */
export function compileShader(
    gl: WebGL2RenderingContext,
    type: GLenum,
    source: string
): WebGLShader {

    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'Unknown error';
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed:\n${log}`);
    }

    return shader;
}

/**
 * Linka vertex + fragment shaders num WebGLProgram.
 * Lança erro com log detalhado se o link falhar.
 */
export function createProgram(
    gl: WebGL2RenderingContext,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader
): WebGLProgram {

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? 'Unknown error';
        gl.deleteProgram(program);
        throw new Error(`Program link failed:\n${log}`);
    }

    return program;
}

/**
 * Cria uma textura R8UI (unsigned integer, 1 byte por texel) para o bitmask.
 * Nearest filtering — sem interpolação.
 */
export function createBitmaskTexture(
    gl: WebGL2RenderingContext,
    width: number,
    height: number
): WebGLTexture {

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Aloca sem dados (preenchido depois via texSubImage2D)
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R16UI,            // internal format: unsigned int 8-bit, 1 channel
        width,
        height,
        0,
        gl.RED_INTEGER,      // format
        gl.UNSIGNED_SHORT,    // type
        null                 // sem dados iniciais
    );

    // Nearest filtering — cada célula é um texel discreto
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
}

/**
 * Converte hex string (#RRGGBB ou #RRGGBBAA) para [R, G, B, A] normalizado (0-1).
 */
export function hexToNormalizedRGBA(hex: string): [number, number, number, number] {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    const a = raw.length >= 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1.0;
    return [r, g, b, a];
}




// ── Seed ──
/**
 * Hash determinístico string → number (53 bits, safe para Number).
 * Usado para converter seed alfanumérica em número para o WASM.
 */
export function cyrb53(str: string, seed: number = 0): number {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;

    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 16), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 16), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Gera seed aleatória alfanumérica (8 chars). */
export function generateRandomSeed(): string {
    return Math.random().toString(36).slice(2, 10);
}


// ── Base64 URL-safe ──
function toBase64Url(bytes: Uint8Array): string {
    const binary = String.fromCharCode(...bytes);
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');

    while (b64.length % 4) b64 += '=';

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

// ── Compression (native CompressionStream) ──
async function compress(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as any]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function decompress(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as any]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}


// ── Grid: nibble-pack (4 bits por célula, 2 células por byte) ──

function packGrid(grid: Grid): Uint8Array {
    const flat = grid.flat();
    const bytes = new Uint8Array(Math.ceil(flat.length / 2));

    for (let i = 0; i < flat.length; i += 2) {
        const hi = flat[i] & 0xF;
        const lo = (i + 1 < flat.length ? flat[i + 1] : 0) & 0xF;
        bytes[i >> 1] = (hi << 4) | lo;
    }

    return bytes;
}

function unpackGrid(bytes: Uint8Array, offset: number, rows: number, cols: number): Grid {
    const total = rows * cols;
    const flat: number[] = [];

    for (let i = 0; i < Math.ceil(total / 2); i++) {
        flat.push((bytes[offset + i] >> 4) & 0xF);
        if (flat.length < total) {
            flat.push(bytes[offset + i] & 0xF);
        }
    }

    const grid: Grid = [];
    for (let r = 0; r < rows; r++) {
        grid.push(flat.slice(r * cols, (r + 1) * cols));
    }

    return grid;
}


// ── Encode / Decode (formato binário v1) ──

export async function encodeShareState(
    grid: Grid,
    seedText: string,
    symmetry: boolean,
    colorEffects: ColorEffect[],
    postEffects: PostEffectConfig[],
): Promise<string> {

    const seedBytes = new TextEncoder().encode(seedText);
    const gridBytes = packGrid(grid);
    const numCE = colorEffects.length;

    // Flags byte: bit0=symmetry, bits 1..N = postEffects[i].enabled
    let flags = symmetry ? 1 : 0;
    postEffects.forEach((e, i) => {
        if (e.enabled) flags |= (1 << (i + 1));
    });

    // Monta buffer binário
    const totalLen = 1 + 1 + 1 + seedBytes.length + 1 + numCE + gridBytes.length;
    const buf = new Uint8Array(totalLen);
    let off = 0;

    buf[off++] = 1;                              // version
    buf[off++] = flags;                          // symmetry + post effects
    buf[off++] = seedBytes.length;               // seed length
    buf.set(seedBytes, off); off += seedBytes.length;  // seed data
    buf[off++] = numCE;                          // num color effects
    for (let i = 0; i < numCE; i++) {
        buf[off++] = colorEffects[i] as number;    // color effect per palette slot
    }
    buf.set(gridBytes, off);                     // nibble-packed grid

    const compressed = await compress(buf);

    return toBase64Url(compressed);
}


export async function decodeShareState(
    encoded: string,
    gridRows: number,
    gridCols: number,
): Promise<DecodedShareState> {

    const compressed = fromBase64Url(encoded);
    const buf = await decompress(compressed);
    let off = 0;

    /*const _version =*/ buf[off++];                // version (1 por agora)
    const flags = buf[off++];                    // flags byte
    const symmetry = (flags & 1) !== 0;

    const seedLen = buf[off++];
    const seedText = new TextDecoder().decode(buf.slice(off, off + seedLen));
    off += seedLen;

    const numCE = buf[off++];
    const colorEffects: number[] = [];
    for (let i = 0; i < numCE; i++) {
        colorEffects.push(buf[off++]);
    }

    // Post effects: flags bits 1..7
    const postEffectsEnabled: boolean[] = [];
    for (let i = 1; i <= 7; i++) {
        postEffectsEnabled.push((flags & (1 << i)) !== 0);
    }

    // Grid nibble-unpack
    const grid = unpackGrid(buf, off, gridRows, gridCols);

    return { grid, seedText, symmetry, colorEffects, postEffectsEnabled };
}








