import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { requireAppAdmin } from '../auth-middleware';

const router = Router();

// GET /api/settings — app-admin only
router.get('/', requireAppAdmin, async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`SELECT setting_value FROM app_settings WHERE setting_key = 'activity_log_retention_days'`);
    const days = parseInt(result.recordset[0]?.setting_value, 10);
    res.json({ activityLogRetentionDays: Number.isFinite(days) && days > 0 ? days : 30 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings — app-admin only
router.put('/', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { activityLogRetentionDays } = req.body as { activityLogRetentionDays?: number };
    const days = Number(activityLogRetentionDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      res.status(400).json({ error: 'activityLogRetentionDays must be between 1 and 3650' });
      return;
    }
    const pool = await getPool();
    await pool.request()
      .input('value', sql.NVarChar, String(Math.round(days)))
      .query(`UPDATE app_settings SET setting_value = @value, updated_at = GETUTCDATE()
              WHERE setting_key = 'activity_log_retention_days'`);
    res.json({ activityLogRetentionDays: Math.round(days) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
