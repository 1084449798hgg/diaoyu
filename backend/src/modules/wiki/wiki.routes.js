const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest } = require('../../middleware/errors');

const router = express.Router();

/* ---------------- 钓鱼百科 ---------------- */

const ARTICLES = [
  { id: 1, title: '新手第一次出钓，装备清单与避坑指南', cover: '🎣', category: '入门', reads: 12834, digest: '竿、线、漂、饵四大件怎么配，一篇讲清' },
  { id: 2, title: '气压与鱼口的关系：为什么闷天鱼不咬钩？', cover: '🌡️', category: '钓理', reads: 9521, digest: '从溶氧角度理解气压变化对鱼情的影响' },
  { id: 3, title: '鲫鱼四季饵料配方（春腥夏淡秋香冬浓）', cover: '🪱', category: '饵料', reads: 8734, digest: '对应季节调整味型与状态' },
  { id: 4, title: '鲤鱼调漂入门：从灵钝讲到顿口', cover: '🎯', category: '钓技', reads: 7620, digest: '顿口、黑漂、顶漂的抓口时机' },
  { id: 5, title: '夏季夜钓安全手册：防蛇防蚊防雷击', cover: '🌙', category: '安全', reads: 6890, digest: '夜钓虽爽，安全第一' },
  { id: 6, title: '路亚入门：拟饵选择与操作手法', cover: '🐟', category: '路亚', reads: 6210, digest: '亮片、米诺、软虫的适用场景' },
  { id: 7, title: '海钓基础：潮汐、流向与标点选择', cover: '🌊', category: '海钓', reads: 5430, digest: '看懂潮汐表，找到鱼的必经之路' },
  { id: 8, title: '2026 新《渔业法》要点：这些水域不能钓', cover: '⚖️', category: '法规', reads: 12053, digest: '禁钓区、禁钓期与合规垂钓' },
];

router.get('/articles', ah(async (_req, res) => {
  res.json({ total: ARTICLES.length, items: ARTICLES });
}));

/* ---------------- 附近渔具 ---------------- */

const GEAR_SHOPS = [
  { id: 1, name: '千岛湖渔具城', type: '综合渔具店', distance: 1.2, rating: 4.8, tags: ['钓竿', '饵料', '免费停车'], address: '淳安县千岛湖镇新安南路 88 号' },
  { id: 2, name: '老张饵料坊', type: '饵料店', distance: 2.4, rating: 4.6, tags: ['自制饵料', '现磨'], address: '千岛湖镇砚香路 12 号' },
  { id: 3, name: '临湖钓具', type: '钓具店', distance: 3.1, rating: 4.5, tags: ['路亚', '海钓用具'], address: '千岛湖镇环湖北路 45 号' },
  { id: 4, name: '姜家渔需', type: '综合渔具店', distance: 8.6, rating: 4.3, tags: ['鱼护', '钓箱'], address: '姜家镇镇前街 3 号' },
  { id: 5, name: '汾口户外联盟', type: '户外店', distance: 12.8, rating: 4.2, tags: ['露营', '钓具'], address: '汾口镇风华路 76 号' },
  { id: 6, name: '大墅农资渔具', type: '综合店', distance: 15.3, rating: 4.0, tags: ['饵料', '廉价'], address: '大墅镇中心路 21 号' },
];

router.get('/gear-shops', ah(async (_req, res) => {
  res.json({ total: GEAR_SHOPS.length, items: GEAR_SHOPS });
}));

/* ---------------- 潮汐查询 ---------------- */

/**
 * 潮汐推算（半日潮简化模型，确定性算法）
 * 以月相为基准：高潮间隔约 12h25min，大潮出现在朔望（新月/满月）
 */
function computeTide(dateStr, moonPhase) {
  const p = moonPhase ?? 0.5;
  const firstHigh = (p * 24.84) % 12.42;
  const fmt = (h) => {
    const hh = Math.floor(h) % 24;
    const mm = Math.round((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 59 : mm).padStart(2, '0')}`;
  };
  const strength = 0.5 + 0.5 * Math.cos(4 * Math.PI * p); // 朔望最大
  const range = Math.round((1.2 + 2.8 * strength) * 100) / 100;
  const name = strength > 0.8 ? '大潮' : strength > 0.5 ? '中潮' : '小潮';
  const height = (k) => Math.round((range / 2 + k * 0.35) * 100) / 100;
  return {
    date: dateStr,
    type: '半日潮',
    name,
    tideRange: range,
    tides: [
      { time: fmt(firstHigh), type: '高潮', height: height(0.8) },
      { time: fmt(firstHigh + 6.21), type: '低潮', height: height(0.2) },
      { time: fmt(firstHigh + 12.42), type: '高潮', height: height(0.7) },
      { time: fmt(firstHigh + 18.63), type: '低潮', height: height(0.3) },
    ],
    advice: name === '大潮'
      ? '大潮期水流急，海钓选洄湾缓流处，注意安全'
      : '潮水流速中等，适合大多数标点作钓',
  };
}

router.get('/tide', ah(async (req, res) => {
  const dateStr = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw badRequest('date 需为 YYYY-MM-DD 格式');
  const { moonPhase } = require('../weather/weather.simulator');
  const { phase } = moonPhase(dateStr);
  res.json(computeTide(dateStr, phase));
}));

module.exports = router;
