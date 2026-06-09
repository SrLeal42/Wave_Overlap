import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders';
import { compileShader, createProgram, createBitmaskTexture, hexToNormalizedRGBA } from '../utils/Utilities';
import type { PaletteColor } from '../types/Grid';
import { RenderMode } from '../constants/Output';

export class WFCRenderer {

    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private maskTexture: WebGLTexture;

    // Uniform locations
    private uMaskTex: WebGLUniformLocation;
    private uPalette: WebGLUniformLocation;
    private uNumColors: WebGLUniformLocation;
    private uMode: WebGLUniformLocation;
    private uTime: WebGLUniformLocation;
    private uGridSize: WebGLUniformLocation;

    private gridW: number;
    private gridH: number;
    private startTime: number;
    private destroyed = false;

    constructor(
        canvas: HTMLCanvasElement,
        gridW: number,
        gridH: number,
        palette: PaletteColor[]
    ) {
        this.gridW = gridW;
        this.gridH = gridH;
        this.startTime = performance.now() / 1000;

        // 1. Contexto WebGL2
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            premultipliedAlpha: false,
        });

        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        // 2. Compila shaders e cria program
        const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        this.program = createProgram(gl, vs, fs);

        // Shaders já linkados — podem ser deletados
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        // 3. VAO vazio (vertex shader usa gl_VertexID, sem attributes)
        const vao = gl.createVertexArray();
        if (!vao) throw new Error('Failed to create VAO');
        this.vao = vao;

        // 4. Textura do bitmask
        this.maskTexture = createBitmaskTexture(gl, gridW, gridH);

        // 5. Busca uniform locations
        this.uMaskTex = this.getUniform('uMaskTex');
        this.uPalette = this.getUniform('uPalette');
        this.uNumColors = this.getUniform('uNumColors');
        this.uMode = this.getUniform('uMode');
        this.uTime = this.getUniform('uTime');
        this.uGridSize = this.getUniform('uGridSize');

        // 6. Seta uniforms iniciais
        gl.useProgram(this.program);

        // Textura no slot 0
        gl.uniform1i(this.uMaskTex, 0);

        // Grid size
        gl.uniform2f(this.uGridSize, gridW, gridH);

        // Modo inicial
        gl.uniform1i(this.uMode, 0);

        // Tempo inicial
        gl.uniform1f(this.uTime, 0.0);

        // Palette
        this.updatePalette(palette);

        // Viewport
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    private getUniform(name: string): WebGLUniformLocation {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc === null) {
            console.warn(`[WFCRenderer] Uniform '${name}' not found (may be optimized out)`);
        }
        return loc!;
    }

    /**
     * Atualiza a paleta de cores nos uniforms.
     * Chamado quando a paleta muda.
     */
    updatePalette(palette: PaletteColor[]): void {
        const gl = this.gl;
        gl.useProgram(this.program);

        // Converte para flat array [r,g,b,a, r,g,b,a, ...]
        const MAX_COLORS = 32;
        const data = new Float32Array(MAX_COLORS * 4);

        for (let i = 0; i < Math.min(palette.length, MAX_COLORS); i++) {
            const [r, g, b, a] = hexToNormalizedRGBA(palette[i].hex);
            data[i * 4 + 0] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
            data[i * 4 + 3] = a;
        }

        gl.uniform4fv(this.uPalette, data);
        gl.uniform1i(this.uNumColors, palette.length);
    }

    /**
     * Troca o modo visual.
     * 0 = RGB average, 1 = OKLab blend, 2 = Bayer dither, 3 = Animated
     */
    setMode(mode: RenderMode): void {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform1i(this.uMode, mode);
    }

    /**
     * Renderiza um frame.
     * Chamado a cada rAF — faz upload do bitmask SAB como textura e desenha.
     */
    render(sabView: Uint8Array | Uint16Array): void {
        if (this.destroyed) return;

        const gl = this.gl;

        // 1. Upload bitmask para a textura
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,              // mip level
            0, 0,           // offset
            this.gridW,
            this.gridH,
            gl.RED_INTEGER, // format
            gl.UNSIGNED_SHORT,
            sabView
        );

        // 2. Atualiza tempo (para modo animado)
        gl.useProgram(this.program);
        const elapsed = performance.now() / 1000 - this.startTime;
        gl.uniform1f(this.uTime, elapsed);

        // 3. Draw fullscreen quad
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Libera todos os recursos WebGL.
     */
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;

        const gl = this.gl;
        gl.deleteTexture(this.maskTexture);
        gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.program);
    }
}
