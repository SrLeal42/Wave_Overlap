import { useState, useEffect, useRef, useCallback } from 'react';
import type { WFCParams, WasmStatus, WorkerOutMessage } from './types';

interface UseWasmResult {
  status: WasmStatus;
  error: string | null;
  generate: (params: WFCParams) => Promise<Uint8Array>;
  generateLive: (params: WFCParams, sab: SharedArrayBuffer) => Promise<void>;
  cancel: () => void;
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

  const initWorker = useCallback(() => {

    setStatus('loading');

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
        case 'live-done':
          pendingRef.current?.resolve(new Uint8Array(0));
          pendingRef.current = null;
          break;
        case 'error':

          if (pendingRef.current) {
            pendingRef.current.reject(new Error(msg.error));
            pendingRef.current = null;
          } else {
            setError(msg.error);
            setStatus('error');
            console.log(msg.error);
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
  }, []);

  useEffect(() => {
    initWorker();
    return () => workerRef.current?.terminate();
  }, [initWorker]);

  // Função que encerra o worker abruptamente e instancia um novo
  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;

      // Rejeita a promise pendente para o UI saber que parou
      if (pendingRef.current) {
        pendingRef.current.reject(new Error('Cancelado pelo usuário'));
        pendingRef.current = null;
      }

      // Reinicia o worker para o próximo uso
      initWorker();
    }
  }, [initWorker]);

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


  const generateLive = useCallback((
    params: WFCParams,
    sab: SharedArrayBuffer
  ): Promise<void> => {

    return new Promise((resolve, reject) => {

      const worker = workerRef.current;
      if (!worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      // Reutiliza o mesmo pending pattern
      pendingRef.current = {
        resolve: () => resolve(),
        reject: (err: Error) => reject(err),
      } as any;

      worker.postMessage({
        type: 'generate-live',
        payload: params,
        sab,
      });

    });

  }, []);

  return { status, error, generate, generateLive, cancel };
}
