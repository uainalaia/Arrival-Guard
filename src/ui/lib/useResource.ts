"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { readCached, writeCached } from "./resourceCache";

export interface Resource<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly loading: boolean;
  /** true cuando `data` ya llegó del servidor en este montaje; false mientras solo hay lo guardado en la caché. */
  readonly fresh: boolean;
  readonly refresh: () => Promise<void>;
}

export interface ResourceOptions {
  /** Clave de resourceCache.ts: el primer render muestra la última respuesta guardada hasta que llega la nueva. */
  readonly cacheKey?: string;
}

/**
 * Lee un recurso del servidor y lo vuelve a leer cada `intervalMs` mientras la pestaña está visible, y al volver a
 * ella. El estado verdadero vive en el servidor: la interfaz solo lo refleja.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[], intervalMs = 8000, options: ResourceOptions = {}): Resource<T> {
  const { cacheKey } = options;
  const [data, setData] = useState<T | null>(() => (cacheKey ? readCached<T>(cacheKey) : null));
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  const keyRef = useRef(cacheKey);
  useLayoutEffect(() => {
    loadRef.current = load;
    keyRef.current = cacheKey;
  });
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const next = await loadRef.current(current.signal);
      if (current.signal.aborted) return;
      setData(next);
      setFresh(true);
      setError(null);
      if (keyRef.current) writeCached(keyRef.current, next);
    } catch (e) {
      if (current.signal.aborted) return;
      if (e instanceof ApiError) setError(e);
      else if (!(e instanceof DOMException && e.name === "AbortError")) setError(new ApiError(0, { code: "UNKNOWN", message: "Something went wrong. Try again." }));
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = intervalMs > 0 ? window.setInterval(tick, intervalMs) : null;
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      controller.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, intervalMs, ...deps]);

  return { data, error, loading, fresh, refresh };
}
