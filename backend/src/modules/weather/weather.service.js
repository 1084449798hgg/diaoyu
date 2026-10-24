/**
 * 天气服务：Redis 缓存（TTL 1h + 0-30s jitter）+ 多数据源降级
 * 数据源优先级：和风真实 API（已配置 KEY）→ 内置模拟器 → 失败降级到模拟器
 */
const config = require('../../config');
const { cacheGet, cacheSet } = require('../../cache/redis');
const simulator = require('./weather.simulator');
const hefeng = require('./hefeng.client');

const CACHE_PREFIX = 'weather';
const TTL_SECONDS = 3600; // 1 小时（逐小时数据 1 小时更新一次）

async function getWeather(spot, dateStr) {
  const key = `${CACHE_PREFIX}:${spot.id}:${dateStr}`;

  const cached = await cacheGet(key);
  if (cached) return { ...cached, meta: { source: 'cache', degraded: false } };

  let data;
  let source = config.hefengApiKey ? 'hefeng' : 'simulator';
  let degraded = false;
  try {
    data = config.hefengApiKey ? await hefeng.fetch(spot, dateStr) : simulator.generate(spot.id, dateStr);
  } catch (e) {
    console.warn(`[weather] 数据源 ${source} 失败，降级模拟器:`, e.message);
    data = simulator.generate(spot.id, dateStr);
    source = 'degraded';
    degraded = true;
  }

  await cacheSet(key, data, TTL_SECONDS);
  return { ...data, meta: { source, degraded } };
}

module.exports = { getWeather };
