/**
 * 文件上传路由（本地存储版）
 */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { query, run } = require("./db");

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, "../data/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/", upload.single("file"), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "未收到文件" });
    const { mode = "desensitized", tags = "", groupName = "" } = req.body;
    // 修复中文文件名乱码：multer 以 latin1 接收，需转回 utf-8
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    run(
      "INSERT INTO uploaded_files (filename, original_name, file_size, mime_type, storage_key, mode, group_name, tags) VALUES (?,?,?,?,?,?,?,?)",
      [file.filename, originalName, file.size, file.mimetype, file.filename, mode, groupName, tags]
    );
    res.json({ ok: true, filename: file.filename });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get("/list", (req, res) => {
  const files = query("SELECT * FROM uploaded_files ORDER BY uploaded_at DESC");
  res.json({ files });
});

router.delete("/:id", (req, res) => {
  const rows = query("SELECT filename FROM uploaded_files WHERE id=?", [req.params.id]);
  if (rows.length > 0) {
    const filePath = path.join(UPLOAD_DIR, rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    run("DELETE FROM uploaded_files WHERE id=?", [req.params.id]);
  }
  res.json({ ok: true });
});

module.exports = router;
