/**
 * WASM Loader — carrega e inicializa o módulo Go/WASM.
 *
 * O Go compila para WASM usando um runtime próprio (wasm_exec.js) que
 * injeta a classe `Go` no escopo global. Este loader:
 *
 * 1. Carrega wasm_exec.js como <script> (precisa ser global)
 * 2. Instancia o runtime Go
 * 3. Faz fetch do .wasm e inicializa com WebAssembly.instantiateStreaming
 * 4. Roda go.run() em background (o select{} no main.go mantém vivo)
 *
 * Após a inicialização, as funções exportadas pelo Go (ex: goPing)
 * ficam disponíveis em window.
 */

declare global {
  interface Window {
    Go: new () => GoInstance;
    goPing: (name?: string) => string;
    extractPatterns: (grid: Uint8Array, rows: number, cols: number, patternSize: number) => string;
    generateWFC: (
      grid: Uint8Array, rows: number, cols: number,
      patternSize: number, outW: number, outH: number, seed: number
    ) => Uint8Array | { error: string };
  }
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run: (instance: WebAssembly.Instance) => Promise<void>;
}

let initPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {

  return new Promise((resolve, reject) => {

    // Evita carregar duas vezes
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });

}

async function initWasm(): Promise<void> {
  // 1. Carrega o glue code do Go
  await loadScript('/wasm/wasm_exec.js');

  // 2. Instancia o runtime
  const go = new window.Go();

  // 3. Fetch + instantiate do módulo WASM
  const result = await WebAssembly.instantiateStreaming(
    fetch('/wasm/main.wasm'),
    go.importObject
  );

  // 4. Executa o Go em background (não bloqueia — o select{} mantém vivo)
  go.run(result.instance);
}

/**
 * Inicializa o módulo WASM. É idempotente — chamadas subsequentes
 * retornam a mesma Promise.
 */
export function loadWasm(): Promise<void> {

  if (!initPromise) {
    initPromise = initWasm();
  }

  return initPromise;
}

