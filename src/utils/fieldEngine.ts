import { FieldDefinition, FieldExpression, ColorRule, ColorRuleOperator } from '../types';
import { format as formatDate, parseISO, differenceInMinutes } from 'date-fns';

// ─── Expression evaluator ─────────────────────────────────────────────────────

export function evaluateExpression(
  expression: FieldExpression,
  record: Record<string, unknown>
): string {
  switch (expression.type) {
    case 'static':
      return expression.staticValue ?? '';

    case 'concat': {
      // New format: ordered parts (field refs + static text mixed freely)
      if (expression.concatParts && expression.concatParts.length > 0) {
        return expression.concatParts
          .map((p) => p.kind === 'field'
            ? String(record[p.name ?? p.id] ?? '')  // use name (API key) if stored, fall back to id
            : p.value)
          .join('');
      }
      // Legacy format: fields joined by separator
      const sep = expression.separator ?? ' ';
      return (expression.fields ?? [])
        .map((f) => String(record[f] ?? ''))
        .filter(Boolean)
        .join(sep);
    }

    case 'timeDiff': {
      const [startField, endField] = expression.fields ?? [];
      const start = record[startField];
      const end = record[endField];
      if (!start || !end) return '';
      try {
        const mins = differenceInMinutes(parseISO(String(end)), parseISO(String(start)));
        return String(mins);
      } catch {
        return '';
      }
    }

    case 'lookup': {
      const [sourceField] = expression.fields ?? [];
      const raw = String(record[sourceField] ?? '');
      return expression.map?.[raw] ?? raw;
    }

    default:
      return '';
  }
}

// ─── Color rule evaluator ─────────────────────────────────────────────────────

function matchesRule(rule: ColorRule, displayValue: string): boolean {
  const v = displayValue;
  const rv = rule.value;
  const num = parseFloat(v);
  const rnum = parseFloat(rv);

  switch (rule.operator as ColorRuleOperator) {
    case 'eq':         return v === rv;
    case 'neq':        return v !== rv;
    case 'contains':   return v.toLowerCase().includes(rv.toLowerCase());
    case 'startsWith': return v.toLowerCase().startsWith(rv.toLowerCase());
    case 'gt':         return !isNaN(num) && !isNaN(rnum) && num > rnum;
    case 'lt':         return !isNaN(num) && !isNaN(rnum) && num < rnum;
    case 'gte':        return !isNaN(num) && !isNaN(rnum) && num >= rnum;
    case 'lte':        return !isNaN(num) && !isNaN(rnum) && num <= rnum;
    default:           return false;
  }
}

export function evaluateColorRules(
  rules: ColorRule[],
  displayValue: string
): { textColor?: string; bgColor?: string; bold?: boolean } | null {
  for (const rule of rules) {
    if (matchesRule(rule, displayValue)) {
      return { textColor: rule.textColor, bgColor: rule.bgColor, bold: rule.bold };
    }
  }
  return null;
}

// ─── Cell style builder ───────────────────────────────────────────────────────

export function getCellStyle(
  field: FieldDefinition,
  displayValue: string
): React.CSSProperties {
  if (!field.colorRules?.length) return {};
  const result = evaluateColorRules(field.colorRules, displayValue);
  if (!result) return {};
  return {
    color: result.textColor,
    backgroundColor: result.bgColor,
    fontWeight: result.bold ? 'bold' : undefined,
  };
}

// ─── Field value resolver ─────────────────────────────────────────────────────

export function getFieldDisplayValue(
  field: FieldDefinition,
  record: Record<string, unknown>,
  dateFormatOverride?: string
): string {
  // Computed field
  if (field.expression) {
    return evaluateExpression(field.expression, record);
  }

  const raw = record[field.name];
  if (raw === null || raw === undefined || raw === '') return '';

  const fmt = dateFormatOverride ?? field.dateFormat;

  switch (field.type) {
    case 'datetime': {
      if (!fmt) return String(raw);
      try {
        return formatDate(parseISO(String(raw)), fmt);
      } catch {
        return String(raw);
      }
    }
    case 'int':
      return String(Math.round(Number(raw)));
    case 'float':
      return Number(raw).toFixed(2);
    case 'boolean':
      return raw ? 'Yes' : 'No';
    default:
      return String(raw);
  }
}

// ─── Preset color palettes for the color rule editor UI ───────────────────────

export const PRESET_COLORS = [
  // With background (light-theme style)
  { label: 'Red',    textColor: '#991b1b', bgColor: '#fee2e2' },
  { label: 'Amber',  textColor: '#92400e', bgColor: '#fef3c7' },
  { label: 'Green',  textColor: '#166534', bgColor: '#dcfce7' },
  { label: 'Blue',   textColor: '#1e40af', bgColor: '#dbeafe' },
  { label: 'Purple', textColor: '#5b21b6', bgColor: '#ede9fe' },
  // Text-only (transparent BG — theme-friendly)
  { label: '• Red',    textColor: '#ef4444', bgColor: 'transparent' },
  { label: '• Amber',  textColor: '#f59e0b', bgColor: 'transparent' },
  { label: '• Green',  textColor: '#22c55e', bgColor: 'transparent' },
  { label: '• Blue',   textColor: '#3b82f6', bgColor: 'transparent' },
  { label: '• Purple', textColor: '#a855f7', bgColor: 'transparent' },
];
