import { create } from 'zustand';
import { Site, AppAdmin, FieldDefinition, DEFAULT_FIELD_DEFINITIONS } from '../types';
import { apiClient } from '../services/apiClient';

interface SiteStore {
  sites: Site[];
  appAdmins: AppAdmin[];
  // Per-site field definitions keyed by site.id
  // Falls back to DEFAULT_FIELD_DEFINITIONS when not set for a site
  siteFieldDefinitions: Record<string, FieldDefinition[]>;

  initialized: boolean;
  loading: boolean;

  // Initialization
  initialize: () => Promise<void>;

  // Site CRUD
  addSite: (site: Site) => Promise<void>;
  updateSite: (id: string, updates: Partial<Site>) => Promise<void>;
  deleteSite: (id: string) => Promise<void>;

  // App admin CRUD
  addAppAdmin: (username: string, password: string) => Promise<void>;
  updateAppAdmin: (id: string, updates: { username?: string; password?: string }) => Promise<void>;
  deleteAppAdmin: (id: string) => Promise<void>;
  validateAppAdmin: (username: string, password: string) => AppAdmin | null;

  // Per-site field definitions
  getSiteFieldDefinitions: (siteId: string) => FieldDefinition[];
  setSiteFieldDefinitions: (siteId: string, fields: FieldDefinition[]) => void;
  addSiteFieldDefinition: (siteId: string, field: FieldDefinition) => Promise<void>;
  updateSiteFieldDefinition: (siteId: string, fieldId: string, updates: Partial<FieldDefinition>) => Promise<void>;
  deleteSiteFieldDefinition: (siteId: string, fieldId: string) => Promise<void>;

  // Legacy shims
  globalAdminUsernames: string[];
  setGlobalAdmins: (usernames: string[]) => void;
  fieldDefinitions: FieldDefinition[];
  setFieldDefinitions: (fields: FieldDefinition[]) => void;
  addFieldDefinition: (field: FieldDefinition) => void;
  updateFieldDefinition: (id: string, updates: Partial<FieldDefinition>) => void;
  deleteFieldDefinition: (id: string) => void;
}

