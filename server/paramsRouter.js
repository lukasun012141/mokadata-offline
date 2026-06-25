/**
 * 参数配置 REST API 路由
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
};

// ─── 下载模板 ─────────────────────────────────────────────────────────────────
router.get("/template/:type", (req, res) => {
  const tpl = TEMPLATES[req.params.type];
  if (!tpl) return res.status(404).json({ message: "模板不存在" });

  const wb = XLSX.utils.book_new();
  const wsData = [tpl.headers, tpl.example];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // 设置列宽
  ws["!cols"] = tpl.headers.map(() => ({ wch: 20 }));

  // 标题行样式（标注必填）
  XLSX.utils.book_append_sheet(wb, ws, tpl.name);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(tpl.name)}.xlsx`);
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

    // 跳过标题行
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== ""));

    let inserted = 0;
    let skipped = 0;

    if (mode === "full") {
      // 全量覆盖：先清空
      const tableMap = {
        sku: "sku_configs",
        exchange_rate: "exchange_rates",
        tariff: "tariff_configs",
        freight_sku: "freight_by_sku",
        freight_category: "freight_by_category",
        freight_fallback: "freight_by_category_only",
        last_mile: "last_mile_configs",
      };
      if (tableMap[type]) run(`DELETE FROM ${tableMap[type]}`);
    }

    for (const row of dataRows) {
      try {
        if (type === "sku") {
          const [skuCode, skuNameCn, skuNameEn, skuCategory] = row;
          if (!skuCode || !skuNameCn) { skipped++; continue; }
          const existing = query("SELECT id FROM sku_configs WHERE sku_code = ?", [String(skuCode).trim()]);
          if (existing.length > 0 && mode === "incremental") { skipped++; continue; }
          if (existing.length > 0) {
            run("UPDATE sku_configs SET sku_name_cn=?, sku_name_en=?, sku_category=?, updated_at=? WHERE sku_code=?",
              [String(skuNameCn), String(skuNameEn || ""), String(skuCategory || ""), Date.now(), String(skuCode).trim()]);
          } else {
            run("INSERT INTO sku_configs (sku_code, sku_name_cn, sku_name_en, sku_category) VALUES (?,?,?,?)",
              [String(skuCode).trim(), String(skuNameCn), String(skuNameEn || ""), String(skuCategory || "")]);
          }
          inserted++;
        } else if (type === "exchange_rate") {
          const [period, country, currency, rateToRmb] = row;
          if (!period || !country || !currency || !rateToRmb) { skipped++; continue; }
          run("INSERT INTO exchange_rates (period, country, currency, rate_to_rmb) VALUES (?,?,?,?)",
            [String(period), String(country), String(currency), parseFloat(rateToRmb)]);
          inserted++;
        } else if (type === "tariff") {
          const [skuCode, productNameCn, productNameEn, exportHsCode, importCountry, importHsCode, tariffRate, declaredPrice] = row;
          if (!skuCode || !importCountry) { skipped++; continue; }
          run("INSERT INTO tariff_configs (sku_code, product_name_cn, product_name_en, export_hs_code, import_country, import_hs_code, tariff_rate, declared_price_per_sku) VALUES (?,?,?,?,?,?,?,?)",
            [String(skuCode), String(productNameCn || ""), String(productNameEn || ""), String(exportHsCode || ""), String(importCountry), String(importHsCode || ""), tariffRate ? parseFloat(tariffRate) : null, declaredPrice ? parseFloat(declaredPrice) : null]);
          inserted++;
        } else if (type === "freight_sku") {
          const [skuCode, destination, transportMode, pricePerSku] = row;
          if (!skuCode || !destination || !transportMode || !pricePerSku) { skipped++; continue; }
          run("INSERT INTO freight_by_sku (sku_code, destination, transport_mode, price_per_sku) VALUES (?,?,?,?)",
            [String(skuCode), String(destination), String(transportMode), parseFloat(pricePerSku)]);
          inserted++;
        } else if (type === "freight_category") {
          const [categoryName, destination, transportMode, pricePerCategory] = row;
          if (!categoryName || !destination || !transportMode || !pricePerCategory) { skipped++; continue; }
          run("INSERT INTO freight_by_category (category_name, destination, transport_mode, price_per_category) VALUES (?,?,?,?)",
            [String(categoryName), String(destination), String(transportMode), parseFloat(pricePerCategory)]);
          inserted++;
        } else if (type === "freight_fallback") {
          const [categoryName, transportMode, pricePerCategory] = row;
          if (!categoryName || !transportMode || !pricePerCategory) { skipped++; continue; }
          run("INSERT INTO freight_by_category_only (category_name, transport_mode, price_per_category) VALUES (?,?,?)",
            [String(categoryName), String(transportMode), parseFloat(pricePerCategory)]);
          inserted++;
        } else if (type === "last_mile") {
          const [fileSource, logisticsProvider, countryName, warehouseName] = row;
          if (!logisticsProvider || !countryName) { skipped++; continue; }
          run("INSERT INTO last_mile_configs (file_source, logistics_provider, country_name, warehouse_name) VALUES (?,?,?,?)",
            [String(fileSource || ""), String(logisticsProvider), String(countryName), String(warehouseName || "")]);
          inserted++;
        }
      } catch (e) {
        skipped++;
      }
    }

    res.json({ inserted, skipped });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ─── CRUD API ─────────────────────────────────────────────────────────────────

// SKU 配置
router.get("/sku", (req, res) => res.json(query("SELECT * FROM sku_configs ORDER BY id DESC")));
router.post("/sku", (req, res) => {
  const { id, skuCode, skuNameCn, skuNameEn, skuCategory } = req.body;
  if (id) {
    run("UPDATE sku_configs SET sku_name_cn=?, sku_name_en=?, sku_category=?, updated_at=? WHERE id=?",
      [skuNameCn, skuNameEn || "", skuCategory || "", Date.now(), id]);
  } else {
    run("INSERT INTO sku_configs (sku_code, sku_name_cn, sku_name_en, sku_category) VALUES (?,?,?,?)",
      [skuCode, skuNameCn, skuNameEn || "", skuCategory || ""]);
  }
  res.json({ ok: true });
});
router.delete("/sku/:id", (req, res) => { run("DELETE FROM sku_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 汇率配置
router.get("/exchange-rate", (req, res) => res.json(query("SELECT * FROM exchange_rates ORDER BY period DESC, country")));
router.post("/exchange-rate", (req, res) => {
  const { id, period, country, currency, rateToRmb } = req.body;
  if (id) {
    run("UPDATE exchange_rates SET period=?, country=?, currency=?, rate_to_rmb=?, updated_at=? WHERE id=?",
      [period, country, currency, parseFloat(rateToRmb), Date.now(), id]);
  } else {
    run("INSERT INTO exchange_rates (period, country, currency, rate_to_rmb) VALUES (?,?,?,?)",
      [period, country, currency, parseFloat(rateToRmb)]);
  }
  res.json({ ok: true });
});
router.delete("/exchange-rate/:id", (req, res) => { run("DELETE FROM exchange_rates WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 关税配置
router.get("/tariff", (req, res) => res.json(query("SELECT * FROM tariff_configs ORDER BY id DESC")));
router.post("/tariff", (req, res) => {
  const { id, skuCode, productNameCn, productNameEn, exportHsCode, importCountry, importHsCode, tariffRate, declaredPricePerSku } = req.body;
  if (id) {
    run("UPDATE tariff_configs SET sku_code=?, product_name_cn=?, product_name_en=?, export_hs_code=?, import_country=?, import_hs_code=?, tariff_rate=?, declared_price_per_sku=?, updated_at=? WHERE id=?",
      [skuCode, productNameCn || "", productNameEn || "", exportHsCode || "", importCountry, importHsCode || "", tariffRate ? parseFloat(tariffRate) : null, declaredPricePerSku ? parseFloat(declaredPricePerSku) : null, Date.now(), id]);
  } else {
    run("INSERT INTO tariff_configs (sku_code, product_name_cn, product_name_en, export_hs_code, import_country, import_hs_code, tariff_rate, declared_price_per_sku) VALUES (?,?,?,?,?,?,?,?)",
      [skuCode, productNameCn || "", productNameEn || "", exportHsCode || "", importCountry, importHsCode || "", tariffRate ? parseFloat(tariffRate) : null, declaredPricePerSku ? parseFloat(declaredPricePerSku) : null]);
  }
  res.json({ ok: true });
});
router.delete("/tariff/:id", (req, res) => { run("DELETE FROM tariff_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 头程配置
router.get("/freight/sku", (req, res) => res.json(query("SELECT * FROM freight_by_sku ORDER BY id DESC")));
router.post("/freight/sku", (req, res) => {
  const { id, skuCode, destination, transportMode, pricePerSku } = req.body;
  if (id) {
    run("UPDATE freight_by_sku SET sku_code=?, destination=?, transport_mode=?, price_per_sku=? WHERE id=?",
      [skuCode, destination, transportMode, parseFloat(pricePerSku), id]);
  } else {
    run("INSERT INTO freight_by_sku (sku_code, destination, transport_mode, price_per_sku) VALUES (?,?,?,?)",
      [skuCode, destination, transportMode, parseFloat(pricePerSku)]);
  }
  res.json({ ok: true });
});
router.delete("/freight/sku/:id", (req, res) => { run("DELETE FROM freight_by_sku WHERE id=?", [req.params.id]); res.json({ ok: true }); });

router.get("/freight/category", (req, res) => res.json(query("SELECT * FROM freight_by_category ORDER BY id DESC")));
router.post("/freight/category", (req, res) => {
  const { id, categoryName, destination, transportMode, pricePerCategory } = req.body;
  if (id) {
    run("UPDATE freight_by_category SET category_name=?, destination=?, transport_mode=?, price_per_category=? WHERE id=?",
      [categoryName, destination, transportMode, parseFloat(pricePerCategory), id]);
  } else {
    run("INSERT INTO freight_by_category (category_name, destination, transport_mode, price_per_category) VALUES (?,?,?,?)",
      [categoryName, destination, transportMode, parseFloat(pricePerCategory)]);
  }
  res.json({ ok: true });
});
router.delete("/freight/category/:id", (req, res) => { run("DELETE FROM freight_by_category WHERE id=?", [req.params.id]); res.json({ ok: true }); });

router.get("/freight/fallback", (req, res) => res.json(query("SELECT * FROM freight_by_category_only ORDER BY id DESC")));
router.post("/freight/fallback", (req, res) => {
  const { id, categoryName, transportMode, pricePerCategory } = req.body;
  if (id) {
    run("UPDATE freight_by_category_only SET category_name=?, transport_mode=?, price_per_category=? WHERE id=?",
      [categoryName, transportMode, parseFloat(pricePerCategory), id]);
  } else {
    run("INSERT INTO freight_by_category_only (category_name, transport_mode, price_per_category) VALUES (?,?,?,?)",
      [categoryName, transportMode, parseFloat(pricePerCategory)]);
  }
  res.json({ ok: true });
});
router.delete("/freight/fallback/:id", (req, res) => { run("DELETE FROM freight_by_category_only WHERE id=?", [req.params.id]); res.json({ ok: true }); });

// 尾程配置
router.get("/last-mile", (req, res) => res.json(query("SELECT * FROM last_mile_configs ORDER BY id DESC")));
router.post("/last-mile", (req, res) => {
  const { id, fileSource, logisticsProvider, countryName, warehouseName } = req.body;
  if (id) {
    run("UPDATE last_mile_configs SET file_source=?, logistics_provider=?, country_name=?, warehouse_name=? WHERE id=?",
      [fileSource || "", logisticsProvider, countryName, warehouseName || "", id]);
  } else {
    run("INSERT INTO last_mile_configs (file_source, logistics_provider, country_name, warehouse_name) VALUES (?,?,?,?)",
      [fileSource || "", logisticsProvider, countryName, warehouseName || ""]);
  }
  res.json({ ok: true });
});
router.delete("/last-mile/:id", (req, res) => { run("DELETE FROM last_mile_configs WHERE id=?", [req.params.id]); res.json({ ok: true }); });

module.exports = router;
