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

        for (let i = 0; i < source.length; i++) {

            const color = source ? (lookup[source[i]] ?? fallback) : fallback;

            const offset = i * 4;
            pixels[offset] = color[0];     // R
            pixels[offset + 1] = color[1]; // G
            pixels[offset + 2] = color[2]; // B
            pixels[offset + 3] = color[3]; // A
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
