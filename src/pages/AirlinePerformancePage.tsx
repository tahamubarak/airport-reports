import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { FilterState, AirlineStats, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { addDays } from 'date-fns';

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: new Date(), endDate: addDays(new Date(), 1) },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

export const AirlinePerformancePage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
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

  const airlineStats = useMemo((): AirlineStats[] => {
    const stats: Record<string, AirlineStats> = {};
    filtered.forEach((f) => {
      if (!stats[f.linecode]) {
        stats[f.linecode] = { airline: f.linecode, totalFlights: 0, onTime: 0, delayed: 0, cancelled: 0, avgDelay: 0 };
      }
      const s = stats[f.linecode];
      s.totalFlights++;
      if (f.status === 'On Time' || f.status === 'Early') s.onTime++;
      else if (f.status === 'Delayed') { s.delayed++; s.avgDelay += f.delayMinutes; }
      else if (f.status === 'Cancelled') s.cancelled++;
    });
    return Object.values(stats).map((s) => ({
      ...s,
      avgDelay: s.delayed > 0 ? Math.round(s.avgDelay / s.delayed) : 0,
    })).sort((a, b) => b.totalFlights - a.totalFlights);
  }, [filtered]);

  const chartData = airlineStats.map((s) => ({
    airline: s.airline,
    'On Time': s.onTime,
    'Delayed': s.delayed,
    'Cancelled': s.cancelled,
    'On-Time %': s.totalFlights > 0 ? Math.round((s.onTime / s.totalFlights) * 100) : 0,
    'Avg Delay': s.avgDelay,
  }));

  const compareData = selectedAirlines.length > 0
    ? airlineStats.filter((s) => selectedAirlines.includes(s.airline))
    : airlineStats.slice(0, 6);

  const radarData = [
    { metric: 'On-Time %' },
    { metric: 'Reliability' },
    { metric: 'Volume' },
    { metric: 'No Cancels' },
    { metric: 'Low Delay' },
  ].map((row) => {
    const entry: Record<string, string | number> = { metric: row.metric };
    compareData.forEach((s) => {
      const maxFlights = Math.max(...airlineStats.map((a) => a.totalFlights));
      if (row.metric === 'On-Time %') entry[s.airline] = s.totalFlights > 0 ? Math.round((s.onTime / s.totalFlights) * 100) : 0;
      else if (row.metric === 'Reliability') entry[s.airline] = s.totalFlights > 0 ? Math.round(((s.totalFlights - s.cancelled) / s.totalFlights) * 100) : 0;
      else if (row.metric === 'Volume') entry[s.airline] = maxFlights > 0 ? Math.round((s.totalFlights / maxFlights) * 100) : 0;
      else if (row.metric === 'No Cancels') entry[s.airline] = s.totalFlights > 0 ? Math.round(((s.totalFlights - s.cancelled) / s.totalFlights) * 100) : 0;
      else if (row.metric === 'Low Delay') entry[s.airline] = Math.max(0, 100 - s.avgDelay);
    });
    return entry;
  });

  const toggleAirlineCompare = (airline: string) => {
    setSelectedAirlines((prev) =>
      prev.includes(airline) ? prev.filter((a) => a !== airline) : [...prev, airline]
    );
  };

  const exportData = airlineStats.map((s) => ({
    Airline: s.airline,
    'Total Flights': s.totalFlights,
    'On Time': s.onTime,
    'Delayed': s.delayed,
    'Cancelled': s.cancelled,
    'On-Time %': s.totalFlights > 0 ? `${Math.round((s.onTime / s.totalFlights) * 100)}%` : '0%',
    'Avg Delay (min)': s.avgDelay,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800"><strong>Demo Mode:</strong> Showing simulated data due to CORS restrictions.</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu data={exportData} title="Airline Performance Report" filename="airline-performance" disabled={exportData.length === 0} />
      </div>

      {loading && <LoadingSpinner message="Loading airline data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* On-Time % Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">On-Time Performance by Airline</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis yAxisId="count" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar yAxisId="count" dataKey="On Time" stackId="a" fill="#22c55e" />
                  <Bar yAxisId="count" dataKey="Delayed" stackId="a" fill="#f59e0b" />
                  <Bar yAxisId="count" dataKey="Cancelled" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Radar chart comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Airline Comparison (Radar)</h3>
                <p className="text-xs text-slate-500">
                  {selectedAirlines.length > 0 ? `${selectedAirlines.length} selected` : 'Top 6'}
                </p>
              </div>
              {compareData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                    {compareData.map((s, i) => (
                      <Radar
                        key={s.airline}
                        name={s.airline}
                        dataKey={s.airline}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Avg Delay by Airline (mins)</h3>
              {chartData.filter((d) => d['Avg Delay'] > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartData.filter((d) => d['Avg Delay'] > 0).sort((a, b) => (b['Avg Delay'] as number) - (a['Avg Delay'] as number))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} unit="m" />
                    <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={30} />
                    <Tooltip formatter={(v) => [`${v}m`, 'Avg Delay']} />
                    <Bar dataKey="Avg Delay" radius={[0, 4, 4, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No delayed flights</div>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Airline Performance Summary</h3>
              <p className="text-xs text-slate-500">Click rows to add to comparison</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Airline</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">On Time</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delayed</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Cancelled</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">On-Time %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {airlineStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">No airline data available</td>
                    </tr>
                  ) : (
                    airlineStats.map((s, i) => {
                      const onTimePct = s.totalFlights > 0 ? Math.round((s.onTime / s.totalFlights) * 100) : 0;
                      const isSelected = selectedAirlines.includes(s.airline);
                      return (
                        <tr
                          key={s.airline}
                          className={`hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                          onClick={() => toggleAirlineCompare(s.airline)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                              <span
                                className="font-bold px-2 py-0.5 rounded text-white text-sm"
                                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                              >
                                {s.airline}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{s.totalFlights}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium">{s.onTime}</td>
                          <td className="px-4 py-3 text-right text-amber-600 font-medium">{s.delayed}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-medium">{s.cancelled}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full"
                                  style={{
                                    width: `${onTimePct}%`,
                                    backgroundColor: onTimePct >= 80 ? '#22c55e' : onTimePct >= 60 ? '#f59e0b' : '#ef4444',
                                  }}
                                />
                              </div>
                              <span className={`font-semibold ${onTimePct >= 80 ? 'text-green-600' : onTimePct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                                {onTimePct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {s.avgDelay > 0 ? (
                              <span className="text-amber-600 font-medium">{s.avgDelay}m</span>
                            ) : (
                              <span className="text-green-600">—</span>
                            )}
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
