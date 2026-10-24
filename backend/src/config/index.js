require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'fishing',
    password: process.env.DB_PASSWORD || 'fishing123',
    name: process.env.DB_NAME || 'fishing_app',
  },
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  // 和风天气 Web API Key：留空时使用内置模拟数据源（结构一致，配置后自动切换）
  hefengApiKey: process.env.HEFENG_API_KEY || '',
  isDev: process.env.NODE_ENV !== 'production',
};
