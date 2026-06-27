import { useState, useEffect } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';
import { OutputGrid } from './components/OutputGrid';
import { HintTip } from './components/HintTip';

import { GRID_COLS, GRID_ROWS, GRID_OUT_ROWS, GRID_OUT_COLS, GRID_PATTERN_SIZE, WFC_MAX_RETRIES } from './constants/Grid';
import { DEFAULT_PALETTE } from './constants/Grid';
import { BUILTIN_PRESETS } from './constants/DrawingPreset';
import {
  RenderMode, RENDER_MODES, ColorEffect, COLOR_EFFECT_PRESETS,
  DEFAULT_POST_EFFECTS, type PostEffectConfig, type PostEffectType
} from './constants/Output';

import type { Grid } from './types/Grid';
import type { DrawingPreset } from './types/DrawingPreset';

import {
  gridToFlat, loadSavedPresets, savePreset, deletePreset, printSavedPresetInterface,
  cyrb53, generateRandomSeed, encodeShareState, decodeShareState
} from './utils/Utilities';


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

  const [seedText, setSeedText] = useState('');
  const [randomSeedBool, setRandomSeedBool] = useState(false);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveDrawingName, setSaveDrawingName] = useState('');

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);


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

    // Resolve a seed: se vazia, gera uma aleatória e mostra no campo
    let currentSeed = seedText;
    if (!currentSeed || randomSeedBool) {
      currentSeed = generateRandomSeed();
      setSeedText(currentSeed);
    }

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
          seed: cyrb53(currentSeed),
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

    setIsSaveModalOpen(true);
    setSaveDrawingName('');

  };

  const handleConfirmSave = () => {

    if (!grid || !saveDrawingName.trim()) return;

    const id = `saved_${Date.now()}`;
    const label = saveDrawingName.trim();
    const preset: DrawingPreset = { id, label: `🖫 ${label}`, grid };

    printSavedPresetInterface(grid, label);
    savePreset(preset);
    setSavedPresets(loadSavedPresets());

    setIsSaveModalOpen(false);
    setSaveDrawingName('');

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

  const handleShareLink = async () => {

    if (!grid) return;

    const encoded = await encodeShareState(
      grid, seedText, symmetry, colorEffects, postEffects
    );

    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;

    try {
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      prompt('Copy this URL:', url);
    }

  };


  const togglePostEffect = (type: PostEffectType) => {

    setPostEffects(prev => prev.map(e =>
      e.type === type ? { ...e, enabled: !e.enabled } : e
    ));

  };


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('s');

    if (!encoded) return;

    decodeShareState(encoded, GRID_ROWS, GRID_COLS)
      .then(state => {

        setPresetGrid(state.grid);
        setSeedText(state.seedText);
        setSymmetry(state.symmetry);

        if (state.colorEffects.length > 0) {
          setColorEffects(prev => state.colorEffects.length >= prev.length
            ? state.colorEffects as typeof prev
            : [...state.colorEffects, ...prev.slice(state.colorEffects.length)] as typeof prev
          );
        }

        setPostEffects(prev => prev.map((e, i) => ({
          ...e,
          enabled: state.postEffectsEnabled[i] ?? e.enabled,
        })));

        setSelectedPresetId('');
        // Limpa a URL sem reload
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch(err => console.error('[Share] Failed to decode URL:', err));

  }, []);




  return (
    <div className="app-container">

      {/* LEFT PANEL: Drawing Grid & Basic Tools */}
      <div className="left-panel">


        <DrawingGrid
          onGridChange={handleGridChange}
          externalGrid={presetGrid}
        />

        <div className="preset-controls">

          <select className="sharp-select" onChange={handlePresetChange} value={selectedPresetId}>
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

          <div className="preset-actions">
            <button className="btn-sharp preset-save-btn" onClick={handleSave} disabled={!grid || isBuiltIn}>
              🖫 Save
            </button>
            {isUserSaved && (
              <button className="btn-sharp" onClick={handleDelete} title="Delete">
                ✕
              </button>
            )}
          </div>
        </div>


      </div>


      {/* CENTER PANEL: Modifiers & Generation */}
      <div className="center-panel">

        <div className="share-group">

          <button
            className="btn-sharp btn-share"
            onClick={() => setIsShareModalOpen(true)}
          >
            Share
          </button>

        </div>


        <div className="control-group">
          <span>Seed:</span>

          <input
            type="text"
            className="sharp-input"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="Random"
            spellCheck={false}
            autoComplete="off"
          />

        </div>

        <div className='checkbox-container'>

          <label className="checkbox-label">
            <input type="checkbox" checked={symmetry} onChange={(e) => setSymmetry(e.target.checked)} />
            <span className="checkbox-custom"></span>
            Symmetry (D4)
            <HintTip
              text="Extracts rotated and reflected versions of each pattern, producing results with 4-fold symmetry."
              position="right"
            />
          </label>

          <label className="checkbox-label">
            <input type="checkbox" checked={randomSeedBool} onChange={(e) => setRandomSeedBool(e.target.checked)} />
            <span className="checkbox-custom"></span>
            Random Seed
            <HintTip text="Generates a new random seed on each run." position="right" />
          </label>

        </div>

        <div className="control-group">
          <span>
            Construction Visual:
            <HintTip text="How uncollapsed cells are displayed during generation." position="right" />
          </span>
          <select className="sharp-select" value={renderMode} onChange={(e) => setRenderMode(Number(e.target.value) as RenderMode)}>
            {RENDER_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Camada 2: Per-Color Effects */}
        <details className="custom-dropdown">

          <summary>Color Effects <span>▼</span></summary>

          <div className="dropdown-content">
            {COLOR_EFFECT_PRESETS.map(preset => (
              <label key={`${preset.paletteIndex}-${preset.effect}`} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={colorEffects[preset.paletteIndex] === preset.effect}
                  onChange={() => toggleColorPreset(preset.paletteIndex, preset.effect)}
                />
                <span className="checkbox-custom"></span>
                {preset.label}
              </label>
            ))}
          </div>

        </details>


        {/* Camada 3: Post-Processing */}
        <details className="custom-dropdown">

          <summary>Post-Processing <span>▼</span></summary>

          <div className="dropdown-content">
            {postEffects.map(fx => (
              <label key={fx.type} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={fx.enabled}
                  onChange={() => togglePostEffect(fx.type)}
                />
                <span className="checkbox-custom"></span>
                {fx.type.charAt(0).toUpperCase() + fx.type.slice(1)}
              </label>
            ))}
          </div>

        </details>


        <button
          className={`btn-sharp btn-generate ${isLive ? 'cancel' : ''}`}
          onClick={handleAction}
          disabled={!isLive && (!grid || status !== 'ready')}
        >
          {isLive ? '■ Cancel Generation' : 'Generate (WFC)'}
        </button>

      </div>

      {/* RIGHT PANEL: Output Grid */}
      <div className="right-panel">
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

      {/* Modal de Salvar Desenho */}
      {isSaveModalOpen && (

        <div className="modal-overlay" onClick={() => setIsSaveModalOpen(false)}>

          <div className="modal-content modal-save" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h3>Save Drawing</h3>
              <button className="btn-sharp" onClick={() => setIsSaveModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              <label className="modal-label">Enter a name:</label>
              <input
                type="text"
                className="sharp-input"
                value={saveDrawingName}
                onChange={(e) => setSaveDrawingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmSave(); }}
                placeholder="My Pattern"
                spellCheck={false}
                autoComplete="off"
                autoFocus
              />
              <p className="modal-footnote">
                The drawing will be saved locally and available in the Preset selector.
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="btn-sharp btn-generate"
                onClick={handleConfirmSave}
                disabled={!saveDrawingName.trim()}
              >
                Save
              </button>
              <button className="btn-sharp" onClick={() => setIsSaveModalOpen(false)}>
                Cancel
              </button>
            </div>

          </div>

        </div>

      )}



      {/* Modal de Compartilhamento */}
      {isShareModalOpen && (

        <div className="modal-overlay" onClick={() => setIsShareModalOpen(false)}>

          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h3>Share Options</h3>
              <button className="btn-sharp" onClick={() => setIsShareModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              <button className="btn-sharp" onClick={handleShareLink}>
                {showCopied ? '✓ Copied!' : '⛓ Link'}
              </button>

              <button className="btn-sharp" onClick={() => { /* Futuro: Exportar JPG/GIF */ }}>
                🖼 JPG / GIF
              </button>

              <button className="btn-sharp" onClick={() => { /* Futuro: Exportar JSON */ }}>
                {'{ }'} JSON
              </button>
            </div>

          </div>

        </div>

      )}



    </div>


  );


}

export default App;
