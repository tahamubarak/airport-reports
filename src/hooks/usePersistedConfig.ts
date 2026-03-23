import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../store/useSessionStore';

/**
 * Persists a report's field configuration to localStorage, scoped per site.
 * Config is automatically reloaded when the active site changes.
 *
 * @param reportKey  Short stable key, e.g. "taxi_time" or "gate_utilization"
 * @param defaults   Default config object (must be a stable module-level const)
 * @returns { config, apply }
 *   - config: currently applied (and loaded) config
 *   - apply(newConfig): saves to localStorage and updates config
 */
export function usePersistedConfig<T extends object>(reportKey: string, defaults: T) {
  const session = useSessionStore((s) => s.session);
  const siteId =
    (session?.isAppAdmin ? session?.adminActiveSiteId : session?.site?.id) ?? 'default';
  const storageKey = `fieldCfg_${siteId}_${reportKey}`;

  // Keep a ref so the apply callback always uses the latest key
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const [config, setConfig] = useState<T>(defaults);

  // Load from localStorage whenever the site changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setConfig(raw ? { ...defaults, ...JSON.parse(raw) } : defaults);
    } catch {
      setConfig(defaults);
    }
  }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = useCallback((newConfig: T) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(storageKeyRef.current, JSON.stringify(newConfig));
    } catch {}
  }, []);

  return { config, apply };
}
