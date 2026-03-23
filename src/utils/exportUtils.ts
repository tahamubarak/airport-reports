import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Flight, FieldDefinition } from '../types';
import { getFieldDisplayValue } from './fieldEngine';
import { format, parseISO } from 'date-fns';

// ─── Field-aware value formatter ────────────────────────────────────────────

export function formatFieldValue(value: unknown, field: FieldDefinition): string {
  if (value === null || value === undefined || value === '') return '';

  switch (field.type) {
    case 'datetime': {
      const fmt = field.dateFormat || 'MM/dd/yyyy HH:mm';
      try {
        const str = String(value);
        if (!str) return '';
        return format(parseISO(str), fmt);
      } catch {
        return String(value);
      }
    }
    case 'int':
      return String(Math.round(Number(value)));
    case 'float':
      return Number(value).toFixed(2);
    case 'boolean':
      return value ? 'Yes' : 'No';
    default:
      return String(value);
  }
}

// ─── Build display rows from flights + field definitions ────────────────────

export function buildRows(
  flights: Flight[],
  fields: FieldDefinition[]
): Record<string, string>[] {
  return flights.map((flight) => {
    const row: Record<string, string> = {};
    fields.forEach((f) => {
      row[f.label] = getFieldDisplayValue(f, flight as unknown as Record<string, unknown>);
    });
    return row;
  });
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export const exportToCSV = (
  flights: Flight[],
  fields: FieldDefinition[],
  filename = 'flights'
): void => {
  const rows = buildRows(flights, fields);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h] ?? '';
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ─── Excel ───────────────────────────────────────────────────────────────────

export const exportToExcel = (
  flights: Flight[],
  fields: FieldDefinition[],
  filename = 'flights'
): void => {
  const rows = buildRows(flights, fields);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = fields.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
};

// ─── PDF ─────────────────────────────────────────────────────────────────────

export const exportToPDF = (
  flights: Flight[],
  fields: FieldDefinition[],
  title = 'Flight Report',
  filename = 'flights'
): void => {
  const rows = buildRows(flights, fields);
  const headers = fields.map((f) => f.label);
  const body = rows.map((row) => headers.map((h) => row[h] ?? ''));

  const doc = new jsPDF({ orientation: headers.length > 7 ? 'landscape' : 'portrait' });

  // Header
  doc.setFontSize(16);
  doc.setTextColor(30, 64, 175); // blue-800
  doc.text(title, 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}  |  ${flights.length} records`, 14, 23);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
};

// ─── Print ───────────────────────────────────────────────────────────────────

export const printTable = (
  title: string,
  flights: Flight[],
  fields: FieldDefinition[]
): void => {
  const rows = buildRows(flights, fields);
  const headers = fields.map((f) => f.label);

  const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 10px; margin: 16px; color: #1e293b; }
          h1 { font-size: 15px; color: #1e40af; margin: 0 0 4px; }
          .meta { font-size: 9px; color: #64748b; margin-bottom: 10px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #1e40af; color: white; font-weight: 600; padding: 5px 8px; text-align: left; }
          td { border-bottom: 1px solid #e2e8f0; padding: 4px 8px; }
          tr:nth-child(even) td { background: #f8fafc; }
          @media print { @page { margin: 1cm; } }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')} &nbsp;|&nbsp; ${flights.length} records</div>
        <table>
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
    </html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
};

// ─── Generic (non-flight) export for charts/custom reports ──────────────────

export const exportRawToCSV = (
  data: Record<string, unknown>[],
  filename = 'report'
): void => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const lines = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportRawToExcel = (
  data: Record<string, unknown>[],
  filename = 'report'
): void => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
};

export const exportRawToPDF = (
  data: Record<string, unknown>[],
  title = 'Report',
  filename = 'report'
): void => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const body = data.map((row) => headers.map((h) => String(row[h] ?? '')));
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });

  doc.setFontSize(16);
  doc.setTextColor(30, 64, 175);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}  |  ${data.length} records`, 14, 23);

  autoTable(doc, {
    head: [headers],
    body,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
};
