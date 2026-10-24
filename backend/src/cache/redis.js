/**
 * 缓存封装：Redis 优先，连接异常时自动降级为进程内内存缓存。
 * TTL 统一附加 0-30 秒随机 jitter，防止缓存雪崩（需求文档 NFR-02）。
 */
const Redis = require('ioredis');
const config = require('../config');

let redis = null;
try {
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy: () => null, // 不自动重连风暴，交给降级逻辑
  });
  redis.on('error', () => { /* 静默：走内存缓存 */ });
} catch {
  redis = null;
}

const memStore = new Map(); // key -> { value, expireAt }

async function cacheGet(key) {
  try {
    if (redis && redis.status === 'ready') {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch { /* fallthrough */ }
  const hit = memStore.get(key);
  if (!hit) return null;
  if (hit.expireAt < Date.now()) {
    memStore.delete(key);
    return null;
  }
  return hit.value;
}

async function cacheSet(key, value, ttlSeconds) {
  const jitter = Math.floor(Math.random() * 30); // 0-30s 随机抖动
  const ttl = ttlSeconds + jitter;
  try {
    if (redis && redis.status === 'ready') {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return;
    }
  } catch { /* fallthrough */ }
  memStore.set(key, { value, expireAt: Date.now() + ttl * 1000 });
  if (memStore.size > 500) {
    const now = Date.now();
    for (const [k, v] of memStore) if (v.expireAt < now) memStore.delete(k);
  }
}

async function cacheDel(key) {
  try {
    if (redis && redis.status === 'ready') await redis.del(key);
  } catch { /* ignore */ }
  memStore.delete(key);
}

/** 计算到当天 23:59 的剩余秒数 */
function secondsUntilEndOfDay(dateStr) {
  const end = new Date(`${dateStr}T23:59:59+08:00`);
  return Math.max(60, Math.floor((end.getTime() - Date.now()) / 1000));
}

module.exports = { cacheGet, cacheSet, cacheDel, secondsUntilEndOfDay, redis };
