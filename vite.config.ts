import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import https from 'https';
import type { IncomingMessage, ServerResponse } from 'http';

// ─── Custom multi-host proxy plugin ───────────────────────────────────────────
// Vite's built-in proxy reuses connections across different target hosts, which
// causes requests intended for RDU to be sent over an existing BWI connection.
// This custom middleware opens a fresh HTTPS connection per request, guaranteeing
// the correct host receives each call.

const multiHostProxyPlugin = {
  name: 'multi-host-proxy',
  configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
    server.middlewares.use('/api-proxy', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      // URL format: /api-proxy/{host}/{path...}?{query}
      const raw = req.url || '';
      const match = raw.match(/^\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
      if (!match) { next(); return; }

      const targetHost = match[1];
      const targetPath = match[2] || '/';
      const targetQuery = match[3] || '';

      // Collect request body
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks) : null;

        // Build forwarded headers — keep auth, content-type, accept; drop browser-specific ones
        const forwardHeaders: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          const lower = k.toLowerCase();
          if (['host', 'origin', 'referer', 'connection', 'transfer-encoding'].includes(lower)) continue;
          forwardHeaders[k] = v;
        }
        forwardHeaders['host'] = targetHost;
        if (body) forwardHeaders['content-length'] = String(body.length);

        const options: https.RequestOptions = {
          hostname: targetHost,
          port: 443,
          path: targetPath + targetQuery,
          method: req.method,
          headers: forwardHeaders,
          rejectUnauthorized: false, // allow self-signed certs in dev
        };

        console.log(`[proxy] ${req.method} https://${targetHost}${targetPath}${targetQuery}`);

        const proxyReq = https.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          console.error('[proxy error]', err.message);
          if (!res.headersSent) {
            res.writeHead(502);
            res.end(`Proxy error: ${err.message}`);
          }
        });

        if (body) proxyReq.write(body);
        proxyReq.end();
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), multiHostProxyPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
          'xlsx': ['xlsx'],
          'ui-vendor': ['lucide-react', 'react-hot-toast', 'react-datepicker'],
          'state': ['zustand', 'axios', 'date-fns'],
        },
      },
    },
  },
});
