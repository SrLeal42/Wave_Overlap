/**
 * Web Worker que carrega e executa o Go/WASM.
 */

import type { WorkerInMessage, WorkerOutMessage } from './types';

// --- Declarações de globais do worker (injetadas pelo Go/WASM) ---

declare const Go: new () => {
    importObject: WebAssembly.Imports;
    run: (instance: WebAssembly.Instance) => Promise<void>;
};

declare const generateWFC: (
    grid: Uint8Array, rows: number, cols: number,
    patternSize: number, outW: number, outH: number,
    seed: number, maxRetries: number
) => Uint8Array | { error: string };

// --- Inicialização ---

async function loadScript(url: string): Promise<void> {
    const resp = await fetch(url);
    const text = await resp.text();
    (0, eval)(text);
}

async function init() {

    await loadScript('/wasm/wasm_exec.js');

    const go = new Go();

    const result = await WebAssembly.instantiateStreaming(
        fetch('/wasm/main.wasm'),
        go.importObject
    );

    go.run(result.instance);
    self.postMessage({ type: 'ready' } satisfies WorkerOutMessage);
}

// --- Handler ---

self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
    const msg = e.data;

    if (msg.type === 'generate') {
        const p = msg.payload;
        const result = generateWFC(
            p.grid, p.rows, p.cols, p.patternSize,
            p.outW, p.outH, p.seed, p.maxRetries
        );

        if (result instanceof Uint8Array) {
            self.postMessage(
                { type: 'result', payload: result } satisfies WorkerOutMessage,
                { transfer: [result.buffer] }
            );
        } else {
            self.postMessage({ type: 'error', error: result.error } satisfies WorkerOutMessage);
        }
    }
};

init().catch((err) => {
    self.postMessage({ type: 'error', error: `Worker init failed: ${err.message}` } satisfies WorkerOutMessage);
});
