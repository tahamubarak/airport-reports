import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts';
import { Luggage, AlertTriangle, Clock, CheckCircle, TrendingDown, Settings, RefreshCw } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { FilterState, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { subDays, parseISO, differenceInMinutes } from 'date-fns';

// ── Default field names (editable by user) ────────────────────────────────────
const DEFAULTS = {
  firstBagField: 'firstbag',
  lastBagField:  'lastbag',
  beltField:     'belt',
};

// ── SLA benchmarks (minutes) ──────────────────────────────────────────────────
const SLA_TTFB    = 20;  // time to first bag target
const SLA_BELT    = 30;  // belt duration target
const SLA_TOTAL   = 45;  // total delivery target

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: subDays(new Date(), 1), endDate: new Date() },
  adi: 'A',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeDiff(laterStr: unknown, earlierStr: unknown): number | null {
  if (!laterStr || !earlierStr) return null;
  try {
    const diff = differenceInMinutes(parseISO(String(laterStr)), parseISO(String(earlierStr)));
    if (diff < 0 || diff > 240) return null;
    return diff;
  } catch { return null; }
}

function perfColor(mins: number, target: number): string {
  if (mins <= target * 0.8) return '#22c55e';
  if (mins <= target)        return '#84cc16';
  if (mins <= target * 1.3)  return '#f59e0b';
  return '#ef4444';
}

