
// Parâmetros do WFC — fonte única de verdade
export interface WFCParams {
    grid: Uint8Array;
    rows: number;
    cols: number;
    patternSize: number;
    outW: number;
    outH: number;
    seed: number;
    maxRetries: number;
    symmetry: boolean;
}

// Status do WASM
export type WasmStatus = 'loading' | 'ready' | 'error';



// Mensagens Worker ↔ Main Thread
// --- Entrada (Main → Worker) ---
export interface GenerateMessage {
    type: 'generate';
    payload: WFCParams;  // reutiliza WFCParams
}

export interface GenerateLiveMessage {
    type: 'generate-live';
    payload: WFCParams;
    sab: SharedArrayBuffer;
}
export type WorkerInMessage = GenerateMessage | GenerateLiveMessage;


// --- Saída (Worker → Main) ---

export interface ResultMessage {
    type: 'result';
    payload: Uint8Array;
}

export interface ErrorMessage {
    type: 'error';
    error: string;
}

export interface ReadyMessage {
    type: 'ready';
}

export interface LiveDoneMessage {
    type: 'live-done';
}


export type WorkerOutMessage = ResultMessage | ErrorMessage | ReadyMessage | LiveDoneMessage;
