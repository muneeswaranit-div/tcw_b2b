require('dotenv').config();

const path = require('path');
const { createPool, ensureSchema, importLegacyFile } = require('./mysql-store');

async function main() {
  const filePath = path.resolve(
    process.argv[2] || path.join(__dirname, 'cycleworld_db.json')
  );
  const pool = createPool();
  try {
    await ensureSchema(pool);
    const imported = await importLegacyFile(pool, filePath);
    if (imported) {
      console.log('Legacy database state imported into MySQL.');
    } else {
      console.log('MySQL already contains application state; no data was overwritten.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Legacy database import failed:', err.message);
  process.exitCode = 1;
});
