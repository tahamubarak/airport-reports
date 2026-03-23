// ─── Site ─────────────────────────────────────────────────────────────────────
export interface Site {
  id: string;
  name: string;
  iataCode: string;
  siteId: string;
  baseUrl: string;
  description?: string;
  adminUsers: string[];
  enabled: boolean;
  /**
   * Optional service-level API key (UUID).
   * Bypasses the 3-step APVe user auth flow when set.
   */
  serviceApiKey?: string;
  /** Timeout in seconds for data fetch requests to APVe API. Default 60. */
  fetchTimeoutSeconds?: number;
}

// ─── App Admin (stored in Azure SQL `app_admins`, bcrypt-hashed) ──────────────
export interface AppAdmin {
  id: string;
  username: string;
  password: string; // always '••••••••' from API — real hash never leaves the server
}

// ─── User Session ──────────────────────────────────────────────────────────────
export interface UserSession {
  username: string;
  site: Site | null;           // null when logged in as app admin
  accessToken: string;
  publicAccessToken: string;
  tokenExpiry: number;
  /** The user's long-lived APVe API key — used to silently refresh publicAccessToken */
  apiKey?: string;
  isGlobalAdmin: boolean;
  isSiteAdmin: boolean;
  isAppAdmin: boolean;         // true for application-level admins
  adminActiveSiteId: string | null; // which site the app admin is currently viewing
  loggedInAt: number;
}

// ─── Flight ───────────────────────────────────────────────────────────────────
export type OtpStatus = 'On Time' | 'Delayed' | 'Cancelled' | 'Early';
export type DelayBand =
  | 'On Time'
  | '1-15 min'
  | '16-30 min'
  | '31-60 min'
  | '61-120 min'
  | '120+ min'
  | 'Cancelled';
export type TimePeriod =
  | 'Early Morning (0-6)'
  | 'Morning (6-12)'
  | 'Afternoon (12-18)'
  | 'Evening (18-24)';

export interface Flight {
  adi: 'A' | 'D';
  scheduleDate: string;
  linecode: string;
  number: string;
  siteIata: string;
  gate: string;
  city: string;
  schedule: string;
  actual: string;
  status: string;
  claim: string;
  delayMinutes: number;
  // Computed fields
  otpStatus: OtpStatus;
  delayBand: DelayBand;
  scheduledHour: number;
  timePeriod: TimePeriod;
  airlineName: string;
  flightKey: string;
  searchKey: string;
  [key: string]: unknown; // allow dynamic computed fields
}

// ─── Conditional Formatting ───────────────────────────────────────────────────
// TODO: Azure SQL table `color_rules` (id, field_definition_id FK, operator, value, text_color, bg_color, bold)
export type ColorRuleOperator = 'eq' | 'neq' | 'contains' | 'startsWith' | 'gt' | 'lt' | 'gte' | 'lte';

export interface ColorRule {
  id: string;
  operator: ColorRuleOperator;
  value: string;
  textColor?: string;  // CSS hex e.g. '#dc2626'
  bgColor?: string;    // CSS hex e.g. '#fee2e2'
  bold?: boolean;
}

// ─── Field Expressions (computed fields) ──────────────────────────────────────
export type FieldExpressionType = 'timeDiff' | 'concat' | 'lookup' | 'static';

/** A single piece in a concat expression — either a field reference or literal text */
export type ConcatPart =
  | { kind: 'field'; id: string; name?: string }  // name = record key (field.name), may differ from id for custom fields
  | { kind: 'static'; value: string };

export interface FieldExpression {
  type: FieldExpressionType;
  fields?: string[];            // source field ids (timeDiff / lookup; legacy concat)
  separator?: string;           // legacy concat separator
  concatParts?: ConcatPart[];   // ordered mix of field refs + static text for concat
  map?: Record<string, string>; // for lookup: raw value → display value
  staticValue?: string;         // for static
}

// ─── Field Definitions ────────────────────────────────────────────────────────
// TODO: Azure SQL table `field_definitions` (id, site_id FK nullable, name, label, type, ...)
export type FieldType = 'string' | 'datetime' | 'int' | 'float' | 'boolean';

export interface FieldDefinition {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  dateFormat?: string;
  enabled: boolean;
  isBuiltIn: boolean;
  expression?: FieldExpression;  // if set, value is computed rather than read from Flight
  colorRules?: ColorRule[];       // conditional formatting applied in table cells
}

