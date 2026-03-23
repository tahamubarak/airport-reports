import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { requireAuth, requireAppAdmin } from '../auth-middleware';

const router = Router();

// ─── Helper: serialise one DB row → SavedReport shape ────────────────────────
interface ReportRow {
  id: string;
  name: string;
  description?: string;
  isBaseReport: boolean;
  siteId: string | null;
  isActive: boolean;
  parentReportId?: string;
  createdBy: string;
  fields: unknown[];
  chartType: string;
  groupBy: string;
  aggregation: string;
  fieldDateFormats: Record<string, unknown>;
  fieldExpressions: Record<string, unknown>;
  visibleFilters: string[];
  sortConfig: unknown[];
  columnLabels: Record<string, unknown>;
  filterDescription?: string;
  defaultFilterValues: Record<string, unknown>;
  fieldColorRules: Record<string, unknown>;
  assignedSiteIds: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

function rowToReport(r: Record<string, unknown>): ReportRow {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    isBaseReport: !!r.is_base_report,
    siteId: (r.site_id as string | null) ?? null,
    isActive: r.is_active !== undefined ? !!r.is_active : true,
    parentReportId: (r.parent_report_id as string | null) ?? undefined,
    createdBy: r.created_by as string,
    fields: JSON.parse((r.fields as string) ?? '[]'),
    chartType: r.chart_type as string,
    groupBy: r.group_by as string,
    aggregation: r.aggregation as string,
    fieldDateFormats: JSON.parse((r.field_date_formats as string) ?? '{}'),
    fieldExpressions: JSON.parse((r.field_expressions as string) ?? '{}'),
    visibleFilters: JSON.parse((r.visible_filters as string) ?? '["adi","airlines","status"]'),
    sortConfig: JSON.parse((r.sort_config as string) ?? '[]'),
    columnLabels: JSON.parse((r.column_labels as string) ?? '{}'),
    filterDescription: (r.filter_description as string | null) ?? undefined,
    defaultFilterValues: JSON.parse((r.default_filter_values as string) ?? '{}'),
    fieldColorRules: JSON.parse((r.field_color_rules as string) ?? '{}'),
    assignedSiteIds: [],  // legacy — siteId is now canonical
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const REPORT_COLS = `r.id, r.name, r.description, r.is_base_report, r.site_id, r.is_active,
  r.parent_report_id, r.created_by, r.fields, r.chart_type, r.group_by, r.aggregation,
  r.field_date_formats, r.field_expressions, r.visible_filters, r.sort_config,
  r.column_labels, r.filter_description, r.default_filter_values, r.field_color_rules,
  r.created_at, r.updated_at`;

// ─── Helper: read one report back from DB ────────────────────────────────────
async function fetchReport(pool: Awaited<ReturnType<typeof getPool>>, id: string) {
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query(`SELECT ${REPORT_COLS} FROM saved_reports r WHERE r.id = @id`);
  const r = result.recordset[0];
  if (!r) return null;
  return rowToReport(r);
}

// ─── Helper: write audit log entry ───────────────────────────────────────────
async function writeAudit(
  pool: Awaited<ReturnType<typeof getPool>>,
  opts: {
    reportId: string;
    siteId?: string | null;
    changedBy: string;
    action: string;
    summary?: string;
    snapshotBefore?: object | null;
    snapshotAfter?: object | null;
  }
) {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('reportId', sql.NVarChar, opts.reportId)
      .input('siteId', sql.NVarChar, opts.siteId ?? null)
      .input('changedBy', sql.NVarChar, opts.changedBy)
      .input('action', sql.NVarChar, opts.action)
      .input('summary', sql.NVarChar, opts.summary ?? null)
      .input('snapshotBefore', sql.NVarChar, opts.snapshotBefore ? JSON.stringify(opts.snapshotBefore) : null)
      .input('snapshotAfter', sql.NVarChar, opts.snapshotAfter ? JSON.stringify(opts.snapshotAfter) : null)
      .query(`INSERT INTO report_audit_log
              (id, report_id, site_id, changed_by, action, summary, snapshot_before, snapshot_after)
              VALUES
              (@id, @reportId, @siteId, @changedBy, @action, @summary, @snapshotBefore, @snapshotAfter)`);
  } catch (err) {
    // Non-fatal — log but don't break the main request
    console.error('[audit] Failed to write audit log:', err);
  }
}

// ─── Helper: produce human-readable change summary ───────────────────────────
function diffSummary(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string {
  const tracked = [
    'name', 'description', 'fields', 'chartType', 'groupBy', 'aggregation',
    'isBaseReport', 'isActive', 'visibleFilters', 'sortConfig', 'columnLabels',
    'filterDescription', 'defaultFilterValues', 'fieldDateFormats',
    'fieldExpressions', 'fieldColorRules',
  ];
  const changed: string[] = [];
  for (const key of tracked) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed.push(key);
  }
  return changed.length ? `Updated: ${changed.join(', ')}` : 'No significant changes';
}

// ─── GET /api/reports ─────────────────────────────────────────────────────────
// App admin  → all reports; optionally filtered by ?siteId=
// Site admin → all reports for their site (active + inactive, for management)
// Site user  → only active reports for their site
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const user = req.user!;
    const request = pool.request();
    let query: string;

