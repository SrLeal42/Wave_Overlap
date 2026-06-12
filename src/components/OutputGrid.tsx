import { useRef, useEffect } from 'react';
import { type OutputGridProps, RenderMode } from '../constants/Output';
import { WFCRenderer } from '../webgl/renderer';

import '../styles/OutputGrid.css';

export function OutputGrid({
    source,
    rows,
    cols,
    palette,
    live = false,
    renderMode = RenderMode.RGBAverage,
    bloomEnabled = true,
}: OutputGridProps) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<WFCRenderer | null>(null);
    const rafIdRef = useRef<number>(0);

    // Inicializa o WFCRenderer quando o canvas monta ou grid size muda
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            const renderer = new WFCRenderer(canvas, cols, rows, palette);
            rendererRef.current = renderer;
            console.log('[OutputGrid] WebGL2 renderer initialized');
        } catch (err) {
            console.error('[OutputGrid] Failed to init WebGL2:', err);
        }

        return () => {
            rendererRef.current?.destroy();
            rendererRef.current = null;
        };
    }, [cols, rows]); // Recria se grid size mudar

    // Atualiza paleta quando muda
    useEffect(() => {
        rendererRef.current?.updatePalette(palette);
    }, [palette]);

    // Atualiza modo quando muda
    useEffect(() => {
        rendererRef.current?.setMode(renderMode as RenderMode);
    }, [renderMode]);

    // Atualiza bloom quando muda
    useEffect(() => {
        rendererRef.current?.setBloom(bloomEnabled);
    }, [bloomEnabled]);


    // Render único quando source muda (não-live)
    useEffect(() => {
        if (source && rendererRef.current) {
            rendererRef.current.render(source);
        }
    }, [source, live, renderMode, bloomEnabled]);

    // rAF loop quando live=true
    useEffect(() => {
        if (!live || !source) return;

        const loop = () => {
            rendererRef.current?.render(source);
            rafIdRef.current = requestAnimationFrame(loop);
        };

        rafIdRef.current = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafIdRef.current);
    }, [live, source]);

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
