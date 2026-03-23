import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Users, AlertTriangle, Activity, TrendingUp, Clock, Zap, RefreshCw } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { FilterState, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { subDays, parseISO } from 'date-fns';

// Default estimated passengers per flight movement (industry narrow-body average)
const DEFAULT_PAX_PER_FLIGHT = 150;

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: subDays(new Date(), 1), endDate: new Date() },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

// Extract concourse from gate (e.g. "A12" → "A", "12" → "Terminal", "B3" → "B")
function getConcourse(gate: string): string {
  if (!gate || gate.trim() === '') return 'Unassigned';
  const match = gate.trim().match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : 'Terminal';
}

function congestionColor(load: number): string {
  if (load < 30) return '#22c55e';   // green
  if (load < 60) return '#84cc16';   // lime
  if (load < 80) return '#f59e0b';   // amber
  return '#ef4444';                   // red
}

function congestionLabel(load: number): string {
  if (load < 30) return 'Low';
  if (load < 60) return 'Moderate';
  if (load < 80) return 'High';
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
            <span className="font-medium">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const PassengerFlowPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [paxPerFlight, setPaxPerFlight] = useState(DEFAULT_PAX_PER_FLIGHT);
  const [paxInput, setPaxInput] = useState(String(DEFAULT_PAX_PER_FLIGHT));
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);

  useEffect(() => {
    fetchFlights(filters.dateRange);
  }, [adminActiveSiteId]);

  const handleRefresh = () => fetchFlights(filters.dateRange);

  const handleApplyPax = () => {
    const val = parseInt(paxInput, 10);
    if (!isNaN(val) && val > 0 && val <= 10000) {
      setPaxPerFlight(val);
    } else {
      setPaxInput(String(paxPerFlight));
    }
  };

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  const filtered = useMemo(() => {
    return flights.filter((f) => {
      if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      return true;
    });
  }, [flights, filters]);

  // Pax flow by hour — arrivals = deplaning, departures = boarding
  const flowByHour = useMemo(() => {
    const hours: Record<number, { deplaning: number; boarding: number; total: number }> = {};
    for (let h = 0; h < 24; h++) hours[h] = { deplaning: 0, boarding: 0, total: 0 };

    filtered.forEach((f) => {
      const timeStr = f.actual && f.actual.trim() !== '' ? f.actual : f.schedule;
      if (!timeStr) return;
      try {
        const hour = parseISO(timeStr).getHours();
        if (f.adi === 'A') {
          hours[hour].deplaning += paxPerFlight;
        } else {
          hours[hour].boarding += paxPerFlight;
        }
        hours[hour].total += paxPerFlight;
      } catch {}
    });

    return Object.entries(hours)
      .filter(([, v]) => v.total > 0)
      .map(([h, v]) => ({
        hour: `${String(Number(h)).padStart(2, '0')}:00`,
        'Deplaning (Arr)': v.deplaning,
        'Boarding (Dep)': v.boarding,
        'Total Pax': v.total,
        rawHour: Number(h),
      }));
  }, [filtered, paxPerFlight]);

  // Peak hour
  const peakHour = useMemo(() => {
    if (flowByHour.length === 0) return null;
    return flowByHour.reduce((max, row) => (row['Total Pax'] > max['Total Pax'] ? row : max), flowByHour[0]);
  }, [flowByHour]);

  // Concourse load
  const concourseData = useMemo(() => {
    const stats: Record<string, { flights: number; pax: number; arrivals: number; departures: number }> = {};

    filtered.forEach((f) => {
      const key = getConcourse(f.gate);
      if (!stats[key]) stats[key] = { flights: 0, pax: 0, arrivals: 0, departures: 0 };
      stats[key].flights++;
      stats[key].pax += paxPerFlight;
      if (f.adi === 'A') stats[key].arrivals++;
      else stats[key].departures++;
    });

    const maxPax = Math.max(...Object.values(stats).map((s) => s.pax), 1);

    return Object.entries(stats)
      .sort((a, b) => b[1].pax - a[1].pax)
      .map(([concourse, s]) => ({
        concourse,
        ...s,
        loadPct: Math.round((s.pax / maxPax) * 100),
      }));
  }, [filtered, paxPerFlight]);

  // Peak concourse
  const peakConcourse = concourseData[0] ?? null;

  // KPIs
  const kpis = useMemo(() => {
    const totalPax = filtered.length * paxPerFlight;
    const depPax = filtered.filter((f) => f.adi === 'D').length * paxPerFlight;
    const arrPax = filtered.filter((f) => f.adi === 'A').length * paxPerFlight;
    const peakLoad = peakHour ? peakHour['Total Pax'] : 0;
    const congestionScore = flowByHour.length > 0
      ? Math.min(100, Math.round((peakLoad / Math.max(flowByHour.reduce((s, r) => s + r['Total Pax'], 0) / flowByHour.length, 1)) * 50))
      : 0;

    return { totalPax, depPax, arrPax, peakLoad, congestionScore };
  }, [filtered, peakHour, flowByHour, paxPerFlight]);

  // Heatmap: hour × concourse (pax count)
  const heatmapConcourses = useMemo(() => concourseData.filter((c) => c.concourse !== 'Unassigned').map((c) => c.concourse), [concourseData]);

  const heatmapData = useMemo(() => {
    const grid: Record<string, Record<string, number>> = {};
    for (let h = 0; h < 24; h++) {
      const hKey = `${String(h).padStart(2, '0')}:00`;
      grid[hKey] = {};
      heatmapConcourses.forEach((c) => { grid[hKey][c] = 0; });
    }

    filtered.forEach((f) => {
      const timeStr = f.actual && f.actual.trim() !== '' ? f.actual : f.schedule;
      if (!timeStr) return;
      try {
        const hour = parseISO(timeStr).getHours();
        const hKey = `${String(hour).padStart(2, '0')}:00`;
        const conc = getConcourse(f.gate);
        if (grid[hKey] && heatmapConcourses.includes(conc)) {
          grid[hKey][conc] = (grid[hKey][conc] || 0) + paxPerFlight;
        }
      } catch {}
    });

    return Object.entries(grid)
      .filter(([, v]) => Object.values(v).some((x) => x > 0))
      .map(([hour, values]) => ({ hour, ...values } as { hour: string } & Record<string, number | string>));
  }, [filtered, heatmapConcourses, paxPerFlight]);

  const heatmapMax = useMemo(() => {
    let max = 1;
    heatmapData.forEach((row) => {
      heatmapConcourses.forEach((c) => {
        if ((row[c] as number) > max) max = row[c] as number;
      });
    });
    return max;
  }, [heatmapData, heatmapConcourses]);

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

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm text-blue-800 flex-wrap">
        <Users className="w-4 h-4 flex-shrink-0 text-blue-600" />
        <span>
          Passenger counts are <strong>estimated</strong> using flight movements × pax/flight (industry avg). Actual counts require sensor or POS integration.
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <label className="text-blue-700 font-medium whitespace-nowrap">Pax / flight:</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={paxInput}
            onChange={(e) => setPaxInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleApplyPax()}
            className="w-20 text-center text-sm font-bold border border-blue-300 bg-white text-blue-900 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleApplyPax}
            title="Apply"
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {paxPerFlight !== DEFAULT_PAX_PER_FLIGHT && (
            <button
              onClick={() => { setPaxPerFlight(DEFAULT_PAX_PER_FLIGHT); setPaxInput(String(DEFAULT_PAX_PER_FLIGHT)); }}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              Reset to {DEFAULT_PAX_PER_FLIGHT}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu
          data={[
            ...flowByHour.map((r) => ({
              Hour: r.hour,
              'Deplaning (Arr)': r['Deplaning (Arr)'],
              'Boarding (Dep)': r['Boarding (Dep)'],
              'Total Pax': r['Total Pax'],
            })),
          ]}
          title="Passenger Flow Report"
          filename="passenger-flow"
          disabled={flowByHour.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading passenger flow data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Est. Total Pax"
              value={kpis.totalPax.toLocaleString()}
              icon={<Users className="w-6 h-6" />}
              color="blue"
            />
            <KPICard
              title="Deplaning"
              value={kpis.arrPax.toLocaleString()}
              icon={<span className="text-lg font-bold">↓</span>}
              color="slate"
              subtitle="Arriving passengers"
            />
            <KPICard
              title="Boarding"
              value={kpis.depPax.toLocaleString()}
              icon={<span className="text-lg font-bold">↑</span>}
              color="purple"
              subtitle="Departing passengers"
            />
            <KPICard
              title="Peak Hour Pax"
              value={kpis.peakLoad.toLocaleString()}
              icon={<Zap className="w-6 h-6" />}
              color={kpis.peakLoad > 2000 ? 'red' : kpis.peakLoad > 1000 ? 'amber' : 'green'}
              subtitle={peakHour ? `at ${peakHour.hour}` : undefined}
            />
            <KPICard
              title="Peak Concourse"
              value={peakConcourse ? peakConcourse.concourse : '—'}
              icon={<Activity className="w-6 h-6" />}
              color="amber"
              subtitle={peakConcourse ? `${peakConcourse.pax.toLocaleString()} est. pax` : undefined}
            />
            <KPICard
              title="Congestion Score"
              value={`${kpis.congestionScore}/100`}
              icon={<TrendingUp className="w-6 h-6" />}
              color={kpis.congestionScore < 30 ? 'green' : kpis.congestionScore < 60 ? 'amber' : 'red'}
              subtitle={congestionLabel(kpis.congestionScore)}
            />
          </div>

          {/* Pax flow area chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Estimated Passenger Flow by Hour</h3>
              {peakHour && (
                <span className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full font-medium">
                  <Clock className="w-3 h-3" />
                  Peak: {peakHour.hour} — {peakHour['Total Pax'].toLocaleString()} pax
                </span>
              )}
            </div>
            {flowByHour.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={flowByHour} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorDeplaning" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="colorBoarding" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="Deplaning (Arr)" stroke="#6366f1" strokeWidth={2} fill="url(#colorDeplaning)" />
                  <Area type="monotone" dataKey="Boarding (Dep)" stroke="#f59e0b" strokeWidth={2} fill="url(#colorBoarding)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Concourse bar + heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Concourse Load (Est. Pax)</h3>
              {concourseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={concourseData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="concourse" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="arrivals" name="Deplaning" stackId="a" fill="#6366f1" />
                    <Bar dataKey="departures" name="Boarding" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            {/* Congestion heatmap */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-800">Concourse × Hour Heatmap</h3>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-green-400 inline-block" /> Low
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> High
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-500 inline-block" /> Critical
                  </span>
                </div>
              </div>
              {heatmapData.length > 0 && heatmapConcourses.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1 text-slate-500 font-medium w-16">Hour</th>
                        {heatmapConcourses.map((c) => (
                          <th key={c} className="text-center px-1 py-1 text-slate-500 font-semibold">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.map((row) => (
                        <tr key={row.hour}>
                          <td className="px-2 py-1 text-slate-500 font-mono">{row.hour}</td>
                          {heatmapConcourses.map((c) => {
                            const val = (row[c] as number) || 0;
                            const pct = Math.round((val / heatmapMax) * 100);
                            const bg = val === 0 ? '#f8fafc' : congestionColor(pct);
                            return (
                              <td key={c} className="px-1 py-1 text-center">
                                <div
                                  className="rounded text-white font-semibold text-center leading-none py-1.5 px-1 min-w-[32px]"
                                  style={{
                                    backgroundColor: bg,
                                    color: val === 0 ? '#cbd5e1' : 'white',
                                    fontSize: '10px',
                                  }}
                                  title={`${c} @ ${row.hour}: ${val.toLocaleString()} est. pax`}
                                >
                                  {val === 0 ? '·' : val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                  <Activity className="w-8 h-8 opacity-30" />
                  <span>Heatmap requires gate assignments with concourse letters (e.g. A12, B3)</span>
                </div>
              )}
            </div>
          </div>

          {/* Peak hours table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Hourly Passenger Flow Summary</h3>
              <span className="text-xs text-slate-500">Sorted by busiest hour</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Hour</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pax</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Deplaning</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Boarding</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[160px]">Load</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[...flowByHour].sort((a, b) => b['Total Pax'] - a['Total Pax']).map((row, i) => {
                    const maxPax = flowByHour.length > 0 ? Math.max(...flowByHour.map((r) => r['Total Pax'])) : 1;
                    const loadPct = Math.round((row['Total Pax'] / maxPax) * 100);
                    return (
                      <tr key={row.hour} className={`hover:bg-slate-50 ${i === 0 ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-800">{row.hour}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{row['Total Pax'].toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-indigo-600 font-medium">{row['Deplaning (Arr)'].toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-amber-600 font-medium">{row['Boarding (Dep)'].toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24 bg-slate-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{ width: `${loadPct}%`, backgroundColor: congestionColor(loadPct) }}
                              />
                            </div>
                            <span className="text-xs font-semibold w-8 text-right" style={{ color: congestionColor(loadPct) }}>
                              {loadPct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: congestionColor(loadPct) + '20',
                              color: congestionColor(loadPct),
                            }}
                          >
                            {congestionLabel(loadPct)}
                          </span>
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
