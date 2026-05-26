import { useState, useEffect, useRef, useCallback } from 'react';
import type { WFCParams, WasmStatus, WorkerOutMessage } from './types';

interface UseWasmResult {
  status: WasmStatus;
  error: string | null;
  generate: (params: WFCParams) => Promise<Uint8Array>;
}

export function useWasm(): UseWasmResult {
  const [status, setStatus] = useState<WasmStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Armazena o resolve/reject da Promise pendente
  const pendingRef = useRef<{

    resolve: (data: Uint8Array) => void;

    reject: (err: Error) => void;

  } | null>(null);

  useEffect(() => {

    const worker = new Worker(
      new URL('./wfc.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {

      const msg = e.data;

      switch (msg.type) {
        case 'ready':
          setStatus('ready');
          break;

        case 'result':
          pendingRef.current?.resolve(msg.payload);
          pendingRef.current = null;
          break;

        case 'error':
          if (pendingRef.current) {
            pendingRef.current.reject(new Error(msg.error));
            pendingRef.current = null;
          } else {
            // Erro de inicialização
            setError(msg.error);
            setStatus('error');
            console.log(msg.error)
          }
          break;
      }
    };

    worker.onerror = (e) => {

      console.error('[useWasm] Worker error:', e);
      setError(e.message);
      setStatus('error');

    };

    workerRef.current = worker;

    return () => worker.terminate();

  }, []);

  const generate = useCallback((params: WFCParams): Promise<Uint8Array> => {

    return new Promise((resolve, reject) => {

      const worker = workerRef.current;
      if (!worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      pendingRef.current = { resolve, reject };

      worker.postMessage({
        type: 'generate',
        payload: params,
      });

    });

  }, []);

  return { status, error, generate };
}