export const useSiteStore = create<SiteStore>()((set, get) => ({
  sites: [],
  appAdmins: [],
  siteFieldDefinitions: {},
  initialized: false,
  loading: false,

  // ── Initialization ──────────────────────────────────────────────────────────
  initialize: async () => {
    // Skip if already loading; skip if initialized AND sites were actually loaded
    if (get().loading) return;
    if (get().initialized && get().sites.length > 0) return;
    set({ loading: true, initialized: false });
    try {
      const sitesRes = await apiClient.get<Site[]>('/sites');
      const sites = sitesRes.data;

      // Fetch field definitions for all sites in parallel
      const fieldResults = await Promise.all(
        sites.map((s) =>
          apiClient.get<FieldDefinition[]>(`/sites/${s.id}/fields`).catch(() => ({ data: [] as FieldDefinition[] }))
        )
      );
      const siteFieldDefinitions: Record<string, FieldDefinition[]> = {};
      sites.forEach((s, i) => { siteFieldDefinitions[s.id] = fieldResults[i].data; });

      // Try to load admins (only succeeds if user has admin token)
      let appAdmins: AppAdmin[] = [];
      try {
        const adminsRes = await apiClient.get<AppAdmin[]>('/admins');
        appAdmins = adminsRes.data;
      } catch {
        // Not an app admin or not authenticated yet — ignore
      }

      set({ sites, appAdmins, siteFieldDefinitions, initialized: true, loading: false });
    } catch {
      set({ loading: false, initialized: true });
    }
  },

  // ── Site CRUD ──────────────────────────────────────────────────────────────
  addSite: async (site) => {
    const res = await apiClient.post<Site>('/sites', site);
    set((state) => ({ sites: [...state.sites, res.data] }));
  },

  updateSite: async (id, updates) => {
    const res = await apiClient.put<Site>(`/sites/${id}`, updates);
    set((state) => ({
      sites: state.sites.map((s) => (s.id === id ? res.data : s)),
    }));
  },

  deleteSite: async (id) => {
    await apiClient.delete(`/sites/${id}`);
    set((state) => ({
      sites: state.sites.filter((s) => s.id !== id),
      siteFieldDefinitions: Object.fromEntries(
        Object.entries(state.siteFieldDefinitions).filter(([k]) => k !== id)
      ),
    }));
  },

  // ── App Admin CRUD ─────────────────────────────────────────────────────────
  addAppAdmin: async (username, password) => {
    const res = await apiClient.post<AppAdmin>('/admins', { username, password });
    // API returns { id, username, password: '••••••••' }
    set((state) => ({ appAdmins: [...state.appAdmins, res.data] }));
  },

  updateAppAdmin: async (id, updates) => {
    const res = await apiClient.put<AppAdmin>(`/admins/${id}`, updates);
    // API returns { id, username, password: '••••••••' } with resolved username
    set((state) => ({
      appAdmins: state.appAdmins.map((a) => (a.id === id ? res.data : a)),
    }));
  },

  deleteAppAdmin: async (id) => {
    if (get().appAdmins.length <= 1) return;
    await apiClient.delete(`/admins/${id}`);
    set((state) => ({
      appAdmins: state.appAdmins.filter((a) => a.id !== id),
    }));
  },

  // Actual validation is done via the API in authService.loginAsAppAdmin
  validateAppAdmin: () => null,

  // ── Per-site field definitions ─────────────────────────────────────────────
  getSiteFieldDefinitions: (siteId) => {
    const { siteFieldDefinitions } = get();
    const stored = siteFieldDefinitions[siteId];
    if (!stored) return DEFAULT_FIELD_DEFINITIONS; // not yet fetched
    // If site has no built-ins in DB, prepend the hardcoded defaults
    const hasBuiltIns = stored.some((f) => f.isBuiltIn);
    if (!hasBuiltIns) return [...DEFAULT_FIELD_DEFINITIONS, ...stored];
    return stored;
  },

  setSiteFieldDefinitions: (siteId, fields) =>
    set((state) => ({
      siteFieldDefinitions: { ...state.siteFieldDefinitions, [siteId]: fields },
    })),

  addSiteFieldDefinition: async (siteId, field) => {
    const res = await apiClient.post<FieldDefinition>(`/sites/${siteId}/fields`, field);
    set((state) => ({
      siteFieldDefinitions: {
        ...state.siteFieldDefinitions,
        [siteId]: [...(state.siteFieldDefinitions[siteId] ?? DEFAULT_FIELD_DEFINITIONS), res.data],
      },
    }));
  },

  updateSiteFieldDefinition: async (siteId, fieldId, updates) => {
    // Merge with current field so partial updates don't wipe other columns
    const current = get().siteFieldDefinitions[siteId]?.find((f) => f.id === fieldId);
    const payload = current ? { ...current, ...updates } : updates;
    const res = await apiClient.put<FieldDefinition>(`/sites/${siteId}/fields/${fieldId}`, payload);
    set((state) => ({
      siteFieldDefinitions: {
        ...state.siteFieldDefinitions,
        [siteId]: (state.siteFieldDefinitions[siteId] ?? DEFAULT_FIELD_DEFINITIONS).map(
          (f) => (f.id === fieldId ? res.data : f)
        ),
      },
    }));
  },

  deleteSiteFieldDefinition: async (siteId, fieldId) => {
    await apiClient.delete(`/sites/${siteId}/fields/${fieldId}`);
    set((state) => ({
      siteFieldDefinitions: {
        ...state.siteFieldDefinitions,
        [siteId]: (state.siteFieldDefinitions[siteId] ?? DEFAULT_FIELD_DEFINITIONS).filter(
          (f) => f.id !== fieldId || f.isBuiltIn
        ),
      },
    }));
  },

  // ── Legacy shims ───────────────────────────────────────────────────────────
  globalAdminUsernames: [],
  setGlobalAdmins: (usernames) => set({ globalAdminUsernames: usernames }),
  fieldDefinitions: DEFAULT_FIELD_DEFINITIONS,
  setFieldDefinitions: (fields) => set({ fieldDefinitions: fields }),
  addFieldDefinition: (field) =>
    set((state) => ({ fieldDefinitions: [...state.fieldDefinitions, field] })),
  updateFieldDefinition: (id, updates) =>
    set((state) => ({
      fieldDefinitions: state.fieldDefinitions.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  deleteFieldDefinition: (id) =>
    set((state) => ({
      fieldDefinitions: state.fieldDefinitions.filter((f) => f.id !== id || f.isBuiltIn),
    })),
}));
