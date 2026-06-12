import {
    VERTEX_SHADER, FRAGMENT_SHADER, BLOOM_BRIGHT_SHADER,
    BLOOM_BLUR_SHADER, BLOOM_COMPOSITE_SHADER, POST_VERTEX_SHADER
} from './shaders';
import { compileShader, createProgram, createBitmaskTexture, hexToNormalizedRGBA } from '../utils/Utilities';
import type { PaletteColor } from '../types/Grid';
import { RenderMode, BLOOM_THRESHOLD, BLOOM_INTENSITY } from '../constants/Output';

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


    // --- Bloom resources ---
    private bloomEnabled = false;
    // Programs
    private brightProgram: WebGLProgram | null = null;
    private blurProgram: WebGLProgram | null = null;
    private compositeProgram: WebGLProgram | null = null;
    // FBOs + Textures
    private sceneFBO: WebGLFramebuffer | null = null;
    private sceneTex: WebGLTexture | null = null;
    private fboA: WebGLFramebuffer | null = null;
    private texA: WebGLTexture | null = null;
    private fboB: WebGLFramebuffer | null = null;
    private texB: WebGLTexture | null = null;
    // Bloom uniform locations
    private uBright_SceneTex: WebGLUniformLocation | null = null;
    private uBright_Threshold: WebGLUniformLocation | null = null;
    private uBlur_InputTex: WebGLUniformLocation | null = null;
    private uBlur_Direction: WebGLUniformLocation | null = null;
    private uComp_SceneTex: WebGLUniformLocation | null = null;
    private uComp_BloomTex: WebGLUniformLocation | null = null;
    private uComp_Intensity: WebGLUniformLocation | null = null;




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

        // Bloom
        this.initBloomPipeline(canvas.width, canvas.height);
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
    * Cria um FBO com textura RGBA8 para post-processing.
    */
    private createBloomFBO(width: number, height: number): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
        const gl = this.gl;

        const texture = gl.createTexture();
        if (!texture) throw new Error('Failed to create bloom texture');

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA8,
            width, height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer();
        if (!fbo) throw new Error('Failed to create bloom FBO');

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, texture, 0
        );

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`Bloom FBO incomplete: 0x${status.toString(16)}`);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        return { fbo, texture };
    }


    /**
    * Compila shaders de bloom, cria FBOs e busca uniform locations.
    */
    private initBloomPipeline(width: number, height: number): void {
        const gl = this.gl;

        // --- Compile programs ---
        const vs = compileShader(gl, gl.VERTEX_SHADER, POST_VERTEX_SHADER);

        const brightFS = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_BRIGHT_SHADER);
        this.brightProgram = createProgram(gl, vs, brightFS);
        gl.deleteShader(brightFS);

        const blurFS = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_BLUR_SHADER);
        this.blurProgram = createProgram(gl, vs, blurFS);
        gl.deleteShader(blurFS);

        const compFS = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_COMPOSITE_SHADER);
        this.compositeProgram = createProgram(gl, vs, compFS);
        gl.deleteShader(compFS);

        gl.deleteShader(vs); // Shared VS — delete após todos linkarem

        // --- Create FBOs ---
        const scene = this.createBloomFBO(width, height);
        this.sceneFBO = scene.fbo;
        this.sceneTex = scene.texture;

        const a = this.createBloomFBO(width, height);
        this.fboA = a.fbo;
        this.texA = a.texture;

        const b = this.createBloomFBO(width, height);
        this.fboB = b.fbo;
        this.texB = b.texture;

        // --- Uniform locations ---
        this.uBright_SceneTex = gl.getUniformLocation(this.brightProgram, 'uSceneTex');
        this.uBright_Threshold = gl.getUniformLocation(this.brightProgram, 'uThreshold');

        this.uBlur_InputTex = gl.getUniformLocation(this.blurProgram, 'uInputTex');
        this.uBlur_Direction = gl.getUniformLocation(this.blurProgram, 'uDirection');

        this.uComp_SceneTex = gl.getUniformLocation(this.compositeProgram, 'uSceneTex');
        this.uComp_BloomTex = gl.getUniformLocation(this.compositeProgram, 'uBloomTex');
        this.uComp_Intensity = gl.getUniformLocation(this.compositeProgram, 'uIntensity');

        // --- Set static uniforms ---
        gl.useProgram(this.brightProgram);
        gl.uniform1i(this.uBright_SceneTex, 0); // texture unit 0
        gl.uniform1f(this.uBright_Threshold, BLOOM_THRESHOLD);

        gl.useProgram(this.blurProgram);
        gl.uniform1i(this.uBlur_InputTex, 0);

        gl.useProgram(this.compositeProgram);
        gl.uniform1i(this.uComp_SceneTex, 0); // unit 0
        gl.uniform1i(this.uComp_BloomTex, 1); // unit 1
        gl.uniform1f(this.uComp_Intensity, BLOOM_INTENSITY);
    }

    /**
    * Executa os passes de bloom: bright extract → blur H → blur V → composite.
    */
    private renderBloomPasses(): void {
        const gl = this.gl;

        // Pass 1: Bright extract (sceneTex → fboA)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
        gl.useProgram(this.brightProgram!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 2: Blur horizontal (texA → fboB)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
        gl.useProgram(this.blurProgram!);
        gl.uniform2f(this.uBlur_Direction, 1.0 / this.gridW, 0.0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 3: Blur vertical (texB → fboA)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
        gl.uniform2f(this.uBlur_Direction, 0.0, 1.0 / this.gridH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texB);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 4: Composite (sceneTex + texA → tela)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this.compositeProgram!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

        if (this.bloomEnabled) {
            // --- Com bloom: render para sceneFBO ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            // Executa bloom pipeline
            this.renderBloomPasses();
        } else {
            // --- Sem bloom: direto na tela (zero overhead) ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
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
        // Bloom cleanup
        gl.deleteProgram(this.brightProgram);
        gl.deleteProgram(this.blurProgram);
        gl.deleteProgram(this.compositeProgram);
        gl.deleteFramebuffer(this.sceneFBO);
        gl.deleteFramebuffer(this.fboA);
        gl.deleteFramebuffer(this.fboB);
        gl.deleteTexture(this.sceneTex);
        gl.deleteTexture(this.texA);
        gl.deleteTexture(this.texB);
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

    setBloom(enabled: boolean): void {
        this.bloomEnabled = enabled;
    }


}
