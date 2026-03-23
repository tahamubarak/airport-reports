import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter,
} from 'recharts';
import { AlertTriangle, Clock, TrendingDown, TrendingUp, XCircle, Settings, RefreshCw } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { FilterState } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { format, parseISO, addDays } from 'date-fns';

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: new Date(), endDate: addDays(new Date(), 1) },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

const STATUS_COLORS: Record<string, string> = {
  'On Time': '#22c55e',
  'Early': '#60a5fa',
  'Delayed': '#f59e0b',
  'Cancelled': '#ef4444',
};

const DELAY_DEFAULTS = { actualField: 'actual' };

export const DelayAnalysisPage: React.FC = () => {
  const [filters, setFilters]           = useState<FilterState>(DEFAULT_FILTERS);
  const { config: fieldCfg, apply: applyFieldCfg } = usePersistedConfig('delay_analysis', DELAY_DEFAULTS);
  const [actualFieldInput, setActualFieldInput] = useState(fieldCfg.actualField);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);

  const actualField = fieldCfg.actualField;

  // Sync input when persisted config loads
  const cfgStr = JSON.stringify(fieldCfg);
  useEffect(() => { setActualFieldInput(fieldCfg.actualField); }, [cfgStr]); // eslint-disable-line

  const handleApply = () => applyFieldCfg({ actualField: actualFieldInput.trim() || 'actual' });

  useEffect(() => {
    fetchFlights(filters.dateRange);
  }, [adminActiveSiteId]);

  const handleRefresh = () => fetchFlights(filters.dateRange);

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  const filtered = useMemo(() => {
    return flights.filter((f) => {
      if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      return true;
    });
  }, [flights, filters]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const delayed = filtered.filter((f) => f.status === 'Delayed');
    const cancelled = filtered.filter((f) => f.status === 'Cancelled');
    const onTime = filtered.filter((f) => f.status === 'On Time' || f.status === 'Early');
    const maxDelay = delayed.length > 0 ? Math.max(...delayed.map((f) => f.delayMinutes)) : 0;
    const avgDelay = delayed.length > 0
      ? Math.round(delayed.reduce((s, f) => s + f.delayMinutes, 0) / delayed.length)
      : 0;
    return {
      onTimeRate: total > 0 ? Math.round((onTime.length / total) * 100) : 0,
      avgDelay,
      maxDelay,
      totalDelayed: delayed.length,
      totalCancelled: cancelled.length,
    };
  }, [filtered]);

  const statusPieData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((f) => { counts[f.status] = (counts[f.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const delayByAirline = useMemo(() => {
    const stats: Record<string, { delayed: number; total: number; sumDelay: number }> = {};
    filtered.forEach((f) => {
      if (!stats[f.linecode]) stats[f.linecode] = { delayed: 0, total: 0, sumDelay: 0 };
      stats[f.linecode].total++;
      if (f.status === 'Delayed') {
        stats[f.linecode].delayed++;
        stats[f.linecode].sumDelay += f.delayMinutes;
      }
    });
    return Object.entries(stats)
      .map(([airline, s]) => ({
        airline,
        'On-Time %': s.total > 0 ? Math.round(((s.total - s.delayed) / s.total) * 100) : 0,
        'Avg Delay (min)': s.delayed > 0 ? Math.round(s.sumDelay / s.delayed) : 0,
        flights: s.total,
      }))
      .sort((a, b) => b.flights - a.flights)
      .slice(0, 12);
  }, [filtered]);

  const delayByHour = useMemo(() => {
    const hourData: Record<number, { delayed: number; total: number; sumDelay: number }> = {};
    for (let h = 0; h < 24; h++) hourData[h] = { delayed: 0, total: 0, sumDelay: 0 };
    filtered.forEach((f) => {
      const fr = f as Record<string, unknown>;
      const sv = String(fr['schedule'] ?? '');
      if (!sv) return;
      try {
        const h = parseISO(sv).getHours();
        hourData[h].total++;
        if (f.status === 'Delayed') {
          hourData[h].delayed++;
          hourData[h].sumDelay += f.delayMinutes;
        }
      } catch {}
    });
    return Object.entries(hourData)
      .filter(([, v]) => v.total > 0)
      .map(([hour, v]) => ({
        hour: `${String(Number(hour)).padStart(2, '0')}:00`,
        'Delayed Flights': v.delayed,
        'Avg Delay (min)': v.delayed > 0 ? Math.round(v.sumDelay / v.delayed) : 0,
        total: v.total,
      }));
  }, [filtered]);

  const delayDistribution = useMemo(() => {
    const buckets = [
      { label: '0–15m', min: 0, max: 15 },
      { label: '15–30m', min: 15, max: 30 },
      { label: '30–60m', min: 30, max: 60 },
      { label: '60–120m', min: 60, max: 120 },
      { label: '2h+', min: 120, max: Infinity },
    ];
    const delayed = filtered.filter((f) => f.status === 'Delayed');
    return buckets.map((b) => ({
      label: b.label,
      count: delayed.filter((f) => f.delayMinutes >= b.min && f.delayMinutes < b.max).length,
    }));
  }, [filtered]);

  const topDelayed = useMemo(() => {
    return [...filtered]
      .filter((f) => f.status === 'Delayed')
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 10);
  }, [filtered]);

  const exportData = useMemo(() => filtered.map((f) => {
    const fr = f as Record<string, unknown>;
    const sv = String(fr['schedule'] ?? '');
    const av = String(fr[actualField] ?? '');
    const schedTime = sv ? (() => { try { return format(parseISO(sv), 'HH:mm'); } catch { return sv; } })() : '';
    const actualTime = av ? (() => { try { return format(parseISO(av), 'HH:mm'); } catch { return av; } })() : '';
    const rawDate = String(f.scheduleDate || sv || '');
    const schedDate = rawDate ? (() => { try { return format(parseISO(rawDate), 'yyyy-MM-dd'); } catch { return ''; } })() : '';
    return {
      Flight: `${f.linecode}${f.number}`,
      ADI: f.adi === 'A' ? 'ARR' : 'DEP',
      City: f.city,
      Gate: f.gate || '—',
      'Scheduled Date': schedDate,
      'Scheduled Time': schedTime,
      'Actual Time': actualTime,
      'Delay (min)': f.delayMinutes,
      Status: f.status,
    };
  }), [filtered, actualField]);

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800"><strong>Demo Mode:</strong> Showing simulated data due to CORS restrictions.</span>
        </div>
      )}

      {/* Field config bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm space-y-2">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Settings className="w-4 h-4 text-slate-400" />
          Field Names
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs whitespace-nowrap">Actual / Est. Time:</label>
            <input
              value={actualFieldInput}
              onChange={(e) => setActualFieldInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="actual"
            />
          </div>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {fieldCfg.actualField !== 'actual' && (
            <button
              onClick={() => { applyFieldCfg(DELAY_DEFAULTS); setActualFieldInput('actual'); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Reset defaults
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu data={exportData} title="Delay Analysis Report" filename="delay-analysis" disabled={exportData.length === 0} />
      </div>

      {loading && <LoadingSpinner message="Loading delay data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard
              title="On-Time Rate"
              value={`${kpis.onTimeRate}%`}
              icon={<TrendingDown className="w-6 h-6" />}
              color={kpis.onTimeRate >= 80 ? 'green' : kpis.onTimeRate >= 60 ? 'amber' : 'red'}
            />
            <KPICard
              title="Avg Delay"
              value={`${kpis.avgDelay}m`}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.avgDelay <= 15 ? 'green' : kpis.avgDelay <= 30 ? 'amber' : 'red'}
            />
            <KPICard
              title="Max Delay"
              value={`${kpis.maxDelay}m`}
              icon={<TrendingUp className="w-6 h-6" />}
              color="red"
            />
            <KPICard
              title="Total Delayed"
              value={kpis.totalDelayed}
              icon={<Clock className="w-6 h-6" />}
              color="amber"
            />
            <KPICard
              title="Cancelled"
              value={kpis.totalCancelled}
              icon={<XCircle className="w-6 h-6" />}
              color="red"
            />
          </div>

          {/* Pie + Airline delays */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Status Breakdown</h3>
              {statusPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusPieData.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [v, 'Flights']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">On-Time % by Airline</h3>
              {delayByAirline.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={delayByAirline} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} unit="%" />
                    <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={30} />
                    <Tooltip formatter={(v) => [`${v}%`, 'On-Time Rate']} />
                    <Bar dataKey="On-Time %" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>
          </div>

          {/* Delays by hour + distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Delays by Hour of Day</h3>
              {delayByHour.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={delayByHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Delayed Flights" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Delay Duration Distribution</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={delayDistribution} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v) => [v, 'Flights']} />
                  <Bar dataKey="count" name="Flights" radius={[4, 4, 0, 0]}>
                    {delayDistribution.map((_, i) => (
                      <Cell key={i} fill={['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Delayed Flights */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Most Delayed Flights</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Flight</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ADI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">City</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Gate</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduled</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delay</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {topDelayed.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">No delayed flights</td>
                    </tr>
                  ) : (
                    topDelayed.map((f, i) => {
                      const fr = f as Record<string, unknown>;
                      const sv = String(fr['schedule'] ?? '');
                      const av = String(fr[actualField] ?? '');
                      const rawDate = String(f.scheduleDate || sv || '');
                      const schedDate = rawDate ? (() => { try { return format(parseISO(rawDate), 'MM/dd'); } catch { return ''; } })() : '';
                      const schedTime = sv ? (() => { try { return format(parseISO(sv), 'HH:mm'); } catch { return sv; } })() : '—';
                      const actualTime = av ? (() => { try { return format(parseISO(av), 'HH:mm'); } catch { return av; } })() : '—';
                      return (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{f.linecode}{f.number}</div>
                          {schedDate && <div className="text-xs text-slate-400">{schedDate}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${f.adi === 'A' ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-50 text-rose-700'}`}>
                            {f.adi === 'A' ? 'ARR' : 'DEP'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{f.city}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{f.gate || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{schedTime}</td>
                        <td className="px-4 py-3 text-amber-600 font-medium">{actualTime}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-amber-600 font-bold text-base">+{f.delayMinutes}m</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge label={f.status} variant="status" />
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
