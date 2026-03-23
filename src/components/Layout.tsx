import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Plane,
  DoorOpen,
  TrendingUp,
  Award,
  Paintbrush,
  Settings,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Shield,
  User,
  FileBarChart,
  Palette,
  Check,
  Luggage,
  Trophy,
  Users,
  Timer,
  ConciergeBell,
} from 'lucide-react';
import { useSessionStore } from '../store/useSessionStore';
import { useSiteStore } from '../store/useSiteStore';
import { useReportsStore } from '../store/useReportsStore';
import { useThemeStore, THEMES, AppTheme } from '../store/useThemeStore';
import toast from 'react-hot-toast';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { path: '/reports/flight-operations', label: 'Flight Operations', icon: <Plane className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/gate-utilization', label: 'Gate Utilization', icon: <DoorOpen className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/delay-analysis', label: 'Delay Analysis', icon: <TrendingUp className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/airline-performance', label: 'Airline Performance', icon: <Award className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/otp-scorecard', label: 'OTP Scorecard', icon: <Trophy className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/baggage-performance', label: 'Baggage Performance', icon: <Luggage className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/passenger-flow', label: 'Passenger Flow', icon: <Users className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/baggage-belt', label: 'Baggage Belt', icon: <ConciergeBell className="w-5 h-5" />, group: 'Reports' },
  { path: '/reports/taxi-time', label: 'Taxi Time', icon: <Timer className="w-5 h-5" />, group: 'Reports' },
  { path: '/report-designer', label: 'Report Designer', icon: <Paintbrush className="w-5 h-5" />, adminOnly: true },
  { path: '/admin', label: 'Admin', icon: <Shield className="w-5 h-5" />, adminOnly: true },
];

const NavItemComp: React.FC<{ item: NavItem; collapsed: boolean }> = ({ item, collapsed }) => {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${
          isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <span className="flex-shrink-0">{item.icon}</span>
      {!collapsed && (
        <span className="text-sm font-medium truncate">{item.label}</span>
      )}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-slate-700 text-white text-xs rounded-md opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
          {item.label}
        </div>
      )}
    </NavLink>
  );
};

interface LayoutProps {
  children: React.ReactNode;
}

// ─── Theme Switcher ───────────────────────────────────────────────────────────

