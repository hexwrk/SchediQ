"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { ApiError } from "./api";
import { useAuth } from "./auth-context";

// One data-loading pattern for every page, so each view has the same three
// states: loading, error (with retry) and loaded.
//
// Why this shape: React's "set state synchronously in an effect" rule. The
// initial fetch runs in an effect but only touches state inside the promise
// callbacks, never synchronously. `reload()` is for event handlers (after a
// save, the Retry button) and may set state directly. `key` replaces a deps
// array: pass a string that changes whenever the request should re-run (e.g.
// `course:${id}`).

interface State<T> {
  key: string | null; // which request `data` / `error` belong to
  data: T | undefined;
  error: string | null;
  // HTTP status of the failure (e.g. 403 -> render "Access denied").
  errorStatus: number | null;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) return err.message;
  // fetch() rejects with a TypeError when the API is unreachable.
  if (err instanceof TypeError) return "Can't reach the SchediQ server. Check your connection and try again.";
  return fallback;
}

function statusOf(err: unknown): number | null {
  return err instanceof ApiError ? err.status : null;
}

export function useApi<T>(key: string, fetcher: (token: string) => Promise<T>) {
  const { token } = useAuth();
  const [state, setState] = useState<State<T>>({ key: null, data: undefined, error: null, errorStatus: null });
  const [reloading, setReloading] = useState(false);
  const requestKey = token ? `${key}|${token}` : null;

  // Effect event: always calls the latest fetcher without making it a dependency.
  const run = useEffectEvent((t: string) => fetcher(t));

  useEffect(() => {
    if (!token || !requestKey) return;
    let active = true;
    run(token).then(
      (data) => active && setState({ key: requestKey, data, error: null, errorStatus: null }),
      (err) =>
        active &&
        setState((s) => ({ key: requestKey, data: s.data, error: errorMessage(err), errorStatus: statusOf(err) }))
    );
    // Ignore a response that arrives after the key changed or the page unmounted.
    return () => {
      active = false;
    };
  }, [token, requestKey]);

  // Imperative refetch for event handlers (Retry, after a mutation). Resolves
  // with the fresh data so callers can act on it.
  async function reload(): Promise<T | undefined> {
    if (!token || !requestKey) return undefined;
    setReloading(true);
    try {
      const data = await fetcher(token);
      setState({ key: requestKey, data, error: null, errorStatus: null });
      return data;
    } catch (err) {
      setState((s) => ({ ...s, key: requestKey, error: errorMessage(err), errorStatus: statusOf(err) }));
      return undefined;
    } finally {
      setReloading(false);
    }
  }

  // Optimistic local edits (e.g. remove a row after delete) without a refetch.
  function mutate(update: (prev: T) => T) {
    setState((s) => (s.data === undefined ? s : { ...s, data: update(s.data) }));
  }

  const settled = state.key === requestKey;
  return {
    data: settled ? state.data : undefined,
    error: settled ? state.error : null,
    errorStatus: settled ? state.errorStatus : null,
    // Loading = this request has not answered yet (first load or key change).
    loading: !settled,
    reloading,
    reload,
    mutate,
  };
}
