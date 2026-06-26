/**
 * MokaData 离线版 - Express 服务器入口
 * 无需外网，无需 Manus 账号，本地 SQLite 存储
 */
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
const superjson = require("superjson");
const { getDb, query, run, saveDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 3737;

app.use(compression());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ─── 离线用户（模拟已登录，跳过 OAuth）─────────────────────────────────────
const OFFLINE_USER = {
  id: 1,
  openId: "offline-user",
  name: "本地用户",
  email: "local@mokadata.local",
  role: "admin",
  loginMethod: "offline",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastSignedIn: new Date().toISOString(),
};

// 字段名映射：下划线 → 驼峰（与在线版 Drizzle ORM 保持一致）
function mapSkuRow(r) { return { id: r.id, skuCode: r.sku_code, skuNameCn: r.sku_name_cn, skuNameEn: r.sku_name_en, skuCategory: r.sku_category, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapExchangeRateRow(r) { return { id: r.id, period: r.period, country: r.country, currency: r.currency, rateToRmb: r.rate_to_rmb, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapTariffRow(r) { return { id: r.id, skuCode: r.sku_code, productNameCn: r.product_name_cn, productNameEn: r.product_name_en, exportHsCode: r.export_hs_code, importCountry: r.import_country, importHsCode: r.import_hs_code, tariffRate: r.tariff_rate, declaredPricePerSku: r.declared_price_per_sku, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapFreightBySkuRow(r) { return { id: r.id, skuCode: r.sku_code, destination: r.destination, transportMode: r.transport_mode, pricePerSku: r.price_per_sku, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapFreightByCategoryRow(r) { return { id: r.id, categoryName: r.category_name, destination: r.destination, transportMode: r.transport_mode, pricePerCategory: r.price_per_category, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapFreightByCategoryOnlyRow(r) { return { id: r.id, categoryName: r.category_name, transportMode: r.transport_mode, pricePerCategory: r.price_per_category, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapLastMileRow(r) { return { id: r.id, fileSource: r.file_source, logisticsProvider: r.logistics_provider, countryName: r.country_name, warehouseName: r.warehouse_name, createdAt: r.created_at, updatedAt: r.updated_at }; }
function mapPointsRedemptionRow(r) { return { id: r.id, redemptionSkuCode: r.redemption_sku_code, redemptionSkuName: r.redemption_sku_name, site: r.site, redemptionCategory: r.redemption_category, price: r.price, currency: r.currency, pointsRequired: r.points_required, pointsPerCurrencyUnit: r.points_per_currency_unit, createdAt: r.created_at, updatedAt: r.updated_at }; }

// tRPC + superjson 标准批量响应格式
// 前端使用 superjson transformer，响应必须包含 {json, meta} 结构
const trpcOk = (data) => {
  const serialized = superjson.serialize(data);
  return [{ result: { data: serialized } }];
};
const trpcErr = (message) => [{ error: { message, code: "INTERNAL_SERVER_ERROR" } }];

// 解析 tRPC 输入参数
function parseTrpcInput(req) {
  if (req.method === "GET") {
    try {
      const raw = req.query.input;
      return raw ? JSON.parse(decodeURIComponent(raw)) : {};
    } catch { return {}; }
  }
  // POST batch 格式：body["0"].json
  const body = req.body;
  if (body && body["0"] && body["0"].json !== undefined) return body["0"].json;
  if (body && body.json !== undefined) return body.json;
  return body || {};
}

// ─── tRPC 拦截中间件 ─────────────────────────────────────────────────────────
app.use("/api/trpc", async (req, res) => {
  const routePath = req.path.replace(/^\//, "");
  const input = parseTrpcInput(req);

  try {
    await getDb(); // 确保 db 已初始化

    // ── auth ──────────────────────────────────────────────────────────────────
    if (routePath.includes("auth.me")) {
      return res.json(trpcOk(OFFLINE_USER));
    }
    if (routePath.includes("auth.logout")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── files ─────────────────────────────────────────────────────────────────
    if (routePath.includes("files.list")) {
      const rows = query("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC LIMIT 100");
      const files = rows.map(r => ({
        id: r.id,
        userId: 1,
        name: r.original_name,
        originalName: r.original_name,
        fileType: (r.original_name || "").endsWith(".xlsx") || (r.original_name || "").endsWith(".xls") ? "excel"
          : (r.original_name || "").endsWith(".csv") ? "csv"
          : (r.original_name || "").endsWith(".docx") || (r.original_name || "").endsWith(".doc") ? "word" : "other",
        mode: r.mode || "desensitized",
        storageKey: r.storage_key,
        storageUrl: `/api/files/download/${r.id}`,
        fileSize: r.file_size,
        tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
        groupName: r.group_name || null,
        version: 1,
        isLatest: true,
        parseStatus: "done",
        createdAt: new Date(r.uploaded_at || Date.now()),
        updatedAt: new Date(r.uploaded_at || Date.now()),
      }));
      return res.json(trpcOk({ files }));
    }
    if (routePath.includes("files.delete")) {
      const fileId = input?.fileId;
      if (fileId) run("DELETE FROM uploaded_files WHERE id=?", [fileId]);
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("files.parse")) {
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("files.getVersions")) {
      return res.json(trpcOk({ success: true, versions: [] }));
    }
    if (routePath.includes("files.preview")) {
      const XLSX = require("xlsx");
      const fs = require("fs");
      const fileId = input?.fileId || (input && input["0"]?.json?.fileId);
      const sheetName = input?.sheetName;
      const maxRows = input?.maxRows || 50;
      if (!fileId) return res.json(trpcOk({ sheets: [], currentSheet: "", columns: [], rows: [], totalRows: 0, message: "未指定文件" }));
      const rows = query("SELECT * FROM uploaded_files WHERE id=?", [fileId]);
      if (!rows.length) return res.json(trpcOk({ sheets: [], currentSheet: "", columns: [], rows: [], totalRows: 0, message: "文件不存在" }));
      const fileRow = rows[0];
      const ext = (fileRow.original_name || "").split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext || "")) {
        return res.json(trpcOk({ sheets: [], currentSheet: "", columns: [], rows: [], totalRows: 0, fileType: ext, message: "该文件类型暂不支持预览，仅支持 Excel (.xlsx/.xls) 和 CSV 文件" }));
      }
      const UPLOAD_DIR = require("path").join(__dirname, "../data/uploads");
      const filePath = require("path").join(UPLOAD_DIR, fileRow.storage_key);
      if (!fs.existsSync(filePath)) {
        return res.json(trpcOk({ sheets: [], currentSheet: "", columns: [], rows: [], totalRows: 0, message: "文件已丢失，请重新上传" }));
      }
      try {
        const wb = XLSX.readFile(filePath, { cellDates: true });
        const sheetNames = wb.SheetNames;
        const targetSheet = sheetName || sheetNames[0];
        const ws = wb.Sheets[targetSheet];
        if (!ws) return res.json(trpcOk({ sheets: sheetNames, currentSheet: targetSheet, columns: [], rows: [], totalRows: 0, message: `工作表 "${targetSheet}" 为空` }));
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
        const headerRow = jsonData[0] || [];
        const columns = headerRow.map((h, i) => ({ key: String(i), label: (h !== null && h !== undefined) ? String(h) : `列${i+1}` }));
        const dataRows = jsonData.slice(1, maxRows + 1).map(row => Object.fromEntries(columns.map((col, i) => [col.key, row[i] ?? null])));
        return res.json(trpcOk({ sheets: sheetNames, currentSheet: targetSheet, columns, rows: dataRows, totalRows: jsonData.length - 1, fileType: ext, message: null }));
      } catch (e) {
        return res.json(trpcOk({ sheets: [], currentSheet: "", columns: [], rows: [], totalRows: 0, message: `解析失败: ${e.message}` }));
      }
    }

    // ── workflows ─────────────────────────────────────────────────────────────
    if (routePath.includes("workflows.list")) {
      return res.json(trpcOk({ workflows: [] }));
    }
    if (routePath.includes("workflows.")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── dashboards ────────────────────────────────────────────────────────────
    if (routePath.includes("dashboards.list")) {
      return res.json(trpcOk({ dashboards: [] }));
    }
    if (routePath.includes("dashboards.")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── business ──────────────────────────────────────────────────────────────
    if (routePath.includes("business.")) {
      return res.json(trpcOk({ data: [], total: 0 }));
    }

    // ── reports ───────────────────────────────────────────────────────────────
    if (routePath.includes("reports.list")) {
      return res.json(trpcOk({ reports: [] }));
    }
    if (routePath.includes("reports.")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── knowledge ─────────────────────────────────────────────────────────────
    if (routePath.includes("knowledge.list")) {
      return res.json(trpcOk({ items: [] }));
    }
    if (routePath.includes("knowledge.")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── params.sku ────────────────────────────────────────────────────────────
    if (routePath.includes("params.listSku")) {  // matches both listSku and listSkus
      const rows = query("SELECT * FROM sku_configs ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapSkuRow)));
    }
    if (routePath.includes("params.upsertSku")) {
      if (input?.skuCode) {
        const existing = query("SELECT id FROM sku_configs WHERE sku_code=?", [input.skuCode]);
        if (existing.length > 0) {
          run("UPDATE sku_configs SET sku_name_cn=?, sku_name_en=?, sku_category=?, updated_at=? WHERE sku_code=?",
            [input.skuNameCn, input.skuNameEn, input.skuCategory, Date.now(), input.skuCode]);
        } else {
          run("INSERT INTO sku_configs (sku_code, sku_name_cn, sku_name_en, sku_category) VALUES (?,?,?,?)",
            [input.skuCode, input.skuNameCn, input.skuNameEn, input.skuCategory]);
        }
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteSku")) {
      if (input?.id) run("DELETE FROM sku_configs WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.exchangeRate ───────────────────────────────────────────────────
    if (routePath.includes("params.listExchangeRate")) {  // matches both listExchangeRate and listExchangeRates
      const rows = query("SELECT * FROM exchange_rates ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapExchangeRateRow)));
    }
    if (routePath.includes("params.upsertExchangeRate")) {
      if (input) {
        run("INSERT INTO exchange_rates (period, country, currency, rate_to_rmb) VALUES (?,?,?,?)",
          [input.period, input.country, input.currency, input.rateToRmb]);
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteExchangeRate")) {
      if (input?.id) run("DELETE FROM exchange_rates WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.tariff ─────────────────────────────────────────────────────────
    if (routePath.includes("params.listTariff")) {  // matches both listTariff and listTariffs
      const rows = query("SELECT * FROM tariff_configs ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapTariffRow)));
    }
    if (routePath.includes("params.upsertTariff")) {
      if (input) {
        run("INSERT INTO tariff_configs (sku_code, product_name_cn, product_name_en, export_hs_code, import_country, import_hs_code, tariff_rate, declared_price_per_sku) VALUES (?,?,?,?,?,?,?,?)",
          [input.skuCode, input.productNameCn, input.productNameEn, input.exportHsCode, input.importCountry, input.importHsCode, input.tariffRate, input.declaredPricePerSku]);
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteTariff")) {
      if (input?.id) run("DELETE FROM tariff_configs WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.freightBySku ───────────────────────────────────────────────────
    if (routePath.includes("params.listFreightBySku")) {
      const rows = query("SELECT * FROM freight_by_sku ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapFreightBySkuRow)));
    }
    if (routePath.includes("params.upsertFreightBySku")) {
      if (input) {
        run("INSERT INTO freight_by_sku (sku_code, destination, transport_mode, price_per_sku) VALUES (?,?,?,?)",
          [input.skuCode, input.destination, input.transportMode, input.pricePerSku]);
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteFreightBySku")) {
      if (input?.id) run("DELETE FROM freight_by_sku WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.freightByCategory ──────────────────────────────────────────────
    if (routePath.includes("params.listFreightByCategory")) {
      const rows = query("SELECT * FROM freight_by_category ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapFreightByCategoryRow)));
    }
    if (routePath.includes("params.upsertFreightByCategory")) {
      if (input) {
        run("INSERT INTO freight_by_category (category_name, destination, transport_mode, price_per_category) VALUES (?,?,?,?)",
          [input.categoryName, input.destination, input.transportMode, input.pricePerCategory]);
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteFreightByCategory")) {
      if (input?.id) run("DELETE FROM freight_by_category WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.freightByCategoryOnly ──────────────────────────────────────────
    if (routePath.includes("params.listFreightByCategoryOnly")) {
      const rows = query("SELECT * FROM freight_by_category_only ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapFreightByCategoryOnlyRow)));
    }
    if (routePath.includes("params.upsertFreightByCategoryOnly")) {
      if (input) {
        run("INSERT INTO freight_by_category_only (category_name, transport_mode, price_per_category) VALUES (?,?,?)",
          [input.categoryName, input.transportMode, input.pricePerCategory]);
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deleteFreightByCategoryOnly")) {
      if (input?.id) run("DELETE FROM freight_by_category_only WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.lastMile ───────────────────────────────────────────────────────
    if (routePath.includes("params.listLastMile")) {
      const rows = query("SELECT * FROM last_mile_configs ORDER BY id DESC");
      return res.json(trpcOk(rows.map(mapLastMileRow)));
    }
    if (routePath.includes("params.upsertLastMile")) {
      if (input) {
        run("INSERT INTO last_mile_configs (file_source, logistics_provider, country_name, warehouse_name) VALUES (?,?,?,?)",
          [input.fileSource, input.logisticsProvider, input.countryName, input.warehouseName]);
      }
      return res.json(trpcOk({ success: true }));
    }
        if (routePath.includes("params.deleteLastMile")) {
      if (input?.id) run("DELETE FROM last_mile_configs WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }

    // ── params.pointsRedemption ──────────────────────────────────────────
    if (routePath.includes("params.listPointsRedemption")) {
      const rows = query("SELECT * FROM points_redemption_config ORDER BY site, redemption_sku_code");
      return res.json(trpcOk(rows.map(mapPointsRedemptionRow)));
    }
    if (routePath.includes("params.upsertPointsRedemption")) {
      if (input) {
        if (input.id) {
          run("UPDATE points_redemption_config SET redemption_sku_code=?, redemption_sku_name=?, site=?, redemption_category=?, price=?, currency=?, points_required=?, points_per_currency_unit=?, updated_at=? WHERE id=?",
            [input.redemptionSkuCode, input.redemptionSkuName, input.site, input.redemptionCategory || null, parseFloat(input.price) || 0, input.currency, parseInt(input.pointsRequired) || 0, input.pointsPerCurrencyUnit != null ? parseFloat(input.pointsPerCurrencyUnit) : null, Date.now(), input.id]);
        } else {
          run("INSERT INTO points_redemption_config (redemption_sku_code, redemption_sku_name, site, redemption_category, price, currency, points_required, points_per_currency_unit) VALUES (?,?,?,?,?,?,?,?)",
            [input.redemptionSkuCode, input.redemptionSkuName, input.site, input.redemptionCategory || null, parseFloat(input.price) || 0, input.currency, parseInt(input.pointsRequired) || 0, input.pointsPerCurrencyUnit != null ? parseFloat(input.pointsPerCurrencyUnit) : null]);
        }
      }
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.deletePointsRedemption")) {
      if (input?.id) run("DELETE FROM points_redemption_config WHERE id=?", [input.id]);
      return res.json(trpcOk({ success: true }));
    }
    if (routePath.includes("params.downloadPointsRedemptionTemplate")) {
      const XLSX = require("xlsx");
      const wb = XLSX.utils.book_new();
      const headers = [["兑换SKU编码", "兑换SKU名称", "站点", "兑换大类", "价格", "币种", "兑换所需积分", "单位货币所需积分"]];
      const ws = XLSX.utils.aoa_to_sheet(headers);
      ws["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "积分兑换匹配表");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return res.json(trpcOk({ base64: Buffer.from(buf).toString("base64"), filename: "积分兑换匹配表_模板.xlsx" }));
    }
    if (routePath.includes("params.importPointsRedemption")) {
      if (input?.base64) {
        const XLSX = require("xlsx");
        const buf = Buffer.from(input.base64, "base64");
        const wb = XLSX.read(buf, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const dataRows = rows.slice(1).filter(r => r[0]);
        if (input.mode === "overwrite") run("DELETE FROM points_redemption_config");
        let imported = 0;
        for (const row of dataRows) {
          try {
            run("INSERT INTO points_redemption_config (redemption_sku_code, redemption_sku_name, site, redemption_category, price, currency, points_required, points_per_currency_unit) VALUES (?,?,?,?,?,?,?,?)",
              [String(row[0] ?? ""), String(row[1] ?? ""), String(row[2] ?? ""), row[3] ? String(row[3]) : null, parseFloat(row[4]) || 0, String(row[5] ?? "USD"), parseInt(row[6]) || 0, row[7] != null ? parseFloat(row[7]) : null]);
            imported++;
          } catch(e) {}
        }
        return res.json(trpcOk({ success: true, imported }));
      }
      return res.json(trpcOk({ success: true, imported: 0 }));
    }
    // ── system ────────────────────────────────────────────────────────────────
    if (routePath.includes("system.")) {
      return res.json(trpcOk({ success: true }));
    }

    // ── 兜底 ──────────────────────────────────────────────────────────────────
    console.log(`[tRPC] 未处理路由: ${routePath}`);
    return res.json(trpcOk(null));

  } catch (err) {
    console.error(`[tRPC Error] ${routePath}:`, err.message);
    return res.status(500).json(trpcErr(err.message));
  }
});

// 初始化数据库
getDb().then(() => {
  console.log("✅ 数据库初始化完成");

  // 挂载文件上传路由
  const uploadRouter = require("./uploadRouter");
  app.use("/api/upload", uploadRouter);
  app.use("/api/files", uploadRouter);

  // 挂载参数配置 Excel 路由
  const paramsRouter = require("./paramsRouter");
  app.use("/api/params", paramsRouter);

  // 健康检查
  app.get("/api/health", (req, res) => res.json({ status: "ok", version: "1.0.0" }));

  // 托管前端静态文件
  const distPath = path.join(__dirname, "../client/dist");
  app.use(express.static(distPath));

  // SPA fallback：所有未匹配路由返回 index.html
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║     MokaData 财务数据分析平台 - 离线版       ║");
    console.log("╠══════════════════════════════════════════════╣");
    console.log(`║  本地访问: http://localhost:${PORT}            ║`);
    console.log(`║  局域网访问: http://<本机IP>:${PORT}           ║`);
    console.log("║                                              ║");
    console.log("║  按 Ctrl+C 停止服务                          ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");
  });
}).catch(err => {
  console.error("❌ 数据库初始化失败:", err);
  process.exit(1);
});
