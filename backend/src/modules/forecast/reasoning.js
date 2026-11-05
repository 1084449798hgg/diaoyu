/**
 * 鱼情推理引擎 v2（Hybrid Reasoner）—— 气象 → 地理环境 → 水域 → 鱼情结论
 *
 * 引入的开源算法（保留出处与许可证）：
 *  1. q3579338/fishing-weather-forecast-china  docs/model.md 鱼情模型 v0.3  [MIT]
 *     八因子加权（水温/气压/温变/风/天空/时段/月相潮/水域）、水温闸门、
 *     3h 滑动平均、日分 0.6·最佳6h + 0.4·全天、危险封顶、48h 降雨涨水、
 *     风向→下风岸钓位、季节水温带→水层/饵型建议。
 *     https://github.com/q3579338/fishing-weather-forecast-china
 *  2. Chris-db/FishCast  js/engine.js  [MIT]
 *     天气闸门（weather gate）作为合成乘数、气压趋势评分、Solunar 大/小口窗口。
 *     https://github.com/Chris-db/FishCast
 *  3. mourner/suncalc  [BSD-2-Clause]（经本目录 astro.js 移植）
 *     按经纬度本地计算日出日落/月相/月中天/月出月落天文事件。
 *     https://github.com/mourner/suncalc
 *
 * 设计原则：每一个分数都产出一句中文因果理由（可解释、不编造），三层推理
 * 各自有独立 summary 与 steps，供前端做「推理链」可视化。纯函数、无副作用。
 */
const astro = require('./astro');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const pad2 = (n) => String(n).padStart(2, '0');

/* 鱼种适宜水温四区间 (tmin, opt_lo, opt_hi, tmax) —— 移植自 model.md §5 [MIT] */
const SPECIES_TEMP = {
  鲫鱼:   [5, 15, 25, 30], 鲤鱼: [10, 18, 28, 32], 草鱼: [15, 20, 30, 33],
  鲢鳙:   [16, 22, 30, 34], 罗非: [18, 24, 32, 36], 翘嘴: [8, 15, 28, 32],
  鲈鱼:   [10, 18, 28, 32], 黑鱼: [12, 20, 30, 34], 鳜鱼: [10, 18, 28, 30],
  黄颡鱼: [10, 18, 28, 32], 青鱼: [10, 18, 28, 32], 鳊鱼: [8, 15, 26, 30],
  鲶鱼:   [10, 18, 28, 32], 白条: [8, 15, 28, 32],
};

/* 水域类型 → 中文/英文/基础分/地形建议（模型 §3.8、§7 [MIT]） */
const WATER_PROFILE = {
  水库: { en: 'RESERVOIR', en2: '深水 · 岸线复杂', base: 75, terrain: '找回水湾、岬角、老河道、深浅交界', depthTag: '深水大水面', stratify: true },
  湖泊: { en: 'LAKE',      en2: '静水 · 水草丰茂', base: 75, terrain: '找草边、进出水口、铧尖', depthTag: '中等水深', stratify: true },
  河流: { en: 'RIVER',     en2: '流水 · 含沙变化', base: 80, terrain: '找回水湾、缓流、桥墩下游', depthTag: '流动水体', stratify: false },
  黑坑: { en: 'POND',      en2: '小水体 · 人工投放', base: 80, terrain: '找增氧机、进水口、深水区', depthTag: '浅水小塘', stratify: false },
  近海: { en: 'SEA',       en2: '潮汐 · 咸水', base: 80, terrain: '看潮汐，平潮前后半小时口差', depthTag: '潮汐影响', stratify: false },
};
const WIND_DIR_DEG = { 北: 0, 东北: 45, 东: 90, 东南: 135, 南: 180, 西南: 225, 西: 270, 西北: 315 };
const DIR8 = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

const LEVELS = [
  { min: 80, name: '极佳', en: 'EXCELLENT', text: '难得的开口日，值得专程去一趟' },
  { min: 65, name: '好',   en: 'GOOD',      text: '值得去，留意扣分最多的那一项' },
  { min: 50, name: '一般', en: 'FAIR',      text: '能钓，选对时段和水层才有口' },
  { min: 35, name: '偏差', en: 'POOR',      text: '鱼口偏弱，短钓或改天' },
  { min: 0,  name: '不建议', en: 'AVOID',   text: '条件不利，建议改天再战' },
];
const levelOf = (s) => LEVELS.find((l) => s >= l.min) || LEVELS[LEVELS.length - 1];

