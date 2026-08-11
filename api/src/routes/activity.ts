import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getPool, sql } from '../db';
import { requireAuth, requireAppAdmin } from '../auth-middleware';

const router = Router();

async function getRetentionDays(pool: Awaited<ReturnType<typeof getPool>>): Promise<number> {
  const result = await pool.request()
    .query(`SELECT setting_value FROM app_settings WHERE setting_key = 'activity_log_retention_days'`);
  const raw = result.recordset[0]?.setting_value;
  const days = parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

async function purgeExpired(pool: Awaited<ReturnType<typeof getPool>>): Promise<void> {
  const days = await getRetentionDays(pool);
  await pool.request()
    .input('days', sql.Int, days)
    .query(`DELETE FROM user_activity_log WHERE log_time < DATEADD(day, -@days, GETUTCDATE())`);
}

// POST /api/activity/login — logs a site-user login. Requires a site-scoped token.
router.post('/login', requireAuth, async (req: Request, res: Response) => {
  try {
    const { username, siteId, isAppAdmin } = req.user!;
    if (isAppAdmin || !siteId) {
      res.status(400).json({ error: 'Not a site-user token' });
      return;
    }
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, randomUUID())
      .input('siteId', sql.NVarChar, siteId)
      .input('username', sql.NVarChar, username)
      .query(`INSERT INTO user_activity_log (id, site_id, username, activity_type)
              VALUES (@id, @siteId, @username, 'login')`);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/activity/load — logs a data-load/refresh with the fetched date range.
router.post('/load', requireAuth, async (req: Request, res: Response) => {
  try {
    const { username, siteId, isAppAdmin } = req.user!;
    if (isAppAdmin || !siteId) {
      res.status(400).json({ error: 'Not a site-user token' });
      return;
    }
    const { startDate, endDate } = req.body as { startDate?: string; endDate?: string };
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate required' });
      return;
    }
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, randomUUID())
      .input('siteId', sql.NVarChar, siteId)
      .input('username', sql.NVarChar, username)
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .query(`INSERT INTO user_activity_log (id, site_id, username, activity_type, load_start_date, load_end_date)
              VALUES (@id, @siteId, @username, 'data_load', @startDate, @endDate)`);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/activity?siteId=... — app-admin only. Purges expired rows, then returns the log for one site.
router.get('/', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const siteId = req.query.siteId as string | undefined;
    if (!siteId) {
      res.status(400).json({ error: 'siteId query param required' });
      return;
    }
    const pool = await getPool();
    await purgeExpired(pool);
    const result = await pool.request()
      .input('siteId', sql.NVarChar, siteId)
      .query(`SELECT TOP 5000 id, site_id, username, activity_type, log_time, load_start_date, load_end_date
              FROM user_activity_log WHERE site_id = @siteId ORDER BY log_time DESC`);
    res.json(result.recordset.map((r) => ({
      id: r.id,
      siteId: r.site_id,
      username: r.username,
      activityType: r.activity_type,
      logTime: r.log_time,
      loadStartDate: r.load_start_date,
      loadEndDate: r.load_end_date,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
