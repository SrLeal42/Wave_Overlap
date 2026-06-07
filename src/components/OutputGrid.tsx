import { useRef, useEffect, useCallback } from 'react';
import type { PaletteColor } from '../types/Grid';
import type { OutputGridProps } from '../constants/Output';

import '../styles/OutputGrid.css';

/**
 * Pré-computa a paleta como array de [R, G, B, A] para lookup O(1).
 * Evita parsing de hex string a cada pixel a cada frame.
 */
function buildRGBALookup(palette: PaletteColor[]): Uint8ClampedArray[] {

    return palette.map(({ hex }) => {

        const raw = hex.replace('#', '');
        const r = parseInt(raw.slice(0, 2), 16);
        const g = parseInt(raw.slice(2, 4), 16);
        const b = parseInt(raw.slice(4, 6), 16);
        const a = raw.length >= 8 ? parseInt(raw.slice(6, 8), 16) : 255;

        return new Uint8ClampedArray([r, g, b, a]);
    });

}

export function OutputGrid({
    source,
    rows,
    cols,
    palette,
    live = false,
}: OutputGridProps) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafIdRef = useRef<number>(0);
    const lookupRef = useRef<Uint8ClampedArray[]>([]);

    // Atualiza lookup quando paleta muda
    useEffect(() => {
        lookupRef.current = buildRGBALookup(palette);
    }, [palette]);

    /**
     * Desenha o conteúdo do source no canvas.
     * Essa função é reutilizável tanto para render único quanto para rAF loop.
     */
    const render = useCallback(() => {

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');

        if (!canvas || !ctx || !source) return;

        const lookup = lookupRef.current;
        const imageData = ctx.createImageData(cols, rows);
        const pixels = imageData.data; // Uint8ClampedArray RGBA

        const fallback = lookup[0] ?? new Uint8ClampedArray([10, 10, 19, 255]);

        const bytesPerCell = Math.ceil(palette.length / 8);

        for (let i = 0; i < rows * cols; i++) {
            const maskOffset = i * bytesPerCell;
            const pixelOffset = i * 4;

            // Decodifica quais cores estão presentes
            const colors: Uint8ClampedArray[] = [];
            for (let c = 0; c < palette.length; c++) {
                const byteIdx = Math.floor(c / 8);
                const bitIdx = c % 8;
                if (source[maskOffset + byteIdx] & (1 << bitIdx)) {
                    colors.push(lookup[c]);
                }
            }

            if (colors.length === 0) {
                // Contradição — fallback
                pixels[pixelOffset] = fallback[0];
                pixels[pixelOffset + 1] = fallback[1];
                pixels[pixelOffset + 2] = fallback[2];
                pixels[pixelOffset + 3] = fallback[3];
            } else if (colors.length === 1) {
                // Colapsada — cor direta
                pixels[pixelOffset] = colors[0][0];
                pixels[pixelOffset + 1] = colors[0][1];
                pixels[pixelOffset + 2] = colors[0][2];
                pixels[pixelOffset + 3] = colors[0][3];
            } else {
                // Não colapsada — média das cores possíveis
                let r = 0, g = 0, b = 0;
                for (const c of colors) {
                    r += c[0]; g += c[1]; b += c[2];
                }
                const n = colors.length;
                pixels[pixelOffset] = r / n;
                pixels[pixelOffset + 1] = g / n;
                pixels[pixelOffset + 2] = b / n;
                pixels[pixelOffset + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }, [source, rows, cols]);

    // Fase 1: render único quando source muda
    useEffect(() => {
        if (!live) {
            render();
        }
    }, [render, live]);

    // Fase 2: rAF loop quando live=true
    useEffect(() => {
        if (!live || !source) return;

        const loop = () => {
            render();
            rafIdRef.current = requestAnimationFrame(loop);
        };

        rafIdRef.current = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafIdRef.current);
    }, [live, source, render]);

    // if (!source) return null;

    return (
        <div className="output-grid-container">
            <canvas
                ref={canvasRef}
                width={cols}
                height={rows}
                className="output-canvas"
            />
        </div>
    );
}