export const DEFAULT_FIELD_DEFINITIONS: FieldDefinition[] = [
  { id: 'linecode',     name: 'linecode',     label: 'Airline Code',    type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'number',       name: 'number',       label: 'Flight Number',   type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'adi',          name: 'adi',          label: 'Arr/Dep',         type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'city',         name: 'city',         label: 'City',            type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'gate',         name: 'gate',         label: 'Gate',            type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'claim',        name: 'claim',        label: 'Baggage Claim',   type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'scheduleDate', name: 'scheduleDate', label: 'Schedule Date',   type: 'datetime', dateFormat: 'MM/dd/yyyy',       enabled: true,  isBuiltIn: true },
  { id: 'schedule',     name: 'schedule',     label: 'Scheduled Time',  type: 'datetime', dateFormat: 'MM/dd/yyyy HH:mm', enabled: true,  isBuiltIn: true },
  { id: 'actual',       name: 'actual',       label: 'Estimated Time',  type: 'datetime', dateFormat: 'MM/dd/yyyy HH:mm', enabled: true,  isBuiltIn: true },
  { id: 'status',       name: 'status',       label: 'Status',          type: 'string',   enabled: true,  isBuiltIn: true,
    colorRules: [
      { id: 'status-ontime',    operator: 'eq', value: 'On Time',   textColor: '#166534', bgColor: '#dcfce7', bold: false },
      { id: 'status-delayed',   operator: 'eq', value: 'Delayed',   textColor: '#92400e', bgColor: '#fef3c7', bold: true  },
      { id: 'status-cancelled', operator: 'eq', value: 'Cancelled', textColor: '#991b1b', bgColor: '#fee2e2', bold: true  },
      { id: 'status-early',     operator: 'eq', value: 'Early',     textColor: '#1e40af', bgColor: '#dbeafe', bold: false },
    ],
  },
  { id: 'delayMinutes', name: 'delayMinutes', label: 'Delay (mins)',    type: 'int',      enabled: true,  isBuiltIn: true,
    colorRules: [
      { id: 'delay-high',   operator: 'gt', value: '60', textColor: '#991b1b', bgColor: '#fee2e2', bold: true  },
      { id: 'delay-medium', operator: 'gt', value: '15', textColor: '#92400e', bgColor: '#fef3c7', bold: false },
    ],
  },
  { id: 'parkingbay',  name: 'parkingbay',  label: 'Stand',            type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'terminal',    name: 'terminal',    label: 'Terminal',         type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'line',        name: 'line',        label: 'Airline',          type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'remark',      name: 'remark',      label: 'Remark',           type: 'string',   enabled: true,  isBuiltIn: true },
  { id: 'sched_hhmm',  name: 'schedule',    label: 'Sched. Time',      type: 'datetime', dateFormat: 'HH:mm', enabled: true,  isBuiltIn: true },
  { id: 'estim_hhmm',  name: 'actual',      label: 'Est. Time',        type: 'datetime', dateFormat: 'HH:mm', enabled: true,  isBuiltIn: true },
];

