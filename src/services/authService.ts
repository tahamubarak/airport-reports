import axios from 'axios';
import { AuthResponse, PublicAuthResponse, User, UserApiKey, Site, UserSession } from '../types';
import { useSessionStore } from '../store/useSessionStore';
import { useSiteStore } from '../store/useSiteStore';
import { apiClient } from './apiClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

const isCorsError = (error: unknown): boolean => {
  if (axios.isAxiosError(error)) {
    return (
      error.code === 'ERR_NETWORK' ||
      error.message.includes('Network Error') ||
      error.message.includes('CORS') ||
      error.response === undefined
    );
  }
  return false;
};

/**
 * Route all external APVe API calls through the Express server-side proxy.
 * This avoids browser CORS restrictions in both dev and production.
 * URL format: /api/proxy/{host}/{path}
 * In dev, Vite forwards /api/* to Express (localhost:3001) which proxies onward.
 * In prod, Express handles /api/proxy/* directly.
 */
export function apiUrl(fullUrl: string): string {
  try {
    const url = new URL(fullUrl);
    return `/api/proxy/${url.host}${url.pathname}${url.search}`;
  } catch {
    return fullUrl;
  }
}

// ─── Low-level API calls ──────────────────────────────────────────────────────

async function loginRequest(
  baseUrl: string,
  username: string,
  iataCode: string,
  password: string
): Promise<AuthResponse> {
  try {
    const response = await axios.post<AuthResponse>(
      apiUrl(`${baseUrl}authApi/v1/api/Authentication/login`),
      { userName: username, site: iataCode, password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error(
        'CORS_ERROR: Cannot connect to the API from browser. ' +
          'Try using the Vite dev proxy (/api-proxy) or contact your administrator.'
      );
    }
    throw error;
  }
}

async function getUserByUsername(
  baseUrl: string,
  token: string,
  username: string
): Promise<User> {
  try {
    const response = await axios.post<User>(
      apiUrl(`${baseUrl}usersapi/v1/api/Users/GetByUserName?expand=activeApiKeys`),
      JSON.stringify(username),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error('CORS_ERROR: Cannot retrieve user data due to CORS restrictions.');
    }
    throw error;
  }
}

async function createApiKey(
  baseUrl: string,
  token: string,
  userId: string | number,
  siteId: string
): Promise<UserApiKey> {
  const response = await axios.post<UserApiKey>(
    apiUrl(`${baseUrl}usersapi/v1/api/UserApiKeys`),
    {
      userId: typeof userId === 'string' ? parseInt(userId) || userId : userId,
      activeStart: '2023-04-24T00:00:00-05:00',
      activeEnd: '2045-04-24T00:00:00-05:00',
      enabled: true,
      siteId: parseInt(siteId) || 1,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 15000,
    }
  );
  return response.data;
}

async function getPublicToken(
  baseUrl: string,
  apiKey: string
): Promise<PublicAuthResponse> {
  try {
    const response = await axios.post<PublicAuthResponse>(
      apiUrl(`${baseUrl}connectpublicapi/api/ConnectPublicApiAuthentication`),
      JSON.stringify(apiKey),
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return response.data;
  } catch (error) {
    if (isCorsError(error)) {
      throw new Error('CORS_ERROR: Cannot obtain public API token due to CORS restrictions.');
    }
    throw error;
  }
}

// ─── Auth service ─────────────────────────────────────────────────────────────

export const authService = {
  /**
   * App admin login — authenticates against the backend API.
   * Returns null on bad credentials or network error.
   */
  async loginAsAppAdmin(username: string, password: string): Promise<UserSession | null> {
    let token: string;
    let returnedUsername: string;
    try {
      const response = await apiClient.post<{ token: string; username: string }>(
        '/auth/login',
        { username, password }
      );
      token = response.data.token;
      returnedUsername = response.data.username;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        return null;
      }
      // Network or other error
      return null;
    }

    useSessionStore.getState().setAdminToken(token);

    // Auto-select the first enabled site so the admin can immediately use Dashboard/Reports
    const siteStore = useSiteStore.getState();
    const firstSite = siteStore.sites.find((s) => s.enabled) ?? siteStore.sites[0] ?? null;

    const session: UserSession = {
      username: returnedUsername,
      site: null,
      accessToken: '',
      publicAccessToken: '',
      tokenExpiry: Date.now() + SESSION_DURATION_MS,
      isGlobalAdmin: false,
      isSiteAdmin: false,
      isAppAdmin: true,
      adminActiveSiteId: firstSite?.id ?? null,
      loggedInAt: Date.now(),
    };
    useSessionStore.getState().setSession(session);
    return session;
  },

  /**
   * Full 3-step login flow for a given site.
   * Returns a complete UserSession on success.
   */
  async login(site: Site, username: string, password: string): Promise<UserSession> {
    let accessToken = '';
    let publicAuth: PublicAuthResponse;
    let resolvedApiKey: string | undefined = site.serviceApiKey;

    if (site.serviceApiKey) {
      // ── Service-key flow ─────────────────────────────────────────────────────
      // Step 1: Always validate credentials against APVe — no anonymous access
      const authResponse = await loginRequest(site.baseUrl, username, site.iataCode, password);
      accessToken = authResponse.token;

      // Step 3: Use the site's service API key for the public token instead of
      // the user's own key — avoids per-user API key management while still
      // requiring valid APVe credentials to enter the app
      publicAuth = await getPublicToken(site.baseUrl, site.serviceApiKey);
      resolvedApiKey = site.serviceApiKey;
    } else {
      // ── Standard 3-step flow ─────────────────────────────────────────────────
      // Step 1: Login
      const authResponse = await loginRequest(site.baseUrl, username, site.iataCode, password);
      accessToken = authResponse.token;

      // Step 2: Get user + API key
      const user = await getUserByUsername(site.baseUrl, authResponse.token, username);
      const linkedEntities = user.links?.activeApiKeys?.linkedEntities;
      let apiKey: string;

      if (linkedEntities && linkedEntities.length > 0) {
        apiKey = linkedEntities[0].key;
      } else {
        console.log('No active API keys found, creating one...');
        const newKey = await createApiKey(
          site.baseUrl,
          authResponse.token,
          user.id,
          site.siteId
        );
        apiKey = newKey.key;
      }

      resolvedApiKey = apiKey;

      // Step 3: Get public token
      publicAuth = await getPublicToken(site.baseUrl, apiKey);
    }

    // Determine admin roles
    const siteStore = useSiteStore.getState();
    const isGlobalAdmin = siteStore.globalAdminUsernames.includes(username);
    const isSiteAdmin = isGlobalAdmin || site.adminUsers.includes(username);

    const session: UserSession = {
      username,
      site,
      accessToken,
      publicAccessToken: publicAuth.publicAccessToken,
      tokenExpiry: Date.now() + 55 * 60 * 1000,
      // Store apiKey so we can silently refresh publicAccessToken on expiry
      apiKey: resolvedApiKey,
      isGlobalAdmin,
      isSiteAdmin,
      isAppAdmin: false,
      adminActiveSiteId: null,
      loggedInAt: Date.now(),
    };

    useSessionStore.getState().setSession(session);
    return session;
  },

  /**
   * Returns a valid publicAccessToken, auto-refreshing if needed.
   * Uses the stored apiKey (user's APVe key or site serviceApiKey) to get a
   * fresh token transparently — no password re-entry required.
   * Only throws SESSION_EXPIRED if the 8-hour session window has elapsed.
   */
  async ensureValidToken(): Promise<string> {
    const sessionStore = useSessionStore.getState();

    if (!sessionStore.isSessionValid()) {
      throw new Error('SESSION_EXPIRED');
    }

    const session = sessionStore.session!;

    // Token still valid — return it immediately
    if (session.publicAccessToken && session.tokenExpiry > Date.now() + 60_000) {
      return session.publicAccessToken;
    }

    // Determine which baseUrl + key to use for refresh
    let baseUrl: string | undefined;
    let refreshKey: string | undefined;

    if (session.isAppAdmin) {
      // App admin: look up their currently active site
      if (session.adminActiveSiteId) {
        const activeSite = useSiteStore.getState().sites.find(s => s.id === session.adminActiveSiteId);
        baseUrl = activeSite?.baseUrl;
        refreshKey = activeSite?.serviceApiKey;
      }
    } else {
      // Regular user: use stored apiKey (works for both serviceApiKey and standard flow)
      baseUrl = session.site?.baseUrl;
      refreshKey = session.apiKey;
    }

    if (baseUrl && refreshKey) {
      const publicAuth = await getPublicToken(baseUrl, refreshKey);
      const newExpiry = Date.now() + 55 * 60 * 1000;
      sessionStore.updateTokens(session.accessToken, publicAuth.publicAccessToken, newExpiry);
      return publicAuth.publicAccessToken;
    }

    // No key available to refresh — session must be re-established
    throw new Error('SESSION_EXPIRED');
  },

  async _doFetchFlights(
    token: string,
    baseUrl: string,
    startDate: string,
    endDate: string,
    timeoutMs = 60000
  ): Promise<string> {
    const response = await axios.get(
      apiUrl(`${baseUrl}connectpublicapi/api/ConnectPublicDailies/Dailies`),
      {
        params: { scheduleStartTime: startDate, scheduleEndTime: endDate },
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/xml, text/xml, */*',
          // Tell the server-side proxy how long to wait for APVe
          'x-proxy-timeout': String(Math.ceil(timeoutMs / 1000)),
        },
        timeout: timeoutMs + 5000, // client waits slightly longer than proxy
        responseType: 'text',
      }
    );
    return response.data as string;
  },

  /**
   * Resolve the refresh key (serviceApiKey or user's own apiKey) and baseUrl
   * for the current session/active site.
   */
  _resolveRefreshCredentials(): { baseUrl: string; refreshKey: string } | null {
    const session = useSessionStore.getState().session;
    if (!session) return null;
    if (session.isAppAdmin) {
      if (!session.adminActiveSiteId) return null;
      const activeSite = useSiteStore.getState().sites.find(s => s.id === session.adminActiveSiteId);
      if (activeSite?.baseUrl && activeSite?.serviceApiKey) {
        return { baseUrl: activeSite.baseUrl, refreshKey: activeSite.serviceApiKey };
      }
      return null;
    }
    if (session.site?.baseUrl && session.apiKey) {
      return { baseUrl: session.site.baseUrl, refreshKey: session.apiKey };
    }
    return null;
  },

  async fetchFlightData(startDate: string, endDate: string): Promise<string> {
    const sessionStore = useSessionStore.getState();

    if (!sessionStore.isSessionValid()) {
      throw new Error('SESSION_EXPIRED');
    }

    const session = sessionStore.session!;

    let activeSite: import('../types').Site | null = session.site;
    if (session.isAppAdmin) {
      if (!session.adminActiveSiteId) throw new Error('No site selected — select a site from the admin panel first');
      const siteStore = useSiteStore.getState();
      activeSite = siteStore.sites.find(s => s.id === session.adminActiveSiteId) ?? null;
      if (!activeSite) throw new Error('Selected site not found');
    }
    if (!activeSite) throw new Error('No site selected');

    const creds = this._resolveRefreshCredentials();
    if (!creds) throw new Error('SESSION_EXPIRED');

    // Always get a fresh token on every data fetch — never rely on the cache.
    // This guarantees we have a valid token even after site switches or long idle periods.
    const freshAuth = await getPublicToken(creds.baseUrl, creds.refreshKey);
    const newExpiry = Date.now() + 55 * 60 * 1000;
    sessionStore.updateTokens(session.accessToken, freshAuth.publicAccessToken, newExpiry);
    let token = freshAuth.publicAccessToken;

    const timeoutMs = (activeSite.fetchTimeoutSeconds ?? 60) * 1000;

    // Attempt the fetch; retry once on 504 / 503 / timeout with a brand-new token
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this._doFetchFlights(token, activeSite.baseUrl, startDate, endDate, timeoutMs);
      } catch (error) {
        if (isCorsError(error)) {
          throw new Error(
            'CORS_ERROR: Cannot fetch flight data from browser. ' +
              'Try running the app via `npm run dev` which includes a proxy, or contact your administrator.'
          );
        }

        // On 401/403 — token rejected; get a new one and retry once
        if (axios.isAxiosError(error) &&
            (error.response?.status === 401 || error.response?.status === 403)) {
          if (attempt === 0) {
            console.log('[fetch] Token rejected (401/403), refreshing and retrying...');
            const retryAuth = await getPublicToken(creds.baseUrl, creds.refreshKey);
            sessionStore.updateTokens(session.accessToken, retryAuth.publicAccessToken, Date.now() + 55 * 60 * 1000);
            token = retryAuth.publicAccessToken;
            continue;
          }
          throw new Error('SESSION_EXPIRED');
        }

        // On 504 / 503 / timeout — retry once after a short pause
        const isTransient = axios.isAxiosError(error) &&
          (error.response?.status === 504 || error.response?.status === 503 ||
           error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK');
        if (isTransient && attempt === 0) {
          console.log('[fetch] Transient error, retrying in 3s...');
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to fetch flight data after retry');
  },

  // ─── Legacy compatibility (used by old SettingsPage test) ────────────────
  async authenticate(): Promise<{ publicAccessToken: string; publicRefreshToken: string }> {
    const session = useSessionStore.getState().session;
    if (!session) throw new Error('Not logged in');
    return {
      publicAccessToken: session.publicAccessToken,
      publicRefreshToken: '',
    };
  },
};
