
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
}

// Status do WASM
export type WasmStatus = 'loading' | 'ready' | 'error';



// Mensagens Worker ↔ Main Thread
// --- Entrada (Main → Worker) ---
export interface GenerateMessage {
    type: 'generate';
    payload: WFCParams;  // reutiliza WFCParams
}

export type WorkerInMessage = GenerateMessage;

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

export type WorkerOutMessage = ResultMessage | ErrorMessage | ReadyMessage;
