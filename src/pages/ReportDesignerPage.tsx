import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Save, Download, Trash2, Plus, BarChart2, PieChart as PieIcon,
  LineChart as LineIcon, Table, ChevronUp, ChevronDown, Calendar,
  Palette, Code2, X, Check, RefreshCw,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useFlights } from '../hooks/useFlights';
import {
  SavedReport, CHART_COLORS, Flight, FieldDefinition,
  FieldExpression, FieldExpressionType, ColorRule, ColorRuleOperator,
  COLOR_RULE_OPERATORS, PRESET_DATE_FORMATS, ConcatPart, SortField,
} from '../types';
import { useSessionStore } from '../store/useSessionStore';
import { useSiteStore } from '../store/useSiteStore';
import { useReportsStore } from '../store/useReportsStore';
import { getFieldDisplayValue, getCellStyle, PRESET_COLORS } from '../utils/fieldEngine';
import { format, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

type ChartType = 'table' | 'bar' | 'pie' | 'line';
type GroupBy = 'linecode' | 'status' | 'gate' | 'city' | 'adi' | 'scheduleDate';
type Aggregation = 'count' | 'avgDelay';

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: 'table',  label: 'Table',      icon: <Table    className="w-4 h-4" /> },
  { value: 'bar',    label: 'Bar Chart',  icon: <BarChart2 className="w-4 h-4" /> },
  { value: 'pie',    label: 'Pie Chart',  icon: <PieIcon  className="w-4 h-4" /> },
  { value: 'line',   label: 'Line Chart', icon: <LineIcon  className="w-4 h-4" /> },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'linecode',    label: 'Airline' },
  { value: 'status',      label: 'Status' },
  { value: 'gate',        label: 'Gate' },
  { value: 'city',        label: 'City' },
  { value: 'adi',         label: 'ADI (Arr/Dep)' },
  { value: 'scheduleDate', label: 'Date' },
];

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Expression Builder Modal ─────────────────────────────────────────────────

interface ExprBuilderProps {
  fieldDefs: FieldDefinition[];
  initial?: FieldExpression;
  onSave: (expr: FieldExpression) => void;
  onClose: () => void;
}

