import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool, sql } from '../db';
import { signToken } from '../jwt';
import { requireAuth } from '../auth-middleware';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT id, username, password_hash FROM app_admins WHERE username = @username');

    const admin = result.recordset[0];
    if (!admin) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const token = signToken({ username: admin.username, isAppAdmin: true });
    res.json({ token, username: admin.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/site-token
// Called after a successful APVe login on the frontend.
// Looks up the site, determines site admin status, and issues an app-scoped JWT.
router.post('/site-token', async (req: Request, res: Response) => {
  try {
    const { username, siteId } = req.body as { username: string; siteId: string };
    if (!username || !siteId) {
      res.status(400).json({ error: 'username and siteId required' });
      return;
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('siteId', sql.NVarChar, siteId)
      .query('SELECT id, admin_users, enabled FROM sites WHERE id = @siteId');
    const site = result.recordset[0];
    if (!site || !site.enabled) {
      res.status(404).json({ error: 'Site not found or disabled' });
      return;
    }
    const adminUsers: string[] = JSON.parse(site.admin_users ?? '[]');
    const isSiteAdmin = adminUsers.map((u: string) => u.toLowerCase()).includes(username.toLowerCase());
    const token = signToken({ username, isAppAdmin: false, isSiteAdmin, siteId });
    res.json({ token, username, isSiteAdmin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/refresh-site-token
// Refreshes a site token (re-reads admin_users in case it changed).
router.post('/refresh-site-token', requireAuth, async (req: Request, res: Response) => {
  try {
    const { username, siteId } = req.user!;
    if (!siteId || !username) {
      res.status(400).json({ error: 'Not a site token' });
      return;
    }
    const pool = await getPool();
    const result = await pool.request()
      .input('siteId', sql.NVarChar, siteId)
      .query('SELECT id, admin_users, enabled FROM sites WHERE id = @siteId');
    const site = result.recordset[0];
    if (!site || !site.enabled) {
      res.status(404).json({ error: 'Site not found or disabled' });
      return;
    }
    const adminUsers: string[] = JSON.parse(site.admin_users ?? '[]');
    const isSiteAdmin = adminUsers.map((u: string) => u.toLowerCase()).includes(username.toLowerCase());
    const token = signToken({ username, isAppAdmin: false, isSiteAdmin, siteId });
    res.json({ token, username, isSiteAdmin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