/* ================= 派生量 ================= */

/** 某日的逐小时项（按 dateStr 过滤） */
function dayHours(weather, dateStr) {
  return weather.hourly.map((h, i) => ({ h, i })).filter(({ h }) => h.time.slice(0, 10) === dateStr);
}
function dailyMeanTemp(weather, dateStr, fallback) {
  const hs = dayHours(weather, dateStr).map((x) => x.h.temp);
  return hs.length ? avg(hs) : fallback;
}
function prevDay(dateStr) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(Y, M - 1, D - 1));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * 水温序列：气温 EMA（水体热惯性）+ 水深偏移。
 * 对齐模型 §2 的「5 日加权日均气温」思想；本项目天气序列覆盖过去 24h + 未来 15 天，
 * 用 alpha=0.08 的指数滑动平均近似水体滞后（时间常数约 12h），再按水域深度降温。
 */
const DEPTH_OFFSET = { 水库: 2, 湖泊: 1.5, 河流: 1.2, 黑坑: 1, 近海: 0.5 };
function buildWaterTempSeries(waterType, hourly) {
  const alpha = 0.08;
  let ema = avg(hourly.map((h) => h.temp));
  return hourly.map((h) => { ema = ema + alpha * (h.temp - ema); return r1(ema - (DEPTH_OFFSET[waterType] ?? 1.5)); });
}

function seasonOf(W) { return W < 12 ? 'cold' : W <= 26 ? 'mild' : 'hot'; }
const SEASON_CN = { cold: '冷季', mild: '适温季', hot: '热季' };

/** 过去 48h 降水总和（含该小时及之前共 48 个值）—— 模型 §3.8 */
function rain48(weather, fullIdx) {
  const from = Math.max(0, fullIdx - 47);
  return r1(weather.hourly.slice(from, fullIdx + 1).reduce((s, h) => s + (h.precip || 0), 0));
}

/* ================= 八因子（0-100，各带中文理由） ================= */

function fTemp(W, sp) {
  const [tmin, optLo, optHi, tmax] = sp;
  let score, reason;
  if (W >= optLo && W <= optHi) { score = 100; reason = `水温 ${r1(W)}℃ 正处最适区间 ${optLo}-${optHi}℃，鱼摄食活跃`; }
  else if (W >= tmin && W < optLo) { score = 20 + 80 * (W - tmin) / (optLo - tmin); reason = `水温 ${r1(W)}℃ 偏凉，接近但未达最适 ${optLo}℃，活性渐升`; }
  else if (W > optHi && W <= tmax) { score = 20 + 80 * (tmax - W) / (tmax - optHi); reason = `水温 ${r1(W)}℃ 偏高，超过最适 ${optHi}℃，鱼趋深避暑`; }
  else if (W < tmin) { score = Math.max(0, 20 - 5 * (tmin - W)); reason = `水温 ${r1(W)}℃ 低于耐受下限 ${tmin}℃，几乎停口`; }
  else { score = Math.max(0, 20 - 5 * (W - tmax)); reason = `水温 ${r1(W)}℃ 高于耐受上限 ${tmax}℃，易缺氧`; }
  return { score: clamp(score, 0, 100), reason };
}

function fPressure(P, d3, d24, temp, wind) {
  let s = 100; const notes = [];
  if (P < 1000) { s -= Math.min(30, 3 * (1000 - P)); notes.push(`气压 ${P}hPa 偏低`); }
  if (P > 1030) { s -= Math.min(20, 2 * (P - 1030)); notes.push(`气压 ${P}hPa 过高压鱼口`); }
  if (d24 <= -6) { s -= 25; notes.push('24h 急降锋面过境'); }
  else if (d24 <= -3) { s -= 10; notes.push('24h 明显下降'); }
  else if (d24 >= 6) { s -= 25; notes.push('冷锋后高压闭口'); }
  else if (d24 >= 3) { s -= 10; notes.push('24h 持续回升'); }
  else notes.push('气压平稳，鱼情可预期');
  if (d3 <= -1 && d24 > -6) { s += 5; notes.push('3h 短时降压，雨前开口'); }
  if (P < 1005 && temp >= 30 && wind < 2) { s -= 20; notes.push('低压闷热、易缺氧浮头'); }
  return { score: clamp(s, 0, 100), reason: notes.join('；') };
}

