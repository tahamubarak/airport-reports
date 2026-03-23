import axios from 'axios';
import { useSessionStore } from '../store/useSessionStore';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({ baseURL: BASE_URL });

// Attach the best available JWT to every request.
// App admins use adminToken; site users/admins use siteToken.
apiClient.interceptors.request.use((config) => {
  const { adminToken, siteToken } = useSessionStore.getState();
  const token = adminToken ?? siteToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear session (don't redirect — let the store handle it)
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useSessionStore.getState().clearSession();
    }
    return Promise.reject(err);
  }
);
