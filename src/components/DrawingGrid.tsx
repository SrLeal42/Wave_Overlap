import { useState, useEffect, useRef } from 'react';

import type { Grid, DrawingGridProps, DrawingTool } from '../types/Grid';
import { DEFAULT_PALETTE, GRID_ROWS, GRID_COLS } from '../constants/Grid';
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
}: DrawingGridProps) {
    const [grid, setGrid] = useState<Grid>(() => createEmptyGrid(rows, cols));
    const [selectedColor, setSelectedColor] = useState(1);
    const [activeTool, setActiveTool] = useState<DrawingTool>('brush');
    const [isPainting, setIsPainting] = useState(false);

    const isPaintingRef = useRef(false);
    const gridRef = useRef(grid);
    // Mantém a ref sincronizada com o state
    gridRef.current = grid;

    // Libera o "drag painting" quando o mouse é solto em qualquer lugar
    useEffect(() => {

        const handleMouseUp = () => {
            if (isPaintingRef.current) {
                isPaintingRef.current = false;
                setIsPainting(false);
                onGridChange?.(gridRef.current);
            }
        };

        window.addEventListener('mouseup', handleMouseUp);

        return () => window.removeEventListener('mouseup', handleMouseUp);

    }, [onGridChange]);


    const handleClear = () => {
        const empty = createEmptyGrid(rows, cols);
        setGrid(empty);
        onGridChange?.(empty);
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

                                    setIsPainting(true);
                                    isPaintingRef.current = true;
                                    setGrid(prev => brushPaint(prev, r, c, selectedColor));

                                } else if (activeTool === 'bucket') {

                                    const newGrid = bucketFill(gridRef.current, r, c, selectedColor);
                                    setGrid(newGrid);
                                    onGridChange?.(newGrid);  // bucket é instantâneo, já dispara

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

                <div className="tool-selector">
                    <button
                        className={`btn-tool ${activeTool === 'brush' ? 'active' : ''}`}
                        onClick={() => setActiveTool('brush')}
                        title="Pincel"
                    >
                        🖌️
                    </button>
                    <button
                        className={`btn-tool ${activeTool === 'bucket' ? 'active' : ''}`}
                        onClick={() => setActiveTool('bucket')}
                        title="Balde"
                    >
                        🪣
                    </button>
                </div>

            </div>
        </div>
    );
}
