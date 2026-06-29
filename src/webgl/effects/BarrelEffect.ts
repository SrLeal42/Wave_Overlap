import type { PostEffect } from '../../types/PostEffect';
import { compileShader, createProgram } from '../../utils/Utilities';
import { POST_VERTEX_SHADER, BARREL_SHADER } from '../shaders';

export class BarrelEffect implements PostEffect {
    readonly name = 'barrel';
    readonly order = 30;
    enabled = false;

    private gl: WebGL2RenderingContext | null = null;

    private program: WebGLProgram | null = null;
    private uInputTex: WebGLUniformLocation | null = null;
    private uStrength: WebGLUniformLocation | null = null;
    private uZoom: WebGLUniformLocation | null = null;

    init(gl: WebGL2RenderingContext, _width: number, _height: number): void {

        this.gl = gl;

        const vs = compileShader(gl, gl.VERTEX_SHADER, POST_VERTEX_SHADER);
        const fs = compileShader(gl, gl.FRAGMENT_SHADER, BARREL_SHADER);
        this.program = createProgram(gl, vs, fs);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.uInputTex = gl.getUniformLocation(this.program, 'uInputTex');
        this.uStrength = gl.getUniformLocation(this.program, 'uStrength');
        this.uZoom = gl.getUniformLocation(this.program, 'uZoom');

        // Defaults
        gl.useProgram(this.program);
        gl.uniform1i(this.uInputTex, 0);
        gl.uniform1f(this.uStrength, 0.2);
        gl.uniform1f(this.uZoom, 1.1);
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

        if ('strength' in params) {
            gl.uniform1f(this.uStrength, params.strength);
        }

        if ('zoom' in params) {
            gl.uniform1f(this.uZoom, params.zoom);
        }

    }

    destroy(gl: WebGL2RenderingContext): void {
        gl.deleteProgram(this.program);
    }

}
