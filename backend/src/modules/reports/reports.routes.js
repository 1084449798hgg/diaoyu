const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest } = require('../../middleware/errors');
const { authRequired } = require('../../middleware/auth');
const pool = require('../../db/pool');

const router = express.Router();

/** POST /api/v1/reports —— UGC 举报 */
router.post('/', authRequired, ah(async (req, res) => {
  const { targetType, targetId, reason } = req.body || {};
  if (!['catch', 'comment', 'spot'].includes(targetType)) throw badRequest('targetType 需为 catch/comment/spot');
  if (!isFinite(Number(targetId))) throw badRequest('targetId 不正确');
  const [r] = await pool.query(
    'INSERT INTO reports (target_type, target_id, user_id, reason) VALUES (?, ?, ?, ?)',
    [targetType, Number(targetId), req.user.id, reason || '用户举报']
  );
  res.status(201).json({ id: r.insertId, message: '已收到举报，管理员将尽快处理' });
}));

module.exports = router;
