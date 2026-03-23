import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { getPool, sql } from '../db';
import { requireAppAdmin } from '../auth-middleware';

const router = Router();

const MASKED = '••••••••';

router.get('/', requireAppAdmin, async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, username, created_at FROM app_admins ORDER BY username');
    res.json(result.recordset.map(r => ({ id: r.id, username: r.username, password: MASKED })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) { res.status(400).json({ error: 'username and password required' }); return; }
    const id = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('username', sql.NVarChar, username)
      .input('hash', sql.NVarChar, hash)
      .query('INSERT INTO app_admins (id, username, password_hash) VALUES (@id, @username, @hash)');
    res.status(201).json({ id, username, password: MASKED });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const pool = await getPool();

    // Fetch current values so we can do a partial update
    const current = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('SELECT id, username FROM app_admins WHERE id = @id');
    if (!current.recordset.length) { res.status(404).json({ error: 'Admin not found' }); return; }
    const current_ = current.recordset[0];

    const newUsername = username?.trim() || current_.username;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.request()
        .input('id', sql.NVarChar, req.params.id)
        .input('username', sql.NVarChar, newUsername)
        .input('hash', sql.NVarChar, hash)
        .query('UPDATE app_admins SET username=@username, password_hash=@hash WHERE id=@id');
    } else {
      await pool.request()
        .input('id', sql.NVarChar, req.params.id)
        .input('username', sql.NVarChar, newUsername)
        .query('UPDATE app_admins SET username=@username WHERE id=@id');
    }

    res.json({ id: req.params.id, username: newUsername, password: MASKED });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', requireAppAdmin, async (req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const count = await pool.request().query('SELECT COUNT(*) as cnt FROM app_admins');
    if (count.recordset[0].cnt <= 1) {
      res.status(400).json({ error: 'Cannot delete the last admin' });
      return;
    }
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM app_admins WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
