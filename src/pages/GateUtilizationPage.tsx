import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, Settings, Info, RefreshCw } from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { FilterState } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { parseISO, addDays, differenceInMinutes } from 'date-fns';

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: new Date(), endDate: addDays(new Date(), 1) },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

const FIELD_DEFAULTS = {
  arrGateField:      'gate',
  depGateField:      'gate',
  arrSchedField:     'schedule',
  arrActualField:    'actual',
  depSchedField:     'schedule',
  depActualField:    'actual',
  baseOccupancyMins: '45',
};

interface GanttBlock {
  gate: string;
  flight: string;
  startHour: number;
  duration: number;
  status: string;
  adi: 'A' | 'D';
  city: string;
}

export const GateUtilizationPage: React.FC = () => {
  const [filters, setFilters]           = useState<FilterState>(DEFAULT_FILTERS);
  const [concourseFilter, setConcourseFilter] = useState('');
  const { config: cfg, apply: applyConfig } = usePersistedConfig('gate_utilization', FIELD_DEFAULTS);
  const [draft, setDraft]               = useState(FIELD_DEFAULTS);

  // Sync draft when cfg reloads from localStorage (site change)
  const cfgStr = JSON.stringify(cfg);
  useEffect(() => { try { setDraft(JSON.parse(cfgStr)); } catch {} }, [cfgStr]);

  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const handleRefresh = () => fetchFlights(filters.dateRange);

  const handleApply = () => applyConfig({ ...draft, arrSchedField: 'schedule', depSchedField: 'schedule' });

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  const gateVal = (f: typeof flights[0], gateField: string) =>
    String((f as Record<string, unknown>)[gateField] ?? '');

  const filtered = useMemo(() => flights.filter((f) => {
    if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
    if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
    const gf = f.adi === 'A' ? cfg.arrGateField : cfg.depGateField;
    if (concourseFilter && !gateVal(f, gf).toUpperCase().startsWith(concourseFilter.toUpperCase())) return false;
    return true;
  }), [flights, filters, concourseFilter, cfg]);

  const concourses = useMemo(() => {
    const s = new Set<string>();
    flights.forEach((f) => {
      const gf = f.adi === 'A' ? cfg.arrGateField : cfg.depGateField;
      const gv = gateVal(f, gf);
      if (gv) s.add(gv[0].toUpperCase());
    });
    return [...s].sort();
  }, [flights, cfg]);

  const gateStats = useMemo(() => {
    const stats: Record<string, { total: number; arrivals: number; departures: number; occupancyMins: number }> = {};
    filtered.forEach((f) => {
      const fr = f as Record<string, unknown>;
      const gf = f.adi === 'A' ? cfg.arrGateField : cfg.depGateField;
      const sf = f.adi === 'A' ? cfg.arrSchedField : cfg.depSchedField;
      const af = f.adi === 'A' ? cfg.arrActualField : cfg.depActualField;
      const gate = String(fr[gf] ?? '');
      if (!gate) return;
      if (!stats[gate]) stats[gate] = { total: 0, arrivals: 0, departures: 0, occupancyMins: 0 };
      stats[gate].total++;
      if (f.adi === 'A') stats[gate].arrivals++; else stats[gate].departures++;
      const sv = fr[sf];
      const av = fr[af];
      const baseMins = Math.max(0, parseInt(cfg.baseOccupancyMins, 10) || 45);
      if (sv && av && f.status !== 'Cancelled') {
        try {
          const diff = Math.min(120, Math.abs(differenceInMinutes(parseISO(String(av)), parseISO(String(sv)))));
          stats[gate].occupancyMins += baseMins + diff;
        } catch { stats[gate].occupancyMins += baseMins; }
      } else {
        stats[gate].occupancyMins += baseMins;
      }
    });
    return Object.entries(stats)
      .map(([gate, s]) => ({ gate, ...s, avgOccupancy: s.total > 0 ? Math.round(s.occupancyMins / s.total) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [filtered, cfg]);

  const barChartData = gateStats.slice(0, 20).map((g) => ({ gate: g.gate, Arrivals: g.arrivals, Departures: g.departures }));

  const ganttData = useMemo((): GanttBlock[] => filtered
    .filter((f) => {
      const fr = f as Record<string, unknown>;
      const gf = f.adi === 'A' ? cfg.arrGateField : cfg.depGateField;
      const sf = f.adi === 'A' ? cfg.arrSchedField : cfg.depSchedField;
      return fr[gf] && fr[sf];
    })
    .map((f) => {
      const fr = f as Record<string, unknown>;
      const gf = f.adi === 'A' ? cfg.arrGateField : cfg.depGateField;
      const sf = f.adi === 'A' ? cfg.arrSchedField : cfg.depSchedField;
      let startHour = 0;
      try { const t = parseISO(String(fr[sf])); startHour = t.getHours() + t.getMinutes() / 60; } catch {}
      return { gate: String(fr[gf] ?? ''), flight: `${f.linecode}${f.number}`, startHour, duration: 0.75, status: f.status, adi: f.adi, city: f.city };
    }), [filtered, cfg]);

  const ganttGates = useMemo(() => [...new Set(ganttData.map((b) => b.gate))].sort(), [ganttData]);

  const STATUS_BG: Record<string, string> = { 'On Time': '#22c55e', 'Early': '#60a5fa', 'Delayed': '#f59e0b', 'Cancelled': '#ef4444', 'Unknown': '#94a3b8' };
  const HOURS = Array.from({ length: 19 }, (_, i) => i + 5);

  const exportData = gateStats.map((g) => ({
    Gate: g.gate,
    'Total Flights': g.total,
    Arrivals: g.arrivals,
    Departures: g.departures,
    'Avg Occupancy (min)': g.avgOccupancy,
    Concourse: g.gate[0] ? `${g.gate[0]} Concourse` : '?',
  }));

  const inp = (label: string, key: keyof typeof draft, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        className="border border-slate-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Always-visible field config bar — TaxiTime style */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm space-y-2">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <Settings className="w-4 h-4 text-slate-400" />
          Field Names
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Arrivals</span>
            {inp('Gate field', 'arrGateField', 'gate')}
            {inp('Actual Time', 'arrActualField', 'actual')}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Departures</span>
            {inp('Gate field', 'depGateField', 'gate')}
            {inp('Actual Time', 'depActualField', 'actual')}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Occupancy</span>
            {inp('Base (min)', 'baseOccupancyMins', '45')}
          </div>
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors self-center"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {JSON.stringify(draft) !== JSON.stringify(FIELD_DEFAULTS) && (
            <button
              onClick={() => { applyConfig(FIELD_DEFAULTS); setDraft(FIELD_DEFAULTS); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline self-center"
            >
              Reset defaults
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">
          Avg Occupancy = Base (min) per flight + |actual − scheduled| (capped 120 min) &nbsp;·&nbsp; Set departure gate to <em>parkingbay</em> if your data uses Stand instead of Gate
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu data={exportData} title="Gate Utilization Report" filename="gate-utilization" disabled={exportData.length === 0} />
      </div>

      {/* Concourse filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Concourse:</span>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setConcourseFilter('')}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${!concourseFilter ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
            All
          </button>
          {concourses.map((c) => (
            <button key={c} onClick={() => setConcourseFilter(c === concourseFilter ? '' : c)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${concourseFilter === c ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingSpinner message="Loading gate data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Flights per Gate (Top 20)</h3>
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="gate" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="Arrivals" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Departures" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No gate data available</div>
            )}
          </div>

          {/* Gantt */}
          {ganttGates.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800">Gate Timeline</h3>
                <div className="flex items-center gap-3 text-xs">
                  {Object.entries(STATUS_BG).slice(0, 4).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-slate-500">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(900, HOURS.length * 60) + 80 }}>
                  <div className="flex mb-1" style={{ paddingLeft: 72 }}>
                    {HOURS.map((h) => (
                      <div key={h} className="text-xs text-slate-400 font-medium" style={{ width: 60, flexShrink: 0 }}>
                        {String(h).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                  {ganttGates.slice(0, 20).map((gate) => {
                    const blocks = ganttData.filter((b) => b.gate === gate);
                    return (
                      <div key={gate} className="flex items-center mb-1">
                        <div className="text-xs font-mono font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 mr-2 w-16 text-center flex-shrink-0">{gate}</div>
                        <div className="relative flex-1 h-8 bg-slate-50 rounded border border-slate-100" style={{ minWidth: HOURS.length * 60 }}>
                          {blocks.map((block, bi) => {
                            const left = Math.max(0, ((block.startHour - 5) / 18) * 100);
                            const width = Math.max(0.5, (block.duration / 18) * 100);
                            return (
                              <div key={bi} title={`${block.flight} → ${block.city} (${block.adi === 'A' ? 'Arr' : 'Dep'})`}
                                className="absolute top-1 bottom-1 rounded text-white text-xs flex items-center px-1 overflow-hidden cursor-default"
                                style={{ left: `${left}%`, width: `${width}%`, minWidth: 4, backgroundColor: STATUS_BG[block.status] || STATUS_BG['Unknown'], opacity: 0.85 }}>
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
              {ganttGates.length > 20 && <p className="text-xs text-slate-400 mt-2">Showing 20 of {ganttGates.length} gates</p>}
            </div>
          )}

          {/* Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Gate Summary Table</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Gate</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Flights</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Arrivals</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Departures</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <span className="inline-flex items-center justify-end gap-1">
                        Avg Occupancy
                        <span title="Base occupancy (configurable, default 45 min) + |actual − scheduled| per flight (capped 120 min)" className="cursor-help text-blue-400">
                          <Info className="w-3 h-3" />
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Concourse</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gateStats.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No gate data available</td></tr>
                  ) : (
                    gateStats.map((g) => (
                      <tr key={g.gate} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3"><span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{g.gate}</span></td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{g.total}</td>
                        <td className="px-4 py-3 text-right text-indigo-600">{g.arrivals}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{g.departures}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{g.avgOccupancy}m</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">{g.gate[0] || '?'} Concourse</span>
                        </td>
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
