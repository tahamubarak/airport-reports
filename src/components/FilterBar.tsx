import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Filter, X, ChevronDown } from 'lucide-react';
import { FilterState, DateRange } from '../types';
import { Button } from './ui/Button';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  airlines: string[];
  statuses?: string[];
  gates?: string[];
  showAdi?: boolean;
  showAirlines?: boolean;
  showStatus?: boolean;
  showGateFilter?: boolean;
  showSearchBox?: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  extraFilters?: { fieldId: string; label: string; values: string[] }[];
}

const DEFAULT_STATUSES = ['On Time', 'Delayed', 'Cancelled', 'Early'];

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  airlines,
  statuses = DEFAULT_STATUSES,
  gates = [],
  showAdi = true,
  showAirlines = true,
  showStatus = true,
  showGateFilter = false,
  showSearchBox = false,
  onRefresh,
  loading = false,
  extraFilters,
}) => {
  const [airlineOpen, setAirlineOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState<Record<string, boolean>>({});
  const toggleExtra = (fieldId: string, value: string) => {
    const current = filters.extras?.[fieldId] ?? [];
    const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    onChange({ ...filters, extras: { ...(filters.extras ?? {}), [fieldId]: updated } });
  };

  const updateDateRange = (range: Partial<DateRange>) => {
    onChange({ ...filters, dateRange: { ...filters.dateRange, ...range } });
  };

  const toggleAirline = (airline: string) => {
    const current = filters.airlines;
    const updated = current.includes(airline)
      ? current.filter((a) => a !== airline)
      : [...current, airline];
    onChange({ ...filters, airlines: updated });
  };

  const toggleStatus = (status: string) => {
    const current = filters.statuses;
    const updated = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    onChange({ ...filters, statuses: updated });
  };

  const toggleAdi = (adi: 'A' | 'D' | 'both') => {
    onChange({ ...filters, adi });
  };

  const clearAll = () => {
    onChange({ ...filters, airlines: [], statuses: [], adi: 'both', gate: '', search: '', extras: {} });
  };

  const hasActiveFilters =
    filters.airlines.length > 0 ||
    filters.statuses.length > 0 ||
    filters.adi !== 'both' ||
    filters.gate !== '' ||
    filters.search !== '' ||
    Object.values(filters.extras ?? {}).some(v => v.length > 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Date Range */}
        <div className="flex gap-2 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Start Date</label>
            <DatePicker
              selected={filters.dateRange.startDate}
              onChange={(date) => date && updateDateRange({ startDate: date })}
              selectsStart
              startDate={filters.dateRange.startDate}
              endDate={filters.dateRange.endDate}
              dateFormat="MMM dd, yyyy"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36"
            />
          </div>
          <span className="text-slate-400 mt-5">→</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">End Date</label>
            <DatePicker
              selected={filters.dateRange.endDate}
              onChange={(date) => date && updateDateRange({ endDate: date })}
              selectsEnd
              startDate={filters.dateRange.startDate}
              endDate={filters.dateRange.endDate}
              minDate={filters.dateRange.startDate}
              dateFormat="MMM dd, yyyy"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36"
            />
          </div>
        </div>

        {/* ADI Toggle */}
        {showAdi && <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Direction</label>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {(['both', 'A', 'D'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => toggleAdi(opt)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  filters.adi === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt === 'both' ? 'All' : opt === 'A' ? 'Arrivals' : 'Departures'}
              </button>
            ))}
          </div>
        </div>}

        {/* Airline Multiselect */}
        {showAirlines && airlines.length > 0 && (
          <div className="flex flex-col gap-1 relative">
            <label className="text-xs font-medium text-slate-500">Airlines</label>
            <button
              onClick={() => setAirlineOpen(!airlineOpen)}
              className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 min-w-32"
            >
              <span className="flex-1 text-left">
                {filters.airlines.length === 0
                  ? 'All Airlines'
                  : `${filters.airlines.length} selected`}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {airlineOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-48 max-h-56 overflow-y-auto">
                {airlines.sort().map((airline) => (
                  <label
                    key={airline}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={filters.airlines.includes(airline)}
                      onChange={() => toggleAirline(airline)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span className="font-medium">{airline}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status filter */}
        {showStatus && <div className="flex flex-col gap-1 relative">
          <label className="text-xs font-medium text-slate-500">Status</label>
          <button
            onClick={() => setStatusOpen(!statusOpen)}
            className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 min-w-32"
          >
            <span className="flex-1 text-left">
              {filters.statuses.length === 0 ? 'All Statuses' : `${filters.statuses.length} selected`}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {statusOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-48">
              {statuses.map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(status)}
                    onChange={() => toggleStatus(status)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  {status}
                </label>
              ))}
            </div>
          )}
        </div>}

        {/* Extra multi-select filters (gate, claim, city, etc.) */}
        {(extraFilters ?? []).map((ef) => {
          const selected = filters.extras?.[ef.fieldId] ?? [];
          const isOpen = extrasOpen[ef.fieldId] ?? false;
          return (
            <div key={ef.fieldId} className="flex flex-col gap-1 relative">
              <label className="text-xs font-medium text-slate-500">{ef.label}</label>
              <button
                onClick={() => setExtrasOpen(prev => ({ ...prev, [ef.fieldId]: !prev[ef.fieldId] }))}
                className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white hover:bg-slate-50 min-w-32"
              >
                <span className="flex-1 text-left">
                  {selected.length === 0 ? `All ${ef.label}` : `${selected.length} selected`}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {isOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-48 max-h-56 overflow-y-auto">
                  {ef.values.map((val) => (
                    <label key={val} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(val)}
                        onChange={() => toggleExtra(ef.fieldId, val)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>{val}</span>
                    </label>
                  ))}
                  {ef.values.length === 0 && <div className="px-3 py-2 text-xs text-slate-400">No values available</div>}
                </div>
              )}
            </div>
          );
        })}

        {/* Gate filter */}
        {showGateFilter && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Gate</label>
            {gates.length > 0 ? (
              <select
                value={filters.gate}
                onChange={(e) => onChange({ ...filters, gate: e.target.value })}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Gates</option>
                {gates.sort().map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={filters.gate}
                onChange={(e) => onChange({ ...filters, gate: e.target.value })}
                placeholder="Gate..."
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
              />
            )}
          </div>
        )}

        {/* Search */}
        {showSearchBox && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Flight, city..."
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 ml-auto mt-5">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" icon={<X className="w-4 h-4" />} onClick={clearAll}>
              Clear
            </Button>
          )}
          {onRefresh && (
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
              onClick={onRefresh}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
          <Filter className="w-4 h-4 text-slate-400 mt-0.5" />
          {filters.adi !== 'both' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
              {filters.adi === 'A' ? 'Arrivals only' : 'Departures only'}
              <button onClick={() => toggleAdi('both')} className="hover:text-blue-900 ml-0.5">×</button>
            </span>
          )}
          {filters.airlines.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
              {a}
              <button onClick={() => toggleAirline(a)} className="hover:text-slate-900 ml-0.5">×</button>
            </span>
          ))}
          {filters.statuses.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
              {s}
              <button onClick={() => toggleStatus(s)} className="hover:text-slate-900 ml-0.5">×</button>
            </span>
          ))}
          {filters.gate && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
              Gate: {filters.gate}
              <button onClick={() => onChange({ ...filters, gate: '' })} className="hover:text-slate-900 ml-0.5">×</button>
            </span>
          )}
          {filters.search && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
              Search: "{filters.search}"
              <button onClick={() => onChange({ ...filters, search: '' })} className="hover:text-slate-900 ml-0.5">×</button>
            </span>
          )}
          {Object.entries(filters.extras ?? {}).flatMap(([fieldId, values]) =>
            values.map(v => {
              const label = (extraFilters ?? []).find(ef => ef.fieldId === fieldId)?.label ?? fieldId;
              return (
                <span key={`${fieldId}-${v}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
                  {label}: {v}
                  <button onClick={() => toggleExtra(fieldId, v)} className="hover:text-slate-900 ml-0.5">×</button>
                </span>
              );
            })
          )}
        </div>
      )}

      {/* Close dropdowns on outside click */}
      {(airlineOpen || statusOpen || Object.values(extrasOpen).some(Boolean)) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setAirlineOpen(false); setStatusOpen(false); setExtrasOpen({}); }}
        />
      )}
    </div>
  );
};
