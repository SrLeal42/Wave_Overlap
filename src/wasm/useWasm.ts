import { useState, useEffect } from 'react';
import { loadWasm } from './loader';

type WasmStatus = 'loading' | 'ready' | 'error';

interface UseWasmResult {
  status: WasmStatus;
  error: string | null;
}

/**
 * Hook que gerencia o ciclo de vida do módulo WASM.
 * Retorna o status atual ('loading' | 'ready' | 'error').
 *
 * Uso:
 *   const { status, error } = useWasm();
 *   if (status === 'ready') window.goPing('World');
 */
export function useWasm(): UseWasmResult {
  const [status, setStatus] = useState<WasmStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    loadWasm()
      .then(() => setStatus('ready'))
      .catch((err: Error) => {
        console.error('[useWasm] Failed to load WASM:', err);
        setError(err.message);
        setStatus('error');
      });

  }, []);

  return { status, error };
}
