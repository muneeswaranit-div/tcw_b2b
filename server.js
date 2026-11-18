require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createPool, ensureSchema, loadState, saveState } = require('./database/mysql-store');

const ROOT_DIR = __dirname;
const PORT = Number.parseInt(process.env.PORT || '8081', 10);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf'
};

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > 25 * 1024 * 1024) {
        tooLarge = true;
        data = '';
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
      } else {
        resolve(data);
      }
    });
    req.on('error', reject);
  });
}

function isValidDatabaseState(state) {
  return (
    state &&
    typeof state === 'object' &&
    state.meta &&
    state.meta.schemaVersion === '2.0.0-clean' &&
    Array.isArray(state.products) &&
    Array.isArray(state.users)
  );
}

function isPrivateStaticPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/').toLowerCase();
  return (
    normalized === '.env' ||
    normalized.startsWith('.git/') ||
    normalized.startsWith('node_modules/') ||
    normalized === 'js/preloaded-db.js' ||
    normalized === 'database/cycleworld_db.json' ||
    normalized === 'database/cycleworld_db.backup.json'
  );
}

const pool = createPool();
const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (urlPath === '/api/health' && req.method === 'GET') {
    try {
      await pool.query('SELECT 1');
      sendJson(res, 200, { status: 'ok', service: 'Cycle World B2B Wholesale API' });
    } catch (err) {
      console.error('MySQL health check failed:', err.message);
      sendJson(res, 503, { status: 'unavailable', service: 'Cycle World B2B Wholesale API' });
    }
    return;
  }

  if (urlPath === '/api/db' && req.method === 'GET') {
    try {
      const state = await loadState(pool);
      if (!state) {
        sendJson(res, 200, { initialized: false });
        return;
      }
      sendJson(res, 200, state);
    } catch (err) {
      console.error('Unable to load application state from MySQL:', err.message);
      sendJson(res, 503, { error: 'Unable to load application data from MySQL.' });
    }
    return;
  }

  if (urlPath === '/api/sync-db' && req.method === 'POST') {
    try {
      const parsed = JSON.parse(await readBody(req));
      if (!isValidDatabaseState(parsed)) {
        sendJson(res, 400, { error: 'Invalid relational database payload.' });
        return;
      }
      await saveState(pool, parsed);
      sendJson(res, 200, {
        saved: true,
        updatedAt: parsed.meta.updatedAt
      });
    } catch (err) {
      if (err.statusCode === 413) {
        sendJson(res, 413, { error: 'Request body exceeds the 25 MB limit.' });
        return;
      }
      if (err instanceof SyntaxError) {
        sendJson(res, 400, { error: 'Request body must contain valid JSON.' });
        return;
      }
      console.error('Unable to save application state to MySQL:', err.message);
      sendJson(res, 503, { error: 'Unable to save application data to MySQL.' });
    }
    return;
  }

  const safeRelPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const absPath = path.resolve(ROOT_DIR, safeRelPath);
  const relativePath = path.relative(ROOT_DIR, absPath);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (isPrivateStaticPath(relativePath)) {
    res.writeHead(404);
    res.end('404 Not Found');
    return;
  }

  try {
    const stat = await fs.promises.stat(absPath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Unable to serve static file:', err.message);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

async function start() {
  await ensureSchema(pool);
  await pool.query('SELECT 1');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cycle World B2B server listening on port ${PORT} (MySQL storage).`);
  });
}

start().catch(async (err) => {
  console.error('Could not start the server. Check MySQL environment settings and connectivity.');
  console.error(err.message);
  await pool.end();
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await pool.end();
  });
}
