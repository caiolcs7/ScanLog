import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../core/database';
import { cloudEvents, signedUrls } from './api';

/**
 * Lê da nuvem ao abrir, ao voltar o app para a tela, ao voltar a conexão e
 * depois de cada alteração feita no app. Sem conexão aberta em segundo plano.
 */
export function useCloud<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const loader = useRef(load);
  loader.current = load;
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const value = await loader.current();
      if (current !== generation.current) return;
      setData(value);
      setError('');
    } catch (e) {
      if (current !== generation.current) return;
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setData(undefined);
    void reload();
    const visible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const changed = () => void reload();
    cloudEvents.addEventListener('change', changed);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', changed);
    return () => {
      cloudEvents.removeEventListener('change', changed);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', changed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload };
}
/** Cadastros ainda no aparelho, aguardando envio. */
export function usePending(lotId?: string) {
  return useLiveQuery(
    () =>
      lotId
        ? db.outbox.where('lotId').equals(lotId).sortBy('createdAt')
        : db.outbox.orderBy('createdAt').toArray(),
    [lotId],
    [],
  );
}
/** URLs temporárias das fotos guardadas no bucket privado. */
export function usePhotoUrls(paths: string[]) {
  const key = paths.join('|');
  const list = useMemo(() => (key ? key.split('|') : []), [key]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!list.length) return;
    let cancelled = false;
    void signedUrls(list)
      .then((value) => {
        if (!cancelled) setUrls(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [list]);
  return urls;
}
/** Object URLs de fotos em memória, revogados ao sair. */
export function useBlobUrls(blobs: (Blob | undefined)[]) {
  const urls = useMemo(
    () => blobs.map((b) => (b ? URL.createObjectURL(b) : '')),
    [blobs],
  );
  useEffect(
    () => () => urls.forEach((u) => u && URL.revokeObjectURL(u)),
    [urls],
  );
  return urls;
}
