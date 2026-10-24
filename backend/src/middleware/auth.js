const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized } = require('./errors');

function signToken(user) {
  return jwt.sign({ sub: String(user.id), phone: user.phone }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/** 必须登录 */
function authRequired(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('缺少访问令牌，请先登录'));
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = { id: Number(payload.sub), phone: payload.phone };
    next();
  } catch {
    next(unauthorized('令牌无效或已过期，请重新登录'));
  }
}

/** 可选登录：有令牌则解析，无令牌放行 */
function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      req.user = { id: Number(payload.sub), phone: payload.phone };
    } catch { /* 忽略无效令牌 */ }
  }
  next();
}

module.exports = { signToken, authRequired, authOptional };
