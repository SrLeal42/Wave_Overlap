import { useState } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';
import { OutputGrid } from './components/OutputGrid';

import { GRID_COLS, GRID_ROWS, GRID_OUT_ROWS, GRID_OUT_COLS, GRID_PATTERN_SIZE, WFC_MAX_RETRIES } from './constants/Grid';
import { DEFAULT_PALETTE } from './constants/Grid';
import { BUILTIN_PRESETS } from './constants/DrawingPreset';
import {
  RenderMode, RENDER_MODES, ColorEffect, COLOR_EFFECT_PRESETS,
  DEFAULT_POST_EFFECTS, type PostEffectConfig, type PostEffectType
} from './constants/Output';

import type { Grid } from './types/Grid';
import type { DrawingPreset } from './types/DrawingPreset';

import { gridToFlat, loadSavedPresets, savePreset, deletePreset, printSavedPresetInterface } from './utils/Utilities';

import './App.css';


function App() {
  const { status, generate, generateLive, cancel } = useWasm();
  const [grid, setGrid] = useState<Grid | null>(null);

  const [output, setOutput] = useState<Uint8Array | Uint16Array | null>(null);

  const [presetGrid, setPresetGrid] = useState<Grid | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [savedPresets, setSavedPresets] = useState<DrawingPreset[]>(() => loadSavedPresets());
  const allPresets = [...BUILTIN_PRESETS, ...savedPresets];

  const [isLive, setIsLive] = useState(false);
  const [symmetry, setSymmetry] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>(1); // OKLab por padrão
  const [colorEffects, setColorEffects] = useState<ColorEffect[]>(
    () => Array(DEFAULT_PALETTE.length).fill(ColorEffect.None)
  );
  const [postEffects, setPostEffects] = useState<PostEffectConfig[]>(DEFAULT_POST_EFFECTS);

  const isUserSaved = savedPresets.some(p => p.id === selectedPresetId);
  const isBuiltIn = BUILTIN_PRESETS.some(p => p.id === selectedPresetId);

  const handleGridChange = (grid: Grid, isUserEdit?: boolean) => {
    setGrid(grid);

    if (isUserEdit) {
      setSelectedPresetId('');
    }

  };

  const handleAction = () => {
    if (isLive) {
      cancel();
    } else {
      handleGenerate();
    }
  };

  const handleGenerate = async () => {

    if (!grid || status !== 'ready') return;

    const flat = gridToFlat(grid);

    // 1. Cria o SharedArrayBuffer e a view
    const bytesPerCell = Math.ceil(DEFAULT_PALETTE.length / 8);
    const sab = new SharedArrayBuffer(GRID_OUT_ROWS * GRID_OUT_COLS * bytesPerCell);
    const view = new Uint16Array(sab);

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

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;

    if (!id) return;  // opção "Custom" selecionada

    setSelectedPresetId(id);

    const preset = allPresets.find(p => p.id === id);
    if (preset) {
      setPresetGrid([...preset.grid.map(r => [...r])]);  // deep copy
    }

  };

  const handleSave = () => {

    if (!grid) return;

    const id = `saved_${Date.now()}`;
    const label = prompt('Nome do desenho:');   // ou um input inline se preferir algo mais polido

    if (!label) return;

    const preset: DrawingPreset = { id, label: `💾 ${label}`, grid };

    printSavedPresetInterface(grid, label);

    savePreset(preset);
    setSavedPresets(loadSavedPresets());  // re-sincroniza o estado

  };

  const handleDelete = () => {

    if (!selectedPresetId) return;

    deletePreset(selectedPresetId);

    setSavedPresets(loadSavedPresets());

    setSelectedPresetId('');
  };

  const toggleColorPreset = (paletteIndex: number, effect: ColorEffect) => {

    setColorEffects(prev => {
      const next = [...prev];
      next[paletteIndex] = next[paletteIndex] === effect ? ColorEffect.None : effect;

      return next;
    });

  };

  const togglePostEffect = (type: PostEffectType) => {

    setPostEffects(prev => prev.map(e =>
      e.type === type ? { ...e, enabled: !e.enabled } : e
    ));

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
        externalGrid={presetGrid}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '0.75rem 0' }}>

        <select onChange={handlePresetChange} value={selectedPresetId}>

          <option value="">Custom Drawing</option>

          <optgroup label="Built-in">
            {BUILTIN_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </optgroup>

          {savedPresets.length > 0 && (
            <optgroup label="Saved">
              {savedPresets.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </optgroup>
          )}

        </select>

        <button className="btn" onClick={handleSave} disabled={!grid || isBuiltIn}>
          💾 Save
        </button>

        {isUserSaved && (
          <button className="btn btn-clear" onClick={handleDelete}>
            🗑️ Delete
          </button>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#ccc' }}>
          <input
            type="checkbox"
            checked={symmetry}
            onChange={(e) => setSymmetry(e.target.checked)}
          />
          Symmetry (D4)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#ccc' }}>
          Construction Visual:
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

        {/* Camada 2: Per-Color Effects */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>

          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>Color Effects:</span>

          {COLOR_EFFECT_PRESETS.map(preset => (
            <label key={`${preset.paletteIndex}-${preset.effect}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: '#ccc' }}>
              <input
                type="checkbox"
                checked={colorEffects[preset.paletteIndex] === preset.effect}
                onChange={() => toggleColorPreset(preset.paletteIndex, preset.effect)}
              />
              {preset.label}
            </label>
          ))}

        </div>

        {/* Camada 3: Post-Processing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

          <span style={{ fontSize: '0.85rem', color: '#ccc' }}>Post-Processing:</span>

          {postEffects.map(fx => (
            <label key={fx.type}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', color: '#ccc' }}>
              <input
                type="checkbox"
                checked={fx.enabled}
                onChange={() => togglePostEffect(fx.type)}
              />
              {fx.type.charAt(0).toUpperCase() + fx.type.slice(1)}
            </label>
          ))}

        </div>



      </div>

      <button
        className={`btn ${isLive ? 'btn-cancel' : 'btn-generate'}`}
        onClick={handleAction}
        disabled={!isLive && (!grid || status !== 'ready')}
        style={{ backgroundColor: isLive ? '#e74c3c' : undefined }}
      >
        {isLive ? '🛑 Cancel Generation' : 'Generate (WFC)'}
      </button>

      <OutputGrid
        source={output}
        rows={GRID_OUT_ROWS}
        cols={GRID_OUT_COLS}
        palette={DEFAULT_PALETTE}
        live={isLive}
        renderMode={renderMode}
        colorEffects={colorEffects}
        postEffects={postEffects}
      />

    </div>
  );
}

export default App;
