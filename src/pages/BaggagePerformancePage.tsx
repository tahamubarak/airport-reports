import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts';
import { Luggage, AlertTriangle, Package, Clock, TrendingDown, Layers, Settings, RefreshCw } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { Badge } from '../components/ui/Badge';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { FilterState, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { subDays, parseISO, format } from 'date-fns';

interface FieldConfig { claimField: string; }
const DEFAULTS: FieldConfig = { claimField: 'claim' };

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: subDays(new Date(), 1), endDate: new Date() },
  adi: 'A',          // Baggage = arrivals only
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

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
            <span className="font-medium">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const BaggagePerformancePage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { config: fieldConfig, apply: applyFieldConfig } = usePersistedConfig('baggage_performance', DEFAULTS);
  const [draft, setDraft] = useState<FieldConfig>(DEFAULTS);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);

  // Sync draft when persisted config loads (site change)
  const cfgStr = JSON.stringify(fieldConfig);
  useEffect(() => { try { setDraft(JSON.parse(cfgStr)); } catch {} }, [cfgStr]);

  useEffect(() => {
    fetchFlights(filters.dateRange);
  }, [adminActiveSiteId]);

  const handleRefresh = () => fetchFlights(filters.dateRange);
  const handleApply = () => applyFieldConfig({ ...draft });

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  // Arrivals only — baggage is only for inbound flights
  const arrivals = useMemo(() => {
    return flights.filter((f) => {
      if (f.adi !== 'A') return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      return true;
    });
  }, [flights, filters]);

  const withClaim = useMemo(() => arrivals.filter((f) => {
    const fr = f as unknown as Record<string, unknown>;
    const val = String(fr[fieldConfig.claimField] ?? '').trim();
    return val !== '';
  }), [arrivals, fieldConfig.claimField]);

  // KPIs
  const kpis = useMemo(() => {
    const getClaimVal = (f: typeof arrivals[0]) => String((f as unknown as Record<string, unknown>)[fieldConfig.claimField] ?? '').trim();
    const carousels = new Set(withClaim.map(getClaimVal));
    const delayed = arrivals.filter((f) => f.status === 'Delayed');
    const delayedWithClaim = delayed.filter((f) => getClaimVal(f) !== '');

    const avgFlightsPerClaim =
      carousels.size > 0 ? Math.round(withClaim.length / carousels.size) : 0;

    // Most loaded carousel
    const claimCounts: Record<string, number> = {};
    withClaim.forEach((f) => { const v = getClaimVal(f); claimCounts[v] = (claimCounts[v] || 0) + 1; });
    const topClaim = Object.entries(claimCounts).sort((a, b) => b[1] - a[1])[0];

    const avgDelay =
      delayed.length > 0
        ? Math.round(delayed.reduce((s, f) => s + f.delayMinutes, 0) / delayed.length)
        : 0;

    return {
      totalArrivals: arrivals.length,
      activeCarousels: carousels.size,
      avgFlightsPerClaim,
      delayedArrivals: delayed.length,
      delayedWithClaim: delayedWithClaim.length,
      topClaim: topClaim ? `Carousel ${topClaim[0]} (${topClaim[1]} flights)` : '—',
      avgDelay,
    };
  }, [arrivals, withClaim, fieldConfig.claimField]);

  // Per-carousel breakdown
  const carouselData = useMemo(() => {
    const stats: Record<
      string,
      { claim: string; total: number; delayed: number; cancelled: number; totalDelayMins: number }
    > = {};

    arrivals.forEach((f) => {
      const fr = f as unknown as Record<string, unknown>;
      const rawClaim = String(fr[fieldConfig.claimField] ?? '').trim();
      const key = rawClaim !== '' ? rawClaim : 'No Claim';
      if (!stats[key]) stats[key] = { claim: key, total: 0, delayed: 0, cancelled: 0, totalDelayMins: 0 };
      stats[key].total++;
      if (f.status === 'Delayed') { stats[key].delayed++; stats[key].totalDelayMins += f.delayMinutes; }
      if (f.status === 'Cancelled') stats[key].cancelled++;
    });

    return Object.values(stats)
      .sort((a, b) => b.total - a.total)
      .map((s) => ({
        ...s,
        avgDelay: s.delayed > 0 ? Math.round(s.totalDelayMins / s.delayed) : 0,
        delayPct: s.total > 0 ? Math.round((s.delayed / s.total) * 100) : 0,
      }));
  }, [arrivals, fieldConfig.claimField]);

  // Arrivals by hour
  const byHour = useMemo(() => {
    const counts: Record<number, { on_time: number; delayed: number; cancelled: number }> = {};
    for (let h = 0; h < 24; h++) counts[h] = { on_time: 0, delayed: 0, cancelled: 0 };

    arrivals.forEach((f) => {
      if (!f.schedule) return;
      try {
        const hour = parseISO(f.schedule).getHours();
        if (f.status === 'Delayed') counts[hour].delayed++;
        else if (f.status === 'Cancelled') counts[hour].cancelled++;
        else counts[hour].on_time++;
      } catch {}
    });

    return Object.entries(counts)
      .filter(([, v]) => v.on_time + v.delayed + v.cancelled > 0)
      .map(([hour, v]) => ({
        hour: `${String(Number(hour)).padStart(2, '0')}:00`,
        'On Time': v.on_time,
        Delayed: v.delayed,
        Cancelled: v.cancelled,
      }));
  }, [arrivals]);

  // Top delayed arrivals table
  const topDelayed = useMemo(() => {
    return [...arrivals]
      .filter((f) => f.status === 'Delayed')
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 10);
  }, [arrivals]);

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800">
            <strong>Demo Mode:</strong> Showing simulated data due to CORS restrictions.
          </span>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-blue-800">
        <Luggage className="w-4 h-4 flex-shrink-0 text-blue-600" />
        Baggage performance is measured on <strong className="mx-1">arriving flights only</strong>. Carousel assignments come from the baggage claim field.
      </div>

      {/* Field config bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm space-y-2">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Settings className="w-4 h-4 text-slate-400" />
          Field Names
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs whitespace-nowrap">Claim / Belt:</label>
            <input
              value={draft.claimField}
              onChange={(e) => setDraft((p) => ({ ...p, claimField: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="claim"
            />
          </div>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {fieldConfig.claimField !== DEFAULTS.claimField && (
            <button
              onClick={() => { applyFieldConfig(DEFAULTS); setDraft(DEFAULTS); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Reset defaults
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            airlines={airlines}
            onRefresh={handleRefresh}
            loading={loading}
          />
        </div>
        <ExportMenu
          data={carouselData.map((c) => ({
            'Carousel/Claim': c.claim,
            'Total Arrivals': c.total,
            'Delayed': c.delayed,
            'Cancelled': c.cancelled,
            'Delay %': `${c.delayPct}%`,
            'Avg Delay (min)': c.avgDelay,
          }))}
          title="Baggage Performance Report"
          filename="baggage-performance"
          disabled={arrivals.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading baggage data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Total Arrivals"
              value={kpis.totalArrivals.toLocaleString()}
              icon={<Luggage className="w-6 h-6" />}
              color="blue"
            />
            <KPICard
              title="Active Carousels"
              value={kpis.activeCarousels}
              icon={<Layers className="w-6 h-6" />}
              color="purple"
            />
            <KPICard
              title="Flights / Carousel"
              value={kpis.avgFlightsPerClaim}
              icon={<Package className="w-6 h-6" />}
              color="slate"
            />
            <KPICard
              title="Delayed Arrivals"
              value={kpis.delayedArrivals}
              icon={<TrendingDown className="w-6 h-6" />}
              color={kpis.delayedArrivals === 0 ? 'green' : kpis.delayedArrivals < 5 ? 'amber' : 'red'}
            />
            <KPICard
              title="Avg Arrival Delay"
              value={`${kpis.avgDelay}m`}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.avgDelay <= 10 ? 'green' : kpis.avgDelay <= 25 ? 'amber' : 'red'}
            />
            <KPICard
              title="Busiest Carousel"
              value={kpis.activeCarousels > 0 ? kpis.topClaim.replace('Carousel ', '') : '—'}
              icon={<Package className="w-6 h-6" />}
              color="amber"
              subtitle={kpis.activeCarousels > 0 ? kpis.topClaim : undefined}
            />
          </div>

          {/* Row 1 — Carousel flight volume + delay % */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Flights per Carousel</h3>
              {carouselData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={carouselData.slice(0, 12)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="claim" tick={{ fontSize: 11, fill: '#64748b' }} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="total" name="Total Arrivals" radius={[0, 4, 4, 0]}>
                      {carouselData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Delayed Arrivals per Carousel</h3>
              {carouselData.filter((d) => d.delayed > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={carouselData.filter((d) => d.delayed > 0).sort((a, b) => b.delayed - a.delayed).slice(0, 12)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="claim" tick={{ fontSize: 11, fill: '#64748b' }} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="delayed" name="Delayed" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  No delayed arrivals in selected range
                </div>
              )}
            </div>
          </div>

          {/* Row 2 — Arrivals by hour */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Arriving Flights by Hour of Day</h3>
            {byHour.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="On Time" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Delayed" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Cancelled" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Row 3 — Carousel summary table + top delayed */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Carousel Summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Carousel</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Arrivals</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delayed</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delay %</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Delay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {carouselData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400">No carousel data</td>
                      </tr>
                    ) : (
                      carouselData.map((row, i) => (
                        <tr key={row.claim} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span
                              className="font-bold px-2 py-0.5 rounded text-white text-xs"
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            >
                              {row.claim}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{row.total}</td>
                          <td className="px-4 py-3 text-right text-amber-600 font-medium">{row.delayed}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 bg-slate-100 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min(row.delayPct, 100)}%`,
                                    backgroundColor: row.delayPct <= 10 ? '#22c55e' : row.delayPct <= 25 ? '#f59e0b' : '#ef4444',
                                  }}
                                />
                              </div>
                              <span className={`font-semibold text-xs ${row.delayPct <= 10 ? 'text-green-600' : row.delayPct <= 25 ? 'text-amber-600' : 'text-red-600'}`}>
                                {row.delayPct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.avgDelay > 0
                              ? <span className="text-amber-600 font-medium">{row.avgDelay}m</span>
                              : <span className="text-green-600">—</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Top Delayed Arrivals</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Flight</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">From</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Carousel</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {topDelayed.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-slate-400">No delayed arrivals</td>
                      </tr>
                    ) : (
                      topDelayed.map((f, i) => {
                        const fr = f as unknown as Record<string, unknown>;
                        const claimVal = String(fr[fieldConfig.claimField] ?? '').trim();
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
                          <td className="px-4 py-3">
                            {claimVal ? (
                              <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                {claimVal}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-amber-600 font-bold">+{f.delayMinutes}m</span>
                          </td>
                        </tr>
                        );
                      })
                    )}
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
