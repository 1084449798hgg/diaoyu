/**
 * 天气服务：Redis 缓存（TTL 1h + 版本前缀）+ 多数据源降级
 * 数据源优先级：open-meteo（默认真实源，免 Key）→ hefeng（配了 KEY 且显式指定）→ 模拟器兜底
 * meta.source 透出实际来源（open-meteo/hefeng/cache/degraded），前端无感。
 */
const config = require('../../config');
const { cacheGet, cacheSet } = require('../../cache/redis');
const simulator = require('./weather.simulator');
const hefeng = require('./hefeng.client');
const openMeteo = require('./open-meteo.client');

const CACHE_PREFIX = 'weather';
const WEATHER_SCHEMA_VERSION = 'om-v1'; // 天气数据结构版本，切换数据源时递增使旧缓存自动失效
const TTL_SECONDS = 3600; // 1 小时（逐小时数据 1 小时更新一次）

async function getWeather(spot, dateStr) {
  const key = `${CACHE_PREFIX}:${WEATHER_SCHEMA_VERSION}:${spot.id}:${dateStr}`;

  const cached = await cacheGet(key);
  if (cached) return { ...cached, meta: { source: 'cache', degraded: false } };

  // 主数据源：默认 open-meteo；显式指定 hefeng 且配了 KEY 时用和风
  const source = config.weatherSource === 'hefeng' && config.hefengApiKey
    ? 'hefeng'
    : config.weatherSource === 'simulator'
      ? 'simulator'
      : 'open-meteo';

  let data;
  let actualSource = source;
  let degraded = false;
  try {
    if (source === 'hefeng') data = await hefeng.fetch(spot, dateStr);
    else if (source === 'simulator') data = simulator.generate(spot.id, dateStr);
    else data = await openMeteo.fetch(spot, dateStr);
  } catch (e) {
    console.warn(`[weather] 数据源 ${source} 失败，降级模拟器:`, e.message);
    data = simulator.generate(spot.id, dateStr);
    actualSource = 'degraded';
    degraded = true;
  }

  await cacheSet(key, data, TTL_SECONDS);
  return { ...data, meta: { source: actualSource, degraded } };
}

module.exports = { getWeather };
