import { useState, useEffect, useRef } from 'react';
import { useWasm } from './wasm/useWasm';

import { DrawingGrid } from './components/DrawingGrid';
import { OutputGrid, type OutputGridHandle } from './components/OutputGrid';
import { HintTip } from './components/HintTip';

import { GRID_COLS, GRID_ROWS, GRID_OUT_ROWS, GRID_OUT_COLS, GRID_PATTERN_SIZE, WFC_MAX_RETRIES } from './constants/Grid';
import { DEFAULT_PALETTE } from './constants/Grid';
import { BUILTIN_PRESETS } from './constants/DrawingPreset';
import { GIF_DEFAULT_NAME } from './constants/GIFExporter';
import {
  RenderMode, RENDER_MODES, ColorEffect, COLOR_EFFECT_PRESETS,
  DEFAULT_POST_EFFECTS, type PostEffectConfig, type PostEffectType
} from './constants/Output';

import type { Grid } from './types/Grid';
import type { DrawingPreset } from './types/DrawingPreset';

import {
  gridToFlat, loadSavedPresets, savePreset, deletePreset, printSavedPresetInterface,
  cyrb53, generateRandomSeed, encodeShareState, decodeShareState, exportGif, exportTilemap
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

  const [isInfoModalOpen, setIsInfoModalOpen] = useState(() => {
    // Só abre o modal se NÃO houver um link de compartilhamento ('s') na URL
    return !new URLSearchParams(window.location.search).has('s');
  });

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveDrawingName, setSaveDrawingName] = useState('');

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  const outputGridRef = useRef<OutputGridHandle>(null);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);


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

  const handleExportGif = async () => {
    const renderer = outputGridRef.current?.getRenderer();

    if (!renderer || !output) return;

    setIsExportingGif(true);
    setGifProgress(0);

    try {

      const blob = await exportGif({
        renderer,
        source: output,
        width: GRID_OUT_COLS,
        height: GRID_OUT_ROWS,
        onProgress: setGifProgress,
      });

      // Download automático
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = GIF_DEFAULT_NAME;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[GIF] Export failed:', err);
    } finally {
      setIsExportingGif(false);
    }

  };

  const handleExportJson = () => {
    if (!output) return;

    const data = exportTilemap(
      output as Uint16Array,
      GRID_OUT_ROWS,
      GRID_OUT_COLS,
      DEFAULT_PALETTE,
      seedText,
      symmetry,
      GRID_PATTERN_SIZE,
      GRID_ROWS,
      GRID_COLS,
    );

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'wave_overlap.json';
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
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
          ref={outputGridRef}
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

              <button className="btn-sharp" onClick={handleExportGif} disabled={isExportingGif || !output || isLive}>
                {isExportingGif ? `⤓ ${Math.round(gifProgress)}%` : '🖼 GIF'}
              </button>

              <button className="btn-sharp" onClick={handleExportJson} disabled={!output || isLive}>
                {'{ }'} JSON
              </button>
            </div>

          </div>

        </div>

      )}

      {/* Modal de Informações */}
      {isInfoModalOpen && (

        <div className="modal-overlay" onClick={() => setIsInfoModalOpen(false)}>

          <div className="modal-content modal-info" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h3>Wave Overlap</h3>
              <button className="btn-sharp" onClick={() => setIsInfoModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">

              <p>
                Welcome to <strong>Wave Overlap</strong>! This tool lets you generate complex,
                larger images from a simple drawing using the <strong>Wave Function Collapse</strong> algorithm.
              </p>

              <h4>◈ How to use</h4>
              <ul>
                <li><strong>Draw:</strong> Use the left canvas to create a small pattern.</li>
                <li><strong>Configure:</strong> Adjust grid size, colors, or apply symmetry.</li>
                <li><strong>Generate:</strong> Click the play button to watch the algorithm build a new image based on your rules!</li>
              </ul>

              <h4>⟡ Features</h4>
              <ul>
                <li><strong>Live Preview</strong> — Watch the generation unfold in real time.</li>
                <li><strong>Share & Export</strong> — Save as GIF, share a link, or export to JSON.</li>
              </ul>

              <p style={{ fontSize: '0.75rem', color: '#283b2b', marginTop: '1rem' }}>
                Built with React 19 · Go · WebAssembly · WebGL2 <br />
                <a href="https://github.com/SrLeal42/Wave_Overlap" target="_blank" rel="noopener noreferrer">
                  View Source on GitHub
                </a>
              </p>

            </div>


            <div className="modal-actions">
              <button className="btn-sharp btn-generate" onClick={() => setIsInfoModalOpen(false)}>
                Got it
              </button>
            </div>

          </div>

        </div>

      )}

      {/* Botão flutuante para o modal de info */}
      {!isInfoModalOpen && (
        <button
          className="info-fab"
          onClick={() => setIsInfoModalOpen(true)}
          title="About this project"
        >
          ?
        </button>
      )}




    </div>


  );


}

export default App;
