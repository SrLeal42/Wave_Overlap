import type { PostEffect } from '../../types/PostEffect';
import { compileShader, createProgram } from '../../utils/Utilities';
import { POST_VERTEX_SHADER, SCANLINE_SHADER } from '../shaders';

export class ScanlineEffect implements PostEffect {
    readonly name = 'scanlines';
    readonly order = 20;
    enabled = false;

    private gl: WebGL2RenderingContext | null = null;

    private program: WebGLProgram | null = null;
    private uInputTex: WebGLUniformLocation | null = null;
    private uLineCount: WebGLUniformLocation | null = null;
    private uOpacity: WebGLUniformLocation | null = null;
    private uTime: WebGLUniformLocation | null = null;
    private uSpeed: WebGLUniformLocation | null = null;

    private startTime = 0;

    init(gl: WebGL2RenderingContext, _width: number, _height: number): void {

        this.gl = gl;
        this.startTime = performance.now() / 1000;

        const vs = compileShader(gl, gl.VERTEX_SHADER, POST_VERTEX_SHADER);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, SCANLINE_SHADER);
        this.program = createProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uInputTex = gl.getUniformLocation(this.program, 'uInputTex');
        this.uLineCount = gl.getUniformLocation(this.program, 'uLineCount');
        this.uOpacity = gl.getUniformLocation(this.program, 'uOpacity');
        this.uTime = gl.getUniformLocation(this.program, 'uTime');
        this.uSpeed = gl.getUniformLocation(this.program, 'uSpeed');

        // Defaults
        gl.useProgram(this.program);
        gl.uniform1i(this.uInputTex, 0);
        gl.uniform1f(this.uLineCount, 48.0);
        gl.uniform1f(this.uOpacity, 0.3);
        gl.uniform1f(this.uTime, 0.0);
        gl.uniform1f(this.uSpeed, 3.0);
    }

    render(
        gl: WebGL2RenderingContext,
        inputTex: WebGLTexture,
        outputFBO: WebGLFramebuffer | null,
        _vao: WebGLVertexArrayObject
    ): void {
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputFBO);
        gl.useProgram(this.program!);

        // Atualiza tempo a cada frame
        const elapsed = performance.now() / 1000 - this.startTime;
        gl.uniform1f(this.uTime, elapsed);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    setParams(params: Record<string, number>): void {
        const gl = this.gl;

        if (!gl || !this.program) return;

        gl.useProgram(this.program);

        if ('lineCount' in params) {
            gl.uniform1f(this.uLineCount, params.lineCount);
        }

        if ('opacity' in params) {
            gl.uniform1f(this.uOpacity, params.opacity);
        }

        if ('speed' in params) {
            gl.uniform1f(this.uSpeed, params.speed);
        }

    }

    destroy(gl: WebGL2RenderingContext): void {
        gl.deleteProgram(this.program);
    }

}