const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = THEMES.find(t => t.id === theme) ?? THEMES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Change theme"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 text-slate-500 hover:text-blue-600 transition-all text-xs font-medium"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{current.name}</span>
        <span
          className="theme-swatch hidden sm:block"
          style={{ background: current.swatch }}
        />
      </button>

      {open && (
        <div className="theme-switcher-panel absolute right-0 top-full mt-2 w-52 rounded-xl z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--th-text-3)' }}>Theme</p>
          </div>
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id as AppTheme); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
            >
              {/* Dual swatch */}
              <div className="relative flex-shrink-0 w-7 h-7 rounded-lg overflow-hidden border border-slate-200">
                <div className="absolute inset-0" style={{ background: t.swatch }} />
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-tl-md" style={{ background: t.swatch2 }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--th-text-1)' }}>{t.name}</p>
                <p className="text-xs" style={{ color: 'var(--th-text-4)' }}>{t.description}</p>
              </div>
              {theme === t.id && <Check className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
            </button>
          ))}
          <div className="px-3 pb-3" />
        </div>
      )}
    </div>
  );
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { theme } = useThemeStore();
  const navigate = useNavigate();
  const { session, clearSession, setAdminActiveSite } = useSessionStore();
  const { sites } = useSiteStore();
  const { getReportsForSite } = useReportsStore();
  const activeSiteIata = session?.isAppAdmin
    ? sites.find(s => s.id === session.adminActiveSiteId)?.iataCode ?? null
    : session?.site?.iataCode ?? null;

  const activeSiteId = session?.isAppAdmin
    ? (session.adminActiveSiteId ?? '')
    : (session?.site?.id ?? '');

  const customReports = getReportsForSite(activeSiteId);

  const isAdmin = session?.isGlobalAdmin || session?.isSiteAdmin || session?.isAppAdmin;

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const currentPage = visibleNavItems.find((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  );

  const groups = ['', 'Reports'];
  const itemsByGroup = groups.reduce<Record<string, NavItem[]>>((acc, group) => {
    acc[group] = visibleNavItems.filter((item) => (item.group || '') === group);
    return acc;
  }, {});

  const handleLogout = () => {
    clearSession();
    toast('Logged out successfully', { icon: '👋' });
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-800 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
          <Plane className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-white font-bold text-sm leading-tight">APVe Reports</div>
            <div className="text-slate-400 text-xs">
              {activeSiteIata ? `${activeSiteIata} Operations` : 'Airport Operations'}
            </div>
          </div>
        )}
      </div>

      {/* User info */}
      {session && !collapsed && (
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-700 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-blue-200" />
            </div>
            <div className="min-w-0">
              <div className="text-white text-xs font-medium truncate">{session.username}</div>
              {isAdmin && (
                <div className="text-xs text-blue-400 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  {session.isAppAdmin ? 'App Admin' : session.isGlobalAdmin ? 'Global Admin' : 'Site Admin'}
                </div>
              )}
            </div>
            {/* Site badge */}
            <span className="ml-auto flex-shrink-0 text-xs font-bold font-mono bg-blue-600 text-white px-2 py-0.5 rounded">
              {activeSiteIata}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map((group) => (
          <div key={group || 'main'}>
            {group && !collapsed && (
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2">
                {group}
              </div>
            )}
            <div className="space-y-1">
              {itemsByGroup[group].map((item) => (
                <NavItemComp key={item.path} item={item} collapsed={collapsed} />
              ))}
              {/* Custom reports appear after the core Reports items */}
              {group === 'Reports' && customReports.map((r) => (
                <NavItemComp
                  key={r.id}
                  item={{ path: `/reports/custom/${r.id}`, label: r.name, icon: <FileBarChart className="w-5 h-5" />, group: 'Reports' }}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* About + Logout */}
      <div className={`px-3 py-3 border-t border-slate-800 space-y-1`}>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative ${collapsed ? 'justify-center' : ''} ${
              isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
          title="About"
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">About</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-slate-700 text-white text-xs rounded-md opacity-0 pointer-events-none group-hover:opacity-100 whitespace-nowrap z-50 transition-opacity">
              About
            </div>
          )}
        </NavLink>
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors ${collapsed ? 'justify-center' : ''}`}
          title="Logout"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>

      {/* Collapse toggle (desktop) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center px-4 py-3 text-slate-500 hover:text-white border-t border-slate-800 transition-colors"
      >
        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" data-theme={theme} style={{ backgroundColor: 'var(--th-body)' }}>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Mobile */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col
          transform transition-transform duration-200
          lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-sm">APVe Reports</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          {customReports.map((r) => (
            <NavLink
              key={r.id}
              to={`/reports/custom/${r.id}`}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <FileBarChart className="w-5 h-5" />
              {r.name}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-slate-800 pt-3 space-y-1">
          <NavLink
            to="/settings"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Settings className="w-5 h-5" />
            About
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Sidebar - Desktop */}
      <aside
        className={`
          hidden lg:flex flex-col bg-slate-900 flex-shrink-0
          transition-all duration-200
          ${collapsed ? 'w-16' : 'w-60'}
        `}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-slate-500 hover:text-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <h1 className="text-base font-semibold text-slate-800">
              {currentPage?.label || 'APVe Airport Reports'}
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {activeSiteIata
                ? `${activeSiteIata} — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                : new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            {session && (
              <>
                {/* Site selector for app admins, static badge for regular users */}
                {session.isAppAdmin ? (
                  <select
                    value={session.adminActiveSiteId ?? ''}
                    onChange={(e) => setAdminActiveSite(e.target.value || null)}
                    className="hidden sm:inline-flex text-xs font-mono font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"
                    title="Switch active site"
                  >
                    <option value="">— select site —</option>
                    {sites.filter((s) => s.enabled).map((s) => (
                      <option key={s.id} value={s.id}>{s.iataCode} — {s.name}</option>
                    ))}
                  </select>
                ) : (
                  activeSiteIata && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 font-mono font-bold">
                      {activeSiteIata}
                    </span>
                  )
                )}
                {/* User pill */}
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                  <User className="w-3.5 h-3.5" />
                  {session.username}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
