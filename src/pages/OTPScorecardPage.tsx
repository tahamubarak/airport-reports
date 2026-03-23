import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Trophy, AlertTriangle, Target, TrendingDown, Award, Medal } from 'lucide-react';
import { KPICard } from '../components/ui/Card';
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

// OTP thresholds
const OTP_EXCELLENT = 90;
const OTP_GOOD = 80;
const OTP_FAIR = 65;

function otpColor(pct: number): string {
  if (pct >= OTP_EXCELLENT) return '#22c55e';
  if (pct >= OTP_GOOD) return '#84cc16';
  if (pct >= OTP_FAIR) return '#f59e0b';
  return '#ef4444';
}

function otpLabel(pct: number): string {
  if (pct >= OTP_EXCELLENT) return 'Excellent';
  if (pct >= OTP_GOOD) return 'Good';
  if (pct >= OTP_FAIR) return 'Fair';
  return 'Poor';
}

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white font-bold text-xs shadow">
      1
    </span>
  );
  if (rank === 2) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-400 text-white font-bold text-xs shadow">
      2
    </span>
  );
  if (rank === 3) return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-600 text-white font-bold text-xs shadow">
      3
    </span>
  );
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-500 font-semibold text-xs">
      {rank}
    </span>
  );
};

export const OTPScorecardPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { flights, loading, error, isCorsError, isUsingMockData, fetchFlights } = useFlights();
  const adminActiveSiteId = useSessionStore((s) => s.session?.adminActiveSiteId);

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

  // Per-airline stats
  const airlineStats = useMemo((): (AirlineStats & { otpPct: number; rank: number })[] => {
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

    return Object.values(stats)
      .map((s) => ({
        ...s,
        avgDelay: s.delayed > 0 ? Math.round(s.avgDelay / s.delayed) : 0,
        otpPct: s.totalFlights > 0 ? Math.round((s.onTime / s.totalFlights) * 100) : 0,
      }))
      .sort((a, b) => b.otpPct - a.otpPct || b.totalFlights - a.totalFlights)
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }, [filtered]);

  // Airport-wide KPIs
  const kpis = useMemo(() => {
    const total = filtered.length;
    const onTime = filtered.filter((f) => f.status === 'On Time' || f.status === 'Early').length;
    const delayed = filtered.filter((f) => f.status === 'Delayed').length;
    const cancelled = filtered.filter((f) => f.status === 'Cancelled').length;
    const airportOtp = total > 0 ? Math.round((onTime / total) * 100) : 0;

    const best = airlineStats[0];
    const worst = airlineStats[airlineStats.length - 1];

    return { total, onTime, delayed, cancelled, airportOtp, best, worst };
  }, [filtered, airlineStats]);

  // Horizontal bar chart data — ranked high to low OTP
  const rankChartData = airlineStats.map((s) => ({
    airline: s.airline,
    'OTP %': s.otpPct,
    fill: otpColor(s.otpPct),
  }));

  // Scatter: total flights vs OTP%
  const scatterData = airlineStats.map((s) => ({
    x: s.totalFlights,
    y: s.otpPct,
    z: s.totalFlights,
    name: s.airline,
    fill: otpColor(s.otpPct),
  }));

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

      {/* OTP legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
        <span className="text-slate-500">OTP Rating:</span>
        {[
          { label: `Excellent ≥${OTP_EXCELLENT}%`, color: '#22c55e' },
          { label: `Good ≥${OTP_GOOD}%`, color: '#84cc16' },
          { label: `Fair ≥${OTP_FAIR}%`, color: '#f59e0b' },
          { label: `Poor <${OTP_FAIR}%`, color: '#ef4444' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 border border-slate-200">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <FilterBar filters={filters} onChange={setFilters} airlines={airlines} onRefresh={handleRefresh} loading={loading} />
        </div>
        <ExportMenu
          data={airlineStats.map((s) => ({
            Rank: s.rank,
            Airline: s.airline,
            'Total Flights': s.totalFlights,
            'On Time': s.onTime,
            'Delayed': s.delayed,
            'Cancelled': s.cancelled,
            'OTP %': `${s.otpPct}%`,
            'Rating': otpLabel(s.otpPct),
            'Avg Delay (min)': s.avgDelay,
          }))}
          title="OTP Scorecard Report"
          filename="otp-scorecard"
          disabled={airlineStats.length === 0}
        />
      </div>

      {loading && <LoadingSpinner message="Loading OTP data..." />}
      {error && !isUsingMockData && <ErrorState message={error} isCors={isCorsError} onRetry={handleRefresh} />}

      {!loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              title="Airport OTP"
              value={`${kpis.airportOtp}%`}
              icon={<Target className="w-6 h-6" />}
              color={kpis.airportOtp >= OTP_EXCELLENT ? 'green' : kpis.airportOtp >= OTP_GOOD ? 'blue' : kpis.airportOtp >= OTP_FAIR ? 'amber' : 'red'}
              subtitle={otpLabel(kpis.airportOtp)}
            />
            <KPICard
              title="Total Flights"
              value={kpis.total.toLocaleString()}
              icon={<Award className="w-6 h-6" />}
              color="blue"
            />
            <KPICard
              title="On Time"
              value={kpis.onTime.toLocaleString()}
              icon={<Trophy className="w-6 h-6" />}
              color="green"
            />
            <KPICard
              title="Delayed"
              value={kpis.delayed.toLocaleString()}
              icon={<TrendingDown className="w-6 h-6" />}
              color={kpis.delayed === 0 ? 'green' : 'amber'}
            />
            <KPICard
              title="Best Airline"
              value={kpis.best ? `${kpis.best.otpPct}%` : '—'}
              icon={<Medal className="w-6 h-6" />}
              color="green"
              subtitle={kpis.best?.airline}
            />
            <KPICard
              title="Needs Attention"
              value={kpis.worst ? `${kpis.worst.otpPct}%` : '—'}
              icon={<AlertTriangle className="w-6 h-6" />}
              color={kpis.worst && kpis.worst.otpPct < OTP_FAIR ? 'red' : 'amber'}
              subtitle={kpis.worst?.airline}
            />
          </div>

          {/* Ranked OTP bar chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Airline OTP Ranking (High to Low)</h3>
            {rankChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(260, rankChartData.length * 38)}>
                <BarChart
                  data={rankChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} unit="%" />
                  <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={35} />
                  <Tooltip formatter={(v) => [`${v}%`, 'On-Time %']} />
                  {/* Reference lines for thresholds */}
                  <Bar dataKey="OTP %" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, fill: '#475569', formatter: (v: number) => `${v}%` }}>
                    {rankChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
            )}
          </div>

          {/* Volume vs Quality scatter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-1">Volume vs Quality</h3>
              <p className="text-xs text-slate-500 mb-4">Flight volume (x-axis) vs OTP% (y-axis) — ideal airlines are top-right</p>
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="x" name="Flights" tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Total Flights', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="number" dataKey="y" name="OTP %" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" label={{ value: 'OTP %', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#94a3b8' }} />
                    <ZAxis type="number" dataKey="z" range={[60, 400]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm">
                              <p className="font-bold text-slate-800">{d.name}</p>
                              <p className="text-slate-600">Flights: <span className="font-medium">{d.x}</span></p>
                              <p className="text-slate-600">OTP: <span className="font-medium">{d.y}%</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={scatterData} shape={(props: unknown) => {
                      const { cx, cy, payload } = props as { cx: number; cy: number; payload: { fill: string; name: string } };
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={16} fill={payload.fill} fillOpacity={0.85} stroke="white" strokeWidth={2} />
                          <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize={9} fontWeight="bold">
                            {payload.name}
                          </text>
                        </g>
                      );
                    }} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">No data</div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Average Delay by Airline</h3>
              {airlineStats.filter((s) => s.avgDelay > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={[...airlineStats].filter((s) => s.avgDelay > 0).sort((a, b) => b.avgDelay - a.avgDelay)}
                    layout="vertical"
                    margin={{ top: 5, right: 40, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} unit="m" />
                    <YAxis type="category" dataKey="airline" tick={{ fontSize: 12, fill: '#64748b' }} width={35} />
                    <Tooltip formatter={(v) => [`${v}m`, 'Avg Delay']} />
                    <Bar dataKey="avgDelay" name="Avg Delay" radius={[0, 6, 6, 0]} label={{ position: 'right', fontSize: 11, fill: '#475569', formatter: (v: number) => `${v}m` }}>
                      {airlineStats.map((s, i) => (
                        <Cell key={i} fill={s.avgDelay > 45 ? '#ef4444' : s.avgDelay > 20 ? '#f59e0b' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No delayed flights</div>
              )}
            </div>
          </div>

          {/* League Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold text-slate-800">OTP League Table</h3>
              </div>
              <span className="text-xs text-slate-500">{airlineStats.length} airlines ranked</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-12">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Airline</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">On Time</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Delayed</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Cancelled</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Delay</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[160px]">OTP Score</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {airlineStats.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">No airline data available</td>
                    </tr>
                  ) : (
                    airlineStats.map((s) => (
                      <tr
                        key={s.airline}
                        className={`hover:bg-slate-50 transition-colors ${s.rank <= 3 ? 'bg-amber-50/30' : ''}`}
                      >
                        <td className="px-4 py-3 text-center">
                          <RankBadge rank={s.rank} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="font-bold px-2 py-0.5 rounded text-white text-sm"
                            style={{ backgroundColor: CHART_COLORS[(s.rank - 1) % CHART_COLORS.length] }}
                          >
                            {s.airline}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{s.totalFlights}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">{s.onTime}</td>
                        <td className="px-4 py-3 text-right text-amber-600 font-medium">{s.delayed}</td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">{s.cancelled}</td>
                        <td className="px-4 py-3 text-right">
                          {s.avgDelay > 0
                            ? <span className="text-amber-600 font-medium">{s.avgDelay}m</span>
                            : <span className="text-green-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24 bg-slate-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all"
                                style={{
                                  width: `${s.otpPct}%`,
                                  backgroundColor: otpColor(s.otpPct),
                                }}
                              />
                            </div>
                            <span
                              className="font-bold text-sm w-10 text-right"
                              style={{ color: otpColor(s.otpPct) }}
                            >
                              {s.otpPct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="text-xs font-semibold px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: otpColor(s.otpPct) + '20',
                              color: otpColor(s.otpPct),
                            }}
                          >
                            {otpLabel(s.otpPct)}
                          </span>
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
