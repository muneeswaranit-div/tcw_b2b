/**
 * ============================================================================
 * CYCLE WORLD (TCW B2B) - PRODUCTION NODE.JS BACKEND SERVER
 * ============================================================================
 * Provides HTTP static hosting and persistent relational JSON database storage.
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const DB_FILE_PATH = path.resolve(
  process.env.DATABASE_FILE || path.join(ROOT_DIR, 'database', 'cycleworld_db.json')
);

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // API: Health Check
  if (urlPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'Cycle World B2B Wholesale API' }));
    return;
  }

  // API: Get Persisted Relational Database State
  if (urlPath === '/api/db' && req.method === 'GET') {
    if (fs.existsSync(DB_FILE_PATH)) {
      const content = fs.readFileSync(DB_FILE_PATH, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(content);
    } else {
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ initialized: false }));
    }
    return;
  }

  // API: Sync & Persist Relational Database State
  if (urlPath === '/api/sync-db' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.users)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid relational database payload' }));
        return;
      }
      fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true });
      const temporaryPath = `${DB_FILE_PATH}.${process.pid}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(parsed, null, 2), 'utf8');
      fs.renameSync(temporaryPath, DB_FILE_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ saved: true, updatedAt: parsed.meta && parsed.meta.updatedAt }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static File Serving
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

  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    const ext = path.extname(absPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(absPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`============================================================`);
  console.log(` Cycle World B2B Wholesale Portal running at:`);
  console.log(` Port: ${PORT}`);
  console.log(` Database: ${DB_FILE_PATH}`);
  console.log(`============================================================`);
});
