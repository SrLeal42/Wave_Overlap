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
        gl.R8UI,            // internal format: unsigned int 8-bit, 1 channel
        width,
        height,
        0,
        gl.RED_INTEGER,      // format
        gl.UNSIGNED_BYTE,    // type
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

