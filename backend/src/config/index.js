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
  // 天气数据源：open-meteo（默认，免 Key 真实天气）| hefeng（需 KEY）| simulator（内置模拟）
  weatherSource: process.env.WEATHER_SOURCE || 'open-meteo',
  // 和风天气 Web API Key（仅 WEATHER_SOURCE=hefeng 时启用）
  hefengApiKey: process.env.HEFENG_API_KEY || '',
  isDev: process.env.NODE_ENV !== 'production',
};