const ExprBuilderModal: React.FC<ExprBuilderProps> = ({ fieldDefs, initial, onSave, onClose }) => {
  const [type, setType] = useState<FieldExpressionType>(initial?.type ?? 'concat');

  // Concat: ordered parts (field refs + static text)
  const initParts = (): ConcatPart[] => {
    if (initial?.concatParts && initial.concatParts.length > 0) {
      // Backfill name for any existing parts that are missing it
      return initial.concatParts.map(p => {
        if (p.kind === 'field' && !p.name) {
          const def = fieldDefs.find(f => f.id === p.id);
          return { ...p, name: def?.name };
        }
        return p;
      });
    }
    // Migrate legacy format
    if (initial?.type === 'concat' && initial.fields && initial.fields.length > 0) {
      const sep = initial.separator ?? ' ';
      const parts: ConcatPart[] = [];
      initial.fields.forEach((id, i) => {
        const def = fieldDefs.find(f => f.id === id);
        parts.push({ kind: 'field', id, name: def?.name });
        if (i < initial.fields!.length - 1 && sep) parts.push({ kind: 'static', value: sep });
      });
      return parts;
    }
    const first = fieldDefs.filter(f => !f.expression)[0];
    return [{ kind: 'field', id: first?.id ?? '', name: first?.name }];
  };
  const [parts, setParts] = useState<ConcatPart[]>(initParts);

  const [fields, setFields] = useState<string[]>(initial?.fields ?? []);
  const [staticValue, setStaticValue] = useState(initial?.staticValue ?? '');
  const [mapRaw, setMapRaw] = useState(() =>
    initial?.map ? Object.entries(initial.map).map(([k, v]) => `${k}=${v}`).join('\n') : ''
  );

  const toggleField = (id: string) =>
    setFields(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const addPart = (kind: 'field' | 'static') => {
    if (kind === 'field') {
      const first = fieldDefs.filter(f => !f.expression)[0];
      setParts(prev => [...prev, { kind: 'field', id: first?.id ?? '', name: first?.name }]);
    } else {
      setParts(prev => [...prev, { kind: 'static', value: '' }]);
    }
  };
  const removePart = (i: number) => setParts(prev => prev.filter((_, idx) => idx !== i));
  const movePart = (i: number, dir: -1 | 1) => setParts(prev => {
    const next = [...prev];
    const swap = i + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[i], next[swap]] = [next[swap], next[i]];
    return next;
  });
  const updatePart = (i: number, patch: Partial<ConcatPart>) =>
    setParts(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } as ConcatPart : p));

  const handleSave = () => {
    const expr: FieldExpression = { type };
    if (type === 'concat')   { expr.concatParts = parts; }
    if (type === 'timeDiff') { expr.fields = fields.slice(0, 2); }
    if (type === 'static')   { expr.staticValue = staticValue; }
    if (type === 'lookup') {
      expr.fields = fields.slice(0, 1);
      const map: Record<string, string> = {};
      mapRaw.split('\n').forEach(line => {
        const [k, ...rest] = line.split('=');
        if (k && rest.length) map[k.trim()] = rest.join('=').trim();
      });
      expr.map = map;
    }
    onSave(expr);
  };

  const sourceDefs = fieldDefs.filter(f => !f.expression);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-slate-800">Expression Builder</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-4 gap-2">
            {(['concat','timeDiff','lookup','static'] as FieldExpressionType[]).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`py-2 rounded-lg text-xs font-semibold border-2 transition-all ${type === t ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {t === 'timeDiff' ? 'Time Diff' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Type descriptions */}
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            {type === 'concat'   && 'Mix fields and static text in any order. e.g. "Gate " + gate → "Gate A1"'}
            {type === 'timeDiff' && 'Calculates minutes between two datetime fields. e.g. actual − scheduled'}
            {type === 'lookup'   && 'Maps raw values to display values. e.g. "A" → "Arrival"'}
            {type === 'static'   && 'Always shows the same fixed text value.'}
          </p>

          {/* ── Concat: parts builder ── */}
          {type === 'concat' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">Parts (in order)</label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {parts.map((part, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1.5">
                    {/* Move up/down */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => movePart(i, -1)} disabled={i === 0}
                        className="text-slate-300 hover:text-slate-500 disabled:opacity-20"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={() => movePart(i, 1)} disabled={i === parts.length - 1}
                        className="text-slate-300 hover:text-slate-500 disabled:opacity-20"><ChevronDown className="w-3 h-3" /></button>
                    </div>

                    {/* Kind toggle */}
                    <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs shrink-0">
                      <button onClick={() => updatePart(i, { kind: 'field', id: sourceDefs[0]?.id ?? '', name: sourceDefs[0]?.name } as ConcatPart)}
                        className={`px-2 py-1 font-medium transition-colors ${part.kind === 'field' ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        Field
                      </button>
                      <button onClick={() => updatePart(i, { kind: 'static', value: '' } as ConcatPart)}
                        className={`px-2 py-1 font-medium transition-colors ${part.kind === 'static' ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        Text
                      </button>
                    </div>

                    {/* Value editor */}
                    {part.kind === 'field' ? (
                      <select value={part.id} onChange={e => { const def = sourceDefs.find(f => f.id === e.target.value); updatePart(i, { kind: 'field', id: e.target.value, name: def?.name } as ConcatPart); }}
                        className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-xs bg-white">
                        {sourceDefs.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    ) : (
                      <input value={part.value} onChange={e => updatePart(i, { kind: 'static', value: e.target.value } as ConcatPart)}
                        className="flex-1 border border-slate-200 rounded-md px-2 py-1 text-xs"
                        placeholder='e.g. "Gate " or " - "' />
                    )}

                    <button onClick={() => removePart(i)} className="text-slate-300 hover:text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>

              {/* Add buttons */}
              <div className="flex gap-2">
                <button onClick={() => addPart('field')}
                  className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Field
                </button>
                <button onClick={() => addPart('static')}
                  className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Text
                </button>
              </div>

              {/* Live preview */}
              <div className="bg-purple-50 rounded-lg px-3 py-2">
                <p className="text-xs text-purple-600 font-medium mb-0.5">Preview (with sample values)</p>
                <p className="text-sm text-purple-900 font-mono">
                  {parts.map(p => p.kind === 'field'
                    ? `[${sourceDefs.find(f => f.id === p.id)?.label ?? p.id}]`
                    : p.value
                  ).join('')}
                </p>
              </div>
            </div>
          )}

          {/* Field selectors for timeDiff / lookup */}
          {(type === 'timeDiff' || type === 'lookup') && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                {type === 'timeDiff' ? 'Select 2 datetime fields (start, end)' : 'Select source field'}
              </label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                {sourceDefs.map(f => (
                  <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-slate-50">
                    <input type="checkbox" checked={fields.includes(f.id)} onChange={() => toggleField(f.id)}
                      className="rounded border-slate-300 text-purple-600" />
                    <span className="truncate">{f.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Selected order: {fields.map(id => fieldDefs.find(f=>f.id===id)?.label ?? id).join(' → ')}</p>
            </div>
          )}

          {type === 'static' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fixed value</label>
              <input value={staticValue} onChange={e => setStaticValue(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                placeholder="e.g. N/A" />
            </div>
          )}

          {type === 'lookup' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mapping (one per line: rawValue=Display)</label>
              <textarea value={mapRaw} onChange={e => setMapRaw(e.target.value)} rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder={"A=Arrival\nD=Departure"} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" icon={<Check className="w-4 h-4" />} onClick={handleSave}>Apply Expression</Button>
        </div>
      </div>
    </div>
  );
};

// ─── Color Rules Modal ────────────────────────────────────────────────────────

interface ColorRulesModalProps {
  rules: ColorRule[];
  onSave: (rules: ColorRule[]) => void;
  onClose: () => void;
}

const ColorRulesModal: React.FC<ColorRulesModalProps> = ({ rules: initialRules, onSave, onClose }) => {
  const [rules, setRules] = useState<ColorRule[]>(JSON.parse(JSON.stringify(initialRules)));

  const addRule = () => setRules(prev => [...prev, { id: genId(), operator: 'eq', value: '', textColor: '#111827', bgColor: 'transparent' }]);
  const updateRule = (id: string, updates: Partial<ColorRule>) =>
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  const deleteRule = (id: string) => setRules(prev => prev.filter(r => r.id !== id));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800">Color Rules</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {rules.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No rules yet. Add one below.</p>}
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 p-3 border border-slate-200 rounded-xl">
              <select value={rule.operator} onChange={e => updateRule(rule.id, { operator: e.target.value as ColorRuleOperator })}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs">
                {COLOR_RULE_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              <input value={rule.value} onChange={e => updateRule(rule.id, { value: e.target.value })}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs flex-1" placeholder="value" />
              <div className="flex items-center gap-1">
                <label className="text-xs text-slate-500">Text</label>
                <input type="color" value={rule.textColor ?? '#111827'} onChange={e => updateRule(rule.id, { textColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-slate-200" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-slate-500">BG</label>
                {rule.bgColor !== 'transparent' ? (
                  <input type="color" value={rule.bgColor ?? '#ffffff'} onChange={e => updateRule(rule.id, { bgColor: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-slate-200" />
                ) : (
                  <div className="w-7 h-7 rounded border border-slate-200 overflow-hidden cursor-pointer flex-shrink-0"
                    style={{ background: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%) 0 0 / 8px 8px' }}
                    onClick={() => updateRule(rule.id, { bgColor: '#ffffff' })}
                    title="Click to pick a color"
                  />
                )}
                <button
                  onClick={() => updateRule(rule.id, { bgColor: rule.bgColor === 'transparent' ? '#ffffff' : 'transparent' })}
                  title="Toggle transparent background"
                  className={`text-xs px-1.5 py-0.5 rounded border font-mono leading-none ${rule.bgColor === 'transparent' ? 'bg-blue-100 border-blue-400 text-blue-700 font-bold' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                >
                  T
                </button>
              </div>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={!!rule.bold} onChange={e => updateRule(rule.id, { bold: e.target.checked })} />
                Bold
              </label>
              {/* Preview */}
              <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0"
                style={{ color: rule.textColor, backgroundColor: rule.bgColor, fontWeight: rule.bold ? 'bold' : 'normal' }}>
                {rule.value || 'preview'}
              </span>
              <button onClick={() => deleteRule(rule.id)} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {/* Presets */}
          <div className="flex flex-wrap gap-2 pt-2">
            {PRESET_COLORS.map(p => (
              <button key={p.label} onClick={() => {
                if (rules.length > 0) {
                  const last = rules[rules.length - 1];
                  updateRule(last.id, { textColor: p.textColor, bgColor: p.bgColor });
                }
              }} className="text-xs px-2 py-1 rounded-full font-medium border border-slate-200"
                style={{ color: p.textColor, backgroundColor: p.bgColor === 'transparent' ? undefined : p.bgColor }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-5 border-t border-slate-100">
          <button onClick={addRule} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
            <Plus className="w-4 h-4" /> Add Rule
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" icon={<Check className="w-4 h-4" />} onClick={() => { onSave(rules); onClose(); }}>Save Rules</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Add Column Modal ──────────────────────────────────────────────────────────

interface AddColumnModalProps {
  fieldDefs: FieldDefinition[];
  onAdd: (id: string, label: string, expression?: FieldExpression) => void;
  onClose: () => void;
}

const AddColumnModal: React.FC<AddColumnModalProps> = ({ fieldDefs, onAdd, onClose }) => {
  const [label, setLabel] = useState('');
  const [source, setSource] = useState<'field' | 'expression'>('field');
  const [selectedFieldId, setSelectedFieldId] = useState(fieldDefs[0]?.id ?? '');
  const [expression, setExpression] = useState<FieldExpression | undefined>();
  const [showExprBuilder, setShowExprBuilder] = useState(false);

  const handleAdd = () => {
    if (!label.trim()) return;
    if (source === 'field') {
      onAdd(selectedFieldId, label.trim(), undefined);
    } else {
      if (!expression) return;
      onAdd(`custom_${genId()}`, label.trim(), expression);
    }
  };

  const exprSummary = !expression ? null
    : expression.type === 'concat'
      ? (expression.concatParts ?? []).map(p => p.kind === 'field' ? `[${p.id}]` : `"${p.value}"`).join(' + ')
      : expression.type === 'timeDiff'
      ? `timeDiff(${expression.fields?.join(', ')})`
      : expression.type === 'static'
      ? `"${expression.staticValue}"`
      : expression.type;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Add Column</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Column Header</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. Full Flight Info"
                className="w-full mt-1.5 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && label.trim() && (source === 'field' || expression)) handleAdd(); }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Data Source</label>
              <div className="flex gap-2 mt-1.5">
                {([['field', 'Single Field'], ['expression', 'Expression (Concat, etc.)']] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setSource(val)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${source === val ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {source === 'field' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Field</label>
                <select
                  value={selectedFieldId}
                  onChange={e => {
                    const f = fieldDefs.find(f => f.id === e.target.value);
                    setSelectedFieldId(e.target.value);
                    if (!label && f) setLabel(f.label);
                  }}
                  className="w-full mt-1.5 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {fieldDefs.map(f => (
                    <option key={f.id} value={f.id}>{f.label} ({f.id})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">The column header can be different from the field's default name.</p>
              </div>
            )}
            {source === 'expression' && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Expression</label>
                {expression ? (
                  <div className="mt-1.5 flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <span className="text-xs text-purple-700 flex-1 font-mono truncate">{exprSummary}</span>
                    <button onClick={() => setShowExprBuilder(true)} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex-shrink-0">Edit</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowExprBuilder(true)}
                    className="mt-1.5 w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-purple-400 hover:text-purple-600 transition-colors"
                  >
                    + Configure Expression
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              disabled={!label.trim() || (source === 'expression' && !expression)}
              onClick={handleAdd}
            >
              Add Column
            </Button>
          </div>
        </div>
      </div>
      {showExprBuilder && (
        <ExprBuilderModal
          fieldDefs={fieldDefs}
          initial={expression}
          onSave={expr => { setExpression(expr); setShowExprBuilder(false); }}
          onClose={() => setShowExprBuilder(false)}
        />
      )}
    </>
  );
};

// ─── Selected Field Row ───────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldDefinition;
  dateFormatOverride?: string;
  customLabel?: string;
  onLabelChange: (label: string) => void;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDateFormatChange: (fmt: string) => void;
  onExpressionSave: (expr: FieldExpression) => void;
  onColorRulesSave: (rules: ColorRule[]) => void;
  allFields: FieldDefinition[];
}

const FieldRow: React.FC<FieldRowProps> = ({
  field, dateFormatOverride, customLabel, onLabelChange, index, total,
  onMoveUp, onMoveDown, onRemove,
  onDateFormatChange, onExpressionSave, onColorRulesSave, allFields,
}) => {
  const [showDateFormats, setShowDateFormats] = useState(false);
  const [showExpr, setShowExpr] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const colorCount = field.colorRules?.length ?? 0;
  const hasExpr = !!field.expression;

  return (
    <>
      {showExpr && (
        <ExprBuilderModal
          fieldDefs={allFields}
          initial={field.expression}
          onSave={(expr) => { onExpressionSave(expr); setShowExpr(false); }}
          onClose={() => setShowExpr(false)}
        />
      )}
      {showColors && (
        <ColorRulesModal
          rules={field.colorRules ?? []}
          onSave={(rules) => onColorRulesSave(rules)}
          onClose={() => setShowColors(false)}
        />
      )}
      <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg group hover:border-blue-300 transition-colors">
        {/* Order buttons */}
        <div className="flex flex-col gap-0.5">
          <button onClick={onMoveUp} disabled={index === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 p-0.5">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-20 p-0.5">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <input
            value={customLabel ?? field.label}
            onChange={e => onLabelChange(e.target.value)}
            className="text-sm font-medium text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full"
            title="Click to rename column header"
          />
          <div className="flex items-center gap-1">
            {hasExpr
              ? <span className="text-xs text-purple-600">[{field.expression?.type}]</span>
              : <span className="text-xs text-slate-400 font-mono">{field.name}</span>
            }
          </div>
        </div>

        {/* Type badge */}
        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">{field.type}</span>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {field.type === 'datetime' && (
            <div className="relative">
              <button onClick={() => setShowDateFormats(!showDateFormats)}
                title="Date format" className="p-1 text-slate-400 hover:text-blue-600">
                <Calendar className="w-3.5 h-3.5" />
              </button>
              {showDateFormats && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 w-52 py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date Format</div>
                  {PRESET_DATE_FORMATS.map(fmt => (
                    <button key={fmt} onClick={() => { onDateFormatChange(fmt); setShowDateFormats(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 ${(dateFormatOverride ?? field.dateFormat) === fmt ? 'text-blue-600 font-semibold' : 'text-slate-700'}`}>
                      <span className="font-mono">{fmt}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 mt-1 px-3 py-1.5">
                    <input
                      value={dateFormatOverride ?? field.dateFormat ?? ''}
                      onChange={e => onDateFormatChange(e.target.value)}
                      placeholder="Custom format..."
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 font-mono"
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setShowExpr(true)} title="Expression"
            className={`p-1 ${hasExpr ? 'text-purple-600' : 'text-slate-400 hover:text-purple-600'}`}>
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowColors(true)} title="Color rules"
            className={`p-1 ${colorCount > 0 ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
            <Palette className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const ReportDesignerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reportId = searchParams.get('id');

  const { session } = useSessionStore();
  const { getSiteFieldDefinitions, sites } = useSiteStore();
  const { reports, addReport, updateReport, deleteReport, cloneReportToSites } = useReportsStore();

  // Determine active siteId for field definitions
  const activeSiteId: string | null = session?.isAppAdmin
    ? (session.adminActiveSiteId ?? null)
    : (session?.site?.id ?? null);

  const fieldDefs = useMemo(
    () => getSiteFieldDefinitions(activeSiteId ?? '').filter(f => f.enabled),
    [activeSiteId, getSiteFieldDefinitions]
  );

  // Report state
  const [reportName, setReportName] = useState('My Custom Report');
  const [description, setDescription] = useState('');
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>(['linecode', 'number', 'status', 'delayMinutes', 'gate']);
  // Per-field overrides stored locally to this report
  const [fieldDateFormats, setFieldDateFormats] = useState<Record<string, string>>({});
  // Per-field expression overrides (report-specific computed columns, override site defaults)
  const [fieldExpressions, setFieldExpressions] = useState<Record<string, FieldExpression>>({});
  // Per-field color rule overrides
  const [fieldColorRules, setFieldColorRules] = useState<Record<string, ColorRule[]>>({});
  const [chartType, setChartType] = useState<ChartType>('table');
  const [groupBy, setGroupBy] = useState<GroupBy>('linecode');
  const [aggregation, setAggregation] = useState<Aggregation>('count');
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>([]);
  const [isBaseReport, setIsBaseReport] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [deployingSiteIds, setDeployingSiteIds] = useState<string[]>([]);
  const [visibleFilters, setVisibleFilters] = useState<string[]>(['adi', 'airlines', 'status']);
  const [sortConfig, setSortConfig] = useState<SortField[]>([]);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [filterDescription, setFilterDescription] = useState('');
  const [defaultFilterValues, setDefaultFilterValues] = useState<{ adi?: 'A' | 'D' | 'both'; airlines?: string[]; statuses?: string[]; extras?: Record<string, string[]> }>({});
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);

  const { flights, loading, fetchFlights } = useFlights();

  // Load existing report if editing
  useEffect(() => {
    fetchFlights({ startDate: new Date(), endDate: addDays(new Date(), 1) });
    if (reportId) {
      const r = reports.find(rep => rep.id === reportId);
      if (r) {
        setReportName(r.name);
        setDescription(r.description ?? '');
        setSelectedFieldIds(r.fields);
        setFieldDateFormats(r.fieldDateFormats ?? {});
        setFieldExpressions(r.fieldExpressions ?? {});
        setChartType(r.chartType);
        setGroupBy(r.groupBy as GroupBy);
        setAggregation(r.aggregation);
        setAssignedSiteIds(r.assignedSiteIds ?? []);
        setIsBaseReport(r.isBaseReport);
        setIsActive(r.isActive ?? true);
        setVisibleFilters(r.visibleFilters ?? ['adi', 'airlines', 'status']);
        setSortConfig(r.sortConfig ?? []);
        setColumnLabels(r.columnLabels ?? {});
        setFilterDescription(r.filterDescription ?? '');
        setDefaultFilterValues(r.defaultFilterValues ?? {});
        setFieldColorRules(r.fieldColorRules ?? {});
      }
    }
  }, [reportId]);

  // ── Effective field definitions for selected fields ──────────────────────────
  const selectedFields: FieldDefinition[] = useMemo(() => {
    return selectedFieldIds.map(id => {
      const base = fieldDefs.find(f => f.id === id) ?? { id, name: id, label: id, type: 'string' as const, enabled: true, isBuiltIn: false };
      return {
        ...base,
        label: columnLabels[id] ?? base.label,
        dateFormat: fieldDateFormats[id] ?? base.dateFormat,
        expression: fieldExpressions[id] ?? base.expression,
        colorRules: fieldColorRules[id] ?? base.colorRules,
      };
    });
  }, [selectedFieldIds, fieldDefs, fieldDateFormats, fieldExpressions, fieldColorRules, columnLabels]);

  const toggleField = (id: string) => {
    setSelectedFieldIds(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setSelectedFieldIds(prev => {
      const arr = [...prev];
      const [removed] = arr.splice(index, 1);
      arr.splice(index + dir, 0, removed);
      return arr;
    });
  };

  const handleAddColumn = (id: string, label: string, expression?: FieldExpression) => {
    const isNew = !selectedFieldIds.includes(id);
    setSelectedFieldIds(prev => isNew ? [...prev, id] : prev);
    setColumnLabels(prev => ({ ...prev, [id]: label }));
    if (expression) setFieldExpressions(prev => ({ ...prev, [id]: expression }));
    toast.success(isNew ? 'Column added' : 'Column label updated');
    setShowAddColumnModal(false);
  };

  // ── Table preview ────────────────────────────────────────────────────────────
  const tableData = useMemo(() => flights.slice(0, 100), [flights]);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    flights.forEach(f => {
      const key = String(f[groupBy as keyof Flight] || 'Unknown');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f.delayMinutes);
    });
    return Object.entries(grouped).map(([name, delays]) => ({
      name,
      value: aggregation === 'count' ? delays.length
        : delays.length > 0 ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0,
    })).sort((a, b) => b.value - a.value).slice(0, 20);
  }, [flights, groupBy, aggregation]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!reportName.trim()) { toast.error('Report name is required'); return; }
    if (saving) return;
    setSaving(true);
    const existing = reportId ? reports.find(r => r.id === reportId) : undefined;
    const report: SavedReport = {
      id: reportId ?? genId(),
      name: reportName.trim(),
      description: description.trim() || undefined,
      assignedSiteIds,
      isBaseReport,
      isActive,
      siteId: session?.isAppAdmin ? (session.adminActiveSiteId ?? null) : (session?.site?.id ?? null),
      createdBy: session?.username ?? 'unknown',
      fields: selectedFieldIds,
      chartType,
      groupBy,
      aggregation,
      fieldDateFormats,
      fieldExpressions,
      fieldColorRules,
      visibleFilters,
      sortConfig,
      columnLabels,
      filterDescription: filterDescription.trim() || undefined,
      defaultFilterValues,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (existing) {
        await updateReport(report.id, report);
        toast.success('Report updated');
      } else {
        await addReport(report);
        toast.success('Report saved');
        navigate(`/report-designer?id=${report.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this report?')) return;
    deleteReport(id);
    toast.success('Report deleted');
    if (reportId === id) navigate('/report-designer');
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows = tableData.map(f => {
      const row: Record<string, string> = {};
      selectedFields.forEach(fd => { row[fd.label] = getFieldDisplayValue(fd, f as Record<string, unknown>); });
      return row;
    });
    if (rows.length === 0) { toast.error('No data to export'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // ── Preview renderer ─────────────────────────────────────────────────────────
  const renderPreview = () => {
    if (loading) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading flight data...</div>;
    if (flights.length === 0) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">No flight data — check the date range and connection</div>;
    if (selectedFields.length === 0) return <div className="flex items-center justify-center h-full text-slate-400 text-sm">Select at least one field</div>;

    if (chartType === 'table') {
      return (
        <div className="overflow-auto h-full">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {selectedFields.map(f => (
                  <th key={f.id} className="px-3 py-2 text-left text-slate-600 font-semibold border-b border-slate-200 whitespace-nowrap">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  {selectedFields.map(fd => {
                    const val = getFieldDisplayValue(fd, row as Record<string, unknown>);
                    const style = getCellStyle(fd, val);
                    return (
                      <td key={fd.id} className="px-3 py-1.5 text-slate-700" style={style}>{val || '—'}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const aggLabel = aggregation === 'count' ? 'Count' : 'Avg Delay (min)';

    if (chartType === 'bar') return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip />
          <Bar dataKey="value" name={aggLabel} radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

    if (chartType === 'pie') return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} cx="50%" cy="50%" outerRadius={120} paddingAngle={3} dataKey="value"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
            {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={v => [v, aggLabel]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );

    if (chartType === 'line') return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name={aggLabel} />
        </LineChart>
      </ResponsiveContainer>
    );

    return null;
  };

  const isAdmin = session?.isGlobalAdmin || session?.isSiteAdmin || session?.isAppAdmin;

  // Scope the "My Reports" sidebar list to the current site context
  const visibleReports = reports.filter((r) => {
    if (session?.isAppAdmin) {
      // App admin sees reports for the active site (or all if no active site)
      return activeSiteId ? r.siteId === activeSiteId : true;
    }
    // Site user/admin: only their site's reports
    return r.siteId === activeSiteId;
  });

  return (
    <>
      {showAddColumnModal && (
        <AddColumnModal
          fieldDefs={fieldDefs}
          onAdd={handleAddColumn}
          onClose={() => setShowAddColumnModal(false)}
        />
      )}
    <div className="flex flex-col lg:flex-row gap-5 animate-fade-in" style={{ minHeight: 'calc(100vh - 140px)' }}>

      {/* ── Left Panel ── */}
      <div className="lg:w-64 flex-shrink-0 space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-140px)] lg:pr-1">

        {/* Available fields */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Table className="w-4 h-4 text-blue-600" /> Available Fields
          </h3>
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {fieldDefs.map(f => (
              <label key={f.id} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                <input type="checkbox" checked={selectedFieldIds.includes(f.id)} onChange={() => toggleField(f.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700 group-hover:text-blue-600 transition-colors flex-1 truncate">{f.label}</span>
                {f.expression && <Code2 className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                <span className="text-xs text-slate-400 flex-shrink-0">{f.type}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Add Column */}
        <Button
          variant="outline"
          size="sm"
          fullWidth
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowAddColumnModal(true)}
        >
          Add Column
        </Button>

        {/* Selected fields with order + per-field controls */}
        {selectedFieldIds.length > 0 && (
          <Card>
            <h3 className="font-semibold text-slate-800 mb-3">Column Order &amp; Settings</h3>
            <div className="space-y-1.5">
              {selectedFields.map((field, idx) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  dateFormatOverride={fieldDateFormats[field.id]}
                  customLabel={columnLabels[field.id]}
                  index={idx}
                  total={selectedFields.length}
                  onMoveUp={() => moveField(idx, -1)}
                  onMoveDown={() => moveField(idx, 1)}
                  onRemove={() => toggleField(field.id)}
                  onDateFormatChange={fmt => setFieldDateFormats(prev => ({ ...prev, [field.id]: fmt }))}
                  onLabelChange={label => setColumnLabels(prev => ({ ...prev, [field.id]: label }))}
                  onExpressionSave={expr => setFieldExpressions(prev => ({ ...prev, [field.id]: expr }))}
                  onColorRulesSave={rules => setFieldColorRules(prev => ({ ...prev, [field.id]: rules }))}
                  allFields={fieldDefs}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Saved reports list */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3">My Reports</h3>
          {visibleReports.length === 0 ? (
            <p className="text-sm text-slate-400">No saved reports yet</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {visibleReports.map(r => (
                <div key={r.id}
                  className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${r.id === reportId ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'} ${!r.isActive ? 'opacity-60' : ''}`}
                  onClick={() => navigate(`/report-designer?id=${r.id}`)}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                      {r.name}
                      {!r.isActive && <span className="text-xs px-1 py-0 bg-slate-200 text-slate-500 rounded">off</span>}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">{r.chartType} · {r.fields.length} fields</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(r.id); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" fullWidth icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate('/report-designer')} className="mt-3">
            New Report
          </Button>
        </Card>
      </div>

      {/* ── Center — Preview ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col" padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 gap-3">
            <div className="flex-1 min-w-0">
              <input type="text" value={reportName} onChange={e => setReportName(e.target.value)}
                className="text-lg font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 transition-colors w-full"
                placeholder="Report name..." />
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                className="text-xs text-slate-400 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none px-1 mt-0.5 transition-colors w-full"
                placeholder="Optional description..." />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />}
                onClick={() => fetchFlights({ startDate: new Date(), endDate: addDays(new Date(), 1) })}>
                Refresh
              </Button>
              <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleExport}>
                Export
              </Button>
              <Button variant="primary" size="sm" icon={<Save className="w-4 h-4" />} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
          <div className="flex-1 p-5 min-h-96 overflow-hidden">
            {renderPreview()}
          </div>
        </Card>
      </div>

      {/* ── Right Panel ── */}
      <div className="lg:w-64 flex-shrink-0 space-y-4 lg:overflow-y-auto lg:max-h-[calc(100vh-140px)] lg:pr-1">

        {/* Chart type */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3">Chart Type</h3>
          <div className="grid grid-cols-2 gap-2">
            {CHART_TYPE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setChartType(opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-xs font-medium ${chartType === opt.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                <span className={chartType === opt.value ? 'text-blue-600' : 'text-slate-400'}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Group By + Aggregation — only for charts */}
        {chartType !== 'table' && (
          <>
            <Card>
              <h3 className="font-semibold text-slate-800 mb-3">Group By</h3>
              <div className="space-y-1">
                {GROUP_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setGroupBy(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${groupBy === opt.value ? 'bg-blue-600 text-white font-medium' : 'hover:bg-slate-100 text-slate-600'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="font-semibold text-slate-800 mb-3">Aggregation</h3>
              <div className="space-y-1">
                {[{ value: 'count', label: 'Count (flights)' }, { value: 'avgDelay', label: 'Avg Delay (mins)' }].map(opt => (
                  <button key={opt.value} onClick={() => setAggregation(opt.value as Aggregation)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${aggregation === opt.value ? 'bg-blue-600 text-white font-medium' : 'hover:bg-slate-100 text-slate-600'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Active / Inactive toggle — site admins control visibility for regular users */}
        {(session?.isSiteAdmin || session?.isGlobalAdmin) && !session?.isAppAdmin && (
          <Card>
            <h3 className="font-semibold text-slate-800 mb-1">Report Status</h3>
            <p className="text-xs text-slate-400 mb-3">Inactive reports are hidden from regular users.</p>
            <button
              type="button"
              onClick={() => setIsActive(prev => !prev)}
              className="flex items-center gap-3 w-full"
            >
              <div className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-green-700' : 'text-slate-500'}`}>
                {isActive ? 'Active — visible to users' : 'Inactive — hidden from users'}
              </span>
            </button>
          </Card>
        )}

        {/* Deploy to Sites — app admin creates template then deploys copies per site */}
        {session?.isAppAdmin && (
          <Card>
            <h3 className="font-semibold text-slate-800 mb-1">Deploy to Sites</h3>
            <p className="text-xs text-slate-400 mb-3">Each site gets an independent copy they can customise. Save first, then deploy.</p>
            <div className="space-y-2">
              {sites.filter(s => s.enabled).map(site => (
                <label key={site.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox"
                    checked={deployingSiteIds.includes(site.id)}
                    onChange={e => setDeployingSiteIds(prev =>
                      e.target.checked ? [...prev, site.id] : prev.filter(id => id !== site.id)
                    )}
                    className="rounded border-slate-300 text-blue-600" />
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{site.iataCode}</span>
                  <span className="text-sm text-slate-700 truncate">{site.name}</span>
                </label>
              ))}
              {deployingSiteIds.length > 0 && reportId && (
                <Button
                  variant="outline"
                  size="sm"
                  fullWidth
                  onClick={async () => {
                    try {
                      const cloned = await cloneReportToSites(reportId, deployingSiteIds);
                      setDeployingSiteIds([]);
                      toast.success(`Deployed to ${cloned.length} site(s) — each has their own copy`);
                    } catch {
                      toast.error('Deploy failed');
                    }
                  }}
                >
                  Deploy to {deployingSiteIds.length} site{deployingSiteIds.length !== 1 ? 's' : ''}
                </Button>
              )}
              {deployingSiteIds.length > 0 && !reportId && (
                <p className="text-xs text-amber-600">Save the report first, then deploy.</p>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer mt-2 border-t border-slate-100 pt-2">
                <input type="checkbox" checked={isBaseReport} onChange={e => setIsBaseReport(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600" />
                <span className="text-sm text-slate-700">Mark as Base Template</span>
              </label>
            </div>
          </Card>
        )}

        {/* Filter Description */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-1">Filter Description</h3>
          <p className="text-xs text-slate-400 mb-2">Info text shown to viewers above the filter bar</p>
          <textarea
            value={filterDescription}
            onChange={e => setFilterDescription(e.target.value)}
            placeholder="e.g. Use filters below to narrow by gate or airline..."
            rows={3}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </Card>

        {/* Visible Filters */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-1">Visible Filters</h3>
          <p className="text-xs text-slate-400 mb-3">Which filters viewers can use on this report</p>
          <div className="space-y-2">
            {[
              { id: 'adi', label: 'Direction (Arr/Dep)' },
              { id: 'airlines', label: 'Airlines' },
              { id: 'status', label: 'Status' },
              { id: 'gate', label: 'Gate (multi-select)' },
              { id: 'claim', label: 'Baggage Claim (multi-select)' },
              { id: 'city', label: 'City (multi-select)' },
              { id: 'terminal', label: 'Terminal (multi-select)' },
              { id: 'remark', label: 'Remark (multi-select)' },
              { id: 'search', label: 'Search Box' },
            ].map(opt => (
              <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox"
                  checked={visibleFilters.includes(opt.id)}
                  onChange={e => setVisibleFilters(prev =>
                    e.target.checked ? [...prev, opt.id] : prev.filter(f => f !== opt.id)
                  )}
                  className="rounded border-slate-300 text-blue-600" />
                <span className="text-sm text-slate-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Pre-set Filter Values */}
        {visibleFilters.length > 0 && (
          <Card>
            <h3 className="font-semibold text-slate-800 mb-1">Pre-set Filter Values</h3>
            <p className="text-xs text-slate-400 mb-3">Values pre-selected when users open this report</p>
            <div className="space-y-3">
              {visibleFilters.includes('adi') && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Direction</label>
                  <div className="flex gap-1 mt-1">
                    {(['both', 'A', 'D'] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setDefaultFilterValues(prev => ({ ...prev, adi: opt }))}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${(defaultFilterValues.adi ?? 'both') === opt ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {opt === 'both' ? 'All' : opt === 'A' ? 'Arrivals' : 'Departures'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {visibleFilters.includes('status') && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Status</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {['On Time', 'Delayed', 'Cancelled', 'Early'].map(s => {
                      const selected = (defaultFilterValues.statuses ?? []).includes(s);
                      return (
                        <button
                          key={s}
                          onClick={() => setDefaultFilterValues(prev => {
                            const cur = prev.statuses ?? [];
                            return { ...prev, statuses: selected ? cur.filter(x => x !== s) : [...cur, s] };
                          })}
                          className={`px-2 py-1 text-xs rounded border transition-colors ${selected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {['gate', 'claim', 'city', 'terminal', 'remark', 'airlines'].filter(id => visibleFilters.includes(id)).map(fieldId => {
                const label = { gate: 'Gate', claim: 'Claim', city: 'City', terminal: 'Terminal', remark: 'Remark', airlines: 'Airlines' }[fieldId] ?? fieldId;
                const getValues = () => fieldId === 'airlines' ? defaultFilterValues.airlines ?? [] : defaultFilterValues.extras?.[fieldId] ?? [];
                const setValues = (vals: string[]) => {
                  if (fieldId === 'airlines') {
                    setDefaultFilterValues(prev => ({ ...prev, airlines: vals }));
                  } else {
                    setDefaultFilterValues(prev => ({ ...prev, extras: { ...(prev.extras ?? {}), [fieldId]: vals } }));
                  }
                };
                const uniqueVals = [...new Set(flights.map(f => String((f as Record<string, unknown>)[fieldId] ?? '')).filter(Boolean))].sort();
                if (uniqueVals.length === 0) return null;
                const selected = getValues();
                return (
                  <div key={fieldId}>
                    <label className="text-xs font-medium text-slate-600">{label}</label>
                    <div className="mt-1 max-h-28 overflow-y-auto border border-slate-200 rounded-lg">
                      {uniqueVals.map(v => (
                        <label key={v} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selected.includes(v)}
                            onChange={() => setValues(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])}
                            className="rounded border-slate-300 text-blue-600"
                          />
                          <span>{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Sort Order */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-1">Sort Order</h3>
          <p className="text-xs text-slate-400 mb-3">Default sort when viewing — click column headers to override</p>
          <div className="space-y-2">
            {sortConfig.map((sf, i) => {
              const fieldLabel = fieldDefs.find(f => f.id === sf.fieldId)?.label ?? sf.fieldId;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400 w-4 flex-shrink-0">{i + 1}.</span>
                  <select
                    value={sf.fieldId}
                    onChange={e => setSortConfig(prev => prev.map((s, idx) => idx === i ? { ...s, fieldId: e.target.value } : s))}
                    className="flex-1 text-xs border border-slate-300 rounded-lg px-2 py-1.5 min-w-0"
                  >
                    {selectedFieldIds.map(id => {
                      const lbl = fieldDefs.find(f => f.id === id)?.label ?? id;
                      return <option key={id} value={id}>{lbl}</option>;
                    })}
                  </select>
                  <button
                    onClick={() => setSortConfig(prev => prev.map((s, idx) => idx === i ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s))}
                    className="text-xs px-1.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50 flex-shrink-0 w-8 text-center"
                    title={sf.dir === 'asc' ? 'Ascending' : 'Descending'}
                  >
                    {sf.dir === 'asc' ? '↑' : '↓'}
                  </button>
                  <button
                    onClick={() => setSortConfig(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-300 hover:text-red-500 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {selectedFieldIds.length > 0 && (
            <button
              onClick={() => setSortConfig(prev => [...prev, { fieldId: selectedFieldIds[0], dir: 'asc' }])}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 mt-2"
            >
              <Plus className="w-3.5 h-3.5" /> Add Sort Field
            </button>
          )}
        </Card>

        {/* Summary */}
        <Card>
          <h3 className="font-semibold text-slate-800 mb-3">Summary</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Data rows</span>
              <span className="font-medium text-slate-800">{flights.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Columns</span>
              <span className="font-medium text-slate-800">{selectedFieldIds.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chart</span>
              <span className="font-medium text-slate-800 capitalize">{chartType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Assigned to</span>
              <span className="font-medium text-slate-800">
                {assignedSiteIds.length === 0 ? 'All sites' : `${assignedSiteIds.length} site(s)`}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
    </>
  );
};
