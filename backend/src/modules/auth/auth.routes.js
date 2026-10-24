const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, unauthorized, tooMany } = require('../../middleware/errors');
const { signToken } = require('../../middleware/auth');
const { cacheGet, cacheSet, cacheDel } = require('../../cache/redis');
const pool = require('../../db/pool');
const config = require('../../config');

const router = express.Router();

const PHONE_RE = /^1\d{10}$/;

/** POST /api/v1/auth/code —— 发送登录验证码 */
router.post('/code', ah(async (req, res) => {
  const { phone } = req.body || {};
  if (!PHONE_RE.test(phone || '')) throw badRequest('手机号格式不正确');
  const key = `sms:${phone}`;
  if (await cacheGet(key)) throw tooMany('验证码发送过于频繁，请 60 秒后重试');
  const code = config.isDev ? '123456' : String(Math.floor(100000 + Math.random() * 900000));
  await cacheSet(key, { code }, 300);
  // 生产环境：调用短信服务商发送；开发模式直接返回验证码
  res.json({ message: '验证码已发送', devCode: config.isDev ? code : undefined });
}));

/** POST /api/v1/auth/login —— 手机号 + 验证码登录，返回 JWT */
router.post('/login', ah(async (req, res) => {
  const { phone, code } = req.body || {};
  if (!PHONE_RE.test(phone || '')) throw badRequest('手机号格式不正确');
  if (!code) throw badRequest('请输入验证码');

  const key = `sms:${phone}`;
  const rec = await cacheGet(key);
  const devPass = config.isDev && code === '123456';
  if (!devPass && (!rec || rec.code !== String(code))) {
    throw unauthorized('验证码错误或已过期');
  }
  await cacheDel(key);

  let [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
  let user = rows[0];
  if (!user) {
    const [r] = await pool.query('INSERT INTO users (phone, nickname) VALUES (?, ?)', [
      phone,
      `钓友${phone.slice(-4)}`,
    ]);
    user = { id: r.insertId, phone, nickname: `钓友${phone.slice(-4)}`, avatar_url: null };
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, phone: user.phone, nickname: user.nickname, avatarUrl: user.avatar_url },
  });
}));

module.exports = router;
