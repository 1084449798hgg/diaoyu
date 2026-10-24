const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, notFound } = require('../../middleware/errors');
const { authRequired, authOptional } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

/** GET /api/v1/comments?catchId= —— 评论列表 */
router.get('/', ah(async (req, res) => {
  const catchId = Number(req.query.catchId);
  if (!isFinite(catchId)) throw badRequest('缺少 catchId');
  const [rows] = await pool.query(
    `SELECT cm.*, u.nickname, u.avatar_url FROM comments cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.catch_id = ? ORDER BY cm.created_at ASC`,
    [catchId]
  );
  res.json({
    total: rows.length,
    items: rows.map((c) => ({ id: c.id, nickname: c.nickname, avatarUrl: c.avatar_url, content: c.content, createdAt: c.created_at })),
  });
}));

/** POST /api/v1/comments —— 发表评论 */
router.post('/', authRequired, ah(async (req, res) => {
  const { catchId, content } = req.body || {};
  if (!isFinite(Number(catchId))) throw badRequest('缺少 catchId');
  if (!content || !String(content).trim()) throw badRequest('评论内容不能为空');
  if (String(content).length > 500) throw badRequest('评论不能超过 500 字');

  const [c] = await pool.query('SELECT id FROM catches WHERE id = ? AND audit_status = 1', [Number(catchId)]);
  if (!c.length) throw notFound('动态不存在');

  const [r] = await pool.query('INSERT INTO comments (catch_id, user_id, content) VALUES (?, ?, ?)', [
    Number(catchId), req.user.id, String(content).trim(),
  ]);
  await pool.query('UPDATE catches SET comments_count = comments_count + 1 WHERE id = ?', [Number(catchId)]);
  res.status(201).json({ id: r.insertId, message: '评论成功' });
}));

module.exports = router;
