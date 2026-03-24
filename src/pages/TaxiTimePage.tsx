import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Navigation, AlertTriangle, Clock, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Settings, RefreshCw } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { FilterState, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { subDays, parseISO, differenceInMinutes, format } from 'date-fns';

// ── Default field names (editable by user) ────────────────────────────────────
const DEFAULTS = {
  landingField:  'actualtime',   // arrival: actual touchdown time
  onChocksField: 'onchk',        // arrival: time wheels stop at gate
  arrGateField:  'gate',         // arrival: gate identifier field
  offBlockField: 'ofchk',        // departure: time aircraft starts moving
  takeoffField:  'actualtime',   // departure: actual wheels-off time
  depGateField:  'gate',         // departure: gate/stand identifier field
};

// ── SLA benchmarks ────────────────────────────────────────────────────────────
const SLA_TAXI_IN  = 15;  // taxi-in target (minutes)
const SLA_TAXI_OUT = 20;  // taxi-out target (minutes)

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: subDays(new Date(), 1), endDate: new Date() },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeDiff(laterStr: unknown, earlierStr: unknown, maxMins = 90): number | null {
  if (!laterStr || !earlierStr) return null;
  try {
    const diff = differenceInMinutes(parseISO(String(laterStr)), parseISO(String(earlierStr)));
    if (diff < 0 || diff > maxMins) return null;
    return diff;
  } catch { return null; }
}

function taxiColor(mins: number, target: number): string {
  if (mins <= target * 0.8) return '#22c55e';
  if (mins <= target)        return '#84cc16';
  if (mins <= target * 1.5)  return '#f59e0b';
  return '#ef4444';
}

function taxiLabel(mins: number, target: number): string {
  if (mins <= target * 0.8) return 'Excellent';
  if (mins <= target)        return 'Normal';
  if (mins <= target * 1.5)  return 'Slow';
  return 'Critical';
}

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-semibold text-slate-700 mb-2">{label}</p>
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-600">{p.name}:</span>
            <span className="font-medium">{p.value}m</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// ── Field config panel ────────────────────────────────────────────────────────
interface FieldConfig {
  landingField: string;
  onChocksField: string;
  arrGateField: string;
  offBlockField: string;
  takeoffField: string;
  depGateField: string;
}

