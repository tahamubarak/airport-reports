import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { requireAppAdmin } from '../auth-middleware';

const router = Router();

// ── Shared mapper ─────────────────────────────────────────────────────────────
function mapSite(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    iataCode: r.iata_code,
    siteId: r.site_id,
    baseUrl: r.base_url,
    description: (r.description as string) ?? undefined,
    adminUsers: JSON.parse((r.admin_users as string) ?? '[]'),
    enabled: !!r.enabled,
    serviceApiKey: (r.service_api_key as string) ?? undefined,
    fetchTimeoutSeconds: (r.fetch_timeout_seconds as number) ?? 60,
  };
}

const SITE_COLS = 'id, name, iata_code, site_id, base_url, description, admin_users, enabled, service_api_key, COALESCE(fetch_timeout_seconds, 60) AS fetch_timeout_seconds';

async function fetchSite(id: string) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query(`SELECT ${SITE_COLS} FROM sites WHERE id = @id`);
  return result.recordset[0] ? mapSite(result.recordset[0]) : null;
}

// GET /api/sites — public (needed for login IATA validation)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT ${SITE_COLS} FROM sites ORDER BY iata_code`
    );
    res.json(result.recordset.map(mapSite));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sites — app admin only
router.post('/', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { id, name, iataCode, siteId, baseUrl, description, adminUsers, enabled, serviceApiKey, fetchTimeoutSeconds } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('iataCode', sql.NVarChar, iataCode)
      .input('siteId', sql.NVarChar, siteId)
      .input('baseUrl', sql.NVarChar, baseUrl)
      .input('description', sql.NVarChar, description ?? null)
      .input('adminUsers', sql.NVarChar, JSON.stringify(adminUsers ?? []))
      .input('enabled', sql.Bit, enabled ? 1 : 0)
      .input('serviceApiKey', sql.NVarChar, serviceApiKey ?? null)
      .input('fetchTimeoutSeconds', sql.Int, fetchTimeoutSeconds ?? 60)
      .query(`INSERT INTO sites (id, name, iata_code, site_id, base_url, description, admin_users, enabled, service_api_key, fetch_timeout_seconds)
              VALUES (@id, @name, @iataCode, @siteId, @baseUrl, @description, @adminUsers, @enabled, @serviceApiKey, @fetchTimeoutSeconds)`);
    const site = await fetchSite(id);
    res.status(201).json(site);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/sites/:id — returns full updated site
router.put('/:id', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { name, iataCode, siteId, baseUrl, description, adminUsers, enabled, serviceApiKey, fetchTimeoutSeconds } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('iataCode', sql.NVarChar, iataCode)
      .input('siteId', sql.NVarChar, siteId)
      .input('baseUrl', sql.NVarChar, baseUrl)
      .input('description', sql.NVarChar, description ?? null)
      .input('adminUsers', sql.NVarChar, JSON.stringify(adminUsers ?? []))
      .input('enabled', sql.Bit, enabled ? 1 : 0)
      .input('serviceApiKey', sql.NVarChar, serviceApiKey ?? null)
      .input('fetchTimeoutSeconds', sql.Int, fetchTimeoutSeconds ?? 60)
      .query(`UPDATE sites SET name=@name, iata_code=@iataCode, site_id=@siteId, base_url=@baseUrl,
              description=@description, admin_users=@adminUsers, enabled=@enabled,
              service_api_key=@serviceApiKey, fetch_timeout_seconds=@fetchTimeoutSeconds,
              updated_at=GETUTCDATE() WHERE id=@id`);
    const site = await fetchSite(req.params.id);
    if (!site) { res.status(404).json({ error: 'Site not found' }); return; }
    res.json(site);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/sites/:id
router.delete('/:id', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM sites WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
