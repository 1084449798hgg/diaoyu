const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest } = require('../../middleware/errors');
const forecastService = require('./forecast.service');

const router = express.Router();

/**
 * GET /api/v1/forecast?spotId=&date=&species=&days=
 * 核心鱼情预报（需求文档 FR-01 / API 契约）
 * days=15 时附带 dailyTrend 逐日趋势（VIP 黄金窗口预测数据源）
 */
router.get('/', ah(async (req, res) => {
  const { spotId, date, species, days } = req.query;
  if (!spotId || !date || !species) throw badRequest('缺少必填参数 spotId / date / species');
  const result = await forecastService.getForecast({
    spotId: Number(spotId),
    dateStr: String(date),
    speciesName: String(species),
    days: days ? Number(days) : 1,
  });
  res.json(result);
}));

module.exports = router;
