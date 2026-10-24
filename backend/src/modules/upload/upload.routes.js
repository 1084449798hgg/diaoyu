const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ah = require('../../utils/async-handler');
const { authRequired } = require('../../middleware/auth');
const { badRequest } = require('../../middleware/errors');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '../../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 与客户端压缩目标（max 1MB）之间的兜底
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest('仅支持 JPG/PNG/WebP 图片'));
  },
});

/**
 * POST /api/v1/upload —— 图片上传
 * 生产环境为阿里云 OSS + CDN 客户端 STS 直传；此处以本地存储模拟，
 * 返回结构与 OSS 直传回调一致（{ url }），前端无感替换。
 */
router.post('/', authRequired, upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('未收到文件');
  res.status(201).json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename, size: req.file.size });
}));

module.exports = router;