const FieldConfigBar: React.FC<{
  config: FieldConfig;
  onApply: (c: FieldConfig) => void;
}> = ({ config, onApply }) => {
  const [draft, setDraft] = useState(config);
  const changed = JSON.stringify(draft) !== JSON.stringify(config);

  // Sync draft when parent config changes (e.g. loaded from localStorage)
  const configStr = JSON.stringify(config);
  useEffect(() => { try { setDraft(JSON.parse(configStr)); } catch {} }, [configStr]);

  const apply = () => {
    if (Object.values(draft).every(v => v.trim())) onApply(draft);
  };

  const inp = (label: string, key: keyof FieldConfig, placeholder: string) => (
    <div className="flex items-center gap-2">
      <label className="text-slate-500 text-xs whitespace-nowrap">{label}:</label>
      <input
        value={draft[key]}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onKeyDown={e => e.key === 'Enter' && apply()}
        className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm space-y-2">
      <div className="flex items-center gap-2 text-slate-600 font-medium">
        <Settings className="w-4 h-4 text-slate-400" />
        Field Names
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            <ArrowDownToLine className="w-3 h-3" /> Arrivals
          </span>
          {inp('Landing time',  'landingField',  'actualtime')}
          {inp('On-chocks time','onChocksField', 'onchk')}
          {inp('Gate field',    'arrGateField',  'gate')}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            <ArrowUpFromLine className="w-3 h-3" /> Departures
          </span>
          {inp('Off-block time','offBlockField', 'ofchk')}
          {inp('Takeoff time',  'takeoffField',  'actualtime')}
          {inp('Gate field',    'depGateField',  'gate')}
        </div>
        <button
          onClick={apply}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors self-center"
        >
          <RefreshCw className="w-3 h-3" />
          Apply
        </button>
        {changed && (
          <button
            onClick={() => { setDraft(DEFAULTS); onApply(DEFAULTS); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline self-center"
          >
            Reset defaults
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Taxi-in = on-chocks − landing &nbsp;·&nbsp; Taxi-out = takeoff − off-block &nbsp;·&nbsp;
        Targets: in ≤{SLA_TAXI_IN}m, out ≤{SLA_TAXI_OUT}m
      </p>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
export const TaxiTimePage: React.FC = () => {
  const [filters, setFilters]         = useState<FilterState>(DEFAULT_FILTERS);
  const { config: fieldConfig, apply: applyFieldConfig } = usePersistedConfig('taxi_time', DEFAULTS);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const handleRefresh = () => fetchFlights(filters.dateRange);

  const airlines = useMemo(() => [...new Set(flights.map(f => f.linecode))].sort(), [flights]);

  const filtered = useMemo(() => flights.filter(f => {
    if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
    if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
    return true;
  }), [flights, filters]);

  // Enrich: compute taxi times
  const enriched = useMemo(() => filtered.map(f => {
    if (f.adi === 'A') {
      const taxiIn = safeDiff(f[fieldConfig.onChocksField], f[fieldConfig.landingField]);
      return { ...f, taxiIn, taxiOut: null as number | null };
    } else {
      const taxiOut = safeDiff(f[fieldConfig.takeoffField], f[fieldConfig.offBlockField]);
      return { ...f, taxiIn: null as number | null, taxiOut };
    }
  }), [filtered, fieldConfig]);

  const withTaxiIn  = useMemo(() => enriched.filter(f => f.adi === 'A' && f.taxiIn  !== null), [enriched]);
  const withTaxiOut = useMemo(() => enriched.filter(f => f.adi === 'D' && f.taxiOut !== null), [enriched]);

  // KPIs
  const kpis = useMemo(() => {
    const avgIn  = withTaxiIn.length  > 0 ? Math.round(withTaxiIn.reduce( (s, f) => s + (f.taxiIn  ?? 0), 0) / withTaxiIn.length)  : 0;
    const avgOut = withTaxiOut.length > 0 ? Math.round(withTaxiOut.reduce((s, f) => s + (f.taxiOut ?? 0), 0) / withTaxiOut.length) : 0;
    const maxIn  = withTaxiIn.length  > 0 ? Math.max(...withTaxiIn.map(f  => f.taxiIn  ?? 0)) : 0;
    const maxOut = withTaxiOut.length > 0 ? Math.max(...withTaxiOut.map(f => f.taxiOut ?? 0)) : 0;
    const slaInPct  = withTaxiIn.length  > 0 ? Math.round((withTaxiIn.filter( f => (f.taxiIn  ?? 0) <= SLA_TAXI_IN).length  / withTaxiIn.length)  * 100) : 0;
    const slaOutPct = withTaxiOut.length > 0 ? Math.round((withTaxiOut.filter(f => (f.taxiOut ?? 0) <= SLA_TAXI_OUT).length / withTaxiOut.length) * 100) : 0;
    return { avgIn, avgOut, maxIn, maxOut, slaInPct, slaOutPct, nIn: withTaxiIn.length, nOut: withTaxiOut.length };
  }, [withTaxiIn, withTaxiOut]);

  // Per-airline averages
  const airlineData = useMemo(() => {
    const stats: Record<string, { sumIn: number; nIn: number; sumOut: number; nOut: number }> = {};
    withTaxiIn.forEach(f => {
      if (!stats[f.linecode]) stats[f.linecode] = { sumIn: 0, nIn: 0, sumOut: 0, nOut: 0 };
      stats[f.linecode].sumIn += f.taxiIn ?? 0;
      stats[f.linecode].nIn++;
    });
    withTaxiOut.forEach(f => {
      if (!stats[f.linecode]) stats[f.linecode] = { sumIn: 0, nIn: 0, sumOut: 0, nOut: 0 };
      stats[f.linecode].sumOut += f.taxiOut ?? 0;
      stats[f.linecode].nOut++;
    });
    return Object.entries(stats)
      .map(([airline, s]) => ({
        airline,
        'Avg Taxi-In':  s.nIn  > 0 ? Math.round(s.sumIn  / s.nIn)  : null,
        'Avg Taxi-Out': s.nOut > 0 ? Math.round(s.sumOut / s.nOut) : null,
      }))
      .filter(d => d['Avg Taxi-In'] !== null || d['Avg Taxi-Out'] !== null)
      .sort((a, b) => ((b['Avg Taxi-In'] ?? 0) + (b['Avg Taxi-Out'] ?? 0)) - ((a['Avg Taxi-In'] ?? 0) + (a['Avg Taxi-Out'] ?? 0)));
  }, [withTaxiIn, withTaxiOut]);

  // By hour
  const byHour = useMemo(() => {
    const stats: Record<number, { sumIn: number; nIn: number; sumOut: number; nOut: number }> = {};
    const addHour = (timeStr: string, fn: (s: typeof stats[number]) => void) => {
      if (!timeStr) return;
      try {
        const h = parseISO(timeStr).getHours();
        if (!stats[h]) stats[h] = { sumIn: 0, nIn: 0, sumOut: 0, nOut: 0 };
        fn(stats[h]);
      } catch {}
    };
    withTaxiIn.forEach(f => {
      const raw = (f as Record<string, unknown>)[fieldConfig.landingField];
      addHour(String(raw ?? f.actual), s => { s.sumIn += f.taxiIn ?? 0; s.nIn++; });
    });
    withTaxiOut.forEach(f => {
      const raw = (f as Record<string, unknown>)[fieldConfig.offBlockField];
      addHour(String(raw ?? f.actual), s => { s.sumOut += f.taxiOut ?? 0; s.nOut++; });
    });
    return Object.entries(stats)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, s]) => ({
        hour:           `${String(Number(h)).padStart(2, '0')}:00`,
        'Avg Taxi-In':  s.nIn  > 0 ? Math.round(s.sumIn  / s.nIn)  : null,
        'Avg Taxi-Out': s.nOut > 0 ? Math.round(s.sumOut / s.nOut) : null,
      }))
      .filter(r => r['Avg Taxi-In'] !== null || r['Avg Taxi-Out'] !== null);
  }, [withTaxiIn, withTaxiOut, fieldConfig]);

  // Distribution buckets
  const distIn = useMemo(() => {
    const b: Record<string, number> = { '0–5m': 0, '5–10m': 0, '10–15m': 0, '15–20m': 0, '20–30m': 0, '30m+': 0 };
    withTaxiIn.forEach(f => {
      const v = f.taxiIn ?? 0;
      if (v <= 5) b['0–5m']++;
      else if (v <= 10) b['5–10m']++;
      else if (v <= 15) b['10–15m']++;
      else if (v <= 20) b['15–20m']++;
      else if (v <= 30) b['20–30m']++;
      else b['30m+']++;
    });
    return Object.entries(b).map(([band, count]) => ({ band, count }));
  }, [withTaxiIn]);

  const distOut = useMemo(() => {
    const b: Record<string, number> = { '0–8m': 0, '8–15m': 0, '15–20m': 0, '20–25m': 0, '25–35m': 0, '35m+': 0 };
    withTaxiOut.forEach(f => {
      const v = f.taxiOut ?? 0;
      if (v <= 8) b['0–8m']++;
      else if (v <= 15) b['8–15m']++;
      else if (v <= 20) b['15–20m']++;
      else if (v <= 25) b['20–25m']++;
      else if (v <= 35) b['25–35m']++;
      else b['35m+']++;
    });
    return Object.entries(b).map(([band, count]) => ({ band, count }));
  }, [withTaxiOut]);

  // Scatter: delay vs taxi time (arrivals)
  const scatterData = useMemo(() =>
    withTaxiIn
      .filter(f => f.delayMinutes >= 0)
      .map(f => ({ x: f.delayMinutes, y: f.taxiIn ?? 0, name: `${f.linecode}${f.number}` }))
      .slice(0, 200),
  [withTaxiIn]);

  // Top slowest flights (combined)
  const slowest = useMemo(() => {
    const all = [
      ...withTaxiIn.map(f  => ({ ...f, taxi: f.taxiIn  ?? 0, type: 'Taxi-In'  as const })),
      ...withTaxiOut.map(f => ({ ...f, taxi: f.taxiOut ?? 0, type: 'Taxi-Out' as const })),
    ];
    return all.sort((a, b) => b.taxi - a.taxi).slice(0, 12);
  }, [withTaxiIn, withTaxiOut]);

  const noData = withTaxiIn.length === 0 && withTaxiOut.length === 0 && filtered.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800"><strong>Demo Mode:</strong> Showing simulated taxi time data.</span>
        </div>
      )}

      {/* Field config */}
      <FieldConfigBar config={fieldConfig} onApply={applyFieldConfig} />

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu
          flights={filtered}
          fields={useSettingsStore.getState().fieldDefinitions.filter(f => f.enabled)}
          title="Taxi Time Report"
          filename="taxi-time"
          disabled={filtered.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading taxi time data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && noData && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          <Navigation className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No taxi time data found</p>
          <p className="text-sm mt-1">
            Check that field names match your system (e.g.{' '}
            <code className="bg-slate-100 px-1 rounded">{fieldConfig.onChocksField}</code>,{' '}
            <code className="bg-slate-100 px-1 rounded">{fieldConfig.offBlockField}</code>).
          </p>
        </div>
      )}

      {!loading && !noData && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Avg Taxi-In"
              value={kpis.nIn > 0 ? `${kpis.avgIn}m` : '—'}
              icon={<ArrowDownToLine className="w-6 h-6" />}
              color={kpis.avgIn <= SLA_TAXI_IN ? 'green' : kpis.avgIn <= SLA_TAXI_IN * 1.5 ? 'amber' : 'red'}
              subtitle={kpis.nIn > 0 ? `${kpis.nIn} arrivals · target ≤${SLA_TAXI_IN}m` : undefined}
            />
            <KPICard
              title="Avg Taxi-Out"
              value={kpis.nOut > 0 ? `${kpis.avgOut}m` : '—'}
              icon={<ArrowUpFromLine className="w-6 h-6" />}
              color={kpis.avgOut <= SLA_TAXI_OUT ? 'green' : kpis.avgOut <= SLA_TAXI_OUT * 1.5 ? 'amber' : 'red'}
              subtitle={kpis.nOut > 0 ? `${kpis.nOut} departures · target ≤${SLA_TAXI_OUT}m` : undefined}
            />
            <KPICard
              title="Longest Taxi-In"
              value={kpis.nIn > 0 ? `${kpis.maxIn}m` : '—'}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.maxIn <= SLA_TAXI_IN * 1.5 ? 'amber' : 'red'}
            />
            <KPICard
              title="Longest Taxi-Out"
              value={kpis.nOut > 0 ? `${kpis.maxOut}m` : '—'}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.maxOut <= SLA_TAXI_OUT * 1.5 ? 'amber' : 'red'}
            />
            <KPICard
              title="Taxi-In SLA"
              value={kpis.nIn > 0 ? `${kpis.slaInPct}%` : '—'}
              icon={<TrendingUp className="w-6 h-6" />}
              color={kpis.slaInPct >= 90 ? 'green' : kpis.slaInPct >= 70 ? 'amber' : 'red'}
              subtitle={`≤${SLA_TAXI_IN}m compliance`}
            />
            <KPICard
              title="Taxi-Out SLA"
              value={kpis.nOut > 0 ? `${kpis.slaOutPct}%` : '—'}
              icon={<TrendingUp className="w-6 h-6" />}
              color={kpis.slaOutPct >= 90 ? 'green' : kpis.slaOutPct >= 70 ? 'amber' : 'red'}
              subtitle={`≤${SLA_TAXI_OUT}m compliance`}
            />
          </div>

          {/* Row 1 — Airline comparison + hourly trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Avg Taxi Time by Airline</h3>
              {airlineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(260, airlineData.length * 42)}>
                  <BarChart data={airlineData} layout="vertical" margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                    <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Avg Taxi-In"  fill="#6366f1" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="Avg Taxi-Out" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Avg Taxi Time by Hour</h3>
              {byHour.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={byHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="Avg Taxi-In"  stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Avg Taxi-Out" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>
          </div>

          {/* Row 2 — Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Taxi-In Distribution</h3>
              <p className="text-xs text-slate-500 mb-4">Arrival flights · target ≤{SLA_TAXI_IN}m</p>
              {distIn.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={distIn} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Flights']} />
                    <Bar dataKey="count" name="Flights" radius={[4, 4, 0, 0]}>
                      {distIn.map((d, i) => (
                        <Cell key={i} fill={
                          d.band === '0–5m'   ? '#22c55e' :
                          d.band === '5–10m'  ? '#84cc16' :
                          d.band === '10–15m' ? '#f59e0b' :
                          d.band === '15–20m' ? '#fb923c' :
                          '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-52 flex items-center justify-center text-slate-400">No arrival taxi data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Taxi-Out Distribution</h3>
              <p className="text-xs text-slate-500 mb-4">Departure flights · target ≤{SLA_TAXI_OUT}m</p>
              {distOut.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={distOut} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Flights']} />
                    <Bar dataKey="count" name="Flights" radius={[4, 4, 0, 0]}>
                      {distOut.map((d, i) => (
                        <Cell key={i} fill={
                          d.band === '0–8m'   ? '#22c55e' :
                          d.band === '8–15m'  ? '#84cc16' :
                          d.band === '15–20m' ? '#f59e0b' :
                          d.band === '20–25m' ? '#fb923c' :
                          '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-52 flex items-center justify-center text-slate-400">No departure taxi data</div>
              )}
            </div>
          </div>

          {/* Row 3 — Delay vs Taxi scatter + slowest table */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Delay vs Taxi-In Time</h3>
              <p className="text-xs text-slate-500 mb-4">Do delayed arrivals also take longer to taxi in?</p>
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="x" name="Delay" tick={{ fontSize: 11, fill: '#64748b' }} unit="m"
                      label={{ value: 'Flight Delay (min)', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="number" dataKey="y" name="Taxi-In" tick={{ fontSize: 11, fill: '#64748b' }} unit="m"
                      label={{ value: 'Taxi-In (min)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }} />
                    <ZAxis range={[30, 30]} />
                    <Tooltip content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
                            <p className="font-bold text-slate-800">{d.name}</p>
                            <p className="text-slate-600">Delay: <span className="font-medium">{d.x}m</span></p>
                            <p className="text-slate-600">Taxi-In: <span className="font-medium">{d.y}m</span></p>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No arrival taxi data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">Slowest Taxi Times</h3>
                <span className="text-xs text-slate-500">Top 12 combined</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Flight</th>
                      <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Route</th>
                      <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Gate</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxi Time</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {slowest.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No taxi time data</td></tr>
                    ) : slowest.map((f, i) => {
                      const sla   = f.type === 'Taxi-In' ? SLA_TAXI_IN : SLA_TAXI_OUT;
                      const color = taxiColor(f.taxi, sla);
                      const fr    = f as unknown as Record<string, unknown>;
                      const gateField = f.adi === 'A' ? fieldConfig.arrGateField : fieldConfig.depGateField;
                      const gateVal   = String(fr[gateField] ?? f.gate ?? '');
                      const schedDate = (() => {
                        const raw = String(f.scheduleDate || f.schedule || '');
                        if (!raw) return '';
                        try { return format(parseISO(raw), 'MM/dd'); } catch { return ''; }
                      })();
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{f.linecode}{f.number}</div>
                            {schedDate && <div className="text-xs text-slate-400">{schedDate}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{f.city}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{gateVal || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              f.type === 'Taxi-In'
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                              {f.type === 'Taxi-In'
                                ? <ArrowDownToLine className="w-3 h-3" />
                                : <ArrowUpFromLine className="w-3 h-3" />}
                              {f.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-lg" style={{ color }}>
                            {f.taxi}m
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className="text-xs font-semibold px-2 py-1 rounded-full"
                              style={{ backgroundColor: color + '20', color }}
                            >
                              {taxiLabel(f.taxi, sla)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
