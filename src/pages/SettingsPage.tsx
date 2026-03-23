import React from 'react';
import { Info } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useSessionStore } from '../store/useSessionStore';

export const SettingsPage: React.FC = () => {
  const { session } = useSessionStore();

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <Card>
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">About APVe Airport Reports</h3>
            <p className="text-sm text-slate-500 mb-3">
              Airport Flight Reporting Dashboard — React · TypeScript · Vite · Tailwind · Recharts · Zustand
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
              <div>Auth API: <code className="bg-slate-50 px-1 rounded">authApi/v1/</code></div>
              <div>Users API: <code className="bg-slate-50 px-1 rounded">usersapi/v1/</code></div>
              <div>Public API: <code className="bg-slate-50 px-1 rounded">connectpublicapi/</code></div>
              <div>Active site: <code className="bg-slate-50 px-1 rounded">{session?.site?.siteId || session?.adminActiveSiteId || '—'}</code></div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              Field definitions, color rules, and site configuration are managed in <strong>Admin → Site Config</strong>.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
