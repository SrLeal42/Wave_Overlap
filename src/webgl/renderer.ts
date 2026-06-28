import { VERTEX_SHADER, FRAGMENT_SHADER } from './shaders';

import { compileShader, createProgram, createBitmaskTexture, hexToNormalizedRGBA } from '../utils/Utilities';

import type { PaletteColor } from '../types/Grid';
import type { PostEffect } from '../types/PostEffect';

import { DEFAULT_FX_PARAMS, RenderMode, ColorEffect, NUM_COLOR_EFFECTS } from '../constants/Output';

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

    // === Camada 3: Post-Processing Pipeline ===
    private postEffects: PostEffect[] = [];
    private sceneFBO: WebGLFramebuffer | null = null;
    private sceneTex: WebGLTexture | null = null;
    private pingPongFBOs: [WebGLFramebuffer, WebGLFramebuffer] | null = null;
    private pingPongTexs: [WebGLTexture, WebGLTexture] | null = null;


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

        // Camada 2: inicializa color effects como None
        const noEffects = new Int32Array(32);
        gl.uniform1iv(gl.getUniformLocation(this.program, 'uColorEffect'), noEffects);

        // Camada 2: inicializa parâmetros default dos efeitos
        this.setEffectParams(DEFAULT_FX_PARAMS);

        // Viewport
        gl.viewport(0, 0, canvas.width, canvas.height);

        // Camada 3: FBOs para post-processing
        this.initPostProcessingFBOs(canvas.width, canvas.height);
    }

    public getContext(): WebGL2RenderingContext {
        return this.gl;
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


    // ========================================
    // Camada 3: Post-Processing Pipeline
    // ========================================

    /**
     * Cria um FBO com textura RGBA8 para post-processing.
     */
    private createFBO(width: number, height: number): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
        const gl = this.gl;

        const texture = gl.createTexture();
        if (!texture) throw new Error('Failed to create FBO texture');

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
        if (!fbo) throw new Error('Failed to create FBO');

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, texture, 0
        );

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`FBO incomplete: 0x${status.toString(16)}`);
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        return { fbo, texture };
    }

    private initPostProcessingFBOs(width: number, height: number): void {
        const scene = this.createFBO(width, height);
        this.sceneFBO = scene.fbo;
        this.sceneTex = scene.texture;

        const a = this.createFBO(width, height);
        const b = this.createFBO(width, height);
        this.pingPongFBOs = [a.fbo, b.fbo];
        this.pingPongTexs = [a.texture, b.texture];
    }

    /**
     * Registra um PostEffect no pipeline.
     * Efeitos são ordenados por `order` (menor executa primeiro).
     */
    addPostEffect(effect: PostEffect): void {
        effect.init(this.gl, this.gridW, this.gridH);
        this.postEffects.push(effect);
        this.postEffects.sort((a, b) => a.order - b.order);
    }


    // ========================================
    // Render
    // ========================================

    /**
     * Renderiza um frame.
     * Chamado a cada rAF — faz upload do bitmask SAB como textura e desenha.
     */
    render(sabView: Uint8Array | Uint16Array, overrideTime?: number): void {

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
        // 2. Atualiza tempo (para modo animado + per-color effects)
        gl.useProgram(this.program);
        const elapsed = overrideTime !== undefined
            ? overrideTime
            : (performance.now() / 1000 - this.startTime);
        gl.uniform1f(this.uTime, elapsed);

        // 3. Determina se há post-effects ativos
        const activeEffects = this.postEffects.filter(e => e.enabled);

        if (activeEffects.length > 0) {
            // --- Render para sceneFBO ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
            gl.bindVertexArray(this.vao);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // --- Pipeline de post-processing (ping-pong) ---
            let currentInput = this.sceneTex!;

            for (let i = 0; i < activeEffects.length; i++) {
                const isLast = i === activeEffects.length - 1;
                const outputFBO = isLast ? null : this.pingPongFBOs![i % 2];

                activeEffects[i].render(gl, currentInput, outputFBO, this.vao);

                if (!isLast) {
                    currentInput = this.pingPongTexs![i % 2];
                }
            }
        } else {
            // --- Sem post-processing: direto na tela (zero overhead) ---
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

        // Post-processing cleanup
        for (const effect of this.postEffects) {
            effect.destroy(gl);
        }
        gl.deleteFramebuffer(this.sceneFBO);
        gl.deleteTexture(this.sceneTex);
        if (this.pingPongFBOs) {
            gl.deleteFramebuffer(this.pingPongFBOs[0]);
            gl.deleteFramebuffer(this.pingPongFBOs[1]);
        }
        if (this.pingPongTexs) {
            gl.deleteTexture(this.pingPongTexs[0]);
            gl.deleteTexture(this.pingPongTexs[1]);
        }
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
     * Seta todos os efeitos per-color de uma vez.
     */
    setAllColorEffects(effects: ColorEffect[]): void {
        const gl = this.gl;
        gl.useProgram(this.program);

        const data = new Int32Array(32);

        for (let i = 0; i < Math.min(effects.length, 32); i++) {
            data[i] = effects[i];
        }

        gl.uniform1iv(gl.getUniformLocation(this.program, 'uColorEffect'), data);
    }

    /**
     * Toggle de um post-effect por nome.
     */
    setPostEffectEnabled(name: string, enabled: boolean): void {
        const effect = this.postEffects.find(e => e.name === name);

        if (effect) effect.enabled = enabled;
    }

    /**
     * Atualiza parâmetros de um post-effect.
     */
    setPostEffectParams(name: string, params: Record<string, number>): void {
        const effect = this.postEffects.find(e => e.name === name);
        if (effect) effect.setParams(params);
    }


    /**
    * Seta os parâmetros dos efeitos per-color.
    * Recebe um mapa de ColorEffect → {speed, param1, param2, param3}.
    * Converte para o uniform vec4 uFxParams[].
    */
    setEffectParams(params: Record<number, { speed: number; param1: number; param2: number; param3: number }>): void {
        const gl = this.gl;

        gl.useProgram(this.program);

        // NUM_COLOR_EFFECTS × 4 floats = 20 floats
        const data = new Float32Array(NUM_COLOR_EFFECTS * 4);

        for (let fx = 1; fx <= NUM_COLOR_EFFECTS; fx++) {
            const p = params[fx];
            if (p) {
                const offset = (fx - 1) * 4;
                data[offset + 0] = p.speed;
                data[offset + 1] = p.param1;
                data[offset + 2] = p.param2;
                data[offset + 3] = p.param3;
            }
        }

        gl.uniform4fv(gl.getUniformLocation(this.program, 'uFxParams'), data);
    }

}
