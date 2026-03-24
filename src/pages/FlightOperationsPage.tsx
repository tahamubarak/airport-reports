import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { FilterBar } from '../components/FilterBar';
import { Badge, AdiBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingSpinner, ErrorState } from '../components/ui/LoadingSpinner';
import { useFlights } from '../hooks/useFlights';
import { useSessionStore } from '../store/useSessionStore';
import { usePersistedConfig } from '../hooks/usePersistedConfig';
import { FilterState, Flight } from '../types';
import { ExportMenu } from '../components/ui/ExportMenu';
import { useSettingsStore } from '../store/useSettingsStore';
import { format, parseISO, addDays } from 'date-fns';

const PAGE_SIZE = 50;

type SortKey = string;
type SortDir = 'asc' | 'desc';

const DEFAULTS = {
  standField: 'parkingbay',
  onchkField: 'onchk',
  ofchkField: 'ofchk',
};

const DEFAULT_FILTERS: FilterState = {
  dateRange: { startDate: new Date(), endDate: addDays(new Date(), 1) },
  adi: 'both',
  airlines: [],
  statuses: [],
  gate: '',
  search: '',
  extras: {},
};

const formatTime = (iso: string) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'HH:mm'); } catch { return iso; }
};

const formatDate = (iso: string) => {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MM/dd'); } catch { return iso; }
};

const SortIcon: React.FC<{ col: SortKey; sortKey: SortKey; sortDir: SortDir }> = ({ col, sortKey, sortDir }) => {
  if (col !== sortKey) return <ChevronUp className="w-3 h-3 opacity-20" />;
  return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
};

