import type { PostEffect } from '../../types/PostEffect';
import { compileShader, createProgram } from '../../utils/Utilities';
import { POST_VERTEX_SHADER, VIGNETTE_SHADER } from '../shaders';

export class VignetteEffect implements PostEffect {
    readonly name = 'vignette';
    readonly order = 40;
    enabled = false;

    private gl: WebGL2RenderingContext | null = null;

    private program: WebGLProgram | null = null;
    private uInputTex: WebGLUniformLocation | null = null;
    private uRadius: WebGLUniformLocation | null = null;
    private uSoftness: WebGLUniformLocation | null = null;

    init(gl: WebGL2RenderingContext, _width: number, _height: number): void {

        this.gl = gl;

        const vs = compileShader(gl, gl.VERTEX_SHADER, POST_VERTEX_SHADER);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, VIGNETTE_SHADER);
        this.program = createProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uInputTex = gl.getUniformLocation(this.program, 'uInputTex');
        this.uRadius = gl.getUniformLocation(this.program, 'uRadius');
        this.uSoftness = gl.getUniformLocation(this.program, 'uSoftness');

        // Defaults
        gl.useProgram(this.program);
        gl.uniform1i(this.uInputTex, 0);
        gl.uniform1f(this.uRadius, 0.75);
        gl.uniform1f(this.uSoftness, 0.45);
    }

    render(
        gl: WebGL2RenderingContext,
        inputTex: WebGLTexture,
        outputFBO: WebGLFramebuffer | null,
        _vao: WebGLVertexArrayObject
    ): void {
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO);
        gl.useProgram(this.program!);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    setParams(params: Record<string, number>): void {
        const gl = this.gl;

        if (!gl || !this.program) return;

        gl.useProgram(this.program);

        if ('radius' in params) {
            gl.uniform1f(this.uRadius, params.radius);
        }

        if ('softness' in params) {
            gl.uniform1f(this.uSoftness, params.softness);
        }

    }

    destroy(gl: WebGL2RenderingContext): void {
        gl.deleteProgram(this.program);
    }

}
