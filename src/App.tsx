import { useState } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';

import { GRID_COLS, GRID_ROWS, GRID_PATTERN_SIZE } from './constants/Grid';
import type { Grid } from './types/Grid';

import { gridToFlat } from './utils/Utilities';

import './App.css';

function App() {
  const { status } = useWasm();
  const [grid, setGrid] = useState<Grid | null>(null);

  const handleGridChange = (grid: Grid) => {
    setGrid(grid);
    // console.log('[App] Grid updated:', grid);
  };

  const handleGenerate = () => {

    if (!grid || status !== 'ready') return;

    const flat = gridToFlat(grid);

    const json = window.extractPatterns(flat, GRID_ROWS, GRID_COLS, GRID_PATTERN_SIZE);

    if (typeof json === 'object') {
      console.error('[WFC] Extraction error:', json);
      return;
    }

    const result = JSON.parse(json);

    console.log('[WFC] Extraction result:', result);

  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>🌊 Wave Overlap</h1>

      <div style={{ margin: '1rem 0', fontSize: '0.85rem', color: '#999' }}>
        WASM: {status === 'ready' ? '✅' : status === 'loading' ? '⏳' : '❌'}
        {' | '}
        SAB: {typeof SharedArrayBuffer !== 'undefined' ? '✅' : '❌'}
      </div>

      <DrawingGrid
        onGridChange={handleGridChange}
      />

      <button
        className="btn btn-generate"
        onClick={handleGenerate}
        disabled={!grid || status !== 'ready'}
      >
        Generate (WFC)
      </button>

    </div>
  );
}

export default App;