// ─── Sort config ──────────────────────────────────────────────────────────────
export interface SortField {
  fieldId: string;
  dir: 'asc' | 'desc';
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export interface SavedReport {
  id: string;
  name: string;
  description?: string;
  /** Which site owns this report. null = app admin template (no site owner). */
  siteId?: string | null;
  /** Site admins can deactivate a report to hide it from regular users. */
  isActive: boolean;
  /** Set when this report was cloned from a template — tracks lineage. */
  parentReportId?: string;
  /** @deprecated Use siteId instead. Kept for backward compatibility. */
  assignedSiteIds: string[];
  isBaseReport: boolean;       // base/template reports created by app admin (siteId=null)
  createdBy: string;
  fields: string[];
  chartType: 'table' | 'bar' | 'pie' | 'line';
  groupBy: string;
  aggregation: 'count' | 'avgDelay';
  fieldDateFormats: Record<string, string>;  // fieldId → date format override
  /** Per-column expression overrides (required for custom columns created in designer). */
  fieldExpressions: Record<string, FieldExpression>;
  /** Which filter controls are shown to viewers. Default: ['adi','airlines','status'] */
  visibleFilters: string[];
  /** Default sort order applied when viewing the report. Runtime header-click overrides. */
  sortConfig: SortField[];
  /** Custom header label overrides for any column. Key = fieldId. */
  columnLabels: Record<string, string>;
  /** Informational text shown to viewers above the filter bar. */
  filterDescription?: string;
  /** Pre-configured filter values applied when the report is first opened. */
  defaultFilterValues: DefaultFilterValues;
  /** Per-column color rule overrides (stored per-report, override site field defaults). */
  fieldColorRules: Record<string, ColorRule[]>;
  createdAt: string;
  updatedAt: string;
}

// ─── Report Audit Log ─────────────────────────────────────────────────────────
export interface ReportAuditEntry {
  id: string;
  reportId: string;
  siteId?: string | null;
  changedBy: string;
  changedAt: string;
  action: 'created' | 'updated' | 'cloned' | 'deleted' | 'activated' | 'deactivated';
  summary?: string;
  snapshotBefore?: Partial<SavedReport>;
  snapshotAfter?: Partial<SavedReport>;
}

// ─── Legacy Settings (kept for backward compat) ───────────────────────────────
export interface Settings {
  baseUrl: string;
  siteCode: string;
  username: string;
  password: string;
  siteId: string;
  publicAccessToken: string;
  publicRefreshToken: string;
  tokenExpiry: number;
  lastAuthTime: number | null;
  isConnected: boolean;
}

// ─── Auth types ───────────────────────────────────────────────────────────────
export interface AuthResponse {
  token: string;
  refreshToken: string;
}

export interface UserApiKey {
  id: string;
  key: string;
}

export interface User {
  id: string | number;
  key: string;
  links?: {
    activeApiKeys?: {
      linkedEntities?: UserApiKey[];
    };
  };
}

export interface PublicAuthResponse {
  publicAccessToken: string;
  publicRefreshToken: string;
}

// ─── Filters & KPIs ───────────────────────────────────────────────────────────
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface FilterState {
  dateRange: DateRange;
  adi: 'A' | 'D' | 'both';
  airlines: string[];
  statuses: string[];
  gate: string;       // kept for core reports text filter
  search: string;
  extras: Record<string, string[]>;  // dynamic multi-select by fieldId
}

export interface DefaultFilterValues {
  adi?: 'A' | 'D' | 'both';
  airlines?: string[];
  statuses?: string[];
  extras?: Record<string, string[]>;
}

export interface KPIData {
  totalFlights: number;
  departures: number;
  arrivals: number;
  onTimePercent: number;
  avgDelayMinutes: number;
  activeGates: number;
}

export interface GateUtilization {
  gate: string;
  totalFlights: number;
  arrivals: number;
  departures: number;
  avgOccupancyTime: number;
}

export interface AirlineStats {
  airline: string;
  totalFlights: number;
  onTime: number;
  delayed: number;
  cancelled: number;
  avgDelay: number;
}

// ─── UI Constants ─────────────────────────────────────────────────────────────
export type StatusType = 'On Time' | 'Delayed' | 'Cancelled' | 'Early' | 'Unknown';

export const STATUS_COLORS: Record<string, string> = {
  'On Time':  'text-green-600 bg-green-50 border-green-200',
  'Delayed':  'text-amber-600 bg-amber-50 border-amber-200',
  'Cancelled':'text-red-600 bg-red-50 border-red-200',
  'Early':    'text-blue-600 bg-blue-50 border-blue-200',
  'Unknown':  'text-gray-600 bg-gray-50 border-gray-200',
};

export const STATUS_DOT_COLORS: Record<string, string> = {
  'On Time':  'bg-green-500',
  'Delayed':  'bg-amber-500',
  'Cancelled':'bg-red-500',
  'Early':    'bg-blue-400',
  'Unknown':  'bg-gray-400',
};

export const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706',
  '#059669', '#0891b2', '#4f46e5', '#be185d', '#b45309',
];

export const AVAILABLE_FIELDS = [
  { id: 'linecode',    label: 'Airline Code' },
  { id: 'number',      label: 'Flight Number' },
  { id: 'adi',         label: 'ADI (Arr/Dep)' },
  { id: 'gate',        label: 'Gate' },
  { id: 'city',        label: 'City' },
  { id: 'schedule',    label: 'Scheduled Time' },
  { id: 'actual',      label: 'Actual Time' },
  { id: 'status',      label: 'Status' },
  { id: 'delayMinutes',label: 'Delay (mins)' },
  { id: 'claim',       label: 'Baggage Claim' },
  { id: 'scheduleDate',label: 'Schedule Date' },
  { id: 'airlineName', label: 'Airline Name' },
  { id: 'flightKey',   label: 'Flight Key' },
  { id: 'otpStatus',   label: 'OTP Status' },
  { id: 'delayBand',   label: 'Delay Band' },
  { id: 'timePeriod',  label: 'Time Period' },
];

export const COLOR_RULE_OPERATORS: { value: ColorRuleOperator; label: string }[] = [
  { value: 'eq',         label: 'equals' },
  { value: 'neq',        label: 'not equals' },
  { value: 'contains',   label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'gt',         label: '>' },
  { value: 'lt',         label: '<' },
  { value: 'gte',        label: '>=' },
  { value: 'lte',        label: '<=' },
];

export const PRESET_DATE_FORMATS = [
  'MM/dd/yyyy HH:mm',
  'MM/dd/yyyy',
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd',
  'dd/MM/yyyy HH:mm',
  'HH:mm',
  'hh:mm a',
];

// ─── Default site (kept for reference) ────────────────────────────────────────
export const DEFAULT_SITE: Site = {
  id: 'bwi-default',
  name: 'Baltimore/Washington International',
  iataCode: 'BWI',
  siteId: '1',
  baseUrl: 'https://BWI.cloudids.aero/',
  adminUsers: ['cdarling'],
  enabled: true,
};
