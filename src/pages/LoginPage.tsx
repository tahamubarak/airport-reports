import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react';
import { useSiteStore } from '../store/useSiteStore';
import { useSessionStore } from '../store/useSessionStore';
import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import toast from 'react-hot-toast';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { sites } = useSiteStore();
  const { isSessionValid, session } = useSessionStore();

  const [iataCode, setIataCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already logged in — runs only on mount.
  // DO NOT add session/isSessionValid to deps: that would fire mid-login (after
  // setSession() but before the siteToken exchange), navigating to /dashboard
  // before the token is ready and causing a 401 → clearSession() → back to login.
  useEffect(() => {
    if (isSessionValid()) {
      if (session?.isAppAdmin) {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdminPath = iataCode.trim().toLowerCase() === 'admin';
  const enabledSites = sites.filter((s) => s.enabled);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // ── App admin path ────────────────────────────────────────────────────────
    if (isAdminPath) {
      if (!username.trim()) { setError('Username is required'); return; }
      if (!password) { setError('Password is required'); return; }
      setLoading(true);
      try {
        const sess = await authService.loginAsAppAdmin(username.trim(), password);
        if (!sess) {
          setError('Invalid admin credentials');
          return;
        }
        toast.success('Signed in as App Admin');
        navigate('/admin', { replace: true });
      } finally {
        setLoading(false);
      }
      return;
    }

    // ── Site user path ────────────────────────────────────────────────────────
    const iata = iataCode.trim().toUpperCase();
    if (!iata) { setError('Enter an airport IATA code (e.g. BWI, RDU)'); return; }

    const matchedSite = enabledSites.find((s) => s.iataCode.toUpperCase() === iata);
    if (!matchedSite) {
      setError(
        enabledSites.length === 0
          ? 'No sites configured yet. Log in as admin (type "admin" as the IATA code) to set up the first site.'
          : `No site found for "${iata}". Check the code or contact your administrator.`
      );
      return;
    }

    if (!username.trim()) { setError('Username is required'); return; }
    if (!password) { setError('Password is required'); return; }

    setLoading(true);
    try {
      await authService.login(matchedSite, username.trim(), password);
      // Exchange the APVe session for a site-scoped app JWT so we can call the Express API
      try {
        const tokenRes = await apiClient.post<{ token: string; isSiteAdmin: boolean }>(
          '/auth/site-token',
          { username: username.trim(), siteId: matchedSite.id }
        );
        useSessionStore.getState().setSiteToken(tokenRes.data.token);
      } catch {
        // Non-fatal: the user can still view the UI; write operations will be restricted
        console.warn('[auth] Could not obtain site token');
      }
      toast.success(`Welcome, ${username}!`);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      let displayMessage = 'Login failed';
      if (err instanceof Error) {
        displayMessage = err.message.replace('CORS_ERROR: ', '');
      }
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      if (axiosErr?.response) {
        const status = axiosErr.response.status;
        const data = axiosErr.response.data;
        const serverMsg =
          typeof data === 'string'
            ? data
            : typeof data === 'object' && data !== null
            ? JSON.stringify(data)
            : '';
        displayMessage = `HTTP ${status}${serverMsg ? `: ${serverMsg}` : ''} — check your username, password, and site IATA code.`;
      }
      setError(displayMessage);
      console.error('[Login error]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-2xl shadow-blue-900/50 mb-4">
            <Plane className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">APVe Airport Reports</h1>
          <p className="text-blue-300 mt-2 text-sm">Flight Operations Intelligence Platform</p>
        </div>

        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-xl mb-6">Sign In</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* IATA code */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">
                Airport IATA Code
              </label>
              <input
                type="text"
                value={iataCode}
                onChange={(e) => {
                  const v = e.target.value;
                  // keep lowercase if typing "admin", otherwise uppercase
                  setIataCode(v.toLowerCase() === 'admin' || v.toLowerCase().startsWith('adm') ? v : v.toUpperCase());
                }}
                placeholder="e.g. JFK"
                maxLength={10}
                autoComplete="off"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono tracking-widest"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 bg-red-500/20 border border-red-400/30 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full font-semibold rounded-xl px-4 py-3 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${
                isAdminPath
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40 text-white'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing In...
                </>
              ) : isAdminPath ? (
                <>
                  <Shield className="w-4 h-4" />
                  Sign In as Admin
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-blue-400/60 text-xs mt-8">
          Powered by APVe &bull; Airport Operations Intelligence
        </p>
      </div>
    </div>
  );
};
