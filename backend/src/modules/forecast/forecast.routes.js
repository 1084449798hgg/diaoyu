const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest } = require('../../middleware/errors');
const forecastService = require('./forecast.service');

const router = express.Router();

const WATER_TYPES = new Set(['水库', '河流', '黑坑', '湖泊', '近海']);
const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/**
 * GET /api/v1/forecast?spotId=&date=&species=&days=
 *   或  ?lng=&lat=&date=&species=&days=&waterType=&cityName=   （GPS 实时定位坐标模式）
 * 核心鱼情预报（需求文档 FR-01 / API 契约）
 * - 坐标模式：按任意经纬度构造内存虚拟 spot 取真实天气算指数，不入库；坐标与 spotId 同时存在时坐标优先
 * - days=15 时附带 dailyTrend 逐日趋势（VIP 黄金窗口预测数据源）
 */
router.get('/', ah(async (req, res) => {
  const { spotId, lng, lat, date, species, days, waterType, cityName } = req.query;
  if (!date || !species) throw badRequest('缺少必填参数 date / species');

  // 坐标模式判定：lng/lat 均在合法范围
  const lngNum = Number(lng);
  const latNum = Number(lat);
  const hasCoords = lng !== undefined && lat !== undefined && lng !== '' && lat !== ''
    && inRange(lngNum, -180, 180) && inRange(latNum, -90, 90);
  // 显式传了坐标但非法 → 400
  if ((lng !== undefined && lng !== '') || (lat !== undefined && lat !== '')) {
    if (!hasCoords) throw badRequest('经纬度参数不合法：lng 需在 -180~180，lat 需在 -90~90');
  }
  // 无坐标时必须有 spotId
  if (!hasCoords && !spotId) throw badRequest('缺少必填参数 spotId（或提供合法的 lng/lat）');

  const result = await forecastService.getForecast({
    spotId: spotId ? Number(spotId) : undefined,
    coords: hasCoords ? { lng: lngNum, lat: latNum } : null,
    waterType: WATER_TYPES.has(String(waterType)) ? String(waterType) : undefined,
    cityName: cityName ? String(cityName).slice(0, 40) : undefined,
    dateStr: String(date),
    speciesName: String(species),
    days: days ? Number(days) : 1,
  });
  res.json(result);
}));

/**
 * GET /api/v1/forecast/reasoning?spotId=&date=&species=
 * 鱼情推理链（v2 开源混合引擎）：三层可解释推理 + 因子明细 + 建议 + 算法来源署名
 */
router.get('/reasoning', ah(async (req, res) => {
  const { spotId, date, species } = req.query;
  if (!spotId || !date || !species) throw badRequest('缺少必填参数 spotId / date / species');
  const result = await forecastService.getReasoning({
    spotId: Number(spotId),
    dateStr: String(date),
    speciesName: String(species),
  });
  res.json(result);
}));

module.exports = router;
