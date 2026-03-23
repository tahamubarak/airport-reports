import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserSession } from '../types';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

interface SessionStore {
  session: UserSession | null;
  adminToken: string | null;
  /** JWT scoped to a specific site — issued after APVe login via /api/auth/site-token */
  siteToken: string | null;
  setSession: (session: UserSession) => void;
  setAdminToken: (token: string | null) => void;
  setSiteToken: (token: string | null) => void;
  clearSession: () => void;
  updateTokens: (accessToken: string, publicAccessToken: string, expiry: number) => void;
  isSessionValid: () => boolean;
  setAdminActiveSite: (siteId: string | null) => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      session: null,
      adminToken: null,
      siteToken: null,

      setAdminToken: (token) => set({ adminToken: token }),

      setSiteToken: (token) => set({ siteToken: token }),

      setSession: (session) => set({ session }),

      clearSession: () => set({ session: null, adminToken: null, siteToken: null }),

      updateTokens: (accessToken, publicAccessToken, expiry) =>
        set((state) => {
          if (!state.session) return state;
          return { session: { ...state.session, accessToken, publicAccessToken, tokenExpiry: expiry } };
        }),

      isSessionValid: () => {
        const { session } = get();
        if (!session) return false;
        return Date.now() - session.loggedInAt < SESSION_DURATION_MS;
      },

      setAdminActiveSite: (siteId) =>
        set((state) => {
          if (!state.session) return state;
          const siteChanged = state.session.adminActiveSiteId !== siteId;
          return {
            session: {
              ...state.session,
              adminActiveSiteId: siteId,
              // Invalidate the cached APVe token so ensureValidToken fetches a
              // fresh one for the new site — the old site's token won't work here
              ...(siteChanged ? { publicAccessToken: '', tokenExpiry: 0 } : {}),
            },
          };
        }),
    }),
    {
      name: 'airport-reports-session',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
