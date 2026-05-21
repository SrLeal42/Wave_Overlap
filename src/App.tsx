import { useWasm } from './wasm/useWasm';
import { DrawingGrid } from './components/DrawingGrid';
import type { Grid } from './types/Grid';
import './App.css';

function App() {
  const { status } = useWasm();

  const handleGridChange = (grid: Grid) => {
    // Será usado na Fase 3B para enviar o grid ao Go/WASM
    console.log('[App] Grid updated:', grid);
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
    </div>
  );
}

export default App;