function perfLabel(mins: number, target: number): string {
  if (mins <= target * 0.8) return 'Excellent';
  if (mins <= target)        return 'On Target';
  if (mins <= target * 1.3)  return 'At Risk';
  return 'Breach';
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
interface FieldConfig { firstBagField: string; lastBagField: string; beltField: string }

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
    if (draft.firstBagField.trim() && draft.lastBagField.trim()) onApply(draft);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5 text-slate-600 font-medium">
        <Settings className="w-4 h-4 text-slate-400" />
        Field Names
      </div>
      <div className="flex items-center gap-2">
        <label className="text-slate-500 whitespace-nowrap">First Bag:</label>
        <input
          value={draft.firstBagField}
          onChange={e => setDraft(d => ({ ...d, firstBagField: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="firstbag"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-slate-500 whitespace-nowrap">Last Bag:</label>
        <input
          value={draft.lastBagField}
          onChange={e => setDraft(d => ({ ...d, lastBagField: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="lastbag"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-slate-500 whitespace-nowrap">Baggage Belt:</label>
        <input
          value={draft.beltField}
          onChange={e => setDraft(d => ({ ...d, beltField: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="belt"
        />
      </div>
      <button
        onClick={apply}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Apply
      </button>
      {changed && (
        <button
          onClick={() => { setDraft(DEFAULTS); onApply(DEFAULTS); }}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Reset defaults
        </button>
      )}
      <span className="ml-auto text-xs text-slate-400 hidden sm:block">
        SLA: First bag ≤{SLA_TTFB}m · Belt ≤{SLA_BELT}m · Total ≤{SLA_TOTAL}m
      </span>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────
export const BaggageBeltPage: React.FC = () => {
  const [filters, setFilters]     = useState<FilterState>(DEFAULT_FILTERS);
  const { config: fieldConfig, apply: applyFieldConfig } = usePersistedConfig('baggage_belt', DEFAULTS);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const handleRefresh = () => fetchFlights(filters.dateRange);

  const airlines = useMemo(() => [...new Set(flights.map(f => f.linecode))].sort(), [flights]);

  // Arrivals only, apply filters
  const arrivals = useMemo(() => flights.filter(f => {
    if (f.adi !== 'A') return false;
    if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
    return true;
  }), [flights, filters]);

  // Enrich with belt metrics
  const enriched = useMemo(() => arrivals.map(f => {
    const fr    = f as Record<string, unknown>;
    const ttfb  = safeDiff(fr[fieldConfig.firstBagField], f.actual);
    const belt  = safeDiff(fr[fieldConfig.lastBagField],  fr[fieldConfig.firstBagField]);
    const total = safeDiff(fr[fieldConfig.lastBagField],  f.actual);
    const beltId = String(fr[fieldConfig.beltField] ?? f.claim ?? '');
    return { ...f, ttfb, belt, total, beltId };
  }), [arrivals, fieldConfig]);

  const withData = useMemo(() => enriched.filter(f => f.ttfb !== null && f.belt !== null), [enriched]);

  // KPIs
  const kpis = useMemo(() => {
    const n = withData.length;
    if (n === 0) return { n, avgTtfb: 0, avgBelt: 0, avgTotal: 0, slaBreaches: 0, slaPct: 0, bestAirline: '—', worstAirline: '—' };

    const avgTtfb  = Math.round(withData.reduce((s, f) => s + (f.ttfb  ?? 0), 0) / n);
    const avgBelt  = Math.round(withData.reduce((s, f) => s + (f.belt  ?? 0), 0) / n);
    const avgTotal = Math.round(withData.reduce((s, f) => s + (f.total ?? 0), 0) / n);
    const breaches = withData.filter(f => (f.total ?? 0) > SLA_TOTAL).length;
    const slaPct   = Math.round(((n - breaches) / n) * 100);

    // By airline
    const byAirline: Record<string, { sum: number; count: number }> = {};
    withData.forEach(f => {
      if (!byAirline[f.linecode]) byAirline[f.linecode] = { sum: 0, count: 0 };
      byAirline[f.linecode].sum += f.ttfb ?? 0;
      byAirline[f.linecode].count++;
    });
    const airlineAvgs = Object.entries(byAirline).map(([a, v]) => ({ airline: a, avg: v.sum / v.count }));
    const best  = airlineAvgs.sort((a, b) => a.avg - b.avg)[0]?.airline  ?? '—';
    const worst = airlineAvgs.sort((a, b) => b.avg - a.avg)[0]?.airline  ?? '—';

    return { n, avgTtfb, avgBelt, avgTotal, slaBreaches: breaches, slaPct, bestAirline: best, worstAirline: worst };
  }, [withData]);

  // Per-airline chart data
  const airlineData = useMemo(() => {
    const stats: Record<string, { sumTtfb: number; sumBelt: number; sumTotal: number; n: number }> = {};
    withData.forEach(f => {
      if (!stats[f.linecode]) stats[f.linecode] = { sumTtfb: 0, sumBelt: 0, sumTotal: 0, n: 0 };
      stats[f.linecode].sumTtfb  += f.ttfb  ?? 0;
      stats[f.linecode].sumBelt  += f.belt  ?? 0;
      stats[f.linecode].sumTotal += f.total ?? 0;
      stats[f.linecode].n++;
    });
    return Object.entries(stats)
      .map(([airline, s]) => ({
        airline,
        'Avg TTFB':          Math.round(s.sumTtfb  / s.n),
        'Avg Belt Duration': Math.round(s.sumBelt  / s.n),
        'Avg Total':         Math.round(s.sumTotal / s.n),
        flights: s.n,
      }))
      .sort((a, b) => a['Avg TTFB'] - b['Avg TTFB']);
  }, [withData]);

  // Distribution buckets for TTFB
  const ttfbDist = useMemo(() => {
    const buckets: Record<string, number> = {
      '0–15m': 0, '15–20m': 0, '20–25m': 0, '25–30m': 0, '30–40m': 0, '40m+': 0,
    };
    withData.forEach(f => {
      const v = f.ttfb ?? 0;
      if (v <= 15)       buckets['0–15m']++;
      else if (v <= 20)  buckets['15–20m']++;
      else if (v <= 25)  buckets['20–25m']++;
      else if (v <= 30)  buckets['25–30m']++;
      else if (v <= 40)  buckets['30–40m']++;
      else               buckets['40m+']++;
    });
    return Object.entries(buckets).map(([band, count]) => ({ band, count }));
  }, [withData]);

  // By hour trend
  const byHour = useMemo(() => {
    const stats: Record<number, { sumTtfb: number; sumTotal: number; n: number }> = {};
    withData.forEach(f => {
      if (!f.actual) return;
      try {
        const h = parseISO(f.actual).getHours();
        if (!stats[h]) stats[h] = { sumTtfb: 0, sumTotal: 0, n: 0 };
        stats[h].sumTtfb  += f.ttfb  ?? 0;
        stats[h].sumTotal += f.total ?? 0;
        stats[h].n++;
      } catch {}
    });
    return Object.entries(stats)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([h, s]) => ({
        hour:       `${String(Number(h)).padStart(2, '0')}:00`,
        'Avg TTFB': Math.round(s.sumTtfb  / s.n),
        'Avg Total':Math.round(s.sumTotal / s.n),
      }));
  }, [withData]);

  // Top worst performers
  const worstFlights = useMemo(() =>
    [...withData].filter(f => f.total !== null).sort((a, b) => (b.total ?? 0) - (a.total ?? 0)).slice(0, 12),
  [withData]);

  const noDataFields = withData.length === 0 && arrivals.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800"><strong>Demo Mode:</strong> Showing simulated baggage timing data.</span>
        </div>
      )}

      {/* Field config */}
      <FieldConfigBar config={fieldConfig} onApply={applyFieldConfig} />

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu
          data={withData.map((f) => ({
            Flight: `${f.linecode}${f.number}`,
            Airline: f.linecode,
            City: f.city,
            Belt: f.beltId || f.claim || '—',
            'Time to First Bag (min)': f.ttfb ?? '—',
            'Belt Duration (min)': f.belt ?? '—',
            'Total Delivery (min)': f.total ?? '—',
            'TTFB SLA': f.ttfb != null ? (f.ttfb <= SLA_TTFB ? 'Pass' : 'Breach') : '—',
            'Total SLA': f.total != null ? (f.total <= SLA_TOTAL ? 'Pass' : 'Breach') : '—',
            Status: f.status,
          }))}
          title="Baggage Belt Performance"
          filename="baggage-belt"
          disabled={withData.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading baggage belt data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && noDataFields && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-slate-500">
          <Luggage className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No baggage timing data found</p>
          <p className="text-sm mt-1">
            Fields <code className="bg-slate-100 px-1 rounded">{fieldConfig.firstBagField}</code> and{' '}
            <code className="bg-slate-100 px-1 rounded">{fieldConfig.lastBagField}</code> were not found in the flight data.
            Update the field names above to match your system.
          </p>
        </div>
      )}

      {!loading && !noDataFields && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard title="Flights w/ Bag Data" value={kpis.n.toLocaleString()} icon={<Luggage className="w-6 h-6" />} color="blue" />
            <KPICard
              title="Avg Time to 1st Bag"
              value={kpis.n > 0 ? `${kpis.avgTtfb}m` : '—'}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.avgTtfb <= SLA_TTFB ? 'green' : kpis.avgTtfb <= SLA_TTFB * 1.3 ? 'amber' : 'red'}
              subtitle={kpis.n > 0 ? `Target ≤${SLA_TTFB}m` : undefined}
            />
            <KPICard
              title="Avg Belt Duration"
              value={kpis.n > 0 ? `${kpis.avgBelt}m` : '—'}
              icon={<TrendingDown className="w-6 h-6" />}
              color={kpis.avgBelt <= SLA_BELT ? 'green' : kpis.avgBelt <= SLA_BELT * 1.3 ? 'amber' : 'red'}
              subtitle={kpis.n > 0 ? `Target ≤${SLA_BELT}m` : undefined}
            />
            <KPICard
              title="Avg Total Delivery"
              value={kpis.n > 0 ? `${kpis.avgTotal}m` : '—'}
              icon={<CheckCircle className="w-6 h-6" />}
              color={kpis.avgTotal <= SLA_TOTAL ? 'green' : kpis.avgTotal <= SLA_TOTAL * 1.3 ? 'amber' : 'red'}
              subtitle={kpis.n > 0 ? `Target ≤${SLA_TOTAL}m` : undefined}
            />
            <KPICard
              title="SLA Compliance"
              value={kpis.n > 0 ? `${kpis.slaPct}%` : '—'}
              icon={<CheckCircle className="w-6 h-6" />}
              color={kpis.slaPct >= 90 ? 'green' : kpis.slaPct >= 75 ? 'amber' : 'red'}
              subtitle={kpis.n > 0 ? `${kpis.slaBreaches} breaches` : undefined}
            />
            <KPICard
              title="Best Airline"
              value={kpis.bestAirline}
              icon={<CheckCircle className="w-6 h-6" />}
              color="green"
              subtitle="Lowest avg TTFB"
            />
          </div>

          {/* Row 1 — Airline breakdown + TTFB distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Baggage Times by Airline (avg minutes)</h3>
              {airlineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(260, airlineData.length * 42)}>
                  <BarChart data={airlineData} layout="vertical" margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                    <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="Avg TTFB"          fill="#6366f1" radius={[0, 3, 3, 0]} />
                    <Bar dataKey="Avg Belt Duration" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Time to First Bag Distribution</h3>
              <p className="text-xs text-slate-500 mb-4">Number of flights per TTFB band — green target is ≤{SLA_TTFB}m</p>
              {ttfbDist.some(d => d.count > 0) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ttfbDist} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [v, 'Flights']} />
                    <Bar dataKey="count" name="Flights" radius={[4, 4, 0, 0]}>
                      {ttfbDist.map((d, i) => (
                        <Cell key={i} fill={
                          d.band === '0–15m' ? '#22c55e' :
                          d.band === '15–20m' ? '#84cc16' :
                          d.band === '20–25m' ? '#f59e0b' :
                          d.band === '25–30m' ? '#fb923c' :
                          '#ef4444'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>
          </div>

          {/* Row 2 — Hourly trend */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Baggage Performance by Hour</h3>
            {byHour.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={byHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="Avg TTFB"  stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Avg Total" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Row 3 — Flight-level table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Slowest Baggage Deliveries</h3>
              <span className="text-xs text-slate-500">Top 12 by total delivery time</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Flight</th>
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">From</th>
                    <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Carousel</th>
                    <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Time to 1st Bag</th>
                    <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Belt Duration</th>
                    <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Delivery</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {worstFlights.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No baggage timing data</td></tr>
                  ) : worstFlights.map((f, i) => {
                    const ttfbColor  = f.ttfb  !== null ? perfColor(f.ttfb,  SLA_TTFB)  : '#94a3b8';
                    const totalColor = f.total !== null ? perfColor(f.total, SLA_TOTAL) : '#94a3b8';
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{f.linecode}{f.number}</td>
                        <td className="px-4 py-3 text-slate-600">{f.city}</td>
                        <td className="px-4 py-3">
                          {f.claim
                            ? <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{f.claim}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: ttfbColor }}>
                          {f.ttfb !== null ? `${f.ttfb}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">
                          {f.belt !== null ? `${f.belt}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: totalColor }}>
                          {f.total !== null ? `${f.total}m` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {f.total !== null ? (
                            <span
                              className="text-xs font-semibold px-2 py-1 rounded-full"
                              style={{ backgroundColor: totalColor + '20', color: totalColor }}
                            >
                              {perfLabel(f.total, SLA_TOTAL)}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
