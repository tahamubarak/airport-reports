import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane,
  LayoutDashboard,
  DoorOpen,
  TrendingUp,
  Award,
  Paintbrush,
  ArrowRight,
  RefreshCw,
  Clock,
  Activity,
  Plus,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useFlights } from '../hooks/useFlights';
import { generateMockFlights } from '../utils/flightParser';
import { SavedReport } from '../types';
import { format, subDays } from 'date-fns';

interface ReportCard {
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
}

const REPORT_CARDS: ReportCard[] = [
  {
    title: 'Dashboard',
    description: 'KPIs, charts, and real-time flight analytics at a glance',
    path: '/dashboard',
    icon: <LayoutDashboard className="w-6 h-6" />,
    color: 'from-blue-500 to-blue-700',
    badge: 'Popular',
  },
  {
    title: 'Flight Operations',
    description: 'Complete flight table with filtering, sorting, and export',
    path: '/reports/flight-operations',
    icon: <Plane className="w-6 h-6" />,
    color: 'from-indigo-500 to-indigo-700',
  },
  {
    title: 'Gate Utilization',
    description: 'Gate activity analysis with timeline visualization',
    path: '/reports/gate-utilization',
    icon: <DoorOpen className="w-6 h-6" />,
    color: 'from-violet-500 to-violet-700',
  },
  {
    title: 'Delay Analysis',
    description: 'On-time performance breakdown by airline and hour',
    path: '/reports/delay-analysis',
    icon: <TrendingUp className="w-6 h-6" />,
    color: 'from-amber-500 to-orange-600',
  },
  {
    title: 'Airline Performance',
    description: 'Compare on-time rates and delays across all airlines',
    path: '/reports/airline-performance',
    icon: <Award className="w-6 h-6" />,
    color: 'from-emerald-500 to-green-700',
  },
  {
    title: 'Report Designer',
    description: 'Build custom reports with drag-and-drop fields and charts',
    path: '/report-designer',
    icon: <Paintbrush className="w-6 h-6" />,
    color: 'from-pink-500 to-rose-600',
    badge: 'New',
  },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, onTimeRate: 0, activeGates: 0 });
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [lastRefresh] = useState(new Date());

  useEffect(() => {
    // Load saved reports from localStorage
    const stored = localStorage.getItem('airport-saved-reports');
    if (stored) {
      try {
        setSavedReports(JSON.parse(stored));
      } catch {
        // ignore
      }
    }

    // Generate quick stats from mock data for today
    const today = new Date();
    const flights = generateMockFlights(today, today);
    const onTime = flights.filter((f) => f.status === 'On Time' || f.status === 'Early').length;
    const gates = new Set(flights.map((f) => f.gate).filter(Boolean));
    setStats({
      total: flights.length,
      onTimeRate: flights.length > 0 ? Math.round((onTime / flights.length) * 100) : 0,
      activeGates: gates.size,
    });
  }, []);

  const deleteSavedReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedReports.filter((r) => r.id !== id);
    setSavedReports(updated);
    localStorage.setItem('airport-saved-reports', JSON.stringify(updated));
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white shadow-xl">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600 rounded-full translate-y-1/2 -translate-x-1/4" />
        </div>
        {/* Grid overlay */}
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative px-8 py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500/30 rounded-xl flex items-center justify-center backdrop-blur-sm border border-blue-400/30">
                  <Plane className="w-6 h-6 text-blue-300" />
                </div>
                <div>
                  <span className="text-blue-300 text-sm font-medium">BWI Airport Operations</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-green-300 text-xs">Live Data</span>
                  </div>
                </div>
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold mb-3 leading-tight">
                Flight Analytics
                <br />
                <span className="text-blue-300">& Reporting</span>
              </h1>
              <p className="text-slate-300 text-lg max-w-xl">
                Real-time flight data analysis, gate utilization tracking, and performance reporting for airport operations.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:min-w-52">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-3xl font-bold">{stats.total}</div>
                <div className="text-slate-300 text-sm mt-1">Today's Flights</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-3xl font-bold text-green-300">{stats.onTimeRate}%</div>
                <div className="text-slate-300 text-sm mt-1">On-Time Rate</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-3xl font-bold text-blue-300">{stats.activeGates}</div>
                <div className="text-slate-300 text-sm mt-1">Active Gates</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-8">
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/dashboard')}
              iconRight={<ArrowRight className="w-5 h-5" />}
              className="bg-blue-500 hover:bg-blue-400 border-transparent shadow-lg shadow-blue-900/30"
            >
              Open Dashboard
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/report-designer')}
              icon={<Plus className="w-5 h-5" />}
              className="border-white/30 text-white hover:bg-white/10 bg-transparent"
            >
              New Report
            </Button>
          </div>
        </div>
      </div>

      {/* Last Refresh Info */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <RefreshCw className="w-4 h-4" />
        <span>Data last updated: {format(lastRefresh, 'MMM dd, yyyy HH:mm:ss')}</span>
        <Clock className="w-4 h-4 ml-2" />
        <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
      </div>

      {/* Report Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800">Reports & Analytics</h2>
          <span className="text-sm text-slate-500">{REPORT_CARDS.length} available</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_CARDS.map((card) => (
            <div
              key={card.path}
              onClick={() => navigate(card.path)}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-200 cursor-pointer overflow-hidden"
            >
              <div className={`bg-gradient-to-br ${card.color} p-6 relative overflow-hidden`}>
                <div className="text-white/20 absolute -top-4 -right-4 transform scale-150">
                  {card.icon}
                </div>
                <div className="relative flex items-start justify-between">
                  <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                    <div className="text-white">{card.icon}</div>
                  </div>
                  {card.badge && (
                    <span className="px-2 py-0.5 bg-white/20 text-white text-xs font-semibold rounded-full border border-white/30 backdrop-blur-sm">
                      {card.badge}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">
                  {card.title}
                </h3>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">{card.description}</p>
                <div className="flex items-center gap-1 text-blue-600 text-sm font-medium mt-4 group-hover:gap-2 transition-all">
                  Open Report <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Saved Reports</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/report-designer')}>
              + Create New
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {savedReports.map((report) => (
              <Card
                key={report.id}
                hover
                onClick={() => navigate(`/report-designer?id=${report.id}`)}
                className="relative group"
              >
                <div className="flex items-start justify-between">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <button
                    onClick={(e) => deleteSavedReport(report.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                    title="Delete report"
                  >
                    ×
                  </button>
                </div>
                <h3 className="font-semibold text-slate-800 mt-3 truncate">{report.name}</h3>
                <p className="text-xs text-slate-500 mt-1 capitalize">{report.chartType} • {report.groupBy}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {format(new Date(report.updatedAt), 'MMM dd, yyyy')}
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Today\'s Flights', desc: 'View all flights today', path: '/reports/flight-operations', icon: <Plane className="w-5 h-5" /> },
          { label: 'Gate Status', desc: 'Current gate assignments', path: '/reports/gate-utilization', icon: <DoorOpen className="w-5 h-5" /> },
          { label: 'Delays', desc: 'Analyze current delays', path: '/reports/delay-analysis', icon: <TrendingUp className="w-5 h-5" /> },
          { label: 'Performance', desc: 'Airline on-time rates', path: '/reports/airline-performance', icon: <Award className="w-5 h-5" /> },
        ].map((action) => (
          <Card
            key={action.path}
            hover
            padding="sm"
            onClick={() => navigate(action.path)}
            className="flex items-center gap-3"
          >
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600 flex-shrink-0">{action.icon}</div>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 text-sm truncate">{action.label}</div>
              <div className="text-xs text-slate-500 truncate">{action.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
