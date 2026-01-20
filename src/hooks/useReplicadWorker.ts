import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { WorkerMessage } from '../types';

export function useReplicadWorker() {
  const workerRef = useRef<Worker | null>(null);
  const isReadyRef = useRef(false);

  const setMeshData = useStore((state) => state.setMeshData);
  const setIsEvaluating = useStore((state) => state.setIsEvaluating);
  const setError = useStore((state) => state.setError);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/replicad.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, meshData, error } = event.data;
      console.log('[Worker Response]', type, { meshData, error });

      if (type === 'ready') {
        isReadyRef.current = true;
        console.log('[Worker] Ready');
      }

      if (type === 'result') {
        console.log('[Worker] Result received, meshData:', meshData);
        setMeshData(meshData ?? null);
        setIsEvaluating(false);
        setError(null);
      }

      if (type === 'error') {
        console.error('[Worker] Error:', error);
        setError(error ?? 'Unknown error');
        setIsEvaluating(false);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('[Worker] Fatal error:', error);
      setError(error.message);
      setIsEvaluating(false);
    };

    // Initialize the worker
    workerRef.current.postMessage({ type: 'init' });

    return () => {
      workerRef.current?.terminate();
    };
  }, [setMeshData, setIsEvaluating, setError]);

  const evaluate = useCallback((code: string) => {
    if (workerRef.current) {
      console.log('[Evaluating code]', code);
      setIsEvaluating(true);
      setError(null);
      workerRef.current.postMessage({ type: 'evaluate', code });
    }
  }, [setIsEvaluating, setError]);

  return { evaluate };
}
