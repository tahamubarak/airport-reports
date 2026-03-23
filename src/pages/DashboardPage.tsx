import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Plane, TrendingUp, Clock, DoorOpen, CheckCircle, AlertTriangle } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { Badge } from '../components/ui/Badge';
import { useFlights } from '../hooks/useFlights';
import { FilterState, CHART_COLORS } from '../types';
import { useSessionStore } from '../store/useSessionStore';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: subDays(new Date(), 1), endDate: new Date() },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

const DELAY_COLORS: Record<string, string> = {
  'On Time': '#22c55e',
  'Early': '#60a5fa',
  'Delayed': '#f59e0b',
  'Cancelled': '#ef4444',
};

const CustomTooltip: React.FC<{ active?: boolean; payload?: Array<{name: string; value: number; color: string}>; label?: string }> = ({ active, payload, label }) => {
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

export const DashboardPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { flights, loading, error, isCorsError, isUsingMockData, lastFetched, fetchFlights } = useFlights();
  const { session } = useSessionStore();
  const adminActiveSiteId = session?.adminActiveSiteId;

  useEffect(() => {
    fetchFlights(filters.dateRange);
  }, [adminActiveSiteId]);

  const handleRefresh = () => {
    fetchFlights(filters.dateRange);
  };

  const filteredFlights = useMemo(() => {
    return flights.filter((f) => {
      if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      return true;
    });
  }, [flights, filters]);

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  const kpis = useMemo(() => {
    const total = filteredFlights.length;
    const departures = filteredFlights.filter((f) => f.adi === 'D').length;
    const arrivals = filteredFlights.filter((f) => f.adi === 'A').length;
    const onTime = filteredFlights.filter((f) => f.status === 'On Time' || f.status === 'Early').length;
    const delayed = filteredFlights.filter((f) => f.status === 'Delayed');
    const avgDelay = delayed.length > 0
      ? Math.round(delayed.reduce((sum, f) => sum + f.delayMinutes, 0) / delayed.length)
      : 0;
    const gates = new Set(filteredFlights.map((f) => f.gate).filter(Boolean));
    return {
      total,
      departures,
      arrivals,
      onTimePercent: total > 0 ? Math.round((onTime / total) * 100) : 0,
      avgDelayMinutes: avgDelay,
      activeGates: gates.size,
    };
  }, [filteredFlights]);

  const airlineChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredFlights.forEach((f) => { counts[f.linecode] = (counts[f.linecode] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [filteredFlights]);

  const statusPieData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredFlights.forEach((f) => { counts[f.status] = (counts[f.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredFlights]);

  const flightsByHour = useMemo(() => {
    const hourCounts: Record<number, { arrivals: number; departures: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourCounts[h] = { arrivals: 0, departures: 0 };
    }
    filteredFlights.forEach((f) => {
      if (!f.schedule) return;
      try {
        const hour = parseISO(f.schedule).getHours();
        if (f.adi === 'A') hourCounts[hour].arrivals++;
        else hourCounts[hour].departures++;
      } catch {}
    });
    return Object.entries(hourCounts)
      .filter(([, v]) => v.arrivals + v.departures > 0)
      .map(([hour, counts]) => ({
        hour: `${String(Number(hour)).padStart(2, '0')}:00`,
        ...counts,
        total: counts.arrivals + counts.departures,
      }));
  }, [filteredFlights]);

  const gateData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredFlights.forEach((f) => {
      if (f.gate) counts[f.gate] = (counts[f.gate] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([gate, flights]) => ({ gate, flights }));
  }, [filteredFlights]);

  const topDelayedFlights = useMemo(() => {
    return [...filteredFlights]
      .filter((f) => f.status === 'Delayed')
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 8);
  }, [filteredFlights]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Mock data notice */}
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800">
            <strong>Demo Mode:</strong> Showing simulated data due to CORS restrictions. Configure CORS on your API server or run via proxy to see live data.
          </span>
        </div>
      )}

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
          flights={filteredFlights}
          fields={useSettingsStore.getState().fieldDefinitions.filter((f) => f.enabled)}
          title="Dashboard — Flight Data"
          filename="dashboard"
          disabled={filteredFlights.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading flight data..." />}

      {error && !isUsingMockData && (
        <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />
      )}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Total Flights"
              value={kpis.total.toLocaleString()}
              icon={<Plane className="w-6 h-6" />}
              color="blue"
              subtitle={lastFetched ? `Updated ${format(lastFetched, 'HH:mm')}` : undefined}
            />
            <KPICard
              title="Departures"
              value={kpis.departures.toLocaleString()}
              icon={<span className="text-lg font-bold">↑</span>}
              color="purple"
            />
            <KPICard
              title="Arrivals"
              value={kpis.arrivals.toLocaleString()}
              icon={<span className="text-lg font-bold">↓</span>}
              color="slate"
            />
            <KPICard
              title="On-Time %"
              value={`${kpis.onTimePercent}%`}
              icon={<CheckCircle className="w-6 h-6" />}
              color={kpis.onTimePercent >= 80 ? 'green' : kpis.onTimePercent >= 60 ? 'amber' : 'red'}
            />
            <KPICard
              title="Avg Delay"
              value={`${kpis.avgDelayMinutes}m`}
              icon={<Clock className="w-6 h-6" />}
              color={kpis.avgDelayMinutes <= 15 ? 'green' : kpis.avgDelayMinutes <= 30 ? 'amber' : 'red'}
            />
            <KPICard
              title="Active Gates"
              value={kpis.activeGates}
              icon={<DoorOpen className="w-6 h-6" />}
              color="blue"
            />
          </div>

          {/* Row 1 - Airline bar chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Flights by Airline (Top 10)</h3>
            {airlineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={airlineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Flights" radius={[4, 4, 0, 0]}>
                    {airlineChartData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Row 2 - Pie + Line */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Flight Status Breakdown</h3>
              {statusPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={true}
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={index} fill={DELAY_COLORS[entry.name] || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value, 'Flights']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Flights by Hour of Day</h3>
              {flightsByHour.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={flightsByHour} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="arrivals" stroke="#6366f1" strokeWidth={2} dot={false} name="Arrivals" />
                    <Line type="monotone" dataKey="departures" stroke="#f59e0b" strokeWidth={2} dot={false} name="Departures" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>
          </div>

          {/* Row 3 - Gate utilization + Delayed flights */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Gate Utilization (Top 15)</h3>
              {gateData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={gateData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="gate" tick={{ fontSize: 11, fill: '#64748b' }} width={35} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="flights" name="Flights" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Top Delayed Flights</h3>
              {topDelayedFlights.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Flight</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">City</th>
                        <th className="text-left py-2 px-2 text-slate-500 font-medium">Gate</th>
                        <th className="text-right py-2 px-2 text-slate-500 font-medium">Delay</th>
                        <th className="text-right py-2 px-2 text-slate-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topDelayedFlights.map((f, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 px-2 font-medium text-slate-800">{f.linecode}{f.number}</td>
                          <td className="py-2 px-2 text-slate-600">{f.city}</td>
                          <td className="py-2 px-2 text-slate-600">{f.gate || '—'}</td>
                          <td className="py-2 px-2 text-right">
                            <span className="text-amber-600 font-semibold">+{f.delayMinutes}m</span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Badge label={f.status} variant="status" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                  No delayed flights in selected range
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
