import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, Printer, ChevronDown, File } from 'lucide-react';
import { Flight, FieldDefinition } from '../../types';
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  printTable,
  exportRawToCSV,
  exportRawToExcel,
  exportRawToPDF,
} from '../../utils/exportUtils';
import toast from 'react-hot-toast';

interface FlightExportMenuProps {
  flights: Flight[];
  fields: FieldDefinition[];
  title?: string;
  filename?: string;
  disabled?: boolean;
}

interface RawExportMenuProps {
  data: Record<string, unknown>[];
  title?: string;
  filename?: string;
  disabled?: boolean;
}

type ExportMenuProps = FlightExportMenuProps | RawExportMenuProps;

function isFlightExport(props: ExportMenuProps): props is FlightExportMenuProps {
  return 'flights' in props;
}

export const ExportMenu: React.FC<ExportMenuProps> = (props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const title = props.title || 'Report';
  const filename = props.filename || 'report';
  const disabled = props.disabled || false;

  const handle = (fn: () => void, label: string) => {
    setOpen(false);
    try {
      fn();
      toast.success(`Exported as ${label}`);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const actions = isFlightExport(props)
    ? [
        {
          label: 'CSV',
          icon: <FileText className="w-4 h-4 text-green-600" />,
          fn: () => exportToCSV(props.flights, props.fields, filename),
        },
        {
          label: 'Excel (.xlsx)',
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
          fn: () => exportToExcel(props.flights, props.fields, filename),
        },
        {
          label: 'PDF',
          icon: <File className="w-4 h-4 text-red-500" />,
          fn: () => exportToPDF(props.flights, props.fields, title, filename),
        },
        {
          label: 'Print',
          icon: <Printer className="w-4 h-4 text-slate-600" />,
          fn: () => printTable(title, props.flights, props.fields),
        },
      ]
    : [
        {
          label: 'CSV',
          icon: <FileText className="w-4 h-4 text-green-600" />,
          fn: () => exportRawToCSV(props.data, filename),
        },
        {
          label: 'Excel (.xlsx)',
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
          fn: () => exportRawToExcel(props.data, filename),
        },
        {
          label: 'PDF',
          icon: <File className="w-4 h-4 text-red-500" />,
          fn: () => exportRawToPDF(props.data, title, filename),
        },
        {
          label: 'Print',
          icon: <Printer className="w-4 h-4 text-slate-600" />,
          fn: () => {
            const win = window.open('', '_blank');
            if (!win) return;
            const d = props.data;
            if (!d.length) return;
            const headers = Object.keys(d[0]);
            win.document.write(`<html><head><title>${title}</title>
              <style>body{font-family:Arial;font-size:10px;margin:16px}
              h1{color:#1e40af;font-size:15px}
              table{border-collapse:collapse;width:100%}
              th{background:#1e40af;color:white;padding:5px 8px}
              td{border-bottom:1px solid #e2e8f0;padding:4px 8px}
              tr:nth-child(even) td{background:#f8fafc}</style></head>
              <body><h1>${title}</h1>
              <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
              <tbody>${d.map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
              </table><script>window.onload=()=>window.print()<\/script></body></html>`);
            win.document.close();
          },
        },
      ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
          ${disabled
            ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-sm cursor-pointer'
          }`}
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-fade-in">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => handle(action.fn, action.label)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
