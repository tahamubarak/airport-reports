import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import authRouter from './routes/auth';
import sitesRouter from './routes/sites';
import fieldsRouter from './routes/fields';
import reportsRouter from './routes/reports';
import adminsRouter from './routes/admins';
import proxyRouter from './routes/proxy';
import { runMigrations } from './db';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(compression());

// Raw body for proxy route — must be registered BEFORE express.json()
// The proxy forwards bytes as-is so we never reparse/reserialise the body
// (important for endpoints that expect a bare JSON string, e.g. "uuid-key")
app.use('/api/proxy', express.raw({ type: '*/*', limit: '10mb' }));

app.use(express.json());

// CORS only needed in dev (in prod, same origin via Container App)
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'] }));
}

// API routes
app.use('/api/auth', authRouter);
app.use('/api/sites', sitesRouter);
app.use('/api/sites/:siteId/fields', fieldsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admins', adminsRouter);

// Server-side proxy for external APVe API calls (avoids browser CORS restrictions)
// All external calls are routed through here: /api/proxy/{host}/{path}
app.use('/api/proxy', proxyRouter);

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  runMigrations().catch(console.error);
});

export default app;