function fTrend(dT, season) {
  let s = 80, reason;
  if (dT <= -6) { s -= 50; reason = `日均温骤降 ${r1(Math.abs(dT))}℃，鱼应激躲深水`; }
  else if (dT <= -3) { s -= 25; reason = `日均温下降 ${r1(Math.abs(dT))}℃，口转慢`; }
  else if (dT >= 3) {
    s += season === 'cold' ? 20 : season === 'mild' ? 10 : -20;
    reason = season === 'hot' ? `升温 ${r1(dT)}℃ 叠加高水温，闷热不利` : `回暖 ${r1(dT)}℃，${SEASON_CN[season]}诱鱼上浅`;
  } else { s += 10; reason = '日际气温平稳，鱼层稳定'; }
  return { score: clamp(s, 0, 100), reason };
}

function fWind(v, dirDeg, season) {
  let s, reason;
  if (v < 0.5) { s = season === 'cold' ? 70 : season === 'mild' ? 60 : 50; reason = '近乎无风，水体易分层缺氧'; }
  else if (v < 3.4) { s = 100; reason = `风力 ${r1(v)}m/s 二级上下，水面轻漾最宜`; }
  else if (v < 5.5) { s = 85; reason = `风力 ${r1(v)}m/s 三级，尚可`; }
  else if (v < 8) { s = 60; reason = `风力 ${r1(v)}m/s 四级，抛投受影响`; }
  else if (v < 10.8) { s = 30; reason = `风力 ${r1(v)}m/s 五级，口弱且需注意安全`; }
  else { s = 0; reason = `风力 ${r1(v)}m/s 六级以上，不宜出钓`; }
  const north = dirDeg != null && (dirDeg >= 315 || dirDeg <= 45);
  if (season === 'cold' && north && v >= 3.4) { s -= 15; reason += '；冷季北风降温再压口'; }
  return { score: clamp(s, 0, 100), reason };
}

function fSky(cloud, precip, skycon, season) {
  const thunder = /雷/.test(skycon || '');
  if (thunder) return { score: 0, reason: '雷暴天气，鱼藏深水且严禁出钓' };
  if (/雪|雾|霾/.test(skycon || '')) return { score: 40, reason: `${skycon}，光线与气压异常，口弱` };
  const table = {
    hot:  { clear: 55, part: 80, over: 100, light: 100, mid: 60, heavy: 20 },
    mild: { clear: 80, part: 100, over: 90, light: 85, mid: 55, heavy: 20 },
    cold: { clear: 100, part: 85, over: 65, light: 50, mid: 50, heavy: 20 },
  }[season];
  let key, reason;
  if (precip >= 8) { key = 'heavy'; reason = `大雨 ${precip}mm/h，水面扰动、水体浑浊`; }
  else if (precip >= 2.5) { key = 'mid'; reason = `中雨 ${precip}mm/h，鱼口转慢`; }
  else if (precip >= 0.1) { key = 'light'; reason = `微雨 ${precip}mm/h，增氧刺激鱼口`; }
  else if (cloud >= 70) { key = 'over'; reason = `阴天云量 ${cloud}%，弱光`; }
  else if (cloud >= 30) { key = 'part'; reason = `多云云量 ${cloud}%，光线柔和最宜`; }
  else { key = 'clear'; reason = `晴云量 ${cloud}%，光照强`; }
  return { score: table[key], reason };
}

