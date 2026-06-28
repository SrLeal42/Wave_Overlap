import type { WFCRenderer } from "../webgl/renderer";

export interface GifExportOptions {
    renderer: WFCRenderer;
    source: Uint8Array | Uint16Array;
    width: number;
    height: number;
    onProgress?: (percent: number) => void;
}
