/**
 * 参数配置 REST API 路由
 * v4-2026: 全面改为 extra_fields 架构，与 db.js 新结构一致
 *          修复 NOT NULL 约束报错，新增日期自动转换，新增下载当前数据功能
 */
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const { query, run } = require("./db");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── 模板列定义 ───────────────────────────────────────────────────────────────
const TEMPLATES = {
  sku: {
    name: "SKU配置模板",
    headers: ["SKU编码*", "SKU中文名称*", "SKU英文名称", "SKU类别"],
    example: ["BX-001", "拓竹打印机", "Bambu Printer", "打印机"],
  },
  exchange_rate: {
    name: "汇率配置模板",
    headers: ["月份*(如2024-01)", "国家*", "币种*", "对人民币汇率*"],
    example: ["2024-01", "美国", "USD", "7.25"],
  },
  tariff: {
    name: "关税配置模板",
    headers: ["SKU编码*", "中文品名", "英文品名", "中国出口HSCODE", "进口国家*", "进口清关HSCODE", "进口关税税率(%)", "单SKU报关价格(元)"],
    example: ["BX-001", "3D打印机", "3D Printer", "8477800000", "美国", "8477800000", "7.5", "1500"],
  },
  freight_sku: {
    name: "头程配置(按国家+SKU)模板",
    headers: ["SKU编码*", "运输目的地*", "运输方式*", "SKU头程单价(元)*"],
    example: ["BX-001", "美国", "海运", "120.00"],
  },
  freight_category: {
    name: "头程配置(按国家+品类)模板",
    headers: ["品类名称*", "运输目的地*", "运输方式*", "品类头程单价(元)*"],
    example: ["打印机", "美国", "海运", "100.00"],
  },
  freight_fallback: {
    name: "头程配置(仅按品类兜底)模板",
    headers: ["品类名称*", "运输方式*", "品类头程单价(元)*"],
    example: ["打印机", "海运", "80.00"],
  },
  last_mile: {
    name: "尾程配置模板",
    headers: ["文件来源", "物流商名称*", "国家名称*", "仓库名称"],
    example: ["亚马逊报表", "UPS", "美国", "LAX1"],
  },
  "points-redemption": {
    name: "积分兑换匹配表模板",
    headers: ["兑换SKU编码*", "兑换SKU名称*", "站点*", "兑换大类", "价格*", "币种*", "兑换所需积分*", "单位货币所需积分"],
    example: ["GC-USD-10", "$10礼品卡", "全球站", "礼品卡", "10", "USD", "1000", "100"],
  },
  points_redemption: {
    name: "积分兑换匹配表模板",
    headers: ["兑换SKU编码*", "兑换SKU名称*", "站点*", "兑换大类", "价格*", "币种*", "兑换所需积分*", "单位货币所需积分"],
    example: ["GC-USD-10", "$10礼品卡", "全球站", "礼品卡", "10", "USD", "1000", "100"],
  },
};

// 表名映射
const TABLE_MAP = {
  sku: "sku_configs",
  exchange_rate: "exchange_rates",
  tariff: "tariff_configs",
  freight_sku: "freight_by_sku",
  freight_category: "freight_by_category",
  freight_fallback: "freight_by_category_only",
  last_mile: "last_mile_configs",
  "points-redemption": "points_redemption_config",
  points_redemption: "points_redemption_config",
};

// ─── 日期自动转换 ─────────────────────────────────────────────────────────────
const DATE_COL_KEYWORDS = ["月份", "日期", "month", "date", "period", "年月"];
function isDateColumn(colName) {
  const lower = String(colName).toLowerCase();
  return DATE_COL_KEYWORDS.some(k => lower.includes(k.toLowerCase()));
}
function normalizeYearMonth(val) {
  if (val === undefined || val === null || String(val).trim() === "") return val;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const fullDate = s.match(/^(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})$/);
  if (fullDate) return `${fullDate[1]}-${fullDate[2].padStart(2, "0")}`;
  const ymSlash = s.match(/^(\d{4})[\-\/\.](\d{1,2})$/);
  if (ymSlash) return `${ymSlash[1]}-${ymSlash[2].padStart(2, "0")}`;
  const ymCn = s.match(/^(\d{4})年(\d{1,2})月$/);
  if (ymCn) return `${ymCn[1]}-${ymCn[2].padStart(2, "0")}`;
  const num = Number(s);
  if (!isNaN(num) && Number.isInteger(num) && num > 30000 && num < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return s;
}