/** 时段分：晨昏窗/午间/夜间 + Solunar 大口小口加分（模型 §3.6、§3.5 [MIT]） */
function fTime(hourMs, hour, sunriseMs, sunsetMs, season, ev3) {
  const H = 3600000;
  let s, reason;
  const sr = sunriseMs, ss = sunsetMs;
  if (sr != null && ss != null) {
    if (hourMs >= sr - H && hourMs <= sr + 2 * H) { s = 100; reason = '晨口窗口（日出前后），鱼靠岸觅食'; }
    else if (hourMs >= ss - 2 * H && hourMs <= ss + H) { s = 100; reason = '昏口窗口（日落前后），全天第二个高峰'; }
    else if (hour >= 11 && hour < 15) { s = season === 'hot' ? 30 : season === 'mild' ? 70 : 100; reason = season === 'cold' ? '冷季午间升温，正午最好' : '午间强光，鱼退深水'; }
    else if (sr != null && (hourMs > ss + H || hourMs < sr - H)) { s = season === 'hot' ? 75 : season === 'mild' ? 45 : 20; reason = season === 'cold' ? '夜间低温，鱼停口' : '夜间靠边，部分鱼种可夜钓'; }
    else { s = 70; reason = '白天常规时段'; }
  } else { s = 70; reason = '天文时刻缺省，按常规时段'; }
  const sol = astro.solunarBonus(hourMs, ev3);
  if (sol.bonus) { s = Math.min(100, s + sol.bonus); reason += `；叠加${sol.tag}（+${sol.bonus}）`; }
  return { score: s, reason };
}

function fMoon(phase) {
  const a = phase * 29.53;
  const d = Math.min(a, Math.abs(a - 14.77), 29.53 - a);
  let s, reason;
  if (d <= 2) { s = 100; reason = `月龄 ${r1(a)} 天，近新月/满月大潮期，活动强`; }
  else if (d <= 4) { s = 75; reason = `月龄 ${r1(a)} 天，近大潮，活动偏强`; }
  else { s = 55; reason = `月龄 ${r1(a)} 天，小潮期，影响平平`; }
  return { score: s, reason };
}

/** 水域/地理因子：48h 降雨涨水、季节小水体缺氧、海浪（模型 §3.8 [MIT]） */
function fGeo(waterType, rain, season, wind) {
  const p = WATER_PROFILE[waterType] || WATER_PROFILE.湖泊;
  let s = p.base, reason = `${waterType}（${p.en2}），基础分 ${p.base}`;
  if (waterType === '河流' && rain > 30) { s = 30; reason = `过去 48h 降水 ${r1(rain)}mm，河流涨水浑浊，鱼避急流靠湾`; }
  else if (waterType === '河流') { s = 80; reason = `过去 48h 降水 ${r1(rain)}mm，水位平稳，缓流区可钓`; }
  if (waterType === '黑坑' && season === 'hot' && wind < 2) { s = 50; reason = '小水体热季无风，易闷塘缺氧'; }
  if (waterType === '水库' && season === 'hot') { s = 80; reason = '水库热季深水凉爽，分层明显'; }
  return { score: s, reason };
}

/* ================= 天气闸门（FishCast MIT） ================= */
function weatherGate(wind, precip, gust, temp) {
  const ramp = (v, start, zero) => (v <= start ? 1 : v >= zero ? 0 : 1 - (v - start) / (zero - start));
  const gWind = ramp(wind, 5.5, 13.9);
  const gRain = precip >= 8 ? 0.45 : precip >= 2.5 ? 0.8 : 1;
  const gTemp = temp >= 35 ? 0.8 : temp <= 0 ? 0.85 : 1;
  const g = clamp(gWind * gRain * gTemp, 0, 1);
  return { g: r1(g), parts: { wind: r1(gWind), rain: gRain, temp: gTemp } };
}

/* ================= 主推理 ================= */
const FACTOR_META = {
  temp: { label: '水温', en: 'WATER TEMP', weight: 25, icon: 'droplet' },
  pressure: { label: '气压', en: 'PRESSURE', weight: 20, icon: 'gauge' },
  trend: { label: '温变', en: 'TEMP SHIFT', weight: 15, icon: 'trend' },
  wind: { label: '风', en: 'WIND', weight: 10, icon: 'wind' },
  sky: { label: '天空', en: 'SKY', weight: 10, icon: 'cloud' },
  time: { label: '时段', en: 'TIME / SOLUNAR', weight: 10, icon: 'clock' },
  moon: { label: '月相', en: 'MOON', weight: 5, icon: 'moon' },
  geo: { label: '水域', en: 'WATER BODY', weight: 5, icon: 'waves' },
};