    if (user.isAppAdmin) {
      const filterSite = req.query.siteId as string | undefined;
      if (filterSite) {
        request.input('siteId', sql.NVarChar, filterSite);
        query = `SELECT ${REPORT_COLS} FROM saved_reports r
                 WHERE r.site_id = @siteId ORDER BY r.created_at DESC`;
      } else {
        // Return all: site-owned reports + base templates (site_id IS NULL)
        query = `SELECT ${REPORT_COLS} FROM saved_reports r
                 ORDER BY r.site_id, r.created_at DESC`;
      }
    } else {
      if (!user.siteId) {
        res.status(403).json({ error: 'No site context in token' });
        return;
      }
      request.input('siteId', sql.NVarChar, user.siteId);
      if (user.isSiteAdmin) {
        // Site admin sees all reports for their site (incl. inactive) to manage them
        query = `SELECT ${REPORT_COLS} FROM saved_reports r
                 WHERE r.site_id = @siteId ORDER BY r.created_at DESC`;
      } else {
        // Regular site user: only active reports
        query = `SELECT ${REPORT_COLS} FROM saved_reports r
                 WHERE r.site_id = @siteId AND r.is_active = 1 ORDER BY r.created_at DESC`;
      }
    }

    const result = await request.query(query);
    res.json(result.recordset.map(rowToReport));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/reports ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAppAdmin && !user.isSiteAdmin) {
      res.status(403).json({ error: 'Admin access required to create reports' });
      return;
    }

    const {
      id, name, description, isBaseReport, createdBy, fields, chartType, groupBy,
      aggregation, fieldDateFormats, fieldExpressions, visibleFilters, sortConfig,
      columnLabels, filterDescription, defaultFilterValues, fieldColorRules,
    } = req.body;

    // Site admins can only create reports for their own site
    const siteId: string | null = user.isAppAdmin
      ? (req.body.siteId ?? null)
      : user.siteId!;

    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description ?? null)
      .input('isBaseReport', sql.Bit, (user.isAppAdmin && isBaseReport) ? 1 : 0)
      .input('siteId', sql.NVarChar, siteId)
      .input('createdBy', sql.NVarChar, createdBy ?? user.username)
      .input('fields', sql.NVarChar, JSON.stringify(fields ?? []))
      .input('chartType', sql.NVarChar, chartType ?? 'table')
      .input('groupBy', sql.NVarChar, groupBy ?? 'linecode')
      .input('aggregation', sql.NVarChar, aggregation ?? 'count')
      .input('fieldDateFormats', sql.NVarChar, JSON.stringify(fieldDateFormats ?? {}))
      .input('fieldExpressions', sql.NVarChar, JSON.stringify(fieldExpressions ?? {}))
      .input('visibleFilters', sql.NVarChar, JSON.stringify(visibleFilters ?? ['adi', 'airlines', 'status']))
      .input('sortConfig', sql.NVarChar, JSON.stringify(sortConfig ?? []))
      .input('columnLabels', sql.NVarChar, JSON.stringify(columnLabels ?? {}))
      .input('filterDescription', sql.NVarChar, filterDescription ?? null)
      .input('defaultFilterValues', sql.NVarChar, JSON.stringify(defaultFilterValues ?? {}))
      .input('fieldColorRules', sql.NVarChar, JSON.stringify(fieldColorRules ?? {}))
      .query(`INSERT INTO saved_reports
              (id, name, description, is_base_report, site_id, is_active, created_by,
               fields, chart_type, group_by, aggregation, field_date_formats,
               field_expressions, visible_filters, sort_config, column_labels,
               filter_description, default_filter_values, field_color_rules)
              VALUES
              (@id, @name, @description, @isBaseReport, @siteId, 1, @createdBy,
               @fields, @chartType, @groupBy, @aggregation, @fieldDateFormats,
               @fieldExpressions, @visibleFilters, @sortConfig, @columnLabels,
               @filterDescription, @defaultFilterValues, @fieldColorRules)`);

    const created = await fetchReport(pool, id);
    await writeAudit(pool, {
      reportId: id,
      siteId,
      changedBy: user.username,
      action: 'created',
      summary: `Created report "${name}"`,
      snapshotAfter: created ?? undefined,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/reports/:id ─────────────────────────────────────────────────────
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAppAdmin && !user.isSiteAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const pool = await getPool();
    const existing = await fetchReport(pool, req.params.id);
    if (!existing) { res.status(404).json({ error: 'Report not found' }); return; }

    // Ownership check: site admins can only edit their own site's reports
    if (!user.isAppAdmin && existing.siteId !== user.siteId) {
      res.status(403).json({ error: 'You can only edit reports for your own site' });
      return;
    }

    const {
      name, description, isBaseReport, fields, chartType, groupBy, aggregation,
      fieldDateFormats, fieldExpressions, visibleFilters, sortConfig, columnLabels,
      filterDescription, defaultFilterValues, fieldColorRules,
    } = req.body;

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description ?? null)
      .input('isBaseReport', sql.Bit, (user.isAppAdmin && isBaseReport) ? 1 : 0)
      .input('fields', sql.NVarChar, JSON.stringify(fields ?? []))
      .input('chartType', sql.NVarChar, chartType ?? 'table')
      .input('groupBy', sql.NVarChar, groupBy ?? 'linecode')
      .input('aggregation', sql.NVarChar, aggregation ?? 'count')
      .input('fieldDateFormats', sql.NVarChar, JSON.stringify(fieldDateFormats ?? {}))
      .input('fieldExpressions', sql.NVarChar, JSON.stringify(fieldExpressions ?? {}))
      .input('visibleFilters', sql.NVarChar, JSON.stringify(visibleFilters ?? ['adi', 'airlines', 'status']))
      .input('sortConfig', sql.NVarChar, JSON.stringify(sortConfig ?? []))
      .input('columnLabels', sql.NVarChar, JSON.stringify(columnLabels ?? {}))
      .input('filterDescription', sql.NVarChar, filterDescription ?? null)
      .input('defaultFilterValues', sql.NVarChar, JSON.stringify(defaultFilterValues ?? {}))
      .input('fieldColorRules', sql.NVarChar, JSON.stringify(fieldColorRules ?? {}))
      .query(`UPDATE saved_reports SET
              name=@name, description=@description, is_base_report=@isBaseReport,
              fields=@fields, chart_type=@chartType, group_by=@groupBy,
              aggregation=@aggregation, field_date_formats=@fieldDateFormats,
              field_expressions=@fieldExpressions, visible_filters=@visibleFilters,
              sort_config=@sortConfig, column_labels=@columnLabels,
              filter_description=@filterDescription,
              default_filter_values=@defaultFilterValues,
              field_color_rules=@fieldColorRules,
              updated_at=GETUTCDATE()
              WHERE id=@id`);

    const updated = await fetchReport(pool, req.params.id);
    await writeAudit(pool, {
      reportId: req.params.id,
      siteId: existing.siteId,
      changedBy: user.username,
      action: 'updated',
      summary: diffSummary(
        existing as unknown as Record<string, unknown>,
        (updated ?? {}) as unknown as Record<string, unknown>
      ),
      snapshotBefore: existing,
      snapshotAfter: updated ?? undefined,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PATCH /api/reports/:id/active ───────────────────────────────────────────
// Toggle active/inactive — site admins control visibility for their users
router.patch('/:id/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAppAdmin && !user.isSiteAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const pool = await getPool();
    const existing = await fetchReport(pool, req.params.id);
    if (!existing) { res.status(404).json({ error: 'Report not found' }); return; }

    if (!user.isAppAdmin && existing.siteId !== user.siteId) {
      res.status(403).json({ error: 'You can only manage reports for your own site' });
      return;
    }

    const { isActive } = req.body as { isActive: boolean };
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('isActive', sql.Bit, isActive ? 1 : 0)
      .query('UPDATE saved_reports SET is_active=@isActive, updated_at=GETUTCDATE() WHERE id=@id');

    const updated = await fetchReport(pool, req.params.id);
    await writeAudit(pool, {
      reportId: req.params.id,
      siteId: existing.siteId,
      changedBy: user.username,
      action: isActive ? 'activated' : 'deactivated',
      summary: `Report "${existing.name}" ${isActive ? 'activated' : 'deactivated'}`,
      snapshotBefore: existing,
      snapshotAfter: updated ?? undefined,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/reports/:id/clone ─────────────────────────────────────────────
// App admin only: clone a report template to one or more sites independently.
// Each site gets its own copy — they can customize it without affecting others.
router.post('/:id/clone', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const source = await fetchReport(pool, req.params.id);
    if (!source) { res.status(404).json({ error: 'Source report not found' }); return; }

    const { siteIds } = req.body as { siteIds: string[] };
    if (!Array.isArray(siteIds) || siteIds.length === 0) {
      res.status(400).json({ error: 'siteIds array required' });
      return;
    }

    const cloned: ReturnType<typeof rowToReport>[] = [];

    for (const siteId of siteIds) {
      const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await pool.request()
        .input('id', sql.NVarChar, newId)
        .input('name', sql.NVarChar, source.name)
        .input('description', sql.NVarChar, source.description ?? null)
        .input('siteId', sql.NVarChar, siteId)
        .input('parentReportId', sql.NVarChar, source.id)
        .input('createdBy', sql.NVarChar, req.user!.username)
        .input('fields', sql.NVarChar, JSON.stringify(source.fields))
        .input('chartType', sql.NVarChar, source.chartType)
        .input('groupBy', sql.NVarChar, source.groupBy)
        .input('aggregation', sql.NVarChar, source.aggregation)
        .input('fieldDateFormats', sql.NVarChar, JSON.stringify(source.fieldDateFormats))
        .input('fieldExpressions', sql.NVarChar, JSON.stringify(source.fieldExpressions))
        .input('visibleFilters', sql.NVarChar, JSON.stringify(source.visibleFilters))
        .input('sortConfig', sql.NVarChar, JSON.stringify(source.sortConfig))
        .input('columnLabels', sql.NVarChar, JSON.stringify(source.columnLabels))
        .input('filterDescription', sql.NVarChar, source.filterDescription ?? null)
        .input('defaultFilterValues', sql.NVarChar, JSON.stringify(source.defaultFilterValues))
        .input('fieldColorRules', sql.NVarChar, JSON.stringify(source.fieldColorRules))
        .query(`INSERT INTO saved_reports
                (id, name, description, is_base_report, site_id, is_active, parent_report_id,
                 created_by, fields, chart_type, group_by, aggregation, field_date_formats,
                 field_expressions, visible_filters, sort_config, column_labels,
                 filter_description, default_filter_values, field_color_rules)
                VALUES
                (@id, @name, @description, 0, @siteId, 1, @parentReportId,
                 @createdBy, @fields, @chartType, @groupBy, @aggregation, @fieldDateFormats,
                 @fieldExpressions, @visibleFilters, @sortConfig, @columnLabels,
                 @filterDescription, @defaultFilterValues, @fieldColorRules)`);

      const clone = await fetchReport(pool, newId);
      if (clone) cloned.push(clone);

      await writeAudit(pool, {
        reportId: newId,
        siteId,
        changedBy: req.user!.username,
        action: 'cloned',
        summary: `Cloned from template "${source.name}" (${source.id})`,
        snapshotAfter: clone ?? undefined,
      });
    }

    res.status(201).json(cloned);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/reports/:id/audit ───────────────────────────────────────────────
router.get('/:id/audit', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const pool = await getPool();
    const report = await fetchReport(pool, req.params.id);

    if (!report) { res.status(404).json({ error: 'Report not found' }); return; }

    // Site admins can only view audit for their own site's reports
    if (!user.isAppAdmin && report.siteId !== user.siteId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.request()
      .input('reportId', sql.NVarChar, req.params.id)
      .query(`SELECT id, report_id, site_id, changed_by, changed_at, action,
                     summary, snapshot_before, snapshot_after
              FROM report_audit_log
              WHERE report_id = @reportId
              ORDER BY changed_at DESC`);

    const entries = result.recordset.map((e) => ({
      id: e.id,
      reportId: e.report_id,
      siteId: e.site_id ?? null,
      changedBy: e.changed_by,
      changedAt: e.changed_at,
      action: e.action,
      summary: e.summary ?? undefined,
      snapshotBefore: e.snapshot_before ? JSON.parse(e.snapshot_before) : undefined,
      snapshotAfter: e.snapshot_after ? JSON.parse(e.snapshot_after) : undefined,
    }));

    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE /api/reports/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    if (!user.isAppAdmin && !user.isSiteAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const pool = await getPool();
    const existing = await fetchReport(pool, req.params.id);
    if (!existing) { res.status(404).json({ error: 'Report not found' }); return; }

    if (!user.isAppAdmin && existing.siteId !== user.siteId) {
      res.status(403).json({ error: 'You can only delete reports for your own site' });
      return;
    }

    // Write audit before delete (after delete, the record is gone)
    await writeAudit(pool, {
      reportId: req.params.id,
      siteId: existing.siteId,
      changedBy: user.username,
      action: 'deleted',
      summary: `Deleted report "${existing.name}"`,
      snapshotBefore: existing,
    });

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM saved_reports WHERE id = @id');

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
