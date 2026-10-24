const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, notFound, unprocessable, tooMany } = require('../../middleware/errors');
const { authRequired, authOptional } = require('../../middleware/auth');
const pool = require('../../db/pool');
const { moderate } = require('./moderation');

const router = express.Router();

function parseJson(v, fb = []) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return fb; }
}

function catchDto(c, userId) {
  return {
    id: c.id,
    userId: c.user_id,
    nickname: c.nickname,
    avatarUrl: c.avatar_url,
    spotId: c.spot_id,
    spotName: c.spot_name || null,
    fishSpecies: c.fish_species,
    weightKg: c.weight_kg != null ? Number(c.weight_kg) : null,
    bait: c.bait,
    content: c.content,
    imageUrls: parseJson(c.image_urls),
    visibility: c.visibility,
    likesCount: c.likes_count || 0,
    commentsCount: c.comments_count || 0,
    liked: userId ? !!c.liked : false,
    createdAt: c.created_at,
  };
}

/** 发布成功奖励鱼石（追加需求：战报 +鱼石） */
const PUBLISH_POINTS = 5;

/** POST /api/v1/catches —— 发布渔获（主链路先过内容安全审核） */
router.post('/', authRequired, ah(async (req, res) => {
  const { spotId, fishSpecies, weightKg, bait, content, imageUrls, visibility } = req.body || {};
  if (!content && (!imageUrls || !imageUrls.length)) throw badRequest('动态需要文字内容或至少一张图片');
  const weight = weightKg != null && isFinite(Number(weightKg)) ? Math.min(200, Math.max(0, Number(weightKg))) : null;

  // 新用户发帖限频：同一用户 1 分钟内最多 2 条
  const [recent] = await pool.query(
    'SELECT COUNT(*) AS c FROM catches WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE',
    [req.user.id]
  );
  if (recent[0].c >= 2) throw tooMany('发布太频繁，请稍后再试');

  // 1) 机审主链路
  const audit = moderate({ imageUrls: imageUrls || [], content: content || '' });
  if (audit.level === 'high') {
    await pool.query(
      `INSERT INTO catches (user_id, spot_id, fish_species, weight_kg, bait, content, image_urls, visibility, audit_status, audit_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'public', 2, ?)`,
      [req.user.id, spotId || null, fishSpecies || null, weight, bait || null, content || null, JSON.stringify(imageUrls || []), audit.reason]
    );
    throw unprocessable(audit.reason, { audit: { level: 'high', reason: audit.reason } });
  }
  // 2) 中风险 → 人工队列（audit_status=0，不进动态流）；低风险 → 先发后审（1）
  const status = audit.level === 'medium' ? 0 : 1;

  const [r] = await pool.query(
    `INSERT INTO catches (user_id, spot_id, fish_species, weight_kg, bait, content, image_urls, visibility, audit_status, audit_detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, spotId || null, fishSpecies || null, weight, bait || null, content || null,
     JSON.stringify(imageUrls || []), visibility === 'private' ? 'private' : 'public', status, audit.reason]
  );

  // 3) 发布成功奖励鱼石（拦截/失败不奖励）
  await pool.query('UPDATE users SET points = points + ? WHERE id = ?', [PUBLISH_POINTS, req.user.id]);

  res.status(201).json({
    id: r.insertId,
    weightKg: weight,
    auditStatus: status,
    audit: { level: audit.level, reason: audit.reason },
    pointsGained: PUBLISH_POINTS,
    message: status === 0 ? '已提交，图片进入人工复核队列' : '发布成功',
  });
}));

/** GET /api/v1/catches?spotId=&page=&pageSize= —— 动态流（默认只展示审核通过） */
router.get('/', authOptional, ah(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(30, Math.max(1, Number(req.query.pageSize) || 10));
  const conds = ['c.audit_status = 1', "c.visibility = 'public'"];
  const args = [];
  if (req.query.spotId) {
    conds.push('c.spot_id = ?');
    args.push(Number(req.query.spotId));
  }
  if (req.query.userId) {
    conds.push('c.user_id = ?');
    args.push(Number(req.query.userId));
  }
  const where = conds.join(' AND ');

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM catches c WHERE ${where}`, args);
  const [rows] = await pool.query(
    `SELECT c.*, u.nickname, u.avatar_url, s.name AS spot_name,
            ${req.user ? 'EXISTS(SELECT 1 FROM likes l WHERE l.catch_id = c.id AND l.user_id = ?)' : '0'} AS liked
     FROM catches c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN fishing_spots s ON s.id = c.spot_id
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...(req.user ? [req.user.id] : []), ...args, pageSize, (page - 1) * pageSize]
  );
  res.json({
    total: countRows[0].total,
    page,
    pageSize,
    items: rows.map((c) => catchDto(c, req.user?.id)),
  });
}));

/** GET /api/v1/catches/:id —— 动态详情 */
router.get('/:id', authOptional, ah(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.nickname, u.avatar_url, s.name AS spot_name,
            ${req.user ? 'EXISTS(SELECT 1 FROM likes l WHERE l.catch_id = c.id AND l.user_id = ?)' : '0'} AS liked
     FROM catches c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN fishing_spots s ON s.id = c.spot_id
     WHERE c.id = ? AND c.audit_status = 1 AND c.visibility = 'public'`,
    [...(req.user ? [req.user.id] : []), Number(req.params.id)]
  );
  if (!rows.length) throw notFound('动态不存在或未公开');
  res.json(catchDto(rows[0], req.user?.id));
}));

module.exports = router;
