/**
 * useSettingsStore — Legacy compatibility shim.
 *
 * Connection settings have moved to useSiteStore + useSessionStore.
 * Field definitions have moved to useSiteStore.
 *
 * This file re-exports from useSiteStore so that any remaining references
 * to useSettingsStore continue to work without errors.
 */
export { useSiteStore as useSettingsStore } from './useSiteStore';