// ─── 辅助：提取扩展字段（所有列打包为 JSON）─────────────────────────────────
function extractExtraFields(headerRow, dataRow) {
  const extra = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = String(headerRow[i] || "").trim();
    if (!key) continue;
    let val = dataRow[i];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      if (isDateColumn(key)) val = normalizeYearMonth(val);
      extra[key] = String(val).trim();
    }
  }
  return Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
}

// ─── 辅助：从 extra_fields 推断列头 ──────────────────────────────────────────
function inferHeaders(tableName, defaultHeaders) {
  try {
    const rows = query(`SELECT extra_fields FROM ${tableName} WHERE extra_fields IS NOT NULL LIMIT 1`);
    if (rows.length > 0 && rows[0].extra_fields) {
      const ef = JSON.parse(rows[0].extra_fields);
      const keys = Object.keys(ef);
      if (keys.length > 0) return keys;
    }
  } catch (e) {}
  return defaultHeaders;
}

// ─── 版本检测端点 ─────────────────────────────────────────────────────────────
router.get("/debug-version", (req, res) => {
  res.json({ version: "v4-extra-fields-2026", message: "paramsRouter.js v4：全面 extra_fields 架构" });
});

// ─── 下载模板 ─────────────────────────────────────────────────────────────────
// ?mode=blank（默认）：空白模板  ?mode=data：导出当前数据
router.get("/template/:type", (req, res) => {
  const tpl = TEMPLATES[req.params.type];
  if (!tpl) return res.status(404).json({ message: "模板不存在" });
  const mode = req.query.mode || "blank";

  const wb = XLSX.utils.book_new();
  let wsData;

  if (mode === "data") {
    // 导出当前数据
    const tableName = TABLE_MAP[req.params.type];
    if (!tableName) return res.status(404).json({ message: "表不存在" });
    const dbRows = query(`SELECT * FROM ${tableName} ORDER BY id DESC`);
    if (dbRows.length === 0) {
      // 无数据，返回空白模板
      wsData = [inferHeaders(tableName, tpl.headers)];
    } else {
      const headers = inferHeaders(tableName, tpl.headers);
      wsData = [headers];
      for (const row of dbRows) {
        try {
          const ef = row.extra_fields ? JSON.parse(row.extra_fields) : {};
          wsData.push(headers.map(h => ef[h] !== undefined ? ef[h] : ""));
        } catch (e) {
          wsData.push(headers.map(() => ""));
        }
      }
    }
  } else {
    // 空白模板（动态列头，优先从数据库推断）
    const tableName = TABLE_MAP[req.params.type];
    const headers = tableName ? inferHeaders(tableName, tpl.headers) : tpl.headers;
    wsData = [headers, tpl.example.slice(0, headers.length)];
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = wsData[0].map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, tpl.name);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = mode === "data" ? `${tpl.name}_数据导出` : tpl.name;
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ─── 上传导入 ─────────────────────────────────────────────────────────────────
router.post("/import/:type", upload.single("file"), (req, res) => {
  try {
    const { type } = req.params;
    const mode = req.query.mode || "incremental"; // full | incremental
    const file = req.file;
    if (!file) return res.status(400).json({ message: "未收到文件" });

    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (rows.length < 2) return res.json({ inserted: 0, skipped: 0 });

    const headerRow = rows[0].map(h => String(h || "").trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ""));

    console.log("[Import v4] type:", type, "| mode:", mode, "| rows:", dataRows.length);

    const tableName = TABLE_MAP[type];
    if (!tableName) return res.status(400).json({ message: "未知类型: " + type });

    // 全量覆盖：先清空
    if (mode === "full") {
      run(`DELETE FROM ${tableName}`);
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of dataRows) {
      try {
        if (type === "sku") {
          // SKU 保留固定列逻辑
          const skuCode = String(row[0] || "").trim();
          const skuNameCn = String(row[1] || "").trim();
          const skuNameEn = String(row[2] || "").trim();
          const skuCategory = String(row[3] || "").trim();
          if (!skuCode || !skuNameCn) { skipped++; continue; }
          const extraFields = extractExtraFields(headerRow, row);
          const existing = query("SELECT id FROM sku_configs WHERE sku_code = ?", [skuCode]);
          if (existing.length > 0) {
            if (mode === "incremental") { skipped++; continue; }
            run("UPDATE sku_configs SET sku_name_cn=?, sku_name_en=?, sku_category=?, extra_fields=?, updated_at=? WHERE sku_code=?",
              [skuNameCn, skuNameEn, skuCategory, extraFields, Date.now(), skuCode]);
          } else {
            run("INSERT INTO sku_configs (sku_code, sku_name_cn, sku_name_en, sku_category, extra_fields) VALUES (?,?,?,?,?)",
              [skuCode, skuNameCn, skuNameEn, skuCategory, extraFields]);
          }
          inserted++;
        } else {
          // 所有其他类型：全部打包为 extra_fields，只 INSERT (extra_fields)
          const efVal = extractExtraFields(headerRow, row);
          if (!efVal) { skipped++; continue; }
          run(`INSERT INTO ${tableName} (extra_fields) VALUES (?)`, [efVal]);
          inserted++;
        }
      } catch (e) {
        console.error("[Import Row Error]", e.message);
        skipped++;
      }
    }

    console.log("[Import v4] 完成: inserted=" + inserted + ", skipped=" + skipped);
    res.json({ inserted, skipped });
  } catch (e) {
    console.error("[Import v4] 出错:", e.message);
    res.status(500).json({ message: e.message });
  }
});

// ─── 辅助：把 extra_fields JSON 展开为前端期望的字段 ─────────────────────────
function expandRow(r, fieldMap) {
  const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
  const result = { id: r.id, extraFields: r.extra_fields || null, createdAt: r.created_at, updatedAt: r.updated_at };
  for (const [camel, keys] of Object.entries(fieldMap)) {
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      if (ef[k] !== undefined) { result[camel] = ef[k]; break; }
    }
    if (result[camel] === undefined) result[camel] = null;
  }
  return result;
}

