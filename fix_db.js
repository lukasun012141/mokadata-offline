/**
 * MokaData 数据库一键修复脚本
 * 用途：重建所有参数表，去掉旧的 NOT NULL 列，保留已有数据
 * 运行：node fix_db.js（在 MokaData 安装目录下运行）
 */
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "mokadata.db");

async function main() {
  console.log("=== MokaData 数据库修复工具 ===");
  console.log("数据库路径:", DB_PATH);

  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ 找不到数据库文件:", DB_PATH);
    console.log("请确认 MokaData 已经启动过至少一次，且数据库文件存在。");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  // 需要重建的参数表
  const paramTables = [
    "exchange_rates",
    "tariff_configs",
    "freight_by_sku",
    "freight_by_category",
    "freight_by_category_only",
    "last_mile_configs",
    "points_redemption_config",
  ];

  let fixedCount = 0;
  let skippedCount = 0;

  for (const tableName of paramTables) {
    try {
      // 检查表是否存在
      const exists = db.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      if (!exists || exists.length === 0 || exists[0].values.length === 0) {
        console.log(`  ⚠️  ${tableName}：表不存在，跳过`);
        skippedCount++;
        continue;
      }

      // 检查列结构
      const cols = db.exec(`PRAGMA table_info(${tableName})`);
      if (!cols || cols.length === 0) { skippedCount++; continue; }
      const colNames = cols[0].values.map(v => v[1]);
      const oldCols = colNames.filter(c => !["id","extra_fields","created_at","updated_at"].includes(c));

      if (oldCols.length === 0) {
        console.log(`  ✅  ${tableName}：已是新结构，无需修复`);
        skippedCount++;
        continue;
      }

      console.log(`  🔧  ${tableName}：发现旧列 [${oldCols.join(", ")}]，开始重建...`);

      // 查询旧数据条数
      const countRes = db.exec(`SELECT COUNT(*) FROM ${tableName}`);
      const rowCount = countRes[0]?.values[0]?.[0] || 0;
      console.log(`      旧数据：${rowCount} 条`);

      // 建新表
      const tmpName = `${tableName}_fix_tmp`;
      db.run(`DROP TABLE IF EXISTS ${tmpName}`);
      db.run(`
        CREATE TABLE ${tmpName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          extra_fields TEXT,
          created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
          updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
        )
      `);

      // 迁移数据
      const hasExtraFields = colNames.includes("extra_fields");
      if (hasExtraFields) {
        db.run(`INSERT INTO ${tmpName} (id, extra_fields, created_at, updated_at)
                SELECT id, extra_fields, created_at, updated_at FROM ${tableName}`);
      } else {
        db.run(`INSERT INTO ${tmpName} (id, created_at, updated_at)
                SELECT id, created_at, updated_at FROM ${tableName}`);
      }

      // 验证迁移条数
      const newCountRes = db.exec(`SELECT COUNT(*) FROM ${tmpName}`);
      const newCount = newCountRes[0]?.values[0]?.[0] || 0;

      // 删旧表，改名
      db.run(`DROP TABLE ${tableName}`);
      db.run(`ALTER TABLE ${tmpName} RENAME TO ${tableName}`);

      console.log(`      ✅  重建完成，迁移数据：${newCount} 条`);
      fixedCount++;
    } catch (e) {
      console.error(`  ❌  ${tableName} 修复失败:`, e.message);
    }
  }

  // 保存数据库
  console.log("\n正在保存数据库...");
  const data = db.export();
  const buf = Buffer.from(data);
  // 先备份原文件
  const backupPath = DB_PATH + ".bak_" + Date.now();
  fs.copyFileSync(DB_PATH, backupPath);
  console.log("已备份原数据库到:", backupPath);
  fs.writeFileSync(DB_PATH, buf);
  console.log("✅ 数据库保存成功！");

  console.log(`\n=== 修复完成 ===`);
  console.log(`修复表数量：${fixedCount}`);
  console.log(`跳过表数量：${skippedCount}`);
  console.log(`\n请重新启动 MokaData（双击 start.bat），然后重新上传 Excel 文件。`);
}

main().catch(e => {
  console.error("脚本运行出错:", e.message);
  process.exit(1);
});
