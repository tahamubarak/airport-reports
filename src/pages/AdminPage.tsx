import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, Building2, Plus, Trash2, Edit2, X, Check,
  ToggleLeft, ToggleRight, Wifi, WifiOff, RefreshCw,
  Shield, Palette, Code2,
  AlertTriangle, Settings2, FileText, History,
} from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../services/authService';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useSiteStore } from '../store/useSiteStore';
import { useReportsStore } from '../store/useReportsStore';
import { useSessionStore } from '../store/useSessionStore';
import {
  Site, AppAdmin, SavedReport, ReportAuditEntry, FieldDefinition, FieldType,
  ColorRule, ColorRuleOperator, FieldExpression, FieldExpressionType,
  DEFAULT_FIELD_DEFINITIONS, COLOR_RULE_OPERATORS, PRESET_DATE_FORMATS, AVAILABLE_FIELDS,
} from '../types';
import { PRESET_COLORS } from '../utils/fieldEngine';
import toast from 'react-hot-toast';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const FIELD_TYPES: { value: FieldType; label: string; color: string }[] = [
  { value: 'string',   label: 'Text',     color: 'bg-blue-100 text-blue-700' },
  { value: 'datetime', label: 'DateTime', color: 'bg-purple-100 text-purple-700' },
  { value: 'int',      label: 'Integer',  color: 'bg-green-100 text-green-700' },
  { value: 'float',    label: 'Float',    color: 'bg-teal-100 text-teal-700' },
  { value: 'boolean',  label: 'Boolean',  color: 'bg-orange-100 text-orange-700' },
];