// ─── CRUD API ─────────────────────────────────────────────────────────────────

// SKU 配置（保留固定列）
router.get("/sku", (req, res) => {
  res.json(query("SELECT * FROM sku_configs ORDER BY id DESC").map(r => ({
    id: r.id, skuCode: r.sku_code, skuNameCn: r.sku_name_cn,
    skuNameEn: r.sku_name_en, skuCategory: r.sku_category,
    extraFields: r.extra_fields || null, createdAt: r.created_at, updatedAt: r.updated_at,
  })));
});
router.post("/sku", (req, res) => {
  const { id, skuCode, skuNameCn, skuNameEn, skuCategory, extraFields } = req.body;
  if (id) {
    run("UPDATE sku_configs SET sku_name_cn=?, sku_name_en=?, sku_category=?, extra_fields=?, updated_at=? WHERE id=?",
      [skuNameCn, skuNameEn || "", skuCategory || "", extraFields || null, Date.now(), id]);
  } else {
    run("INSERT INTO sku_configs (sku_code, sku_name_cn, sku_name_en, sku_category, extra_fields) VALUES (?,?,?,?,?)",
      [skuCode, skuNameCn, skuNameEn || "", skuCategory || "", extraFields || null]);
  }
  res.json({ ok: true });
});
router.delete("/sku/:id", (req, res) => { run("DELETE FROM sku_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 汇率配置（extra_fields 架构）
router.get("/exchange-rate", (req, res) => {
  res.json(query("SELECT * FROM exchange_rates ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return {
      id: r.id,
      period: ef["月份*(如2024-01)"] || ef["月份"] || ef["period"] || null,
      country: ef["国家*"] || ef["国家"] || ef["country"] || null,
      currency: ef["币种*"] || ef["币种"] || ef["currency"] || null,
      rateToRmb: ef["对人民币汇率*"] || ef["对人民币汇率"] || ef["rate_to_rmb"] || null,
      extraFields: r.extra_fields || null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }));
});
router.post("/exchange-rate", (req, res) => {
  const { id, period, country, currency, rateToRmb, extraFields } = req.body;
  // 构建 extra_fields（兼容旧字段名和新字段名）
  let efVal = extraFields || null;
  if (!efVal && (period || country || currency || rateToRmb)) {
    const ef = {};
    if (period) ef["月份*(如2024-01)"] = period;
    if (country) ef["国家*"] = country;
    if (currency) ef["币种*"] = currency;
    if (rateToRmb) ef["对人民币汇率*"] = String(rateToRmb);
    efVal = JSON.stringify(ef);
  }
  if (id) {
    run("UPDATE exchange_rates SET extra_fields=?, updated_at=? WHERE id=?", [efVal, Date.now(), id]);
  } else {
    run("INSERT INTO exchange_rates (extra_fields) VALUES (?)", [efVal]);
  }
  res.json({ ok: true });
});
router.delete("/exchange-rate/:id", (req, res) => { run("DELETE FROM exchange_rates WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 关税配置（extra_fields 架构）
router.get("/tariff", (req, res) => {
  res.json(query("SELECT * FROM tariff_configs ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return {
      id: r.id,
      skuCode: ef["SKU编码*"] || ef["sku_code"] || null,
      productNameCn: ef["中文品名"] || ef["product_name_cn"] || null,
      productNameEn: ef["英文品名"] || ef["product_name_en"] || null,
      exportHsCode: ef["中国出口HSCODE"] || ef["export_hs_code"] || null,
      importCountry: ef["进口国家*"] || ef["import_country"] || null,
      importHsCode: ef["进口清关HSCODE"] || ef["import_hs_code"] || null,
      tariffRate: ef["进口关税税率(%)"] || ef["tariff_rate"] || null,
      declaredPricePerSku: ef["单SKU报关价格(元)"] || ef["declared_price_per_sku"] || null,
      extraFields: r.extra_fields || null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }));
});
router.post("/tariff", (req, res) => {
  const { id, extraFields, skuCode, productNameCn, productNameEn, exportHsCode, importCountry, importHsCode, tariffRate, declaredPricePerSku } = req.body;
  let efVal = extraFields || null;
  if (!efVal) {
    const ef = {};
    if (skuCode) ef["SKU编码*"] = skuCode;
    if (productNameCn) ef["中文品名"] = productNameCn;
    if (productNameEn) ef["英文品名"] = productNameEn;
    if (exportHsCode) ef["中国出口HSCODE"] = exportHsCode;
    if (importCountry) ef["进口国家*"] = importCountry;
    if (importHsCode) ef["进口清关HSCODE"] = importHsCode;
    if (tariffRate) ef["进口关税税率(%)"] = String(tariffRate);
    if (declaredPricePerSku) ef["单SKU报关价格(元)"] = String(declaredPricePerSku);
    efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null;
  }
  if (id) {
    run("UPDATE tariff_configs SET extra_fields=?, updated_at=? WHERE id=?", [efVal, Date.now(), id]);
  } else {
    run("INSERT INTO tariff_configs (extra_fields) VALUES (?)", [efVal]);
  }
  res.json({ ok: true });
});
router.delete("/tariff/:id", (req, res) => { run("DELETE FROM tariff_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 头程配置（extra_fields 架构）
router.get("/freight/sku", (req, res) => {
  res.json(query("SELECT * FROM freight_by_sku ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return { id: r.id, skuCode: ef["SKU编码*"] || ef["sku_code"] || null, destination: ef["运输目的地*"] || ef["destination"] || null, transportMode: ef["运输方式*"] || ef["transport_mode"] || null, pricePerSku: ef["SKU头程单价(元)*"] || ef["price_per_sku"] || null, extraFields: r.extra_fields || null, createdAt: r.created_at, updatedAt: r.updated_at };
  }));
});
router.post("/freight/sku", (req, res) => {
  const { id, extraFields, skuCode, destination, transportMode, pricePerSku } = req.body;
  let efVal = extraFields || null;
  if (!efVal) { const ef = {}; if (skuCode) ef["SKU编码*"] = skuCode; if (destination) ef["运输目的地*"] = destination; if (transportMode) ef["运输方式*"] = transportMode; if (pricePerSku) ef["SKU头程单价(元)*"] = String(pricePerSku); efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null; }
  if (id) { run("UPDATE freight_by_sku SET extra_fields=? WHERE id=?", [efVal, id]); } else { run("INSERT INTO freight_by_sku (extra_fields) VALUES (?)", [efVal]); }
  res.json({ ok: true });
});
router.delete("/freight/sku/:id", (req, res) => { run("DELETE FROM freight_by_sku WHERE id=?", [req.params.id]); res.json({ ok: true }); });

router.get("/freight/category", (req, res) => {
  res.json(query("SELECT * FROM freight_by_category ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return { id: r.id, categoryName: ef["品类名称*"] || ef["category_name"] || null, destination: ef["运输目的地*"] || ef["destination"] || null, transportMode: ef["运输方式*"] || ef["transport_mode"] || null, pricePerCategory: ef["品类头程单价(元)*"] || ef["price_per_category"] || null, extraFields: r.extra_fields || null, createdAt: r.created_at, updatedAt: r.updated_at };
  }));
});
router.post("/freight/category", (req, res) => {
  const { id, extraFields, categoryName, destination, transportMode, pricePerCategory } = req.body;
  let efVal = extraFields || null;
  if (!efVal) { const ef = {}; if (categoryName) ef["品类名称*"] = categoryName; if (destination) ef["运输目的地*"] = destination; if (transportMode) ef["运输方式*"] = transportMode; if (pricePerCategory) ef["品类头程单价(元)*"] = String(pricePerCategory); efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null; }
  if (id) { run("UPDATE freight_by_category SET extra_fields=? WHERE id=?", [efVal, id]); } else { run("INSERT INTO freight_by_category (extra_fields) VALUES (?)", [efVal]); }
  res.json({ ok: true });
});
router.delete("/freight/category/:id", (req, res) => { run("DELETE FROM freight_by_category WHERE id=?", [req.params.id]); res.json({ ok: true }); });

router.get("/freight/fallback", (req, res) => {
  res.json(query("SELECT * FROM freight_by_category_only ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return { id: r.id, categoryName: ef["品类名称*"] || ef["category_name"] || null, transportMode: ef["运输方式*"] || ef["transport_mode"] || null, pricePerCategory: ef["品类头程单价(元)*"] || ef["price_per_category"] || null, extraFields: r.extra_fields || null, createdAt: r.created_at, updatedAt: r.updated_at };
  }));
});
router.post("/freight/fallback", (req, res) => {
  const { id, extraFields, categoryName, transportMode, pricePerCategory } = req.body;
  let efVal = extraFields || null;
  if (!efVal) { const ef = {}; if (categoryName) ef["品类名称*"] = categoryName; if (transportMode) ef["运输方式*"] = transportMode; if (pricePerCategory) ef["品类头程单价(元)*"] = String(pricePerCategory); efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null; }
  if (id) { run("UPDATE freight_by_category_only SET extra_fields=? WHERE id=?", [efVal, id]); } else { run("INSERT INTO freight_by_category_only (extra_fields) VALUES (?)", [efVal]); }
  res.json({ ok: true });
});
router.delete("/freight/fallback/:id", (req, res) => { run("DELETE FROM freight_by_category_only WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 尾程配置（extra_fields 架构）
router.get("/last-mile", (req, res) => {
  res.json(query("SELECT * FROM last_mile_configs ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return {
      id: r.id,
      fileSource: ef["文件来源"] || ef["file_source"] || null,
      logisticsProvider: ef["物流商名称*"] || ef["logistics_provider"] || null,
      countryName: ef["国家名称*"] || ef["country_name"] || null,
      warehouseName: ef["仓库名称"] || ef["warehouse_name"] || null,
      extraFields: r.extra_fields || null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }));
});
router.post("/last-mile", (req, res) => {
  const { id, extraFields, fileSource, logisticsProvider, countryName, warehouseName } = req.body;
  let efVal = extraFields || null;
  if (!efVal) {
    const ef = {};
    if (fileSource) ef["文件来源"] = fileSource;
    if (logisticsProvider) ef["物流商名称*"] = logisticsProvider;
    if (countryName) ef["国家名称*"] = countryName;
    if (warehouseName) ef["仓库名称"] = warehouseName;
    efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null;
  }
  if (id) {
    run("UPDATE last_mile_configs SET extra_fields=? WHERE id=?", [efVal, id]);
  } else {
    run("INSERT INTO last_mile_configs (extra_fields) VALUES (?)", [efVal]);
  }
  res.json({ ok: true });
});
router.delete("/last-mile/:id", (req, res) => { run("DELETE FROM last_mile_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 积分兑换匹配表（extra_fields 架构）
router.get("/points-redemption", (req, res) => {
  res.json(query("SELECT * FROM points_redemption_config ORDER BY id DESC").map(r => {
    const ef = r.extra_fields ? (() => { try { return JSON.parse(r.extra_fields); } catch(e) { return {}; } })() : {};
    return {
      id: r.id,
      redemptionSkuCode: ef["兑换SKU编码*"] || ef["redemption_sku_code"] || null,
      redemptionSkuName: ef["兑换SKU名称*"] || ef["redemption_sku_name"] || null,
      site: ef["站点*"] || ef["site"] || null,
      redemptionCategory: ef["兑换大类"] || ef["redemption_category"] || null,
      price: ef["价格*"] || ef["price"] || null,
      currency: ef["币种*"] || ef["currency"] || null,
      pointsRequired: ef["兑换所需积分*"] || ef["points_required"] || null,
      pointsPerCurrencyUnit: ef["单位货币所需积分"] || ef["points_per_currency_unit"] || null,
      extraFields: r.extra_fields || null,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }));
});
router.post("/points-redemption", (req, res) => {
  const { id, extraFields, redemptionSkuCode, redemptionSkuName, site, redemptionCategory, price, currency, pointsRequired, pointsPerCurrencyUnit } = req.body;
  let efVal = extraFields || null;
  if (!efVal) {
    const ef = {};
    if (redemptionSkuCode) ef["兑换SKU编码*"] = redemptionSkuCode;
    if (redemptionSkuName) ef["兑换SKU名称*"] = redemptionSkuName;
    if (site) ef["站点*"] = site;
    if (redemptionCategory) ef["兑换大类"] = redemptionCategory;
    if (price) ef["价格*"] = String(price);
    if (currency) ef["币种*"] = currency;
    if (pointsRequired) ef["兑换所需积分*"] = String(pointsRequired);
    if (pointsPerCurrencyUnit) ef["单位货币所需积分"] = String(pointsPerCurrencyUnit);
    efVal = Object.keys(ef).length > 0 ? JSON.stringify(ef) : null;
  }
  if (id) {
    run("UPDATE points_redemption_config SET extra_fields=?, updated_at=? WHERE id=?", [efVal, Date.now(), id]);
  } else {
    run("INSERT INTO points_redemption_config (extra_fields) VALUES (?)", [efVal]);
  }
  res.json({ ok: true });
});
router.delete("/points-redemption/:id", (req, res) => { run("DELETE FROM points_redemption_config WHERE id=?", [req.params.id]); res.json({ ok: true }); });

module.exports = router;
