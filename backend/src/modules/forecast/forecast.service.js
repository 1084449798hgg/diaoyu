/**
 * 鱼情预报服务：Redis 缓存 → DB 快照 → 引擎计算，三级链路
 * v1.1：指数走权威模型（reasoning），顶层透出 score/level/modelVersion。
 */
const pool = require('../../db/pool');
const { cacheGet, cacheSet, secondsUntilEndOfDay } = require('../../cache/redis');
const weatherService = require('../weather/weather.service');
const { computeForecast, computeTopFactors, computeAdvice, computeDailyTrend, nextRainInfo } = require('./engine');
const reasoningEngine = require('./reasoning');
const { notFound, badRequest } = require('../../middleware/errors');

const DISCLAIMER = '预测仅供参考，不构成出钓决策保证';
const MODEL_VERSION = 'fishcast-v1.1'; // 算法版本，改算法时递增使缓存/快照自动失效
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
  const pressureTrend = weather
    ? weather.hourly
        .filter((h) => h.time.slice(0, 10) <= dateStr)
        .map((h) => ({ time: h.time, hour: h.hour, pressure: h.pressure, isToday: h.time.slice(0, 10) === dateStr }))
    : [];
  const advice = extra.advice || computeAdvice(hourly, bestWindow, weather, extra.R);
  const nowUtc = new Date();
  const nowHour = (nowUtc.getUTCHours() + 8) % 24;
  const todayStr = `${nowUtc.getUTCFullYear()}-${pad2(nowUtc.getUTCMonth() + 1)}-${pad2(nowUtc.getUTCDate())}`;
  const rain = dateStr === todayStr ? nextRainInfo(hourly, nowHour) : null;
  return {
    spotId: spot.id,
    spotName: spot.name,
    date: dateStr,
    species: species.species,
    // v1.1 顶层权威分数（首页优先取此字段）
    score: extra.score ?? bestWindow?.avgScore ?? 0,
    level: extra.level ?? bestWindow?.level ?? '',
    modelVersion: MODEL_VERSION,
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
      factors: (h.factors || []).map((f) => ({ key: f.key, value: f.value, label: f.label, score: f.score })),
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

  // 1) Redis 缓存（带模型版本）
  const cacheKey = `forecast:${MODEL_VERSION}:${spotId}:${dateStr}:${speciesName}:d${days}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, meta: { source: 'cache' } };

  // 2) MySQL 快照（带模型版本；仅单日）
  if (days === 1) {
    const [rows] = await pool.query(
      'SELECT * FROM forecast_snapshots WHERE spot_id = ? AND target_date = ? AND species = ? AND model_version = ?',
      [spotId, dateStr, speciesName, MODEL_VERSION]
    );
    if (rows.length && new Date(rows[0].expires_at) > new Date()) {
      const weather = await weatherService.getWeather(spot, dateStr);
      const R = reasoningEngine.reason(spot, species, weather, dateStr);
      const topFactors = computeTopFactors(rows[0].hourly_json, rows[0].best_window_json, species.weights_json, species, R);
      const result = buildResult(spot, species, dateStr, rows[0].hourly_json, rows[0].best_window_json, 'snapshot', weather, topFactors, {
        score: R.conclusion.score, level: R.conclusion.level, advice: R.conclusion.summary, R,
      });
      await cacheSet(cacheKey, result, secondsUntilEndOfDay(dateStr));
      return result;
    }
  }

  // 3) 实时计算
  const weather = await weatherService.getWeather(spot, dateStr);
  const forecast = computeForecast(spot, species, weather, dateStr);
  const { hourly, bestWindow, dayScore, level, _R: R } = forecast;
  const topFactors = computeTopFactors(hourly, bestWindow, species.weights_json, species, R);
  const dailyTrend = days > 1 ? computeDailyTrend(spot, species, weather, dateStr, days) : null;

  if (days === 1) {
    await pool.query(
      `INSERT INTO forecast_snapshots (spot_id, target_date, species, hourly_json, best_window_json, model_version, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE hourly_json = VALUES(hourly_json), best_window_json = VALUES(best_window_json), model_version = VALUES(model_version), expires_at = VALUES(expires_at)`,
      [spotId, dateStr, speciesName, JSON.stringify(hourly), JSON.stringify(bestWindow), MODEL_VERSION, `${dateStr} 23:59:59`]
    );
  }

  const result = buildResult(spot, species, dateStr, hourly, bestWindow, 'computed', weather, topFactors, {
    score: dayScore, level, advice: R && R.conclusion ? R.conclusion.summary : null, R, dailyTrend,
  });
  await cacheSet(cacheKey, result, secondsUntilEndOfDay(dateStr));
  return result;
}

/**
 * 鱼情推理（v2 开源混合引擎）—— 保持原样，零回归
 */
async function getReasoning({ spotId, dateStr, speciesName }) {
  if (!DATE_RE.test(dateStr)) throw badRequest('date 需为 YYYY-MM-DD 格式');
  const cacheKey = `reasoning:${spotId}:${dateStr}:${speciesName}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, meta: { source: 'cache' } };

  const spot = await getSpot(spotId);
  const species = await getSpeciesConfig(speciesName);
  const weather = await weatherService.getWeather(spot, dateStr);
  const result = reasoningEngine.reason(spot, species, weather, dateStr);
  await cacheSet(cacheKey, result, secondsUntilEndOfDay(dateStr));
  return result;
}

module.exports = { getForecast, getReasoning };
