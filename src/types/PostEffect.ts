

export interface PostEffect {
    readonly name: string;
    readonly order: number;
    enabled: boolean;

    init(gl: WebGL2RenderingContext, width: number, height: number): void;

    render(
        gl: WebGL2RenderingContext,
        inputTex: WebGLTexture,
        outputFBO: WebGLFramebuffer | null,
        vao: WebGLVertexArrayObject
    ): void;

    setParams(params: Record<string, number>): void;

    destroy(gl: WebGL2RenderingContext): void;
}
