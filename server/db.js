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
  } else {
    db = new SQL.Database();
    initSchema(db);
    saveDb(db);
  }

  return db;
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
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      rate_to_rmb REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS tariff_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_code TEXT NOT NULL,
      product_name_cn TEXT,
      product_name_en TEXT,
      export_hs_code TEXT,
      import_country TEXT NOT NULL,
      import_hs_code TEXT,
      tariff_rate REAL,
      declared_price_per_sku REAL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_sku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_code TEXT NOT NULL,
      destination TEXT NOT NULL,
      transport_mode TEXT NOT NULL,
      price_per_sku REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      destination TEXT NOT NULL,
      transport_mode TEXT NOT NULL,
      price_per_category REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS freight_by_category_only (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT NOT NULL,
      transport_mode TEXT NOT NULL,
      price_per_category REAL NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS last_mile_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_source TEXT,
      logistics_provider TEXT NOT NULL,
      country_name TEXT NOT NULL,
      warehouse_name TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
