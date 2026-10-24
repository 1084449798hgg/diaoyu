const express = require('express');
const ah = require('../../utils/async-handler');
const { notFound } = require('../../middleware/errors');
const { authRequired } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

/** POST /api/v1/likes/:catchId —— 点赞（幂等） */
router.post('/:catchId', authRequired, ah(async (req, res) => {
  const catchId = Number(req.params.catchId);
  const [c] = await pool.query('SELECT id FROM catches WHERE id = ? AND audit_status = 1', [catchId]);
  if (!c.length) throw notFound('动态不存在');
  try {
    await pool.query('INSERT INTO likes (catch_id, user_id) VALUES (?, ?)', [catchId, req.user.id]);
    await pool.query('UPDATE catches SET likes_count = likes_count + 1 WHERE id = ?', [catchId]);
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY') throw e; // 已点赞则幂等返回
  }
  const [row] = await pool.query('SELECT likes_count FROM catches WHERE id = ?', [catchId]);
  res.json({ liked: true, likesCount: row[0].likes_count });
}));

/** DELETE /api/v1/likes/:catchId —— 取消点赞 */
router.delete('/:catchId', authRequired, ah(async (req, res) => {
  const catchId = Number(req.params.catchId);
  const [r] = await pool.query('DELETE FROM likes WHERE catch_id = ? AND user_id = ?', [catchId, req.user.id]);
  if (r.affectedRows) {
    await pool.query('UPDATE catches SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [catchId]);
  }
  const [row] = await pool.query('SELECT likes_count FROM catches WHERE id = ?', [catchId]);
  res.json({ liked: false, likesCount: row[0].likes_count });
}));

module.exports = router;