/**
 * @param {object} spot    钓点行（water_type, depth_ref, lng, lat, city, name）
 * @param {object} species 鱼种配置（species, water_temp_min/max, category）
 * @param {object} weather weather.service 返回（hourly 覆盖过去24h+未来15天）
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns 可解释推理链对象
 */
function reason(spot, species, weather, dateStr) {
  const waterType = spot.water_type || '湖泊';
  const wp = WATER_PROFILE[waterType] || WATER_PROFILE.湖泊;
  const lat = Number(spot.lat) || 29.6, lng = Number(spot.lng) || 119.05;
  const name = species.species || '鲫鱼';
  const sp = SPECIES_TEMP[name] || [
    Number(species.water_temp_min) || 8, (Number(species.water_temp_min) || 8) + 5,
    (Number(species.water_temp_max) || 28) - 3, Number(species.water_temp_max) || 28,
  ];

  const wtSeries = buildWaterTempSeries(waterType, weather.hourly);
  const hours = dayHours(weather, dateStr);
  const W = hours.length ? r1(avg(hours.map((x) => wtSeries[x.i]))) : r1(avg(wtSeries));
  const season = seasonOf(W);
  const Ta = dailyMeanTemp(weather, dateStr, W);
  const TaPrev = dailyMeanTemp(weather, prevDay(dateStr), Ta);
  const dT = r1(Ta - TaPrev);

  // 天文：本地正午求日出日落；三天月事件合集求 Solunar
  const localNoon = Date.parse(`${dateStr}T04:00:00Z`);
  const sun = astro.sunTimes(localNoon, lat, lng);
  const moon = astro.moonIllumination(localNoon);
  const midnight = Date.parse(`${dateStr}T16:00:00Z`); // 本地 00:00 = UTC 前一日 16:00
  const ev3 = { upper: [], lower: [], rises: [], sets: [] };
  for (const off of [-1, 0, 1]) {
    const ev = astro.moonEvents(midnight + off * 86400000, lat, lng);
    for (const k of Object.keys(ev3)) ev3[k].push(...ev[k]);
  }
  const phaseName = astro.moonPhaseName(moon.phase);

  // 逐小时八因子 → 原始分 H
  const hourlyScored = hours.map(({ h, i }) => {
    const hourMs = Date.parse(h.time) || (localNoon + (h.hour - 12) * 3600000);
    const P = h.pressure;
    const p3 = weather.hourly[i - 3]?.pressure ?? P;
    const p24 = weather.hourly[i - 24]?.pressure ?? P;
    const d3 = r1(P - p3), d24 = r1(P - p24);
    const dirDeg = WIND_DIR_DEG[h.windDir];
    const rain = rain48(weather, i);
    const waterTemp = wtSeries[i];

    const F = {
      temp: fTemp(waterTemp, sp),
      pressure: fPressure(P, d3, d24, h.temp, h.windSpeed),
      trend: fTrend(dT, season),
      wind: fWind(h.windSpeed, dirDeg, season),
      sky: fSky(h.cloud, h.precip, h.skycon, season),
      time: fTime(hourMs, h.hour, sun.sunrise, sun.sunset, season, ev3),
      moon: fMoon(moon.phase),
      geo: fGeo(waterType, rain, season, h.windSpeed),
    };
    // 加权和 /100
    let sum = 0;
    for (const k of Object.keys(F)) sum += FACTOR_META[k].weight * F[k].score / 100;
    // 水温闸门 g（模型 §3.9）
    const g = 0.5 + 0.5 * F.temp.score / 100;
    // 天气闸门（FishCast）
    const gate = weatherGate(h.windSpeed, h.precip, null, h.temp);
    let H = g * gate.g * sum;
    // 硬封顶（模型 §4）
    let cap = null, safety = null;
    if (/雷/.test(h.skycon || '')) { cap = 10; safety = '雷暴，远离水边、收起碳素竿'; }
    else if (h.windSpeed >= 10.8) { cap = 20; safety = '阵风 7 级以上，别去开阔水面和堤坝'; }
    else if (h.precip >= 8) { cap = 35; safety = '强降水，河道注意涨水'; }
    if (cap != null) H = Math.min(H, cap);
    return { hour: h.hour, h, F, g: r1(g), gate: gate.g, sum: Math.round(sum), rain, waterTemp, H: Math.round(clamp(H, 0, 100)), cap, safety };
  });

  // 3h 居中滑动平均（模型 §6）
  const Hs = hourlyScored.map((x, idx, arr) => {
    const win = [arr[idx - 1]?.H, arr[idx]?.H, arr[idx + 1]?.H].filter((v) => v != null);
    return avg(win);
  });
  hourlyScored.forEach((x, idx) => { x.Hs = Math.round(Hs[idx]); });

  // 参与小时 04:00-22:00
  const participating = hourlyScored.filter((x) => x.hour >= 4 && x.hour <= 22);
  const scores = participating.map((x) => x.Hs).sort((a, b) => b - a);
  const A6 = avg(scores.slice(0, 6));
  const Aall = avg(scores);
  let dayScore = Math.round(0.6 * A6 + 0.4 * Aall);

  // 日级危险封顶（模型 §6）
  const thunderHours = hourlyScored.filter((x) => /雷/.test(x.h.skycon || '')).length;
  const galeHours = hourlyScored.filter((x) => x.h.windSpeed >= 10.8).length;
  let dayCap = null;
  if (thunderHours >= 3 || (waterType === '近海' && galeHours >= 3)) dayCap = 45;
  else if (thunderHours >= 1 || galeHours >= 1) dayCap = 60;
  if (dayCap != null) dayScore = Math.min(dayScore, dayCap);
  const level = levelOf(dayScore);

  // 最佳窗口：贪心取最高点 ±1h，屏蔽 ±2h，最多 3 段
  const windows = [];
  const blocked = new Set();
  const pool = [...participating].sort((a, b) => b.Hs - a.Hs || a.hour - b.hour);
  for (let n = 0; n < 3 && pool.length; n++) {
    const c = pool.find((x) => !blocked.has(x.hour) && x.Hs >= 35);
    if (!c) break;
    windows.push({ start: Math.max(0, c.hour - 1), end: Math.min(23, c.hour + 1), score: c.Hs, tag: c.F.time.reason.includes('大口') ? '大口' : c.F.time.reason.includes('小口') ? '小口' : '' });
    for (let hh = c.hour - 2; hh <= c.hour + 2; hh++) blocked.add(hh);
  }

  // 代表小时（Hs 最高）用于因子明细与理由
  const rep = participating.reduce((a, b) => (b.Hs > a.Hs ? b : a), participating[0] || hourlyScored[0]);
  const repRain = rep.rain;

  /* ---------- 三层推理链 ---------- */
  const meteorologySteps = ['temp', 'pressure', 'trend', 'wind', 'sky', 'time', 'moon'].map((k) => ({
    key: k, label: FACTOR_META[k].label, en: FACTOR_META[k].en, icon: FACTOR_META[k].icon,
    weight: FACTOR_META[k].weight, score: Math.round(rep.F[k].score), reason: rep.F[k].reason,
  }));
  const geoSteps = [
    { key: 'type', label: '水域类型', en: 'WATER TYPE', icon: 'waves', value: `${waterType} · ${wp.en}`, reason: `${wp.en2}。${wp.terrain}。` },
    { key: 'depth', label: '水深结构', en: 'DEPTH', icon: 'layers', value: spot.depth_ref || wp.depthTag, reason: wp.stratify ? '大水面存在温跃层，鱼随水温在深浅间垂直迁移，需按水层找鱼' : '水体较浅或流动，昼夜温差小，鱼层相对稳定' },
    { key: 'rain48', label: '48h 汇水', en: 'RUNOFF', icon: 'droplet', value: `${r1(repRain)} mm`, reason: waterType === '河流' && repRain > 30 ? '降雨汇流使河水上涨变浑，鱼避急流、聚于回水湾与缓流区' : '近期降水未造成明显涨水浑浊，水位与能见度稳定' },
    { key: 'season', label: '季节水温带', en: 'THERMAL BAND', icon: 'thermometer', value: `${SEASON_CN[season]} · ${r1(W)}℃`, reason: season === 'cold' ? '冷水季鱼代谢低、趋深趋阳，宜腥香、钓底' : season === 'hot' ? '高温季表层过热缺氧，鱼早晚靠边、午间退深' : '适温季鱼层分布均匀，全天相对可钓' },
  ];
  const astroSteps = [
    { key: 'sun', label: '日出 / 日落', en: 'SUN', icon: 'sun', value: sun.sunrise && sun.sunset ? `${fmtHM(sun.sunrise)} / ${fmtHM(sun.sunset)}` : '—', reason: '按钓点经纬度本地计算，界定晨口与昏口两个黄金窗口' },
    { key: 'moon', label: '月相', en: 'MOON PHASE', icon: 'moon', value: `${phaseName} · 月龄 ${r1(moon.phase * 29.53)} 天`, reason: `月相影响光照与潮汐节律，${fMoon(moon.phase).reason}` },
    { key: 'solunar', label: 'Solunar 窗口', en: 'SOLUNAR', icon: 'sparkles', value: `${ev3.upper.length + ev3.lower.length} 个大口 / ${ev3.rises.length + ev3.sets.length} 个小口`, reason: '月上/下中天前后 1 小时为大口、月出月落前后半小时为小口，叠加在时段分上' },
    { key: 'coord', label: '地理坐标', en: 'COORDINATES', icon: 'pin', value: `${lat.toFixed(3)}°N ${lng.toFixed(3)}°E`, reason: `${spot.city || '钓点所在水域'}，天文事件与季节水温带均以此坐标本地推算` },
  ];

  /* ---------- 建议（模型 §7 规则生成，不编造） ---------- */
  const bestWindDir = rep.h.windDir, bestWindDeg = WIND_DIR_DEG[bestWindDir] ?? 0, bestWindV = rep.h.windSpeed;
  const dirFrom = bestWindDir;
  const downwind = DIR8[(Math.round(bestWindDeg / 45) + 4) % 8];
  const layerAdvice = W < 10 ? '深水底层、午后向阳' : W < 18 ? '中下层、向阳浅滩，午后最好' : W <= 26 ? '早晚浅滩、中午深水' : '早晚与夜里浅水，白天深水/树荫/进水口';
  const baitAdvice = W < 12 ? '腥香、小颗粒、蚯蚓红虫' : W <= 22 ? '腥香谷香皆可' : '清淡、果酸、谷物';
  let positionAdvice;
  if (bestWindV < 0.5) positionAdvice = '无风，钓位影响小，优先找结构';
  else if (season === 'cold' && (bestWindDeg >= 315 || bestWindDeg <= 45)) positionAdvice = '背风向阳，选北岸';
  else if (bestWindV < 5.5) positionAdvice = `风从${dirFrom}来，钓${downwind}岸（下风岸），风把食物和氧气吹过去`;
  else positionAdvice = '风力 4 级以上，选背风、站位平稳的岸，安全第一';

  const safetySet = [...new Set(hourlyScored.map((x) => x.safety).filter(Boolean))];
  if (W <= 2) safetySet.push('可能结冰：冰钓安全第一，冰厚不到 10 厘米不上冰');

  /* ---------- 第三层：合成计算链（把「加权 → 闸门 → 滑动平均 → 日分 → 结论」显式化） ---------- */
  const repWeighted = rep.sum;
  const afterWaterGate = Math.round(repWeighted * rep.g);
  const afterWeatherGate = Math.round(afterWaterGate * rep.gate);
  const geoStep = geoSteps.find((s) => s.key === 'rain48') || geoSteps[0];
  const synthesisSteps = [
    { key: 'weighted', label: '八因子加权', en: 'WEIGHTED SUM', icon: 'layers', value: `${repWeighted} 分`, reason: `水温25 / 气压20 / 温变15 / 风10 / 天空10 / 时段10 / 月相5 / 水域5，按代表时段 ${pad2(rep.hour)}:00 逐项加权求和` },
    { key: 'watergate', label: '水温闸门', en: 'THERMAL GATE', icon: 'droplet', value: `× ${rep.g}`, reason: `水温 ${r1(rep.waterTemp)}℃ 对应 g = 0.5 + 0.5·水温分/100；水温离谱时整体打折，因为再好的气压也钓不到鱼` },
    { key: 'weathergate', label: '天气闸门', en: 'WEATHER GATE', icon: 'wind', value: `× ${rep.gate}`, reason: `取自 FishCast：大风/强降水/极端气温拉低乘数，${rep.gate >= 1 ? '当前天气无额外折减' : '当前天气触发折减'}` },
    { key: 'geo', label: '地理·水域修正', en: 'GEO CONTEXT', icon: 'waves', value: waterType, reason: `${wp.en2}；${geoStep.reason}。该层还决定水层、钓位与饵型建议` },
    { key: 'smooth', label: '3h 平滑 + 日分', en: 'SMOOTHING', icon: 'trend', value: `${dayScore} 分`, reason: `逐小时分做 3 小时居中滑动平均，日分 = 0.6×最佳6小时均值 + 0.4×全天均值${dayCap != null ? `，并因危险天气封顶至 ${dayCap}` : ''}` },
    { key: 'verdict', label: '结论', en: 'VERDICT', icon: 'target', value: `${level.name} · ${level.en}`, reason: `${level.text}。${windows.length ? `建议 ${pad2(windows[0].start)}:00 前后下竿` : '全天鱼口偏弱，建议改天'}` },
  ];

  return {
    model: 'hybrid-v2',
    version: '1.0.0',
    attribution: [
      { name: 'fishing-weather-forecast-china · 鱼情模型 v0.3', license: 'MIT', url: 'https://github.com/q3579338/fishing-weather-forecast-china', use: '八因子加权 / 水温闸门 / 日分 / 危险封顶 / 水域与钓位建议' },
      { name: 'FishCast', license: 'MIT', url: 'https://github.com/Chris-db/FishCast', use: '天气闸门 / 气压趋势 / Solunar 窗口' },
      { name: 'suncalc', license: 'BSD-2-Clause', url: 'https://github.com/mourner/suncalc', use: '日出日落 / 月相 / 月中天月出月落天文算法' },
    ],
    place: {
      name: spot.name, city: spot.city, waterType, waterTypeEn: wp.en, waterTypeDesc: wp.en2,
      depth: spot.depth_ref || wp.depthTag, lat, lng,
    },
    species: name,
    date: dateStr,
    conclusion: {
      score: dayScore, level: level.name, levelEn: level.en, levelText: level.text,
      headline: `今日鱼情 ${dayScore} 分 · ${level.name}`,
      bestWindows: windows,
      dayCap,
      gate: { waterTemp: rep.g, weather: rep.gate },
      safety: safetySet,
      summary: `以 ${r1(W)}℃ 水温、${SEASON_CN[season]}为底，${waterType}水域叠加气压${rep.h.pressure}hPa 与 ${r1(rep.h.windSpeed)}m/s ${rep.h.windDir}风，${windows.length ? `最佳下竿 ${pad2(windows[0].start)}:00–${pad2(windows[0].end)}:00` : '全天鱼口偏弱'}。`,
    },
    layers: [
      { key: 'meteorology', no: '01', label: '气象层', en: 'METEOROLOGY', icon: 'cloud', summary: `七项气象因子加权，代表时段 ${pad2(rep.hour)}:00 逐项打分`, steps: meteorologySteps },
      { key: 'geography', no: '02', label: '地理环境层', en: 'GEOGRAPHY & WATER', icon: 'pin', summary: `天文节律 + 水域地形 + 汇水，决定「在哪、何时」下竿`, steps: [...astroSteps, ...geoSteps] },
      { key: 'synthesis', no: '03', label: '鱼情结论', en: 'SYNTHESIS', icon: 'target', summary: '加权和 × 水温闸门 × 天气闸门 → 3h 平滑 → 日分 → 黄金窗口', steps: synthesisSteps },
    ],
    factors: meteorologySteps.map((s) => ({ ...s, contribution: Math.round(s.weight * s.score / 100 * 10) / 10 })),
    hourly: hourlyScored.map((x) => ({ hour: x.hour, H: x.H, Hs: x.Hs, cap: x.cap })),
    advice: { layer: layerAdvice, position: positionAdvice, bait: baitAdvice, terrain: wp.terrain, season: SEASON_CN[season], waterTemp: W },
    disclaimer: '本推理基于开源经验模型与气象数据，仅供出钓参考，不构成鱼获保证；请遵守当地禁钓与渔获规定。',
  };
}

function fmtHM(ms) {
  // 东八区本地时刻
  const d = new Date(ms + 8 * 3600000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

module.exports = { reason, levelOf, SPECIES_TEMP, WATER_PROFILE };
