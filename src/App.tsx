import { useState } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';
import { OutputGrid } from './components/OutputGrid';

import { GRID_COLS, GRID_ROWS, GRID_OUT_ROWS, GRID_OUT_COLS, GRID_PATTERN_SIZE, WFC_MAX_RETRIES } from './constants/Grid';
import { DEFAULT_PALETTE } from './constants/Grid';
import type { Grid } from './types/Grid';

import { gridToFlat } from './utils/Utilities';

import './App.css';

function App() {
  const { status, generate } = useWasm();
  const [grid, setGrid] = useState<Grid | null>(null);

  const [output, setOutput] = useState<Uint8Array | null>(null);

  const handleGridChange = (grid: Grid) => {
    setGrid(grid);
    // console.log('[App] Grid updated:', grid);
  };


  const handleGenerate = async () => {

    if (!grid || status !== 'ready') return;

    const flat = gridToFlat(grid);

    try {

      const result = await generate({
        grid: flat,
        rows: GRID_ROWS,
        cols: GRID_COLS,
        patternSize: GRID_PATTERN_SIZE,
        outW: GRID_OUT_ROWS,
        outH: GRID_OUT_COLS,
        seed: Date.now(),
        maxRetries: WFC_MAX_RETRIES,
      });

      console.log('[WFC] Output:', result);
      setOutput(result);

    } catch (err) {
      console.error('[WFC] Error:', err);
    }

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

      <OutputGrid
        source={output}
        rows={GRID_OUT_ROWS}
        cols={GRID_OUT_COLS}
        palette={DEFAULT_PALETTE}
      />

    </div>
  );
}

export default App;