export const FlightOperationsPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('schedule');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const { config: fieldConfig, apply: applyFieldConfig } = usePersistedConfig('flight_operations', DEFAULTS);
  const [draft, setDraft] = useState(DEFAULTS);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  // Sync draft when persisted config loads
  const cfgStr = JSON.stringify(fieldConfig);
  useEffect(() => { try { setDraft(JSON.parse(cfgStr)); } catch {} }, [cfgStr]); // eslint-disable-line

  const handleApply = () => applyFieldConfig({ ...draft });

  const inp = (label: string, key: keyof typeof draft, placeholder: string) => (
    <div className="flex items-center gap-2">
      <label className="text-slate-500 text-xs whitespace-nowrap">{label}:</label>
      <input
        value={draft[key]}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onKeyDown={e => e.key === 'Enter' && handleApply()}
        className="w-28 text-xs font-mono border border-slate-300 bg-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder={placeholder}
      />
    </div>
  );

  const handleRefresh = useCallback(() => {
    fetchFlights(filters.dateRange);
  }, [filters.dateRange, fetchFlights]);

  const airlines = useMemo(() => [...new Set(flights.map((f) => f.linecode))].sort(), [flights]);
  const gates = useMemo(() => [...new Set(flights.map((f) => f.gate).filter(Boolean))].sort(), [flights]);

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();
    return flights.filter((f) => {
      if (filters.adi !== 'both' && f.adi !== filters.adi) return false;
      if (filters.airlines.length > 0 && !filters.airlines.includes(f.linecode)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;
      if (filters.gate && f.gate !== filters.gate) return false;
      if (q) {
        const searchIn = `${f.linecode}${f.number} ${f.city} ${f.gate} ${f.status}`.toLowerCase();
        if (!searchIn.includes(q)) return false;
      }
      return true;
    });
  }, [flights, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  useEffect(() => { setPage(1); }, [filters]);

  const columns: { key: SortKey; label: string; width?: string }[] = [
    { key: 'linecode',                    label: 'Flight',    width: 'w-24' },
    { key: 'adi',                         label: 'ADI',       width: 'w-20' },
    { key: 'city',                        label: 'City',      width: 'w-16' },
    { key: 'gate',                        label: 'Gate',      width: 'w-16' },
    { key: fieldConfig.standField,        label: 'Stand',     width: 'w-16' },
    { key: 'claim',                       label: 'Claim',     width: 'w-16' },
    { key: 'schedule',                    label: 'Scheduled', width: 'w-28' },
    { key: 'actual',                      label: 'Actual',    width: 'w-28' },
    { key: fieldConfig.onchkField,        label: 'ONCHK',     width: 'w-24' },
    { key: fieldConfig.ofchkField,        label: 'OFCHK',     width: 'w-24' },
    { key: 'delayMinutes',                label: 'Delay',     width: 'w-20' },
    { key: 'status',                      label: 'Status',    width: 'w-28' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
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
          {inp('Stand field', 'standField', 'parkingbay')}
          {inp('ONCHK field', 'onchkField', 'onchk')}
          {inp('OFCHK field', 'ofchkField', 'ofchk')}
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors self-center"
          >
            <RefreshCw className="w-3 h-3" />
            Apply
          </button>
          {JSON.stringify(fieldConfig) !== JSON.stringify(DEFAULTS) && (
            <button
              onClick={() => { applyFieldConfig(DEFAULTS); setDraft(DEFAULTS); }}
              className="text-xs text-slate-400 hover:text-slate-600 underline self-center"
            >
              Reset defaults
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        airlines={airlines}
        gates={gates}
        showGateFilter
        showSearchBox
        onRefresh={handleRefresh}
        loading={loading}
      />

      {loading && <LoadingSpinner message="Loading flights..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table header with export */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <span className="font-semibold text-slate-800">
                {sorted.length.toLocaleString()} Flights
              </span>
              <span className="text-sm text-slate-500 ml-2">
                (Page {page} of {totalPages})
              </span>
            </div>
            <ExportMenu
              flights={filtered}
              fields={useSettingsStore.getState().fieldDefinitions.filter((f) => f.enabled)}
              title="Flight Operations Report"
              filename="flight-operations"
              disabled={filtered.length === 0}
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none ${col.width || ''}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      <div className="flex items-center gap-1.5">
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-16 text-center text-slate-400">
                      No flights match the current filters
                    </td>
                  </tr>
                ) : (
                  paginated.map((flight, i) => (
                    <tr
                      key={`${flight.linecode}-${flight.number}-${flight.schedule}-${i}`}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{flight.linecode}{flight.number}</div>
                        <div className="text-xs text-slate-400">{formatDate(flight.schedule)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <AdiBadge adi={flight.adi} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{flight.city || '—'}</td>
                      <td className="px-4 py-3">
                        {flight.gate ? (
                          <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {flight.gate}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {String((flight as Record<string, unknown>)[fieldConfig.standField] ?? '') || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{flight.claim || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{formatTime(flight.schedule)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`font-medium ${
                          flight.status === 'Delayed' ? 'text-amber-600' :
                          flight.status === 'Early' ? 'text-blue-600' :
                          flight.status === 'Cancelled' ? 'text-red-500' :
                          'text-slate-800'
                        }`}>
                          {flight.actual ? formatTime(flight.actual) : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {(() => { const v = String((flight as Record<string, unknown>)[fieldConfig.onchkField] ?? ''); return v ? formatTime(v) : '—'; })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {(() => { const v = String((flight as Record<string, unknown>)[fieldConfig.ofchkField] ?? ''); return v ? formatTime(v) : '—'; })()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {flight.status === 'Cancelled' ? (
                          <span className="text-slate-400">—</span>
                        ) : flight.delayMinutes > 0 ? (
                          <span className="text-amber-600 font-semibold">+{flight.delayMinutes}m</span>
                        ) : flight.delayMinutes < 0 ? (
                          <span className="text-blue-500 font-semibold">{flight.delayMinutes}m</span>
                        ) : (
                          <span className="text-green-600 font-semibold">On time</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={flight.status} variant="status" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
              <div className="text-sm text-slate-500">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page number buttons */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const pageNum = start + i;
                  return pageNum <= totalPages ? (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ) : null;
                })}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
