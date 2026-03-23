import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { requireAppAdmin } from '../auth-middleware';

const router = Router({ mergeParams: true });

// ── Shared mapper ─────────────────────────────────────────────────────────────
function mapField(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    label: r.label,
    type: r.type,
    dateFormat: (r.date_format as string) ?? undefined,
    enabled: !!r.enabled,
    isBuiltIn: !!r.is_built_in,
    sortOrder: r.sort_order ?? 0,
    expression: r.expression ? JSON.parse(r.expression as string) : undefined,
    colorRules: JSON.parse((r.color_rules as string) ?? '[]'),
  };
}

async function fetchField(fieldId: string) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar, fieldId)
    .query(`SELECT id, site_id, name, label, type, date_format, enabled, is_built_in, sort_order, expression, color_rules
            FROM site_field_definitions WHERE id = @id`);
  return result.recordset[0] ? mapField(result.recordset[0]) : null;
}

// GET /api/sites/:siteId/fields
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('siteId', sql.NVarChar, req.params.siteId)
      .query(`SELECT id, site_id, name, label, type, date_format, enabled, is_built_in, sort_order, expression, color_rules
              FROM site_field_definitions WHERE site_id = @siteId ORDER BY sort_order, label`);
    res.json(result.recordset.map(mapField));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sites/:siteId/fields — returns full created field
router.post('/', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { id, name, label, type, dateFormat, enabled, isBuiltIn, sortOrder, expression, colorRules } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('siteId', sql.NVarChar, req.params.siteId)
      .input('name', sql.NVarChar, name)
      .input('label', sql.NVarChar, label)
      .input('type', sql.NVarChar, type)
      .input('dateFormat', sql.NVarChar, dateFormat ?? null)
      .input('enabled', sql.Bit, enabled ? 1 : 0)
      .input('isBuiltIn', sql.Bit, isBuiltIn ? 1 : 0)
      .input('sortOrder', sql.Int, sortOrder ?? 0)
      .input('expression', sql.NVarChar, expression ? JSON.stringify(expression) : null)
      .input('colorRules', sql.NVarChar, JSON.stringify(colorRules ?? []))
      .query(`INSERT INTO site_field_definitions (id, site_id, name, label, type, date_format, enabled, is_built_in, sort_order, expression, color_rules)
              VALUES (@id, @siteId, @name, @label, @type, @dateFormat, @enabled, @isBuiltIn, @sortOrder, @expression, @colorRules)`);
    const field = await fetchField(id);
    res.status(201).json(field);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/sites/:siteId/fields/:fieldId — returns full updated field
router.put('/:fieldId', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { label, type, dateFormat, enabled, sortOrder, expression, colorRules } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, req.params.fieldId)
      .input('label', sql.NVarChar, label)
      .input('type', sql.NVarChar, type)
      .input('dateFormat', sql.NVarChar, dateFormat ?? null)
      .input('enabled', sql.Bit, enabled ? 1 : 0)
      .input('sortOrder', sql.Int, sortOrder ?? 0)
      .input('expression', sql.NVarChar, expression ? JSON.stringify(expression) : null)
      .input('colorRules', sql.NVarChar, JSON.stringify(colorRules ?? []))
      .query(`UPDATE site_field_definitions SET label=@label, type=@type, date_format=@dateFormat,
              enabled=@enabled, sort_order=@sortOrder, expression=@expression, color_rules=@colorRules,
              updated_at=GETUTCDATE()
              WHERE id=@id`);
    const field = await fetchField(req.params.fieldId);
    if (!field) { res.status(404).json({ error: 'Field not found' }); return; }
    res.json(field);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/sites/:siteId/fields/:fieldId
router.delete('/:fieldId', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, req.params.fieldId)
      .query('DELETE FROM site_field_definitions WHERE id = @id AND is_built_in = 0');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
