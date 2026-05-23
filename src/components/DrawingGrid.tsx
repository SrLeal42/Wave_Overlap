import { useState, useEffect, useCallback, useRef } from 'react';

import type { Grid, DrawingGridProps } from '../types/Grid';
import { DEFAULT_PALETTE, GRID_ROWS, GRID_COLS } from '../constants/Grid';
import { ColorPalette } from './ColorPalette';

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


    const paintCell = useCallback((row: number, col: number) => {

        setGrid(prev => {
            const next = prev.map(r => [...r]);
            next[row][col] = selectedColor;
            return next;
        });

    }, [selectedColor]);


    const handleClear = () => {
        setGrid(createEmptyGrid(rows, cols));
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
                                setIsPainting(true);
                                isPaintingRef.current = true;
                                paintCell(r, c);
                            }}
                            onMouseEnter={() => {
                                if (isPainting) paintCell(r, c);
                            }}
                        />
                    ))
                )}
            </div>

            <div className="drawing-controls">
                <button className="btn btn-clear" onClick={handleClear}>
                    Clear
                </button>
            </div>
        </div>
    );
}
