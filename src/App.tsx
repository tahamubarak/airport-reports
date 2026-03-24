import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useSiteStore } from './store/useSiteStore';
import { useSessionStore } from './store/useSessionStore';
import { useReportsStore } from './store/useReportsStore';
import { useFlightStore, DEFAULT_FLIGHT_DATE_RANGE } from './store/useFlightStore';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { FlightOperationsPage } from './pages/FlightOperationsPage';
import { GateUtilizationPage } from './pages/GateUtilizationPage';
import { DelayAnalysisPage } from './pages/DelayAnalysisPage';
import { AirlinePerformancePage } from './pages/AirlinePerformancePage';
import { ReportDesignerPage } from './pages/ReportDesignerPage';
import { CustomReportPage } from './pages/CustomReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { BaggagePerformancePage } from './pages/BaggagePerformancePage';
import { OTPScorecardPage } from './pages/OTPScorecardPage';
import { PassengerFlowPage } from './pages/PassengerFlowPage';
import { BaggageBeltPage } from './pages/BaggageBeltPage';
import { TaxiTimePage } from './pages/TaxiTimePage';
import { CheckInCounterPage } from './pages/CheckInCounterPage';

function App() {
  const initialized = useSiteStore((s) => s.initialized);
  const session = useSessionStore((s) => s.session);
  const adminToken = useSessionStore((s) => s.adminToken);
  const siteToken = useSessionStore((s) => s.siteToken);
  const adminActiveSiteId = session?.adminActiveSiteId;
  const [initStarted, setInitStarted] = useState(false);

  // Always initialize siteStore on mount (sets initialized=true even on failure so spinner clears)
  useEffect(() => {
    setInitStarted(true);
    useSiteStore.getState().initialize();
  }, []);

  // Re-initialize site store when session is established
  useEffect(() => {
    if (session?.username) {
      useSiteStore.getState().initialize();
    }
  }, [session?.username]);

  // Initialize reports store only after a token is available (siteToken for site users,
  // adminToken for app admin). This prevents a 401 on GET /api/reports when setSession()
  // fires mid-login before the site token exchange completes.
  useEffect(() => {
    const token = adminToken ?? siteToken;
    if (token) {
      useReportsStore.getState().initialize();
    }
  }, [adminToken, siteToken]);

  // Fetch flight data once when a token becomes available (i.e. on login).
  // After that, data is only refreshed when the user explicitly clicks Refresh
  // on any report page, or when the active site changes (admin site-switch).
  useEffect(() => {
    const token = adminToken ?? siteToken;
    if (token) {
      useFlightStore.getState().fetchFlights(DEFAULT_FLIGHT_DATE_RANGE);
    }
  }, [adminToken, siteToken]);

  // Re-fetch when app-admin switches active site
  useEffect(() => {
    if (adminActiveSiteId) {
      useFlightStore.getState().fetchFlights(
        useFlightStore.getState().lastDateRange ?? DEFAULT_FLIGHT_DATE_RANGE
      );
    }
  }, [adminActiveSiteId]);

  // While loading and no session yet, show a brief spinner
  if (initStarted && !initialized && !session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#22c55e', secondary: '#f8fafc' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#f8fafc' },
          },
        }}
      />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — wrapped in Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/reports/flight-operations" element={<FlightOperationsPage />} />
                  <Route path="/reports/gate-utilization" element={<GateUtilizationPage />} />
                  <Route path="/reports/delay-analysis" element={<DelayAnalysisPage />} />
                  <Route path="/reports/airline-performance" element={<AirlinePerformancePage />} />
                  <Route path="/reports/baggage-performance" element={<BaggagePerformancePage />} />
                  <Route path="/reports/otp-scorecard" element={<OTPScorecardPage />} />
                  <Route path="/reports/passenger-flow" element={<PassengerFlowPage />} />
                  <Route path="/reports/baggage-belt" element={<BaggageBeltPage />} />
                  <Route path="/reports/taxi-time" element={<TaxiTimePage />} />
                  <Route path="/reports/checkin-counter" element={<CheckInCounterPage />} />
                  <Route path="/report-designer" element={<ReportDesignerPage />} />
                  <Route path="/reports/custom/:id" element={<CustomReportPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  {/* Admin-only route */}
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminPage />
                      </AdminRoute>
                    }
                  />
                  {/* Legacy home page */}
                  <Route path="/home" element={<HomePage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
