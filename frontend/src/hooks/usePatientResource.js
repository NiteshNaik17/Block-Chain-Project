import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../services/api';

/**
 * Loads a patient API resource and tracks loading / error / retry state.
 *
 * `fetcher` is called on mount and whenever `deps` change (so a page can pass
 * its filters / page number as deps). `reload({ silent: true })` refreshes the
 * data without flashing the loading skeleton — useful after a mutation.
 *
 * Only the shared Axios instance is used underneath, so the HttpOnly session
 * cookie is always sent; nothing here stores a token.
 */
export default function usePatientResource(fetcher, deps = [], options = {}) {
  const { fallbackMessage = 'Could not load this page.' } = options;

  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const fallbackRef = useRef(fallbackMessage);
  fallbackRef.current = fallbackMessage;

  const run = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setStatus('loading');
      setError(null);
    }
    try {
      const result = await fetcherRef.current();
      setData(result);
      setStatus('ready');
      return result;
    } catch (requestError) {
      setError(apiErrorMessage(requestError, fallbackRef.current));
      setStatus('error');
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const result = await fetcherRef.current();
        if (!active) return;
        setData(result);
        setStatus('ready');
      } catch (requestError) {
        if (!active) return;
        setError(apiErrorMessage(requestError, fallbackRef.current));
        setStatus('error');
      }
    })();

    return () => {
      active = false;
    };
    // `deps` is supplied by the caller so the effect re-runs when the query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { status, data, error, reload: run, setData };
}
