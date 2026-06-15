import type { PostEffect } from '../../types/PostEffect';
import { compileShader, createProgram } from '../../utils/Utilities';
import {
    POST_VERTEX_SHADER, BLOOM_BRIGHT_SHADER,
    BLOOM_BLUR_SHADER, BLOOM_COMPOSITE_SHADER
} from '../shaders';
import { BLOOM_THRESHOLD, BLOOM_INTENSITY } from '../../constants/Output';

export class BloomEffect implements PostEffect {
    readonly name = 'bloom';
    readonly order = 10;
    enabled = true;

    private gl: WebGL2RenderingContext | null = null;

    // Programs
    private brightProgram: WebGLProgram | null = null;
    private blurProgram: WebGLProgram | null = null;
    private compositeProgram: WebGLProgram | null = null;

    // FBOs internos (para sub-passes do bloom)
    private brightFBO: WebGLFramebuffer | null = null;
    private brightTex: WebGLTexture | null = null;
    private blurFBO_A: WebGLFramebuffer | null = null;
    private blurTex_A: WebGLTexture | null = null;
    private blurFBO_B: WebGLFramebuffer | null = null;
    private blurTex_B: WebGLTexture | null = null;

    // Uniform locations
    private uBright_SceneTex: WebGLUniformLocation | null = null;
    private uBright_Threshold: WebGLUniformLocation | null = null;
    private uBlur_InputTex: WebGLUniformLocation | null = null;
    private uBlur_Direction: WebGLUniformLocation | null = null;
    private uComp_SceneTex: WebGLUniformLocation | null = null;
    private uComp_BloomTex: WebGLUniformLocation | null = null;
    private uComp_Intensity: WebGLUniformLocation | null = null;

    private width = 0;
    private height = 0;

    init(gl: WebGL2RenderingContext, width: number, height: number): void {
        this.gl = gl;

        this.width = width;
        this.height = height;

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

        gl.deleteShader(vs);

        // --- Create internal FBOs ---
        const a = this.createInternalFBO(gl, width, height);
        this.brightFBO = a.fbo;  // Reusado como blurV output também
        this.brightTex = a.texture;

        const b = this.createInternalFBO(gl, width, height);
        this.blurFBO_A = b.fbo;
        this.blurTex_A = b.texture;

        const c = this.createInternalFBO(gl, width, height);
        this.blurFBO_B = c.fbo;
        this.blurTex_B = c.texture;

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
        gl.uniform1i(this.uBright_SceneTex, 0);
        gl.uniform1f(this.uBright_Threshold, BLOOM_THRESHOLD);

        gl.useProgram(this.blurProgram);
        gl.uniform1i(this.uBlur_InputTex, 0);

        gl.useProgram(this.compositeProgram);
        gl.uniform1i(this.uComp_SceneTex, 0);
        gl.uniform1i(this.uComp_BloomTex, 1);
        gl.uniform1f(this.uComp_Intensity, BLOOM_INTENSITY);
    }

    /**
     * Executa bloom: bright extract → blur H → blur V → composite.
     * inputTex = cena renderizada, outputFBO = destino (null = tela).
     */
    render(
        gl: WebGL2RenderingContext,
        inputTex: WebGLTexture,
        outputFBO: WebGLFramebuffer | null,
        _vao: WebGLVertexArrayObject
    ): void {
        // Pass 1: Bright extract (inputTex → blurFBO_A)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO_A);
        gl.useProgram(this.brightProgram!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 2: Blur horizontal (blurTex_A → blurFBO_B)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO_B);
        gl.useProgram(this.blurProgram!);
        gl.uniform2f(this.uBlur_Direction, 1.0 / this.width, 0.0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTex_A);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 3: Blur vertical (blurTex_B → blurFBO_A)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO_A);
        gl.uniform2f(this.uBlur_Direction, 0.0, 1.0 / this.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTex_B);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Pass 4: Composite (inputTex + blurTex_A → outputFBO)
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO);
        gl.useProgram(this.compositeProgram!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTex_A);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    setParams(params: Record<string, number>): void {
        const gl = this.gl;

        if (!gl) return;

        if ('threshold' in params && this.brightProgram) {
            gl.useProgram(this.brightProgram);
            gl.uniform1f(this.uBright_Threshold, params.threshold);
        }

        if ('intensity' in params && this.compositeProgram) {
            gl.useProgram(this.compositeProgram);
            gl.uniform1f(this.uComp_Intensity, params.intensity);
        }

    }

    destroy(gl: WebGL2RenderingContext): void {
        gl.deleteProgram(this.brightProgram);
        gl.deleteProgram(this.blurProgram);
        gl.deleteProgram(this.compositeProgram);
        gl.deleteFramebuffer(this.brightFBO);
        gl.deleteFramebuffer(this.blurFBO_A);
        gl.deleteFramebuffer(this.blurFBO_B);
        gl.deleteTexture(this.brightTex);
        gl.deleteTexture(this.blurTex_A);
        gl.deleteTexture(this.blurTex_B);
    }

    private createInternalFBO(
        gl: WebGL2RenderingContext,
        width: number,
        height: number
    ): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
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
}
