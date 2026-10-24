/**
 * 鱼情预报服务：Redis 缓存 → DB 快照 → 引擎计算，三级链路
 * 追加需求：days=15 逐日趋势（VIP 黄金窗口预测）、AI 建议文案、未来两小时降雨提示、溶氧透出
 */
const pool = require('../../db/pool');
const { cacheGet, cacheSet, secondsUntilEndOfDay } = require('../../cache/redis');
const weatherService = require('../weather/weather.service');
const { computeForecast, computeTopFactors, computeAdvice, computeDailyTrend, nextRainInfo } = require('./engine');
const { notFound, badRequest } = require('../../middleware/errors');

const DISCLAIMER = '预测仅供参考，不构成出钓决策保证';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 15;
const pad2 = (n) => String(n).padStart(2, '0');

async function getSpot(spotId) {
  const [rows] = await pool.query('SELECT * FROM fishing_spots WHERE id = ?', [spotId]);
  if (!rows.length) throw notFound(`钓点 #${spotId} 不存在`);
  return rows[0];
}

async function getSpeciesConfig(name) {
  const [rows] = await pool.query('SELECT * FROM fish_species_config WHERE species = ?', [name]);
  if (!rows.length) throw notFound(`鱼种「${name}」暂无预报配置`);
  return { ...rows[0], weights_json: typeof rows[0].weights_json === 'string' ? JSON.parse(rows[0].weights_json) : rows[0].weights_json };
}

function buildResult(spot, species, dateStr, hourly, bestWindow, source, weather, topFactors, extra = {}) {
  // 过去 24h + 当天全天气压序列（需求文档 FR-02：展示过去 24 小时气压趋势）
  const pressureTrend = weather
    ? weather.hourly
        .filter((h) => h.time.slice(0, 10) <= dateStr)
        .map((h) => ({ time: h.time, hour: h.hour, pressure: h.pressure, isToday: h.time.slice(0, 10) === dateStr }))
    : [];
  const advice = computeAdvice(hourly, bestWindow, weather);
  const nowUtc = new Date();
  const nowHour = (nowUtc.getUTCHours() + 8) % 24; // 东八区当前小时
  const todayStr = `${nowUtc.getUTCFullYear()}-${pad2(nowUtc.getUTCMonth() + 1)}-${pad2(nowUtc.getUTCDate())}`;
  const rain = dateStr === todayStr ? nextRainInfo(hourly, nowHour) : null;
  return {
    spotId: spot.id,
    spotName: spot.name,
    date: dateStr,
    species: species.species,
    hourly: hourly.map((h) => ({
      hour: h.hour,
      score: h.score,
      level: h.level,
      temp: h.temp,
      pressure: h.pressure,
      pressureTrend3h: h.pressureTrend3h,
      windSpeed: h.windSpeed,
      windDir: h.windDir,
      precip: h.precip,
      humidity: h.humidity,
      waterTemp: h.waterTemp,
      dissolvedOxygen: h.dissolvedOxygen,
      skycon: h.skycon,
      factors: h.factors.map((f) => ({ key: f.key, value: f.value, label: f.label, score: f.score })),
    })),
    bestWindow,
    topFactors: topFactors || [],
    pressureTrend,
    advice,
    nextRain: rain,
    dailyTrend: extra.dailyTrend || null,
    weatherMeta: weather
      ? { sunrise: weather.sunrise, sunset: weather.sunset, moonPhase: weather.moonPhase, moonPhaseName: weather.moonPhaseName, source: weather.meta.source, degraded: weather.meta.degraded }
      : undefined,
    disclaimer: DISCLAIMER,
    meta: { source },
  };
}

async function getForecast({ spotId, dateStr, speciesName, days = 1 }) {
  if (!DATE_RE.test(dateStr)) throw badRequest('date 需为 YYYY-MM-DD 格式');
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr < today) throw badRequest('不支持预报过去的日期，请从今天起选择');
  days = Math.min(Math.max(Number(days) || 1, 1), MAX_DAYS);

  const spot = await getSpot(spotId);
  const species = await getSpeciesConfig(speciesName);

  // 1) Redis 快照缓存（当天 23:59 过期）
  const cacheKey = `forecast:${spotId}:${dateStr}:${speciesName}:d${days}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, meta: { source: 'cache' } };

  // 2) MySQL 快照（未过期；仅单日预报走此链路，多日趋势实时算）
  if (days === 1) {
    const [rows] = await pool.query(
      'SELECT * FROM forecast_snapshots WHERE spot_id = ? AND target_date = ? AND species = ?',
      [spotId, dateStr, speciesName]
    );
    if (rows.length && new Date(rows[0].expires_at) > new Date()) {
      const weather = await weatherService.getWeather(spot, dateStr);
      const topFactors = computeTopFactors(rows[0].hourly_json, rows[0].best_window_json, species.weights_json, species);
      const result = buildResult(spot, species, dateStr, rows[0].hourly_json, rows[0].best_window_json, 'snapshot', weather, topFactors);
      await cacheSet(cacheKey, result, secondsUntilEndOfDay(dateStr));
      return result;
    }
  }

  // 3) 实时计算（天气经 Redis 缓存 + 降级）
  const weather = await weatherService.getWeather(spot, dateStr);
  const { hourly, bestWindow } = computeForecast(spot, species, weather, dateStr);
  const topFactors = computeTopFactors(hourly, bestWindow, species.weights_json, species);
  const dailyTrend = days > 1 ? computeDailyTrend(spot, species, weather, dateStr, days) : null;

  if (days === 1) {
    await pool.query(
      `INSERT INTO forecast_snapshots (spot_id, target_date, species, hourly_json, best_window_json, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hourly_json = VALUES(hourly_json), best_window_json = VALUES(best_window_json), expires_at = VALUES(expires_at)`,
      [spotId, dateStr, speciesName, JSON.stringify(hourly), JSON.stringify(bestWindow), `${dateStr} 23:59:59`]
    );
  }

  const result = buildResult(spot, species, dateStr, hourly, bestWindow, 'computed', weather, topFactors, { dailyTrend });
  await cacheSet(cacheKey, result, secondsUntilEndOfDay(dateStr));
  return result;
}

module.exports = { getForecast };
