import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppTheme = 'pearl' | 'onyx' | 'navy' | 'aurora' | 'dusk';

export interface ThemeConfig {
  id: AppTheme;
  name: string;
  description: string;
  swatch: string;   // hex for the color preview dot
  swatch2: string;  // accent dot
}

export const THEMES: ThemeConfig[] = [
  { id: 'pearl',  name: 'Pearl',  description: 'Clean & bright',     swatch: '#ffffff', swatch2: '#2563eb' },
  { id: 'onyx',   name: 'Onyx',   description: 'Dark charcoal',      swatch: '#1f2937', swatch2: '#3b82f6' },
  { id: 'navy',   name: 'Navy',   description: 'Deep sea professional', swatch: '#0f2044', swatch2: '#38bdf8' },
  { id: 'aurora', name: 'Aurora', description: 'Midnight violet',    swatch: '#151528', swatch2: '#8b5cf6' },
  { id: 'dusk',   name: 'Dusk',   description: 'Warm ember',         swatch: '#28211e', swatch2: '#f59e0b' },
];

interface ThemeStore {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'pearl',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'apve-theme' }
  )
);
