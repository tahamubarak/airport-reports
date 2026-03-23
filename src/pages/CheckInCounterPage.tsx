import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, Settings, RefreshCw } from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { FilterState, CHART_COLORS } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { parseISO, addDays, addMinutes, subMinutes } from 'date-fns';

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: new Date(), endDate: addDays(new Date(), 1) },
  adi: 'D',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

const DEFAULTS = {
  checkinField: 'checkin',
  openMins:     '120',
  closeMins:    '1',
};

interface CounterBlock {
  counter:   string;
  flight:    string;
  flightIdx: number;
  openHour:  number;   // fractional hour (e.g. 6.5 = 06:30)
  closeHour: number;
  airline:   string;
  city:      string;
  schedISO:  string;
}

export const CheckInCounterPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { config: cfg, apply: applyConfig } = usePersistedConfig('checkin_counter', DEFAULTS);
  const [draft, setDraft] = useState(DEFAULTS);

  const cfgStr = JSON.stringify(cfg);
  useEffect(() => { try { setDraft(JSON.parse(cfgStr)); } catch {} }, [cfgStr]);

  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);

  useEffect(() => { fetchFlights(filters.dateRange); }, [adminActiveSiteId]);
  const handleRefresh = () => fetchFlights(filters.dateRange);

  const handleApply = () => applyConfig({ ...draft });

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  // Departures only
  const departures = useMemo(() => flights.filter((f) => {
    if (f.adi !== 'D') return false;
    if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!f.searchKey.includes(q)) return false;
    }
    return true;
  }), [flights, filters]);

  const openMinsNum  = Math.max(1, parseInt(cfg.openMins,  10) || 120);
  const closeMinsNum = Math.max(0, parseInt(cfg.closeMins, 10) || 1);

  // Build counter blocks
  const counterBlocks = useMemo((): CounterBlock[] => {
    const blocks: CounterBlock[] = [];
    departures.forEach((f, idx) => {
      const fr = f as Record<string, unknown>;
      const schedRaw = String(fr['schedule'] ?? '');
      if (!schedRaw) return;

      // Get all counters for this flight
      const instancesKey = `${cfg.checkinField}_instances`;
      const instances = fr[instancesKey] as string[] | undefined;
      const single    = fr[cfg.checkinField] ? [String(fr[cfg.checkinField])] : [];
      const counters  = instances ?? single;
      if (counters.length === 0) return;

      let schedDate: Date;
      try { schedDate = parseISO(schedRaw); } catch { return; }

      const openTime  = subMinutes(schedDate, openMinsNum);
      const closeTime = subMinutes(schedDate, closeMinsNum);
      const openHour  = openTime.getHours()  + openTime.getMinutes()  / 60;
      const closeHour = closeTime.getHours() + closeTime.getMinutes() / 60;

      counters.forEach((counter) => {
        blocks.push({
          counter,
          flight:    `${f.linecode}${f.number}`,
          flightIdx: idx,
          openHour,
          closeHour,
          airline:   f.airlineName,
          city:      f.city,
          schedISO:  schedRaw,
        });
      });
    });
    return blocks;
  }, [departures, cfg, openMinsNum, closeMinsNum]);

  // Counter stats
  const counterStats = useMemo(() => {
    const stats: Record<string, { flights: Set<string>; flightList: string[] }> = {};
    counterBlocks.forEach((b) => {
      if (!stats[b.counter]) stats[b.counter] = { flights: new Set(), flightList: [] };
      if (!stats[b.counter].flights.has(b.flight)) {
        stats[b.counter].flights.add(b.flight);
        stats[b.counter].flightList.push(b.flight);
      }
    });
    return Object.entries(stats)
      .map(([counter, s]) => ({ counter, total: s.flights.size, flights: s.flightList }))
      .sort((a, b) => b.total - a.total);
  }, [counterBlocks]);

  const activeCounters   = counterStats.length;
  const totalDepartures  = departures.filter((f) => {
    const fr = f as Record<string, unknown>;
    const instances = fr[`${cfg.checkinField}_instances`] as string[] | undefined;
    return !!(instances?.length || fr[cfg.checkinField]);
  }).length;
  const avgFlightsPerCounter = activeCounters > 0 ? (counterBlocks.length / activeCounters).toFixed(1) : '0';

  const barChartData = counterStats.slice(0, 20).map((c) => ({ counter: c.counter, Flights: c.total }));

  // Gantt
  const ganttCounters = useMemo(() => [...new Set(counterBlocks.map((b) => b.counter))].sort(), [counterBlocks]);
  const HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

  // Assign a stable color per flight key
  const flightColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let ci = 0;
    departures.forEach((f) => {
      const key = `${f.linecode}${f.number}`;
      if (!(key in map)) { map[key] = CHART_COLORS[ci % CHART_COLORS.length]; ci++; }
    });
    return map;
  }, [departures]);

  const exportData = counterStats.map((c) => ({
    Counter:       c.counter,
    'Total Flights': c.total,
    'Flight List': c.flights.join(', '),
    'Open (min before sched)':  cfg.openMins,
    'Close (min before sched)': cfg.closeMins,
  }));

  const inp = (label: string, key: keyof typeof draft, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        className="border border-slate-200 rounded px-2 py-1 text-xs w-28 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </label>
  );

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
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {inp('Check-In field', 'checkinField', 'checkin')}
          {inp('Open (min before sched)', 'openMins', '120')}
          {inp('Close (min before sched)', 'closeMins', '1')}
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors self-end"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {JSON.stringify(draft) !== JSON.stringify(DEFAULTS) && (
            <button
              onClick={() => { applyConfig(DEFAULTS); setDraft(DEFAULTS); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline self-end"
            >
              Reset defaults
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Counter open window = Schedule − Open mins &nbsp;→&nbsp; Schedule − Close mins &nbsp;·&nbsp; Departure flights only
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar
            filters={{ ...filters, adi: 'D' }}
            onChange={(f) => setFilters({ ...f, adi: 'D' })}
            airlines={airlines}
            onRefresh={handleRefresh}
            loading={loading}
          />
        </div>
        <ExportMenu data={exportData} title="Check-In Counter Utilization" filename="checkin-counter" disabled={exportData.length === 0} />
      </div>

      {loading && <LoadingSpinner message="Loading check-in data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Counters',      value: activeCounters,        color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
              { label: 'Total Departures',     value: totalDepartures,       color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
              { label: 'Avg Flights/Counter',  value: avgFlightsPerCounter,  color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
              { label: 'Open Window (min)',     value: `${openMinsNum} → ${closeMinsNum}`,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border ${kpi.border} ${kpi.bg} p-4`}>
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Flights per Counter (Top 20)</h3>
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="counter" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="Flights" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No check-in counter data available</div>
            )}
          </div>

          {/* Gantt */}
          {ganttCounters.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Counter Timeline</h3>
                <p className="text-xs text-slate-400">Each color = one flight &nbsp;·&nbsp; Block spans open→close window</p>
              </div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(900, HOURS.length * 60) + 80 }}>
                  {/* Hour labels */}
                  <div className="flex mb-1" style={{ paddingLeft: 72 }}>
                    {HOURS.map((h) => (
                      <div key={h} className="text-xs text-slate-400 font-medium" style={{ width: 60, flexShrink: 0 }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                  {ganttCounters.slice(0, 30).map((counter) => {
                    const blocks = counterBlocks.filter((b) => b.counter === counter);
                    return (
                      <div key={counter} className="flex items-center mb-1">
                        <div className="text-xs font-mono font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 mr-2 w-16 text-center flex-shrink-0">
                          {counter}
                        </div>
                        <div
                          className="relative flex-1 h-8 bg-slate-50 rounded border border-slate-100"
                          style={{ minWidth: HOURS.length * 60 }}
                        >
                          {blocks.map((block, bi) => {
                            const totalHours = 18; // 5:00 – 23:00
                            const left  = Math.max(0, Math.min(100, ((block.openHour  - 5) / totalHours) * 100));
                            const right = Math.max(0, Math.min(100, ((block.closeHour - 5) / totalHours) * 100));
                            const width = Math.max(0.5, right - left);
                            const color = flightColorMap[block.flight] ?? CHART_COLORS[0];
                            return (
                              <div
                                key={bi}
                                title={`${block.flight} → ${block.city} | Open: ${cfg.openMins}min before | Close: ${cfg.closeMins}min before`}
                                className="absolute top-1 bottom-1 rounded text-white text-xs flex items-center px-1 overflow-hidden cursor-default"
                                style={{ left: `${left}%`, width: `${width}%`, minWidth: 4, backgroundColor: color, opacity: 0.85 }}
                              >
                                <span className="truncate font-medium" style={{ fontSize: '9px' }}>{block.flight}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {ganttCounters.length > 30 && (
                <p className="text-xs text-slate-400 mt-2">Showing 30 of {ganttCounters.length} counters</p>
              )}
            </div>
          )}

          {/* Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Counter Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Counter</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Flights</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Flights</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {counterStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-slate-400">
                        No check-in counter data available. Ensure departure flights have a <em>{cfg.checkinField}</em> field.
                      </td>
                    </tr>
                  ) : (
                    counterStats.map((c) => (
                      <tr key={c.counter} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{c.counter}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{c.total}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{c.flights.slice(0, 15).join(', ')}{c.flights.length > 15 ? ` +${c.flights.length - 15} more` : ''}</td>
                      </tr>
                    ))
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
