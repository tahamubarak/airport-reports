import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, ChevronUp, ChevronDown, Info } from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { useSiteStore } from '../store/useSiteStore';
import { useReportsStore } from '../store/useReportsStore';
import { FilterState, CHART_COLORS, Flight, FieldDefinition, DefaultFilterValues } from '../types';
import { getFieldDisplayValue, getCellStyle } from '../utils/fieldEngine';
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

export const CustomReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [runtimeSort, setRuntimeSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const session = useSessionStore((s) => s.session);
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);
  const { reports } = useReportsStore();
  const { getSiteFieldDefinitions } = useSiteStore();

  const report = useMemo(() => reports.find((r) => r.id === id), [reports, id]);

  const activeSiteId = session?.isAppAdmin
    ? (session.adminActiveSiteId ?? null)
    : (session?.site?.id ?? null);

  const fieldDefs = useMemo(
    () => getSiteFieldDefinitions(activeSiteId ?? '').filter((f) => f.enabled),
    [activeSiteId, getSiteFieldDefinitions]
  );

  const selectedFields: FieldDefinition[] = useMemo(() => {
    if (!report) return [];
    return (report.fields ?? []).map((fieldId) => {
      const base = fieldDefs.find((f) => f.id === fieldId) ?? {
        id: fieldId, name: fieldId, label: fieldId, type: 'string' as const, enabled: true, isBuiltIn: false,
      };
      const fmtOverride = (report.fieldDateFormats ?? {})[fieldId];
      const labelOverride = (report.columnLabels ?? {})[fieldId];
      const exprOverride = (report.fieldExpressions ?? {})[fieldId];
      const colorOverride = (report.fieldColorRules ?? {})[fieldId];
      return {
        ...base,
        ...(fmtOverride ? { dateFormat: fmtOverride } : {}),
        ...(labelOverride ? { label: labelOverride } : {}),
        ...(exprOverride ? { expression: exprOverride } : {}),
        ...(colorOverride ? { colorRules: colorOverride } : {}),
      };
    });
  }, [report, fieldDefs]);

  useEffect(() => {
    fetchFlights(filters.dateRange);
  }, [adminActiveSiteId]);

  useEffect(() => {
    if (report && !filtersInitialized) {
      const dv: DefaultFilterValues = report.defaultFilterValues ?? {};
      setFilters(prev => ({
        ...prev,
        adi: dv.adi ?? 'both',
        airlines: dv.airlines ?? [],
        statuses: dv.statuses ?? [],
        extras: dv.extras ?? {},
      }));
      setFiltersInitialized(true);
    }
  }, [report, filtersInitialized]);

  const handleRefresh = () => fetchFlights(filters.dateRange);

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);

  const ALWAYS_SEPARATE = ['adi', 'airlines', 'status', 'search'];
  const extraFilterIds = useMemo(
    () => (report?.visibleFilters ?? []).filter(id => !ALWAYS_SEPARATE.includes(id)),
    [report]
  );

  const extraFiltersConfig = useMemo(() => {
    return extraFilterIds.map(fieldId => {
      const fieldDef = fieldDefs.find(f => f.id === fieldId);
      const label = fieldDef?.label ?? fieldId.charAt(0).toUpperCase() + fieldId.slice(1);
      const values = [...new Set(
        flights.map(f => String((f as Record<string, unknown>)[fieldId] ?? '')).filter(Boolean)
      )].sort();
      return { fieldId, label, values };
    });
  }, [extraFilterIds, flights, fieldDefs]);

  const filtered = useMemo(() => {
    return flights.filter((f) => {
      if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      if (filters.gate && !f.gate.toLowerCase().includes(filters.gate.toLowerCase())) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!f.linecode.toLowerCase().includes(s) && !f.number.toLowerCase().includes(s) && !f.city.toLowerCase().includes(s)) return false;
      }
      // Extra multi-select filters
      for (const [fieldId, values] of Object.entries(filters.extras ?? {})) {
        if (values.length > 0) {
          const fieldVal = String((f as Record<string, unknown>)[fieldId] ?? '');
          if (!values.includes(fieldVal)) return false;
        }
      }
      return true;
    });
  }, [flights, filters]);

  const toggleSort = (key: string) => {
    setRuntimeSort(prev => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: 'asc' };
    });
  };

  const sorted = useMemo(() => {
    if (runtimeSort) {
      return [...filtered].sort((a, b) => {
        const aVal = String((a as Record<string, unknown>)[runtimeSort.key] ?? '');
        const bVal = String((b as Record<string, unknown>)[runtimeSort.key] ?? '');
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return runtimeSort.dir === 'asc' ? cmp : -cmp;
      });
    }
    const sortFields = report?.sortConfig ?? [];
    if (sortFields.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      for (const sf of sortFields) {
        const aVal = String((a as Record<string, unknown>)[sf.fieldId] ?? '');
        const bVal = String((b as Record<string, unknown>)[sf.fieldId] ?? '');
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return sf.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [filtered, runtimeSort, report]);

  const chartData = useMemo(() => {
    if (!report || report.chartType === 'table') return [];
    const groupBy = report.groupBy as keyof Flight;
    const grouped: Record<string, number[]> = {};
    sorted.forEach((f) => {
      const key = String(f[groupBy] ?? 'Unknown');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f.delayMinutes);
    });
    return Object.entries(grouped)
      .map(([name, delays]) => ({
        name,
        value: report.aggregation === 'count'
          ? delays.length
          : delays.length > 0 ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [filtered, report]);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-500">
        <p>Report not found.</p>
        <button onClick={() => navigate('/report-designer')} className="text-blue-600 hover:underline text-sm">
          Go to Report Designer
        </button>
      </div>
    );
  }

  const aggLabel = report.aggregation === 'count' ? 'Count' : 'Avg Delay (min)';

  const renderContent = () => {
    if (loading) return <LoadingSpinner message="Loading data…" />;
    if (sorted.length === 0) return (
      <div className="flex items-center justify-center h-64 text-slate-400">No data for selected filters</div>
    );

    if (report.chartType === 'table') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {selectedFields.map((f) => {
                  const isActive = runtimeSort?.key === f.id;
                  const savedActive = !runtimeSort && (report.sortConfig ?? []).findIndex(s => s.fieldId === f.id) === 0;
                  const dir = isActive ? runtimeSort!.dir : (savedActive ? report.sortConfig![0].dir : null);
                  return (
                    <th
                      key={f.id}
                      onClick={() => toggleSort(f.id)}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none"
                    >
                      <span className="flex items-center gap-1">
                        {f.label}
                        {dir === 'asc' ? (
                          <ChevronUp className="w-3 h-3 text-blue-500" />
                        ) : dir === 'desc' ? (
                          <ChevronDown className="w-3 h-3 text-blue-500" />
                        ) : (
                          <ChevronUp className="w-3 h-3 opacity-20" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.slice(0, 500).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {selectedFields.map((fd) => {
                    const val = getFieldDisplayValue(fd, row as Record<string, unknown>);
                    const style = getCellStyle(fd, val);
                    return (
                      <td key={fd.id} className="px-4 py-2.5 text-slate-700 whitespace-nowrap" style={style}>
                        {val || '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 500 && (
            <div className="px-4 py-2 text-xs text-slate-400 text-center border-t border-slate-100">
              Showing 500 of {sorted.length} rows
            </div>
          )}
        </div>
      );
    }

    if (report.chartType === 'bar') return (
      <div className="p-5 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" name={aggLabel} radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );

    if (report.chartType === 'pie') return (
      <div className="p-5 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" outerRadius={140} paddingAngle={3} dataKey="value"
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => [v, aggLabel]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );

    if (report.chartType === 'line') return (
      <div className="p-5 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name={aggLabel} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );

    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {isUsingMockData && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-amber-800"><strong>Demo Mode:</strong> Showing simulated data due to CORS restrictions.</span>
        </div>
      )}

      {report.filterDescription && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-sm text-blue-700 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <span>{report.filterDescription}</span>
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
            showAdi={(report.visibleFilters ?? ['adi', 'airlines', 'status']).includes('adi')}
            showAirlines={(report.visibleFilters ?? ['adi', 'airlines', 'status']).includes('airlines')}
            showStatus={(report.visibleFilters ?? ['adi', 'airlines', 'status']).includes('status')}
            showGateFilter={false}
            showSearchBox={(report.visibleFilters ?? []).includes('search')}
            extraFilters={extraFiltersConfig}
          />
        </div>
        <ExportMenu
          flights={sorted}
          fields={selectedFields}
          title={report.name}
          filename={report.name.replace(/\s+/g, '-').toLowerCase()}
          disabled={filtered.length === 0}
        />
      </div>

      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{report.name}</h3>
            {report.description && <p className="text-xs text-slate-500 mt-0.5">{report.description}</p>}
          </div>
          <span className="text-xs text-slate-400 capitalize">{report.chartType} · {sorted.length} records</span>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};
