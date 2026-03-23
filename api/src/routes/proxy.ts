/**
 * Server-side HTTP proxy for external APVe API calls.
 * Avoids browser CORS restrictions by forwarding requests server-to-server.
 *
 * URL format: /api/proxy/{host}/{...path}?{query}
 * Example:    /api/proxy/bwi.cloudids.aero/authApi/v1/api/Authentication/login
 */
import { Router, Request, Response } from 'express';
import axios from 'axios';
import https from 'https';

const router = Router();

// Reuse a single HTTPS agent (allows self-signed certs the same way the Vite dev proxy does)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

router.all('/:host/*', async (req: Request, res: Response) => {
  const host = req.params.host;

  // req.url inside this router is relative to its mount point and still contains /:host/...
  // Strip the leading "/{host}" to get just "/{path}?{query}"
  const afterHost = req.url.slice(1 + host.length) || '/';
  const targetUrl = `https://${host}${afterHost}`;

  // Forward a minimal set of headers — auth, content-type, accept
  const forwardHeaders: Record<string, string> = { host };
  if (req.headers['authorization'])  forwardHeaders['authorization']  = req.headers['authorization']  as string;
  if (req.headers['content-type'])   forwardHeaders['content-type']   = req.headers['content-type']   as string;
  if (req.headers['accept'])         forwardHeaders['accept']         = req.headers['accept']         as string;

  // req.body is a raw Buffer (set by express.raw middleware in index.ts)
  // Forward it byte-for-byte — no reparsing or re-serialisation
  let data: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length > 0) {
    data = req.body;
    forwardHeaders['content-length'] = data.length.toString();
  }

  console.log(`[proxy] ${req.method} ${targetUrl}`);

  // Allow caller to specify timeout via x-proxy-timeout header (seconds); default 120s
  const timeoutSeconds = parseInt(req.headers['x-proxy-timeout'] as string, 10);
  const timeoutMs = (!isNaN(timeoutSeconds) && timeoutSeconds > 0) ? timeoutSeconds * 1000 : 120000;

  try {
    const response = await axios({
      method: req.method as string,
      url: targetUrl,
      headers: forwardHeaders,
      data,
      httpsAgent,
      timeout: timeoutMs,
      responseType: 'arraybuffer',
      validateStatus: () => true, // pass every status code back to the client
    });

    res.status(response.status);
    const ct = response.headers['content-type'];
    if (ct) res.setHeader('Content-Type', ct);
    res.send(Buffer.from(response.data as ArrayBuffer));
  } catch (err) {
    console.error('[proxy error]', err);
    res.status(502).json({ error: 'Proxy error' });
  }
});

export default router;
