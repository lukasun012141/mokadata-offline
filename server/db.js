/**
 * MokaData 离线版 - SQLite 数据库模块（使用 sql.js 纯 JS 实现）
 */
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../data/mokadata.db");

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    // 升级迁移：确保新表存在、旧表结构兼容
    migrateSchema(db);
  } else {
    db = new SQL.Database();
    initSchema(db);
    saveDb(db);
  }

  return db;
}

/**
 * 重建参数表：只保留 id / extra_fields / created_at / updated_at
 * SQLite 不支持 DROP COLUMN 或修改 NOT NULL 约束，需要建新表 → 迁移数据 → 删旧表 → 改名
 */
function rebuildParamTable(database, tableName) {
  try {
    // 检查表是否存在
    const exists = database.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
    );
    if (!exists || exists.length === 0 || exists[0].values.length === 0) return;

    // 检查表是否已经是新结构（只有 id/extra_fields/created_at/updated_at）
    const cols = database.exec(`PRAGMA table_info(${tableName})`);
    if (!cols || cols.length === 0) return;
    const colNames = cols[0].values.map(v => v[1]); // v[1] = name
    // 如果已经没有旧业务列（除了 id/extra_fields/created_at/updated_at），跳过重建
    const oldCols = colNames.filter(c => !["id","extra_fields","created_at","updated_at"].includes(c));
    if (oldCols.length === 0) return;

    // 建新表
    const tmpName = `${tableName}_new_v2`;
    database.run(`DROP TABLE IF EXISTS ${tmpName}`);
    database.run(`
      CREATE TABLE ${tmpName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        extra_fields TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      )
    `);

    // 迁移旧数据中的 extra_fields（如果有的话）
    // 注意：旧表可能没有 extra_fields / created_at / updated_at 列，需要动态判断
    const hasExtraFields = colNames.includes("extra_fields");
    const hasCreatedAt = colNames.includes("created_at");
    // updated_at 在旧表中可能不存在，用 CURRENT_TIMESTAMP 兜底
    if (hasExtraFields && hasCreatedAt) {
      database.run(`
        INSERT INTO ${tmpName} (id, extra_fields, created_at, updated_at)
        SELECT id, extra_fields, created_at, strftime('%s','now') * 1000 FROM ${tableName}
      `);
    } else if (hasExtraFields) {
      database.run(`
        INSERT INTO ${tmpName} (id, extra_fields, created_at, updated_at)
        SELECT id, extra_fields, strftime('%s','now') * 1000, strftime('%s','now') * 1000 FROM ${tableName}
      `);
    } else if (hasCreatedAt) {
      database.run(`
        INSERT INTO ${tmpName} (id, created_at, updated_at)
        SELECT id, created_at, strftime('%s','now') * 1000 FROM ${tableName}
      `);
    } else {
      // 旧表只有业务列，没有 extra_fields/created_at/updated_at，只迁移 id
      database.run(`
        INSERT INTO ${tmpName} (id)
        SELECT id FROM ${tableName}
      `);
    }

    // 删旧表，改名
    database.run(`DROP TABLE ${tableName}`);
    database.run(`ALTER TABLE ${tmpName} RENAME TO ${tableName}`);

    console.log(`[DB Migrate] Rebuilt table: ${tableName} (removed NOT NULL columns: ${oldCols.join(", ")})`);
  } catch (e) {
    console.error(`[DB Migrate] Failed to rebuild ${tableName}:`, e.message);
  }
}

function migrateSchema(database) {
  // 1. 确保 points_redemption_config 表存在（旧版可能没有）
  database.run(`
    CREATE TABLE IF NOT EXISTS points_redemption_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  // 2. 重建所有参数表，去掉 NOT NULL 旧列，只保留 id/extra_fields/created_at/updated_at
  const paramTables = [
    "exchange_rates",
    "tariff_configs",
    "freight_by_sku",
    "freight_by_category",
    "freight_by_category_only",
    "last_mile_configs",
    "points_redemption_config",
  ];
  for (const tbl of paramTables) {
    rebuildParamTable(database, tbl);
  }

  // 3. 确保 extra_fields 列存在（对于已经是新结构的表，或 sku_configs）
  const tablesForExtraFields = [
    "sku_configs", "exchange_rates", "tariff_configs",
    "freight_by_sku", "freight_by_category", "freight_by_category_only",
    "last_mile_configs", "points_redemption_config",
  ];
  for (const tbl of tablesForExtraFields) {
    try {
      database.run(`ALTER TABLE ${tbl} ADD COLUMN extra_fields TEXT`);
    } catch (e) {
      // 列已存在，忽略
    }
  }

  saveDb(database);
}

function saveDb(database) {
  const data = (database || db).export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS sku_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_code TEXT NOT NULL UNIQUE,
      sku_name_cn TEXT NOT NULL,
      sku_name_en TEXT,
      sku_category TEXT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS tariff_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_sku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_category_only (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS last_mile_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS points_redemption_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extra_fields TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      storage_key TEXT,
      mode TEXT DEFAULT 'desensitized',
      group_name TEXT,
      tags TEXT,
      uploaded_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] };
}

module.exports = { getDb, saveDb, query, run };
