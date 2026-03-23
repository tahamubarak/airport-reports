import { create } from 'zustand';
import { SavedReport, ReportAuditEntry } from '../types';
import { apiClient } from '../services/apiClient';

interface ReportsStore {
  reports: SavedReport[];
  initialized: boolean;
  loading: boolean;

  initialize: () => Promise<void>;
  /** Force a fresh fetch even if already initialized (e.g., after switching sites). */
  reinitialize: () => Promise<void>;
  addReport: (report: SavedReport) => Promise<void>;
  updateReport: (id: string, updates: Partial<SavedReport>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  /** Toggle active/inactive — site admins use this to show/hide reports from users. */
  toggleReportActive: (id: string, isActive: boolean) => Promise<void>;
  /**
   * App admin: clone a report to one or more sites.
   * Each site receives an independent copy it can customize.
   */
  cloneReportToSites: (reportId: string, siteIds: string[]) => Promise<SavedReport[]>;
  /** Fetch full audit history for a report. */
  getReportAudit: (reportId: string) => Promise<ReportAuditEntry[]>;
  /** Reports visible for a given site (handles both new siteId and legacy assignedSiteIds). */
  getReportsForSite: (siteId: string) => SavedReport[];
  getBaseReports: () => SavedReport[];
}

export const useReportsStore = create<ReportsStore>()((set, get) => ({
  reports: [],
  initialized: false,
  loading: false,

  initialize: async () => {
    if (get().initialized || get().loading) return;
    set({ loading: true });
    try {
      const res = await apiClient.get<SavedReport[]>('/reports');
      set({ reports: res.data, initialized: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  reinitialize: async () => {
    set({ initialized: false, loading: true });
    try {
      const res = await apiClient.get<SavedReport[]>('/reports');
      set({ reports: res.data, initialized: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addReport: async (report) => {
    const res = await apiClient.post<SavedReport>('/reports', report);
    set((state) => ({ reports: [...state.reports, res.data] }));
  },

  updateReport: async (id, updates) => {
    const res = await apiClient.put<SavedReport>(`/reports/${id}`, updates);
    set((state) => ({
      reports: state.reports.map((r) => (r.id === id ? res.data : r)),
    }));
  },

  deleteReport: async (id) => {
    await apiClient.delete(`/reports/${id}`);
    set((state) => ({ reports: state.reports.filter((r) => r.id !== id) }));
  },

  toggleReportActive: async (id, isActive) => {
    const res = await apiClient.patch<SavedReport>(`/reports/${id}/active`, { isActive });
    set((state) => ({
      reports: state.reports.map((r) => (r.id === id ? res.data : r)),
    }));
  },

  cloneReportToSites: async (reportId, siteIds) => {
    const res = await apiClient.post<SavedReport[]>(`/reports/${reportId}/clone`, { siteIds });
    set((state) => ({ reports: [...state.reports, ...res.data] }));
    return res.data;
  },

  getReportAudit: async (reportId) => {
    const res = await apiClient.get<ReportAuditEntry[]>(`/reports/${reportId}/audit`);
    return res.data;
  },

  getReportsForSite: (siteId) => {
    const { reports } = get();
    return reports.filter((r) => {
      // New model: report belongs to a specific site
      if (r.siteId) return r.siteId === siteId;
      // Legacy: base reports visible to all sites
      if (r.isBaseReport) return true;
      // Legacy: explicit assignedSiteIds
      return (r.assignedSiteIds ?? []).includes(siteId);
    });
  },

  getBaseReports: () => get().reports.filter((r) => r.isBaseReport),
}));
