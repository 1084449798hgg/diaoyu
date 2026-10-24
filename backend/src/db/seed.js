require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'fishing',
    password: process.env.DB_PASSWORD || 'fishing123',
    database: process.env.DB_NAME || 'fishing_app',
    multipleStatements: true,
  });
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);
  console.log('[seed] schema applied');
  // 幂等：清空业务表后重新插入演示数据
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['users','fishing_spots','fish_species_config','fish_encyclopedia','forecast_snapshots','catches','comments','likes','fishing_logs','reports']) {
    await conn.query(`TRUNCATE TABLE ${t}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  await conn.query(seed);
  console.log('[seed] demo data inserted');
  await conn.end();
}

main().catch((e) => { console.error('[seed] failed:', e.message); process.exit(1); });
