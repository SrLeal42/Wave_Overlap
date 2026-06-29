import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

import { type OutputGridProps, RenderMode, ANIMATED_POST_EFFECTS } from '../constants/Output';

import { WFCRenderer } from '../webgl/renderer';
import { BloomEffect } from '../webgl/effects/BloomEffect';
import { VignetteEffect } from '../webgl/effects/VignetteEffect';
import { ScanlineEffect } from '../webgl/effects/ScanlineEffect';
import { BarrelEffect } from '../webgl/effects/BarrelEffect';

import '../styles/OutputGrid.css';

export interface OutputGridHandle {
    getRenderer(): WFCRenderer | null;
}

export const OutputGrid = forwardRef<OutputGridHandle, OutputGridProps>(function OutputGrid({
    source,
    rows,
    cols,
    palette,
    live = false,
    renderMode = RenderMode.RGBAverage,
    colorEffects = [],
    postEffects = [],
}, ref) {

    useImperativeHandle(ref, () => ({
        getRenderer: () => rendererRef.current,
    }));

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<WFCRenderer | null>(null);
    const rafIdRef = useRef<number>(0);

    const needsAnimation = live
        || colorEffects.some(e => e !== 0)
        || postEffects.some(e => e.enabled && ANIMATED_POST_EFFECTS.has(e.type));

    // Inicializa o WFCRenderer quando o canvas monta ou grid size muda
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            const renderer = new WFCRenderer(canvas, cols, rows, palette);

            // Registra post-effects
            renderer.addPostEffect(new BloomEffect());
            renderer.addPostEffect(new ScanlineEffect());
            renderer.addPostEffect(new BarrelEffect());
            renderer.addPostEffect(new VignetteEffect());

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

    // Sincroniza color effects (Camada 2)
    useEffect(() => {
        if (colorEffects.length > 0) {
            rendererRef.current?.setAllColorEffects(colorEffects);
        }
    }, [colorEffects]);

    // Sincroniza post-effects (Camada 3)
    useEffect(() => {
        for (const cfg of postEffects) {
            rendererRef.current?.setPostEffectEnabled(cfg.type, cfg.enabled);
            rendererRef.current?.setPostEffectParams(cfg.type, cfg.params);
        }
    }, [postEffects]);


    // Render único quando source muda (não-live)
    useEffect(() => {
        if (source && rendererRef.current) {
            rendererRef.current.render(source);
        }
    }, [source, live, renderMode, colorEffects, postEffects]);

    // rAF loop quando live=true
    useEffect(() => {

        if (!needsAnimation || !source) return;

        const loop = () => {
            rendererRef.current?.render(source);
            rafIdRef.current = requestAnimationFrame(loop);
        };

        rafIdRef.current = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafIdRef.current);

    }, [needsAnimation, source, postEffects]);

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

});
