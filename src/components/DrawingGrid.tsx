import { useState, useEffect, useRef } from 'react';

import type { Grid, DrawingGridProps, DrawingTool } from '../types/Grid';
import { DEFAULT_PALETTE, GRID_ROWS, GRID_COLS, MAX_HISTORY } from '../constants/Grid';
import { ColorPalette } from './ColorPalette';

import { brushPaint, bucketFill } from '../utils/Utilities';

import '../styles/DrawingGrid.css';

// Cria um grid vazio preenchido com a cor 0
function createEmptyGrid(rows: number, cols: number): Grid {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
}


export function DrawingGrid({
    rows = GRID_ROWS,
    cols = GRID_COLS,
    palette = DEFAULT_PALETTE,
    onGridChange,
    externalGrid,
}: DrawingGridProps) {
    const [grid, setGrid] = useState<Grid>(() => createEmptyGrid(rows, cols));
    const [selectedColor, setSelectedColor] = useState(1);
    const [activeTool, setActiveTool] = useState<DrawingTool>('brush');
    const [isPainting, setIsPainting] = useState(false);

    const [history, setHistory] = useState<Grid[]>([]);

    const isPaintingRef = useRef(false);
    const gridRef = useRef(grid);
    // Mantém a ref sincronizada com o state
    gridRef.current = grid;

    useEffect(() => {

        if (externalGrid) {
            setHistory([]);
            setGrid(externalGrid);
            onGridChange?.(externalGrid, false);
        }

    }, [externalGrid]);

    // Libera o "drag painting" quando o mouse é solto em qualquer lugar
    useEffect(() => {

        const handleMouseUp = () => {
            if (isPaintingRef.current) {
                isPaintingRef.current = false;
                setIsPainting(false);
                onGridChange?.(gridRef.current, true);
            }
        };

        window.addEventListener('mouseup', handleMouseUp);

        return () => window.removeEventListener('mouseup', handleMouseUp);

    }, [onGridChange]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history]);




    const pushHistory = () => {
        setHistory(prev => {
            const snapshot = gridRef.current.map(row => [...row]); // deep copy
            const next = [...prev, snapshot];
            // Limita o tamanho do history
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
        });
    };



    const handleClear = () => {
        pushHistory();
        const empty = createEmptyGrid(rows, cols);
        setGrid(empty);
        onGridChange?.(empty, true);
    };

    const handleUndo = () => {
        if (history.length === 0) return;

        setHistory(prev => {
            const next = [...prev];
            const restored = next.pop()!;

            setGrid(restored);
            onGridChange?.(restored, true);

            return next;
        });

    };


    return (
        <div className="drawing-container">
            <ColorPalette
                palette={palette}
                selectedIndex={selectedColor}
                onSelect={setSelectedColor}
            />

            <div
                className="drawing-grid"
                style={{
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                }}
                onContextMenu={(e) => e.preventDefault()}
            >
                {grid.flatMap((row, r) =>
                    row.map((cell, c) => (
                        <div
                            key={`${r}-${c}`}
                            className="grid-cell"
                            style={{ backgroundColor: palette[cell].hex }}
                            onMouseDown={(e) => {
                                e.preventDefault();

                                if (activeTool === 'brush') {

                                    pushHistory();
                                    setIsPainting(true);
                                    isPaintingRef.current = true;
                                    setGrid(prev => brushPaint(prev, r, c, selectedColor));

                                } else if (activeTool === 'bucket') {

                                    pushHistory();

                                    const newGrid = bucketFill(gridRef.current, r, c, selectedColor);

                                    setGrid(newGrid);
                                    onGridChange?.(newGrid, true);  // bucket é instantâneo, já dispara

                                }
                            }}
                            onMouseEnter={() => {
                                // Só o brush faz drag-painting
                                if (isPainting && activeTool === 'brush') {
                                    setGrid(prev => brushPaint(prev, r, c, selectedColor));
                                }

                            }}

                        />
                    ))
                )}
            </div>

            <div className="drawing-controls">

                <button className="btn btn-clear" onClick={handleClear}>
                    Clear
                </button>

                <button
                    className="btn btn-undo"
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    title="Undo (Ctrl+Z)"
                >
                    ↶ Undo
                </button>

                <div className="tool-selector">
                    <button
                        className={`btn-tool ${activeTool === 'brush' ? 'active' : ''}`}
                        onClick={() => setActiveTool('brush')}
                        title="Brush"
                    >
                        🖌
                    </button>
                    <button
                        className={`btn-tool ${activeTool === 'bucket' ? 'active' : ''}`}
                        onClick={() => setActiveTool('bucket')}
                        title="Bucket"
                    >
                        ▣
                    </button>
                </div>

            </div>
        </div>
    );
}