function fieldTypeColor(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.value === type)?.color ?? 'bg-gray-100 text-gray-700';
}
function fieldTypeLabel(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── Color Rules Modal ────────────────────────────────────────────────────────

interface ColorRulesModalProps {
  field: FieldDefinition;
  siteId: string;
  onClose: () => void;
}

const ColorRulesModal: React.FC<ColorRulesModalProps> = ({ field, siteId, onClose }) => {
  const { updateSiteFieldDefinition } = useSiteStore();
  const [rules, setRules] = useState<ColorRule[]>(
    field.colorRules ? JSON.parse(JSON.stringify(field.colorRules)) : []
  );

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      { id: generateId(), operator: 'eq', value: '', textColor: '#111827', bgColor: 'transparent' },
    ]);
  };

  const updateRule = (id: string, updates: Partial<ColorRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    updateSiteFieldDefinition(siteId, field.id, { colorRules: rules });
    toast.success('Color rules saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-purple-600" />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Color Rules</h3>
              <p className="text-sm text-slate-500">{field.label} ({field.name})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {rules.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">No color rules yet. Add one below.</p>
          )}
          {rules.map((rule) => (
            <div key={rule.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value as ColorRuleOperator })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {COLOR_RULE_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                <input
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Value"
                  value={rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <span
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                    style={{ color: rule.textColor, backgroundColor: rule.bgColor, fontWeight: rule.bold ? 'bold' : 'normal' }}
                  >
                    {rule.value || 'Preview'}
                  </span>
                </div>
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rule.bold ?? false}
                    onChange={(e) => updateRule(rule.id, { bold: e.target.checked })}
                    className="rounded"
                  />
                  Bold
                </label>
                <button onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-600 ml-auto">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-500 text-xs">Text:</span>
                  <input type="color" value={rule.textColor ?? '#111827'} onChange={(e) => updateRule(rule.id, { textColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-slate-300" />
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-500 text-xs">BG:</span>
                  {rule.bgColor !== 'transparent' ? (
                    <input type="color" value={rule.bgColor ?? '#ffffff'} onChange={(e) => updateRule(rule.id, { bgColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border border-slate-300" />
                  ) : (
                    <div className="w-8 h-8 rounded border border-slate-300 overflow-hidden cursor-pointer flex-shrink-0"
                      style={{ background: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%) 0 0 / 10px 10px' }}
                      onClick={() => updateRule(rule.id, { bgColor: '#ffffff' })}
                      title="Click to pick a color"
                    />
                  )}
                  <button
                    onClick={() => updateRule(rule.id, { bgColor: rule.bgColor === 'transparent' ? '#ffffff' : 'transparent' })}
                    title="Toggle transparent background"
                    className={`text-xs px-1.5 py-0.5 rounded border font-mono leading-none ${rule.bgColor === 'transparent' ? 'bg-blue-100 border-blue-400 text-blue-700 font-bold' : 'border-slate-300 text-slate-400 hover:text-slate-600'}`}
                  >
                    T
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => updateRule(rule.id, { textColor: p.textColor, bgColor: p.bgColor })}
                      className="px-2 py-1 rounded text-xs font-medium border border-slate-200"
                      style={{ color: p.textColor, backgroundColor: p.bgColor === 'transparent' ? undefined : p.bgColor }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-100">
          <Button variant="outline" icon={<Plus className="w-4 h-4" />} onClick={addRule}>Add Rule</Button>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<Check className="w-4 h-4" />} onClick={handleSave}>Save Rules</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Expression Builder Modal ─────────────────────────────────────────────────

interface ExpressionBuilderModalProps {
  field: FieldDefinition;
  siteId: string;
  onClose: () => void;
}

const ExpressionBuilderModal: React.FC<ExpressionBuilderModalProps> = ({ field, siteId, onClose }) => {
  const { updateSiteFieldDefinition } = useSiteStore();
  const existing = field.expression;
  const [exprType, setExprType] = useState<FieldExpressionType>(existing?.type ?? 'static');
  const [fields, setFields] = useState<string[]>(existing?.fields ?? []);
  const [separator, setSeparator] = useState(existing?.separator ?? ' ');
  const [staticValue, setStaticValue] = useState(existing?.staticValue ?? '');
  const [lookupMap, setLookupMap] = useState<{ key: string; val: string }[]>(
    existing?.map ? Object.entries(existing.map).map(([key, val]) => ({ key, val })) : []
  );

  const toggleField = (id: string) => {
    setFields((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  };

  const handleSave = () => {
    let expr: FieldExpression;
    if (exprType === 'timeDiff') {
      expr = { type: 'timeDiff', fields };
    } else if (exprType === 'concat') {
      expr = { type: 'concat', fields, separator };
    } else if (exprType === 'lookup') {
      const map: Record<string, string> = {};
      lookupMap.forEach(({ key, val }) => { if (key) map[key] = val; });
      expr = { type: 'lookup', fields: fields.slice(0, 1), map };
    } else {
      expr = { type: 'static', staticValue };
    }
    updateSiteFieldDefinition(siteId, field.id, { expression: expr });
    toast.success('Expression saved');
    onClose();
  };

  const handleClear = () => {
    updateSiteFieldDefinition(siteId, field.id, { expression: undefined });
    toast.success('Expression cleared');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Code2 className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-lg font-bold text-slate-800">Expression Builder</h3>
              <p className="text-sm text-slate-500">{field.label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Expression Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(['timeDiff', 'concat', 'lookup', 'static'] as FieldExpressionType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setExprType(t)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${exprType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600 hover:border-indigo-400'}`}
                >
                  {t === 'timeDiff' ? 'Time Diff' : t === 'concat' ? 'Concat' : t === 'lookup' ? 'Lookup' : 'Static'}
                </button>
              ))}
            </div>
          </div>

          {exprType === 'timeDiff' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Calculates the difference in minutes between two datetime fields.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Start Field</label>
                  <select value={fields[0] ?? ''} onChange={(e) => setFields([e.target.value, fields[1] ?? ''])} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select field...</option>
                    {AVAILABLE_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">End Field</label>
                  <select value={fields[1] ?? ''} onChange={(e) => setFields([fields[0] ?? '', e.target.value])} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select field...</option>
                    {AVAILABLE_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {exprType === 'concat' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Concatenates multiple fields with a separator.</p>
              <div>
                <label className="block text-xs text-slate-600 mb-2">Fields (in order)</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {AVAILABLE_FIELDS.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={fields.includes(f.id)} onChange={() => toggleField(f.id)} className="rounded" />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Separator</label>
                <input value={separator} onChange={(e) => setSeparator(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32" placeholder="Space, comma, etc." />
              </div>
            </div>
          )}

          {exprType === 'lookup' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Maps a field value to a display value.</p>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Source Field</label>
                <select value={fields[0] ?? ''} onChange={(e) => setFields([e.target.value])} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select field...</option>
                  {AVAILABLE_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-2">Value Map</label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {lookupMap.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={row.key} onChange={(e) => setLookupMap((prev) => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1" placeholder="Raw value" />
                      <span className="text-slate-400">→</span>
                      <input value={row.val} onChange={(e) => setLookupMap((prev) => prev.map((r, j) => j === i ? { ...r, val: e.target.value } : r))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1" placeholder="Display value" />
                      <button onClick={() => setLookupMap((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setLookupMap((prev) => [...prev, { key: '', val: '' }])} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>
          )}

          {exprType === 'static' && (
            <div>
              <label className="block text-xs text-slate-600 mb-1">Static Value</label>
              <input value={staticValue} onChange={(e) => setStaticValue(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Enter a fixed value" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-100">
          {existing ? (
            <Button variant="ghost" onClick={handleClear}>Clear Expression</Button>
          ) : <span />}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Expression</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Site Modal ───────────────────────────────────────────────────────────────

interface SiteModalProps {
  site?: Site;
  onSave: (data: Omit<Site, 'id'>) => void;
  onClose: () => void;
}

const SiteModal: React.FC<SiteModalProps> = ({ site, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: site?.name ?? '',
    iataCode: site?.iataCode ?? '',
    siteId: site?.siteId ?? '1',
    baseUrl: site?.baseUrl ?? '',
    description: site?.description ?? '',
    adminUsers: site?.adminUsers.join(', ') ?? '',
    enabled: site?.enabled ?? true,
    serviceApiKey: site?.serviceApiKey ?? '',
  });
  const [testUser, setTestUser] = useState('');
  const [testPass, setTestPass] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    if (!form.name.trim() || !form.iataCode.trim() || !form.baseUrl.trim()) {
      toast.error('Name, IATA Code, and Base URL are required');
      return;
    }
    const url = form.baseUrl.trim().endsWith('/') ? form.baseUrl.trim() : `${form.baseUrl.trim()}/`;
    onSave({
      name: form.name.trim(),
      iataCode: form.iataCode.trim().toUpperCase(),
      siteId: form.siteId.trim() || '1',
      baseUrl: url,
      description: form.description.trim() || undefined,
      adminUsers: form.adminUsers.split(',').map((u) => u.trim()).filter(Boolean),
      enabled: form.enabled,
      serviceApiKey: form.serviceApiKey.trim() || undefined,
    });
  };

  const handleTest = async () => {
    const url = form.baseUrl.trim().endsWith('/') ? form.baseUrl.trim() : `${form.baseUrl.trim()}/`;
    setTesting(true);
    setTestResult(null);
    try {
      if (form.serviceApiKey.trim()) {
        const res = await axios.post(
          apiUrl(`${url}connectpublicapi/api/ConnectPublicApiAuthentication`),
          JSON.stringify(form.serviceApiKey.trim()),
          { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        const token = (res.data as { publicAccessToken?: string })?.publicAccessToken;
        setTestResult({ ok: !!token, msg: token ? '✓ Service API key valid — public token received' : 'Unexpected response' });
      } else {
        if (!testUser || !testPass) { toast.error('Enter username and password to test'); setTesting(false); return; }
        const res = await axios.post(
          apiUrl(`${url}authApi/v1/api/Authentication/login`),
          { userName: testUser.trim(), site: form.iataCode.trim().toUpperCase(), password: testPass },
          { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        setTestResult({ ok: true, msg: `✓ Login successful (status ${res.status})` });
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      const status = axErr?.response?.status;
      const data = axErr?.response?.data;
      const serverMsg = typeof data === 'string' ? data : data ? JSON.stringify(data) : '';
      setTestResult({ ok: false, msg: status ? `HTTP ${status}${serverMsg ? ' — ' + serverMsg : ''}` : `Network error: ${axErr?.message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">{site ? 'Edit Site' : 'Add Site'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Airport Name *</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Raleigh-Durham International" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">IATA Code *</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.iataCode} onChange={(e) => setForm((f) => ({ ...f, iataCode: e.target.value.toUpperCase() }))} placeholder="RDU" maxLength={5} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Site ID</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.siteId} onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))} placeholder="1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Base URL *</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://RDU.cloudids.aero/" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Usernames <span className="font-normal text-slate-500">(comma-separated)</span></label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.adminUsers} onChange={(e) => setForm((f) => ({ ...f, adminUsers: e.target.value }))} placeholder="admin1, admin2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Service API Key <span className="font-normal text-slate-500">(optional — bypasses APVe user auth)</span>
            </label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.serviceApiKey} onChange={(e) => setForm((f) => ({ ...f, serviceApiKey: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <p className="text-xs text-slate-400 mt-1">When set, any username can log in using this API key directly.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}>
              {form.enabled ? <ToggleRight className="w-6 h-6 text-green-600" /> : <ToggleLeft className="w-6 h-6 text-slate-400" />}
            </button>
            <span className="text-sm font-medium text-slate-700">{form.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Test Connection</p>
            {!form.serviceApiKey.trim() && (
              <div className="flex gap-2 mb-2">
                <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Username" value={testUser} onChange={(e) => setTestUser(e.target.value)} />
                <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" type="password" placeholder="Password" value={testPass} onChange={(e) => setTestPass(e.target.value)} />
              </div>
            )}
            <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              {form.serviceApiKey.trim() ? 'Test Service Key' : 'Test Login'}
            </button>
            {testResult && (
              <div className={`mt-2 flex items-start gap-2 p-2.5 rounded-lg text-xs ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {testResult.ok ? <Wifi className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> : <WifiOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <span>{testResult.msg}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button variant="primary" onClick={handleSave}>{site ? 'Save Changes' : 'Add Site'}</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

// ─── Field Row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldDefinition;
  siteId: string;
  onColorRules: () => void;
  onExpression?: () => void;
}

const FieldRow: React.FC<FieldRowProps> = ({ field, siteId, onColorRules, onExpression }) => {
  const { updateSiteFieldDefinition, deleteSiteFieldDefinition } = useSiteStore();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [dateFormat, setDateFormat] = useState(field.dateFormat ?? '');

  const commitEdit = () => {
    updateSiteFieldDefinition(siteId, field.id, { label, dateFormat: dateFormat || undefined });
    setEditing(false);
  };

  const toggleEnabled = () => {
    updateSiteFieldDefinition(siteId, field.id, { enabled: !field.enabled });
  };

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-50 group ${!field.enabled ? 'opacity-50' : ''}`}>
      <button onClick={toggleEnabled} className="flex-shrink-0">
        {field.enabled ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />}
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="border border-blue-400 rounded px-2 py-1 text-sm flex-1" onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }} />
            {field.type === 'datetime' && (
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm">
                <option value="">No format</option>
                {PRESET_DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            <button onClick={commitEdit} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
            <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{field.label}</span>
            <span className="text-xs text-slate-400 font-mono">{field.name}</span>
            {field.dateFormat && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{field.dateFormat}</span>}
          </div>
        )}
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${fieldTypeColor(field.type)}`}>{fieldTypeLabel(field.type)}</span>
      {(field.colorRules?.length ?? 0) > 0 && (
        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {field.colorRules!.length} rule{field.colorRules!.length !== 1 ? 's' : ''}
        </span>
      )}
      {field.expression && (
        <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex-shrink-0">{field.expression.type}</span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!editing && <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></button>}
        <button onClick={onColorRules} className="text-slate-400 hover:text-purple-600" title="Color Rules"><Palette className="w-3.5 h-3.5" /></button>
        {!field.isBuiltIn && onExpression && (
          <button onClick={onExpression} className="text-slate-400 hover:text-indigo-600" title="Expression"><Code2 className="w-3.5 h-3.5" /></button>
        )}
        {!field.isBuiltIn && (
          <button onClick={() => deleteSiteFieldDefinition(siteId, field.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
    </div>
  );
};

// ─── Add Field Form ───────────────────────────────────────────────────────────

const AddFieldForm: React.FC<{ siteId: string; onDone: () => void }> = ({ siteId, onDone }) => {
  const { addSiteFieldDefinition } = useSiteStore();
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('string');
  const [dateFormat, setDateFormat] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !label.trim()) { toast.error('Field name and label are required'); return; }
    addSiteFieldDefinition(siteId, {
      id: generateId(),
      name: name.trim(),
      label: label.trim(),
      type,
      dateFormat: type === 'datetime' ? (dateFormat || undefined) : undefined,
      enabled: true,
      isBuiltIn: false,
    });
    toast.success('Field added');
    onDone();
  };

  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40 space-y-3">
      <p className="text-sm font-semibold text-slate-700">New Custom Field</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Field Name (API key)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="myField" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Display Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="My Field" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {type === 'datetime' && (
          <div>
            <label className="block text-xs text-slate-600 mb-1">Date Format</label>
            <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="">No format</option>
              {PRESET_DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={handleAdd}>Add Field</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
};

// ─── Fields Panel (reusable for site + global) ────────────────────────────────

const FieldsPanel: React.FC<{ siteId: string }> = ({ siteId }) => {
  const { getSiteFieldDefinitions } = useSiteStore();
  const fields = getSiteFieldDefinitions(siteId);
  const [showAddForm, setShowAddForm] = useState(false);
  const [colorRulesField, setColorRulesField] = useState<FieldDefinition | null>(null);
  const [expressionField, setExpressionField] = useState<FieldDefinition | null>(null);

  const builtIn = fields.filter((f) => f.isBuiltIn);
  const custom = fields.filter((f) => !f.isBuiltIn);

  return (
    <div className="space-y-4">
      {colorRulesField && (
        <ColorRulesModal field={colorRulesField} siteId={siteId} onClose={() => setColorRulesField(null)} />
      )}
      {expressionField && (
        <ExpressionBuilderModal field={expressionField} siteId={siteId} onClose={() => setExpressionField(null)} />
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-700">Built-in Fields ({builtIn.length})</h4>
        </div>
        <div className="divide-y divide-slate-50">
          {builtIn.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              siteId={siteId}
              onColorRules={() => setColorRulesField(field)}
            />
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-700">Custom Fields ({custom.length})</h4>
          {!showAddForm && (
            <Button variant="outline" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddForm(true)}>Add Field</Button>
          )}
        </div>
        {showAddForm && <AddFieldForm siteId={siteId} onDone={() => setShowAddForm(false)} />}
        {custom.length === 0 && !showAddForm && (
          <p className="text-sm text-slate-400 py-4 text-center">No custom fields yet</p>
        )}
        <div className="divide-y divide-slate-50">
          {custom.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              siteId={siteId}
              onColorRules={() => setColorRulesField(field)}
              onExpression={() => setExpressionField(field)}
            />
          ))}
        </div>
      </Card>

      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
        <p><strong>Tip:</strong> The <em>API Field Name</em> must exactly match the field name in the APVe API XML (e.g. <code className="bg-blue-100 px-1 rounded">gate</code>, <code className="bg-blue-100 px-1 rounded">line</code>, <code className="bg-blue-100 px-1 rounded">schedule</code>). Built-in fields cannot be renamed or deleted.</p>
        <p>For <strong>DateTime</strong> fields, use date-fns format tokens (e.g. <code className="bg-blue-100 px-1 rounded">MM/dd/yyyy HH:mm</code>, <code className="bg-blue-100 px-1 rounded">HH:mm</code>, <code className="bg-blue-100 px-1 rounded">hh:mm a</code>).</p>
      </div>
    </div>
  );
};

// ─── Audit Log Modal ──────────────────────────────────────────────────────────

const AuditLogModal: React.FC<{ reportId: string; reportName: string; onClose: () => void }> = ({
  reportId, reportName, onClose,
}) => {
  const { getReportAudit } = useReportsStore();
  const [entries, setEntries] = useState<ReportAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    getReportAudit(reportId)
      .then(setEntries)
      .catch(() => toast.error('Failed to load audit history'))
      .finally(() => setLoading(false));
  }, [reportId]);

  const actionColor = (action: string) => {
    const map: Record<string, string> = {
      created:     'bg-green-100 text-green-700',
      updated:     'bg-amber-100 text-amber-700',
      cloned:      'bg-purple-100 text-purple-700',
      deleted:     'bg-red-100 text-red-700',
      activated:   'bg-blue-100 text-blue-700',
      deactivated: 'bg-slate-100 text-slate-600',
    };
    return map[action] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">Audit History</h3>
            <p className="text-xs text-slate-400 mt-0.5">{reportName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-400">No audit history yet.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${actionColor(entry.action)}`}>
                      {entry.action}
                    </span>
                    <span className="text-xs font-medium text-slate-700">{entry.changedBy}</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {new Date(entry.changedAt).toLocaleString()}
                    </span>
                  </div>
                  {entry.summary && (
                    <p className="text-sm text-slate-600 mt-1.5">{entry.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Reports Panel ────────────────────────────────────────────────────────────

const ReportsPanel: React.FC<{ siteId: string }> = ({ siteId }) => {
  const navigate = useNavigate();
  const { session } = useSessionStore();
  const { reports, toggleReportActive, deleteReport, cloneReportToSites } = useReportsStore();
  const isAppAdmin = !!session?.isAppAdmin;

  const [auditReport, setAuditReport] = useState<SavedReport | null>(null);

  // Reports that belong to this specific site
  const siteReports = reports.filter((r) => r.siteId === siteId);

  // App admin: base template reports (no site owner) available to deploy
  const templateReports = isAppAdmin ? reports.filter((r) => !r.siteId && r.isBaseReport) : [];

  const chartIcon = (type: string) => {
    const icons: Record<string, string> = { table: '📋', bar: '📊', pie: '🥧', line: '📈' };
    return icons[type] ?? '📋';
  };

  const handleToggleActive = async (r: SavedReport) => {
    try {
      await toggleReportActive(r.id, !r.isActive);
      toast.success(r.isActive ? `"${r.name}" deactivated` : `"${r.name}" activated`);
    } catch {
      toast.error('Failed to update report status');
    }
  };

  const handleDelete = async (r: SavedReport) => {
    if (!confirm(`Delete "${r.name}"? This cannot be undone.`)) return;
    try {
      await deleteReport(r.id);
      toast.success('Report deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      {auditReport && (
        <AuditLogModal
          reportId={auditReport.id}
          reportName={auditReport.name}
          onClose={() => setAuditReport(null)}
        />
      )}

      {/* Built-in reports - hardcoded routes, always available */}
      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">
          Built-in Reports <span className="font-normal text-slate-400">(always available to all sites)</span>
        </h4>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Dashboard',           icon: '📊' },
            { label: 'Flight Operations',   icon: '✈️' },
            { label: 'Gate Utilization',    icon: '🚪' },
            { label: 'Delay Analysis',      icon: '📈' },
            { label: 'Airline Performance', icon: '🏅' },
            { label: 'OTP Scorecard',       icon: '🏆' },
            { label: 'Baggage Performance', icon: '🧳' },
            { label: 'Passenger Flow',      icon: '👥' },
            { label: 'Baggage Belt',        icon: '🛄' },
            { label: 'Taxi Time',           icon: '🛬' },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm">
              <span>{r.icon}</span>
              <span className="font-medium text-blue-700">{r.label}</span>
              <span className="text-blue-400 text-xs">built-in</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Site-specific custom reports */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-700">
            Custom Reports for This Site
            <span className="ml-2 text-xs font-normal text-slate-400">({siteReports.length})</span>
          </h4>
          <button
            onClick={() => navigate('/report-designer')}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> New Report
          </button>
        </div>

        {siteReports.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No custom reports for this site yet.</p>
        ) : (
          <div className="space-y-2">
            {siteReports.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 p-2.5 border rounded-lg ${r.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
              >
                <span className="text-base flex-shrink-0">{chartIcon(r.chartType)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-medium truncate ${r.isActive ? 'text-slate-800' : 'text-slate-500'}`}>
                      {r.name}
                    </p>
                    {!r.isActive && (
                      <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full flex-shrink-0">Inactive</span>
                    )}
                    {r.parentReportId && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full flex-shrink-0">Cloned</span>
                    )}
                  </div>
                  {r.description && <p className="text-xs text-slate-500 truncate">{r.description}</p>}
                  <p className="text-xs text-slate-400">{r.fields.length} fields · by {r.createdBy}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Active / Inactive toggle */}
                  <button
                    onClick={() => handleToggleActive(r)}
                    title={r.isActive ? 'Deactivate (hide from users)' : 'Activate (show to users)'}
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${r.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${r.isActive ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                  <button
                    onClick={() => navigate(`/report-designer?id=${r.id}`)}
                    title="Edit in Report Designer"
                    className="p-1 text-slate-400 hover:text-blue-600"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setAuditReport(r)}
                    title="View audit history"
                    className="p-1 text-slate-400 hover:text-amber-600"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    title="Delete report"
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Templates to deploy — app admin only */}
      {isAppAdmin && templateReports.length > 0 && (
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">Templates Available to Deploy</h4>
          <p className="text-xs text-slate-400 mb-3">
            Deploying creates an independent copy for this site — the site admin can customise it freely.
          </p>
          <div className="space-y-2">
            {templateReports.map((r) => {
              const alreadyDeployed = siteReports.some((sr) => sr.parentReportId === r.id);
              return (
                <div key={r.id} className="flex items-center gap-3 p-2.5 border border-slate-200 rounded-lg">
                  <span>{chartIcon(r.chartType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{r.name}</p>
                    {r.description && <p className="text-xs text-slate-500 truncate">{r.description}</p>}
                  </div>
                  {alreadyDeployed ? (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">Deployed</span>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          await cloneReportToSites(r.id, [siteId]);
                          toast.success(`"${r.name}" deployed to this site`);
                        } catch {
                          toast.error('Deploy failed');
                        }
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex-shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Deploy
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Site Config Inline Form ──────────────────────────────────────────────────

const SiteConfigForm: React.FC<{ site: Site }> = ({ site }) => {
  const { updateSite } = useSiteStore();
  const [form, setForm] = useState({
    name: site.name,
    iataCode: site.iataCode,
    siteId: site.siteId,
    baseUrl: site.baseUrl,
    description: site.description ?? '',
    adminUsers: site.adminUsers.join(', '),
    enabled: site.enabled,
    serviceApiKey: site.serviceApiKey ?? '',
    fetchTimeoutSeconds: site.fetchTimeoutSeconds ?? 60,
  });
  const [testUser, setTestUser] = useState('');
  const [testPass, setTestPass] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    if (!form.name.trim() || !form.baseUrl.trim()) { toast.error('Name and Base URL are required'); return; }
    const url = form.baseUrl.trim().endsWith('/') ? form.baseUrl.trim() : `${form.baseUrl.trim()}/`;
    updateSite(site.id, {
      name: form.name.trim(),
      iataCode: form.iataCode.trim().toUpperCase(),
      siteId: form.siteId.trim() || '1',
      baseUrl: url,
      description: form.description.trim() || undefined,
      adminUsers: form.adminUsers.split(',').map((u) => u.trim()).filter(Boolean),
      enabled: form.enabled,
      serviceApiKey: form.serviceApiKey.trim() || undefined,
      fetchTimeoutSeconds: form.fetchTimeoutSeconds,
    });
    toast.success('Site configuration saved');
  };

  const handleTest = async () => {
    const url = form.baseUrl.trim().endsWith('/') ? form.baseUrl.trim() : `${form.baseUrl.trim()}/`;
    setTesting(true);
    setTestResult(null);
    try {
      if (form.serviceApiKey.trim()) {
        const res = await axios.post(apiUrl(`${url}connectpublicapi/api/ConnectPublicApiAuthentication`), JSON.stringify(form.serviceApiKey.trim()), { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        const token = (res.data as { publicAccessToken?: string })?.publicAccessToken;
        setTestResult({ ok: !!token, msg: token ? '✓ Service API key valid' : 'Unexpected response' });
      } else {
        if (!testUser || !testPass) { toast.error('Enter credentials to test'); setTesting(false); return; }
        const res = await axios.post(apiUrl(`${url}authApi/v1/api/Authentication/login`), { userName: testUser.trim(), site: form.iataCode.trim().toUpperCase(), password: testPass }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        setTestResult({ ok: true, msg: `✓ Login successful (status ${res.status})` });
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      const status = axErr?.response?.status;
      const data = axErr?.response?.data;
      const serverMsg = typeof data === 'string' ? data : data ? JSON.stringify(data) : '';
      setTestResult({ ok: false, msg: status ? `HTTP ${status}${serverMsg ? ' — ' + serverMsg : ''}` : `Network error: ${axErr?.message}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-4">Site Settings</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Airport Name</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">IATA Code</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.iataCode} onChange={(e) => setForm((f) => ({ ...f, iataCode: e.target.value.toUpperCase() }))} maxLength={5} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Site ID</label>
              <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.siteId} onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Base URL</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Usernames <span className="font-normal text-slate-500">(comma-separated)</span></label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.adminUsers} onChange={(e) => setForm((f) => ({ ...f, adminUsers: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Service API Key <span className="font-normal text-slate-500">(optional)</span></label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.serviceApiKey} onChange={(e) => setForm((f) => ({ ...f, serviceApiKey: e.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Data Fetch Timeout <span className="font-normal text-slate-500">(seconds — increase for large sites)</span>
            </label>
            <input
              type="number" min={10} max={600} step={10}
              className="w-32 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.fetchTimeoutSeconds}
              onChange={(e) => setForm((f) => ({ ...f, fetchTimeoutSeconds: Math.max(10, parseInt(e.target.value) || 60) }))}
            />
            <p className="text-xs text-slate-400 mt-1">Default 60s. Use 120–300s for sites with many flights.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}>
              {form.enabled ? <ToggleRight className="w-6 h-6 text-green-600" /> : <ToggleLeft className="w-6 h-6 text-slate-400" />}
            </button>
            <span className="text-sm text-slate-700">{form.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <Button variant="primary" onClick={handleSave}>Save Configuration</Button>
        </div>
      </Card>

      <Card>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Test Connection</h4>
        {!form.serviceApiKey.trim() && (
          <div className="flex gap-2 mb-3">
            <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Username" value={testUser} onChange={(e) => setTestUser(e.target.value)} />
            <input className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" type="password" placeholder="Password" value={testPass} onChange={(e) => setTestPass(e.target.value)} />
          </div>
        )}
        <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
          {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          {form.serviceApiKey.trim() ? 'Test Service Key' : 'Test Login'}
        </button>
        {testResult && (
          <div className={`mt-2 flex items-start gap-2 p-2.5 rounded-lg text-xs ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.ok ? <Wifi className="w-3.5 h-3.5 mt-0.5" /> : <WifiOff className="w-3.5 h-3.5 mt-0.5" />}
            <span>{testResult.msg}</span>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Site Config Panel ────────────────────────────────────────────────────────

type SiteTab = 'config' | 'fields' | 'reports';

const SiteConfigPanel: React.FC<{ siteId: string }> = ({ siteId }) => {
  const { sites } = useSiteStore();
  const site = sites.find((s) => s.id === siteId);
  const [tab, setTab] = useState<SiteTab>('config');

  if (!site) return <div className="text-slate-400 p-8 text-center">Site not found</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl font-bold font-mono bg-blue-600 text-white px-3 py-1 rounded-xl">{site.iataCode}</span>
        <div>
          <h2 className="text-xl font-bold text-slate-800">{site.name}</h2>
          <p className="text-sm text-slate-500">{site.baseUrl}</p>
        </div>
        <div className="ml-auto">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${site.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {site.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([['config', 'Configuration', Settings2], ['fields', 'Field Definitions', FileText], ['reports', 'Reports', Globe]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as SiteTab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' && <SiteConfigForm site={site} />}
      {tab === 'fields' && <FieldsPanel siteId={siteId} />}
      {tab === 'reports' && <ReportsPanel siteId={siteId} />}
    </div>
  );
};

// ─── Global Config Panel ──────────────────────────────────────────────────────

const GlobalConfigPanel: React.FC = () => {
  const { appAdmins, addAppAdmin, updateAppAdmin, deleteAppAdmin, sites } = useSiteStore();
  const { reports } = useReportsStore();
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const startEdit = (admin: AppAdmin) => {
    setEditingAdminId(admin.id);
    setEditUsername(admin.username);
    setEditPassword(''); // always blank — user must type a new password to change it
  };

  const commitEdit = () => {
    if (!editUsername.trim()) { toast.error('Username is required'); return; }
    if (editingAdminId) {
      const updates: { username: string; password?: string } = { username: editUsername.trim() };
      if (editPassword.trim()) updates.password = editPassword.trim();
      updateAppAdmin(editingAdminId, updates);
    }
    setEditingAdminId(null);
    toast.success('Admin updated');
  };

  const handleAdd = () => {
    if (!newUsername.trim() || !newPassword.trim()) { toast.error('Username and password required'); return; }
    addAppAdmin(newUsername.trim(), newPassword.trim());
    setNewUsername(''); setNewPassword(''); setShowAddAdmin(false);
    toast.success('Admin added');
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-amber-600" />
          <h3 className="text-base font-semibold text-slate-800">App Admins</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {appAdmins.map((admin) => (
            <div key={admin.id} className="py-3 flex items-center gap-3">
              {editingAdminId === admin.id ? (
                <>
                  <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1" placeholder="Username" />
                  <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1" placeholder="New password (leave blank to keep)" type="password" />
                  <button onClick={commitEdit} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingAdminId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-slate-800 flex-1">{admin.username}</span>
                  <span className="text-sm text-slate-400 font-mono flex-1">••••••••</span>
                  <button onClick={() => startEdit(admin)} className="text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                  <button
                    onClick={() => { if (appAdmins.length <= 1) { toast.error('Cannot delete the last admin'); return; } deleteAppAdmin(admin.id); toast.success('Admin removed'); }}
                    className={`text-slate-400 hover:text-red-600 ${appAdmins.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {showAddAdmin ? (
          <div className="mt-3 flex items-center gap-2">
            <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1" placeholder="New username" />
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1" placeholder="Password" type="password" />
            <button onClick={handleAdd} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
            <button onClick={() => setShowAddAdmin(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button onClick={() => setShowAddAdmin(true)} className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
            <Plus className="w-4 h-4" /> Add Admin
          </button>
        )}
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800 mb-4">Sites Overview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="pb-2 font-semibold text-slate-600">IATA</th>
                <th className="pb-2 font-semibold text-slate-600">Name</th>
                <th className="pb-2 font-semibold text-slate-600">Status</th>
                <th className="pb-2 font-semibold text-slate-600">Reports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sites.map((site) => {
                const siteReports = reports.filter((r) => (r.assignedSiteIds ?? []).includes(site.id) || r.isBaseReport);
                return (
                  <tr key={site.id}>
                    <td className="py-2"><span className="text-xs font-bold font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{site.iataCode}</span></td>
                    <td className="py-2 text-slate-700">{site.name}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${site.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{site.enabled ? 'Active' : 'Off'}</span></td>
                    <td className="py-2 text-slate-500">{siteReports.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ─── App Admin Layout ─────────────────────────────────────────────────────────

const AppAdminLayout: React.FC = () => {
  const { sites, addSite, updateSite, deleteSite } = useSiteStore();
  const { session, setAdminActiveSite } = useSessionStore();
  const activeSiteId = session?.adminActiveSiteId ?? null;
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | undefined>(undefined);

  const handleSaveSite = (data: Omit<Site, 'id'>) => {
    if (editingSite) {
      updateSite(editingSite.id, data);
      toast.success('Site updated');
    } else {
      addSite({ ...data, id: generateId() });
      toast.success('Site added');
    }
    setShowSiteModal(false);
    setEditingSite(undefined);
  };

  return (
    <div className="flex gap-0 -m-6 min-h-[calc(100vh-64px)]">
      {showSiteModal && (
        <SiteModal
          site={editingSite}
          onSave={handleSaveSite}
          onClose={() => { setShowSiteModal(false); setEditingSite(undefined); }}
        />
      )}

      {/* Sidebar */}
      <aside className="w-56 bg-slate-50 border-r border-slate-200 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">App Admin</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Global Config */}
          <button
            onClick={() => setAdminActiveSite(null)}
            className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors border-b border-slate-100 ${activeSiteId === null ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            Global Config
          </button>

          {/* Sites */}
          {sites.map((site) => (
            <div key={site.id} className="group relative">
              <button
                onClick={() => setAdminActiveSite(site.id)}
                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors ${activeSiteId === site.id ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <span className="text-xs font-bold font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0">{site.iataCode}</span>
                <span className="truncate">{site.name}</span>
                {!site.enabled && <span className="ml-auto text-xs text-slate-400 flex-shrink-0">off</span>}
              </button>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-white shadow rounded-lg px-1 py-0.5">
                <button onClick={(e) => { e.stopPropagation(); setEditingSite(site); setShowSiteModal(true); }} className="text-slate-400 hover:text-blue-600 p-1"><Edit2 className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${site.iataCode}?`)) { deleteSite(site.id); if (activeSiteId === site.id) setAdminActiveSite(null); toast.success('Site deleted'); } }} className="text-slate-400 hover:text-red-600 p-1"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => { setEditingSite(undefined); setShowSiteModal(true); }}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Site
          </button>
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSiteId === null ? (
          <GlobalConfigPanel />
        ) : (
          <SiteConfigPanel key={activeSiteId} siteId={activeSiteId} />
        )}
      </div>
    </div>
  );
};

// ─── Site Admin Layout ────────────────────────────────────────────────────────

type SiteAdminTab = 'fields' | 'reports' | 'config';

const SiteAdminLayout: React.FC = () => {
  const { session } = useSessionStore();
  const { sites } = useSiteStore();
  const [tab, setTab] = useState<SiteAdminTab>('fields');
  const siteId = session?.site?.id ?? '';
  const site = sites.find((s) => s.id === siteId);

  if (!site) return (
    <Card>
      <div className="text-center py-12 text-slate-500">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p>Site not found in configuration</p>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl font-bold font-mono bg-blue-600 text-white px-3 py-1 rounded-xl">{site.iataCode}</span>
        <h2 className="text-xl font-bold text-slate-800">Site Administration</h2>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {([['fields', 'Field Definitions', FileText], ['reports', 'Reports', Globe], ['config', 'Configuration', Settings2]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key as SiteAdminTab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-800'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'fields' && <FieldsPanel siteId={siteId} />}
      {tab === 'reports' && <ReportsPanel siteId={siteId} />}
      {tab === 'config' && (
        <Card>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Site Information</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-3"><dt className="text-slate-500 w-32">Name</dt><dd className="font-medium text-slate-800">{site.name}</dd></div>
            <div className="flex gap-3"><dt className="text-slate-500 w-32">IATA Code</dt><dd className="font-mono font-bold text-slate-800">{site.iataCode}</dd></div>
            <div className="flex gap-3"><dt className="text-slate-500 w-32">Base URL</dt><dd className="text-slate-800 break-all">{site.baseUrl}</dd></div>
            <div className="flex gap-3"><dt className="text-slate-500 w-32">Status</dt><dd><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${site.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{site.enabled ? 'Enabled' : 'Disabled'}</span></dd></div>
          </dl>
        </Card>
      )}
    </div>
  );
};

// ─── Admin Page ───────────────────────────────────────────────────────────────

export const AdminPage: React.FC = () => {
  const { session } = useSessionStore();

  if (!session) return null;

  if (session.isAppAdmin) return <AppAdminLayout />;

  if (session.isSiteAdmin || session.isGlobalAdmin) return <SiteAdminLayout />;

  return (
    <Card>
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-700">Access Denied</h3>
        <p className="text-slate-500 text-sm mt-1">You do not have admin access for this site.</p>
      </div>
    </Card>
  );
};
