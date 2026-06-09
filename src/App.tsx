import { useState } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';
import { OutputGrid } from './components/OutputGrid';

import { GRID_COLS, GRID_ROWS, GRID_OUT_ROWS, GRID_OUT_COLS, GRID_PATTERN_SIZE, WFC_MAX_RETRIES } from './constants/Grid';
import { DEFAULT_PALETTE } from './constants/Grid';
import type { Grid } from './types/Grid';
import { RenderMode, RENDER_MODES } from './constants/Output';

import { gridToFlat } from './utils/Utilities';

import './App.css';


function App() {
  const { status, generate, generateLive } = useWasm();
  const [grid, setGrid] = useState<Grid | null>(null);

  const [output, setOutput] = useState<Uint8Array | null>(null);

  const [isLive, setIsLive] = useState(false);
  const [symmetry, setSymmetry] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>(1); // OKLab por padrão


  const handleGridChange = (grid: Grid) => {
    setGrid(grid);
  };


  const handleGenerate = async () => {

    if (!grid || status !== 'ready') return;

    const flat = gridToFlat(grid);

    // 1. Cria o SharedArrayBuffer e a view
    const bytesPerCell = Math.ceil(DEFAULT_PALETTE.length / 8);
    const sab = new SharedArrayBuffer(GRID_OUT_ROWS * GRID_OUT_COLS * bytesPerCell);
    const view = new Uint8Array(sab);

    // 2. Passa a view pro OutputGrid e liga o modo live
    setOutput(view);
    setIsLive(true);

    try {
      // 3. Envia pro worker — Go escreve no SAB durante o solve
      await generateLive(
        {
          grid: flat,
          rows: GRID_ROWS,
          cols: GRID_COLS,
          patternSize: GRID_PATTERN_SIZE,
          outW: GRID_OUT_ROWS,
          outH: GRID_OUT_COLS,
          numColors: DEFAULT_PALETTE.length,
          seed: Date.now(),
          maxRetries: WFC_MAX_RETRIES,
          symmetry
        },
        sab
      );
      console.log('[WFC] Live generation complete');

    } catch (err) {
      console.error('[WFC] Error:', err);
    } finally {
      // 4. Desliga o rAF loop (mantém o resultado final visível)
      setIsLive(false);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.75rem 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#ccc' }}>
          <input
            type="checkbox"
            checked={symmetry}
            onChange={(e) => setSymmetry(e.target.checked)}
          />
          Symmetry (D4)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#ccc' }}>
          Visual:
          <select
            value={renderMode}
            onChange={(e) => setRenderMode(Number(e.target.value) as RenderMode)}
            style={{
              background: '#1a1a2e',
              color: '#ccc',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.85rem',
            }}
          >
            {RENDER_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

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
        live={isLive}
        renderMode={renderMode}
      />

    </div>
  );
}

export default App;
