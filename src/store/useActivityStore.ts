import { create } from 'zustand';
import { apiClient } from '../services/apiClient';
import { useSessionStore } from './useSessionStore';
import { UserActivityEntry, DateRange } from '../types';
import { format } from 'date-fns';

interface ActivityStoreState {
  retentionDays: number;
  /** Fire-and-forget: logs a site-user login. Never throws — logging must not block the UI. */
  logLogin: () => void;
  /** Fire-and-forget: logs a data load/refresh with its date range. */
  logDataLoad: (dateRange: DateRange) => void;
  fetchActivity: (siteId: string) => Promise<UserActivityEntry[]>;
  fetchRetentionDays: () => Promise<void>;
  updateRetentionDays: (days: number) => Promise<void>;
}

export const useActivityStore = create<ActivityStoreState>((set) => ({
  retentionDays: 30,

  logLogin: () => {
    // Only real site-user sessions are logged, never app-admin sessions.
    const { siteToken, adminToken } = useSessionStore.getState();
    if (!siteToken || adminToken) return;
    apiClient.post('/activity/login').catch(() => {
      console.warn('[activity] Failed to log login');
    });
  },

  logDataLoad: (dateRange) => {
    const { siteToken, adminToken } = useSessionStore.getState();
    if (!siteToken || adminToken) return;
    apiClient.post('/activity/load', {
      startDate: format(dateRange.startDate, 'yyyy-MM-dd'),
      endDate: format(dateRange.endDate, 'yyyy-MM-dd'),
    }).catch(() => {
      console.warn('[activity] Failed to log data load');
    });
  },

  fetchActivity: async (siteId) => {
    const res = await apiClient.get<UserActivityEntry[]>('/activity', { params: { siteId } });
    return res.data;
  },

  fetchRetentionDays: async () => {
    const res = await apiClient.get<{ activityLogRetentionDays: number }>('/settings');
    set({ retentionDays: res.data.activityLogRetentionDays });
  },

  updateRetentionDays: async (days) => {
    const res = await apiClient.put<{ activityLogRetentionDays: number }>('/settings', {
      activityLogRetentionDays: days,
    });
    set({ retentionDays: res.data.activityLogRetentionDays });
  },
}));
