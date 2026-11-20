/**
 * 鱼情引擎 v1.1 —— 首页/天气页指数适配层
 *
 * v1.0 曾用六因子加权 + 全满分舒适区，分数长期扎堆 80+，不真实。
 * v1.1 直接复用 v2 的权威开源模型 reasoning.reason()（FishCast v0.3：
 * 八因子加权 / 水温闸门 / 天气闸门 / 3h 平滑 / 0.6·最好6h+0.4·全天 / 危险封顶），
 * 让首页指数与推理页完全同口径 —— 分数随真实天气拉开分布（雷暴/大风/低水温显著降分）。
 *
 * 本文件保留 v1 的全部导出函数签名与返回结构，forecast.service / 前端零改动即可受益。
 * reasoning.js 本身不改，v2 零回归。
 */
const reasoning = require('./reasoning');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const pad2 = (n) => String(n).padStart(2, '0');

function levelName(score) {
  return reasoning.levelOf(score).name;
}

/**
 * 计算某日预报 —— 内部走 v2 模型，对外保持 v1 结构。
 * @param {object} spot 钓点行（含 water_type/lng/lat/city/name）
 * @param {object} species 鱼种配置行（weights_json 兼容但不再用于打分）
 * @param {object} weather weather.service 返回
 * @param {string} dateStr 'YYYY-MM-DD'
 */
function computeForecast(spot, species, weather, dateStr) {
  const R = reasoning.reason(spot, species, weather, dateStr);
  const concl = R.conclusion;

  // reason.hourly: [{hour, H, Hs, cap}] —— Hs 为 3h 平滑后的逐小时分（0-100）
  const scoredMap = new Map(R.hourly.map((x) => [x.hour, x]));

  // 水温序列（与 reasoning 同口径：EMA 热惯性 + 水深偏移），供逐小时展示
  const DEPTH_OFFSET = { 水库: 2, 湖泊: 1.5, 河流: 1.2, 黑坑: 1, 近海: 0.5 };
  const alpha = 0.08;
  let ema = avg(weather.hourly.map((h) => h.temp));
  const wtSeries = weather.hourly.map((h) => {
    ema = ema + alpha * (h.temp - ema);
    return r1(ema - (DEPTH_OFFSET[spot.water_type] ?? 1.5));
  });

  // 按 dateStr 取当天逐小时气象，组装 v1 hourly[]（图表/逐小时表所需气象字段 + 新分数）
  const dayHours = weather.hourly
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.time.slice(0, 10) === dateStr);

  const hourly = dayHours.map(({ h, i }) => {
    const s = scoredMap.get(h.hour);
    const score = s ? s.Hs : Math.round(clamp(concl.score, 0, 100));
    const p3h = weather.hourly[i - 3]?.pressure ?? h.pressure;
    const trend3h = r1(h.pressure - p3h);
    return {
      hour: h.hour,
      time: h.time,
      score,
      level: levelName(score),
      temp: h.temp,
      pressure: h.pressure,
      pressureTrend3h: trend3h,
      windSpeed: h.windSpeed,
      windDir: h.windDir,
      precip: h.precip,
      humidity: h.humidity,
      cloud: h.cloud,
      waterTemp: wtSeries[i],
      dissolvedOxygen: h.dissolvedOxygen ?? null,
      skycon: h.skycon ?? null,
      factors: [], // v1 前端不逐条展示；明细见 topFactors / 推理页
    };
  });

  // bestWindow：取模型结论的最佳窗口首段；avgScore 用窗口分（真实模型分）
  const win = concl.bestWindows && concl.bestWindows[0];
  const bestWindow = win
    ? { start: win.start, end: win.end, species: species.species, avgScore: win.score, level: levelName(win.score) }
    : { start: 6, end: 8, species: species.species, avgScore: concl.score, level: concl.level };

  return {
    hourly,
    bestWindow,
    topFactors: [],
    // v1.1 新增：首页总分直接取模型日分（forecast.service 会透出到顶层 score）
    dayScore: concl.score,
    level: concl.level,
    _R: R, // 供 forecast.service 复用推理结果生成 advice/topFactors，避免重复计算
  };
}

/** 15 天逐日趋势：每天走 reason() 拿真实日分，与首页同口径 */
function computeDailyTrend(spot, species, weather, anchorDateStr, days = 15) {
  const trend = [];
  const [Y, M, D] = anchorDateStr.split('-').map(Number);
  for (let d = 0; d < days; d++) {
    const t = new Date(Date.UTC(Y, M - 1, D + d));
    const dateStr = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
    try {
      const R = reasoning.reason(spot, species, weather, dateStr);
      const concl = R.conclusion;
      const win = concl.bestWindows && concl.bestWindows[0];
      const { hourly } = computeForecast(spot, species, weather, dateStr);
      trend.push({
        date: dateStr,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][t.getUTCDay()],
        score: concl.score,
        level: concl.level,
        bestWindow: win ? { start: win.start, end: win.end } : { start: 6, end: 8 },
        tempMin: hourly.length ? r1(Math.min(...hourly.map((h) => h.temp))) : null,
        tempMax: hourly.length ? r1(Math.max(...hourly.map((h) => h.temp))) : null,
        isVip: d > 1,
      });
    } catch (e) {
      // 单日失败不影响整体趋势
      console.warn(`[engine] dailyTrend ${dateStr} 计算失败:`, e.message);
    }
  }
  return trend;
}

/** topFactors：从模型 factors（代表时段七项）构造 v1 前端所需结构 */
function computeTopFactors(hourly, bestWindow, weights, species, R) {
  if (R && R.factors) {
    return R.factors
      .slice()
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((f) => ({
        key: f.key,
        label: f.label,
        score: f.score,
        direction: f.score >= 70 ? 'positive' : 'negative',
        weight: f.weight,
      }));
  }
  return [];
}

/** 可解释建议文案：直接用模型的 summary（更贴合真实数据） */
function computeAdvice(hourly, bestWindow, weather, R) {
  if (R && R.conclusion && R.conclusion.summary) return R.conclusion.summary;
  return '';
}

/** 未来两小时降雨提示（保留原逻辑） */
function nextRainInfo(hourly, nowHour) {
  const from = nowHour == null ? 12 : nowHour;
  const next = hourly.filter((h) => h.hour > from && h.hour <= from + 2);
  const rainy = next.find((h) => h.precip > 0);
  if (!rainy) return { willRain: false, text: '未来两小时不会下雨，放心出门吧' };
  const heavy = rainy.precip >= 4 ? '中雨' : '小雨';
  return { willRain: true, rainHour: rainy.hour, text: `预计 ${rainy.hour} 时有${heavy}，注意携带雨具` };
}

function windowName(startHour) {
  if (startHour >= 4 && startHour < 8) return '晨口';
  if (startHour >= 8 && startHour < 11) return '上午口';
  if (startHour >= 11 && startHour < 14) return '午口';
  if (startHour >= 14 && startHour < 18) return '黄金鱼段';
  if (startHour >= 18 && startHour < 21) return '晚口';
  return '夜钓窗口';
}

module.exports = {
  computeForecast, computeTopFactors, computeAdvice, computeDailyTrend,
  nextRainInfo, windowName, levelName,
};
