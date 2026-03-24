/**
 * Thin wrapper around the global useFlightStore.
 * All pages share a single in-memory flight dataset.
 * Data is fetched once on login (App.tsx) and only re-fetched
 * when the user explicitly clicks Refresh or switches sites.
 */
import { useFlightStore } from '../store/useFlightStore';

export function useFlights() {
  return useFlightStore();
}
