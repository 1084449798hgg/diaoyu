const express = require('express');
const ah = require('../../utils/async-handler');
const { authRequired } = require('../../middleware/auth');
const { notFound } = require('../../middleware/errors');
const pool = require('../../db/pool');

const router = express.Router();

/** GET /api/v1/users/me —— 个人中心（战绩/鱼石/图鉴进度） */
router.get('/me', authRequired, ah(async (req, res) => {
  const uid = req.user.id;
  const [userRows] = await pool.query('SELECT id, phone, nickname, avatar_url, points, is_vip, created_at FROM users WHERE id = ?', [uid]);
  const user = userRows[0];
  if (!user) throw notFound('用户不存在');

  const [[catchRows], [fansRows], [logRows], [monthRows], [maxRows], [tankRows]] = await Promise.all([
    pool.query('SELECT COUNT(*) AS c FROM catches WHERE user_id = ? AND audit_status = 1', [uid]),
    pool.query('SELECT COUNT(*) AS c FROM likes l JOIN catches c ON c.id = l.catch_id WHERE c.user_id = ?', [uid]),
    pool.query('SELECT COUNT(*) AS c FROM fishing_logs WHERE user_id = ?', [uid]),
    pool.query("SELECT COUNT(DISTINCT fish_date) AS c FROM fishing_logs WHERE user_id = ? AND fish_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')", [uid]),
    pool.query('SELECT fish_species, weight_kg FROM catches WHERE user_id = ? AND audit_status = 1 AND weight_kg IS NOT NULL ORDER BY weight_kg DESC LIMIT 1', [uid]),
    pool.query(`SELECT c.id, c.fish_species, c.weight_kg, c.image_urls, c.created_at, s.name AS spot_name
                FROM catches c LEFT JOIN fishing_spots s ON s.id = c.spot_id
                WHERE c.user_id = ? AND c.audit_status = 1
                ORDER BY c.created_at DESC LIMIT 8`, [uid]),
  ]);

  const [encRows] = await pool.query(
    `SELECT COUNT(DISTINCT c.fish_species) AS unlocked
     FROM catches c JOIN fish_encyclopedia e ON e.species = c.fish_species
     WHERE c.user_id = ? AND c.audit_status = 1`,
    [uid]
  );
  const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM fish_encyclopedia');

  res.json({
    id: user.id,
    nickname: user.nickname || '钓鱼新手',
    avatarUrl: user.avatar_url,
    phone: user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
    points: user.points,
    isVip: !!user.is_vip,
    createdAt: user.created_at,
    stats: {
      catchCount: catchRows[0].c,
      fansCount: fansRows[0].c,
      followingCount: 0,
      logCount: logRows[0].c,
      monthFishDays: monthRows[0].c,
      maxCatch: maxRows[0] ? { species: maxRows[0].fish_species, weightKg: Number(maxRows[0].weight_kg) } : null,
      encyclopediaUnlocked: encRows[0].unlocked,
      encyclopediaTotal: totalRow.total,
    },
    fishTank: tankRows.map((c) => ({
      id: c.id,
      species: c.fish_species,
      weightKg: c.weight_kg != null ? Number(c.weight_kg) : null,
      spotName: c.spot_name,
      imageUrls: typeof c.image_urls === 'string' ? JSON.parse(c.image_urls || '[]') : (c.image_urls || []),
      createdAt: c.created_at,
    })),
  });
}));

/** GET /api/v1/users/me/encyclopedia —— 鱼种图鉴（X/100） */
router.get('/me/encyclopedia', authRequired, ah(async (req, res) => {
  const [species] = await pool.query('SELECT id, species, category, emoji, intro FROM fish_encyclopedia ORDER BY id');
  const [caught] = await pool.query(
    `SELECT c.fish_species, MIN(c.created_at) AS first_at, COUNT(*) AS n
     FROM catches c JOIN fish_encyclopedia e ON e.species = c.fish_species
     WHERE c.user_id = ? AND c.audit_status = 1 GROUP BY c.fish_species`,
    [req.user.id]
  );
  const caughtMap = Object.fromEntries(caught.map((c) => [c.fish_species, c]));
  res.json({
    total: species.length,
    unlocked: caught.length,
    items: species.map((s) => {
      const c = caughtMap[s.species];
      return {
        id: s.id,
        species: s.species,
        category: s.category,
        emoji: s.emoji,
        intro: s.intro,
        unlocked: !!c,
        firstCaughtAt: c ? c.first_at : null,
        catchCount: c ? c.n : 0,
      };
    }),
  });
}));

/** POST /api/v1/users/me/vip —— 开通会员（MVP 模拟支付） */
router.post('/me/vip', authRequired, ah(async (req, res) => {
  const plan = String(req.body?.plan || 'yearly');
  await pool.query('UPDATE users SET is_vip = 1 WHERE id = ?', [req.user.id]);
  res.json({ isVip: true, plan, message: '会员开通成功（MVP 模拟支付），已解锁 15 天鱼口趋势' });
}));

module.exports = router;
