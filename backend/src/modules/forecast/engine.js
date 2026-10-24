/**
 * 鱼情引擎 v1 —— 分鱼种多因子加权规则（不做 ML，可解释、可配置、冷启动可用）
 * 对应需求文档第八节。
 *
 * 因子与方向：
 *  - pressure_absolute 气压绝对值：1000-1020 hPa 舒适区
 *  - pressure_trend    气压趋势：3h 下降 >5hPa 后趋稳 = 窗口信号；持续上升口弱
 *  - wind              风力：1.6-3.3 m/s（二级风）最宜；>8 m/s 安全风险上升
 *  - water_temp        水温估算：按鱼种配置区间（鲫鱼 15-25℃，鲤鱼 20-28℃）
 *  - precipitation     降水：微雨 0.1-4mm/h 刺激活动；暴雨不利
 *  - moon_tide         月相/潮汐：海钓权重高，淡水低权重
 */

const LEVELS = [
  { min: 82, name: '窗口期' },
  { min: 68, name: '较好' },
  { min: 52, name: '一般' },
  { min: 0, name: '冷' },
];

const WATER_DEPTH_OFFSET = { 水库: 2, 湖泊: 1.5, 河流: 1.2, 黑坑: 1, 近海: 0.5 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/* ---------------- 因子打分（0-100） ---------------- */

function pressureAbsoluteScore(p) {
  if (p >= 1000 && p <= 1020) return 100;
  if (p < 1000) return clamp(100 - (1000 - p) * 9, 5, 100);
  return clamp(100 - (p - 1020) * 6, 5, 100);
}

function pressureTrendScore(trend3h, stability1h) {
  if (trend3h <= -5 && stability1h <= 1) return 95; // 骤降后趋稳 = 窗口信号
  if (trend3h <= -5) return 65;                    // 骤降进行中
  if (trend3h <= -1) return 80;                    // 缓降
  if (trend3h < 1) return 70;                      // 平稳（可预期）
  if (trend3h < 3) return 55;                      // 小幅回升
  return clamp(50 - (trend3h - 3) * 6, 25, 50);    // 持续上升，口弱
}

function windScore(v) {
  if (v >= 1.6 && v <= 3.3) return 100;                        // 二级风最宜
  if (v < 1.6) return clamp(100 - (1.6 - v) * 35, 50, 100);    // 无风闷
  if (v <= 5) return clamp(85 - (v - 3.3) * 12, 60, 85);       // 三级
  if (v <= 8) return clamp(60 - (v - 5) * 10, 25, 60);         // 四到五级
  return clamp(25 - (v - 8) * 5, 5, 25);                       // >8m/s 安全风险
}

function waterTempScore(t, min, max) {
  if (t >= min && t <= max) return 100;
  const d = t < min ? min - t : t - max;
  return clamp(100 - d * 16, 0, 100);
}

function precipScore(r) {
  if (r <= 0) return 62;                              // 无雨
  if (r <= 4) return 92;                              // 微雨刺激
  if (r <= 10) return 55;                             // 中雨
  return clamp(30 - (r - 10) * 2, 15, 30);            // 暴雨不利
}

function moonTideScore(phase, category) {
  if (category === 'sea') {
    const distToNew = Math.min(phase, 1 - phase);     // 距新月（大潮）
    return clamp(45 + (1 - distToNew) * 50, 40, 100);
  }
  return 65 + Math.sin(phase * Math.PI * 2) * 12;     // 淡水低权重，平稳偏正
}

/* ---------------- 可解释标签 ---------------- */

function windScaleName(v) {
  if (v < 1.6) return '无风/软风';
  if (v < 3.4) return '二级';
  if (v < 5.5) return '三级';
  if (v < 8) return '四级';
  if (v < 10.8) return '五级';
  if (v < 13.9) return '六级';
  return '七级以上';
}

function labelPressure(p) {
  if (p >= 1000 && p <= 1020) return `气压 ${p}hPa，处于鱼类舒适区`;
  if (p < 1000) return `气压 ${p}hPa 偏低，鱼群谨慎`;
  return `气压 ${p}hPa 偏高，鱼口受压`;
}

function labelTrend(trend3h, stab1h) {
  if (trend3h <= -5 && stab1h <= 1) return `3小时气压下降 ${r1(Math.abs(trend3h))}hPa 后趋稳，开口窗口信号`;
  if (trend3h <= -5) return `气压快速下降中（3h 降 ${r1(Math.abs(trend3h))}hPa），趋稳前口躁`;
  if (trend3h <= -1) return `气压缓降 ${r1(Math.abs(trend3h))}hPa，缓慢诱鱼`;
  if (trend3h < 1) return `气压平稳，鱼情可预期`;
  if (trend3h < 3) return `气压小幅回升 ${r1(trend3h)}hPa`;
  return `气压持续上升，鱼口偏弱`;
}

function labelWaterTemp(t, species) {
  const inside = t >= species.water_temp_min && t <= species.water_temp_max;
  const pos = t < species.water_temp_min ? '偏低' : '偏高';
  return `水温约 ${r1(t)}℃，${inside ? '处于' : pos}${species.species}适宜区间 ${species.water_temp_min}-${species.water_temp_max}℃`;
}

function labelWind(h) {
  const scale = windScaleName(h.windSpeed);
  const warn = h.windSpeed > 8 ? '，安全风险上升注意防滑' : '';
  return `${h.windDir}风${scale}（${h.windSpeed}m/s）${warn}`;
}

function labelPrecip(r) {
  if (r <= 0) return '无降水';
  if (r <= 4) return `微雨 ${r}mm/h，刺激鱼口`;
  if (r <= 10) return `中雨 ${r}mm/h，鱼口转慢`;
  return `大雨 ${r}mm/h，不利出钓`;
}

function labelMoon(moon, category) {
  if (category === 'sea') {
    const bigTide = moon.phase < 0.1 || moon.phase > 0.9 || (moon.phase > 0.45 && moon.phase < 0.55);
    return `${moon.moonPhaseName}，潮汐流速${bigTide ? '大（大潮期）' : '中等'}`;
  }
  return `${moon.moonPhaseName}，对淡水鱼影响较小`;
}

/* ---------------- 水温估算 ---------------- */

/**
 * 水体热惯性模型：气温指数滑动平均（EMA，alpha=0.08，时间常数约 12h）
 * - 衰减日内温差（空气日振幅 ~8℃ → 水温 ~1.5℃），符合水体热惯性
 * - 再按水域深度偏移（深水更凉）
 */
function buildWaterTempSeries(water_type, hourly) {
  const alpha = 0.08;
  // 以全序列均温初始化，避免冷启动滞后（首日凌晨水温被前一日低温拉低）
  let ema = avg(hourly.map((h) => h.temp));
  return hourly.map((h) => {
    ema = ema + alpha * (h.temp - ema);
    return r1(ema - (WATER_DEPTH_OFFSET[water_type] ?? 1.5));
  });
}

/* ---------------- 主流程 ---------------- */

function levelName(score) {
  return (LEVELS.find((l) => score >= l.min) || LEVELS[LEVELS.length - 1]).name;
}

/**
 * @param {object} spot   钓点行（含 water_type）
 * @param {object} species 鱼种配置行（weights_json 已解析）
 * @param {object} weather weather.service 返回（hourly 覆盖过去24h+未来48h）
 * @param {string} dateStr 'YYYY-MM-DD'
 */
function computeForecast(spot, species, weather, dateStr) {
  const weights = species.weights_json;
  const waterTempSeries = buildWaterTempSeries(spot.water_type, weather.hourly);

  const hourly = weather.hourly
    .map((h, fullIdx) => ({ h, fullIdx }))
    .filter(({ h }) => h.time.slice(0, 10) === dateStr)
    .map(({ h, fullIdx }) => {
      const p3h = weather.hourly[fullIdx - 3]?.pressure ?? h.pressure;
      const p1h = weather.hourly[fullIdx - 1]?.pressure ?? h.pressure;
      const trend3h = r1(h.pressure - p3h);
      const stab1h = Math.abs(r1(h.pressure - p1h));
      const waterTemp = waterTempSeries[fullIdx];

      const factors = [
        { key: 'pressure_absolute', score: pressureAbsoluteScore(h.pressure), value: h.pressure, label: labelPressure(h.pressure) },
        { key: 'pressure_trend', score: pressureTrendScore(trend3h, stab1h), value: trend3h, label: labelTrend(trend3h, stab1h) },
        { key: 'wind', score: windScore(h.windSpeed), value: h.windSpeed, label: labelWind(h) },
        { key: 'water_temp', score: waterTempScore(waterTemp, species.water_temp_min, species.water_temp_max), value: waterTemp, label: labelWaterTemp(waterTemp, species) },
        { key: 'precipitation', score: precipScore(h.precip), value: h.precip, label: labelPrecip(h.precip) },
        { key: 'moon_tide', score: r1(moonTideScore(weather.moonPhase, species.category)), value: weather.moonPhase, label: labelMoon(weather, species.category) },
      ];

      let wSum = 0;
      let sSum = 0;
      for (const f of factors) {
        const w = weights[f.key] ?? 0;
        wSum += w;
        sSum += w * f.score;
      }
      const score = Math.round(clamp(sSum / (wSum || 1), 0, 100));

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
        waterTemp,
        dissolvedOxygen: h.dissolvedOxygen ?? null,
        skycon: h.skycon ?? null,
        factors,
      };
    });

  return { hourly, bestWindow: findBestWindow(hourly, species.species), topFactors: [] };
}

/* ---------------- 追加需求：AI 建议文案 / 15 天趋势 / 降雨提示 ---------------- */

/** 时间窗命名（参考竞品「黄金鱼段」话术） */
function windowName(startHour) {
  if (startHour >= 4 && startHour < 8) return '晨口';
  if (startHour >= 8 && startHour < 11) return '上午口';
  if (startHour >= 11 && startHour < 14) return '午口';
  if (startHour >= 14 && startHour < 18) return '黄金鱼段';
  if (startHour >= 18 && startHour < 21) return '晚口';
  return '夜钓窗口';
}

/**
 * 可解释的「AI 钓况解析」：完全由当日数据规则生成，不编造
 * 例：建议主攻黄金鱼段，15时前后下竿，午后转守深水。气压从1017.7hPa持续爬升至1024.5hPa，水温16.0-18.9℃，溶氧7.2-9.1mg/L。
 */
function computeAdvice(hourly, bestWindow, weather) {
  if (!bestWindow || !hourly.length) return '';
  const name = windowName(bestWindow.start);
  const p0 = hourly[0].pressure;
  const p1 = hourly[hourly.length - 1].pressure;
  const diff = r1(p1 - p0);
  let trendWord;
  if (diff >= 1) trendWord = '持续爬升';
  else if (diff <= -1) trendWord = '持续下降';
  else trendWord = '平稳维持';
  const temps = hourly.map((h) => h.waterTemp);
  const o2s = hourly.map((h) => h.dissolvedOxygen).filter((v) => v != null);
  // 水温午后偏高 → 建议转守深水/浅滩
  const midTemp = hourly[Math.floor(hourly.length / 2)].waterTemp;
  const endTemp = hourly[hourly.length - 1].waterTemp;
  const spotAdvice = midTemp > endTemp + 0.5 ? '午后转守深水' : '可浅滩与深水兼顾';
  const o2Part = o2s.length ? `，溶氧${r1(Math.min(...o2s))}-${r1(Math.max(...o2s))}mg/L` : '';
  return `建议主攻${name}，${bestWindow.start}时前后下竿，${spotAdvice}。气压从${p0}hPa${trendWord}至${p1}hPa，水温${r1(Math.min(...temps))}-${r1(Math.max(...temps))}℃${o2Part}。`;
}

/**
 * 15 天逐日趋势（VIP 黄金窗口预测的数据源）
 * @returns {Array<{date,weekday,score,level,bestWindow,tempMin,tempMax,isVip}>}
 */
function computeDailyTrend(spot, species, weather, anchorDateStr, days = 15) {
  const trend = [];
  const [Y, M, D] = anchorDateStr.split('-').map(Number);
  for (let d = 0; d < days; d++) {
    const t = new Date(Date.UTC(Y, M - 1, D + d));
    const dateStr = `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
    const { hourly } = computeForecast(spot, species, weather, dateStr);
    if (!hourly.length) continue;
    const top = hourly.reduce((a, b) => (b.score > a.score ? b : a), hourly[0]);
    trend.push({
      date: dateStr,
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][t.getUTCDay()],
      score: top.score,
      level: top.level,
      bestWindow: { start: top.hour, end: top.hour },
      tempMin: r1(Math.min(...hourly.map((h) => h.temp))),
      tempMax: r1(Math.max(...hourly.map((h) => h.temp))),
      isVip: d > 1, // 今天/明天免费，第三天起 VIP
    });
  }
  return trend;
}
function pad2(n) { return String(n).padStart(2, '0'); }

/** 未来两小时降雨提示（参考竞品首页「未来两小时不会下雨」） */
function nextRainInfo(hourly, nowHour) {
  const from = nowHour == null ? 12 : nowHour;
  const next = hourly.filter((h) => h.hour > from && h.hour <= from + 2);
  const rainy = next.find((h) => h.precip > 0);
  if (!rainy) return { willRain: false, text: '未来两小时不会下雨，放心出门吧' };
  const heavy = rainy.precip >= 4 ? '中雨' : '小雨';
  return { willRain: true, rainHour: rainy.hour, text: `预计 ${rainy.hour} 时有${heavy}，注意携带雨具` };
}

/** 最佳时间窗：优先 ≥75（窗口期）最长连续段，逐级降档 */
function findBestWindow(hourly, species) {
  if (!hourly.length) return null;
  for (const threshold of [82, 70, 58]) {
    let best = null;
    let start = -1;
    for (let i = 0; i <= hourly.length; i++) {
      const hit = i < hourly.length && hourly[i].score >= threshold;
      if (hit && start === -1) start = i;
      if (!hit && start !== -1) {
        const len = i - start;
        if (!best || len > best.end - best.start) best = { start, end: i - 1 };
        start = -1;
      }
    }
    if (best) {
      const seg = hourly.slice(best.start, best.end + 1);
      return {
        start: seg[0].hour,
        end: seg[seg.length - 1].hour,
        species,
        avgScore: Math.round(avg(seg.map((h) => h.score))),
        level: levelName(avg(seg.map((h) => h.score))),
      };
    }
  }
  // 兜底：全天最高分小时 ±1
  const top = hourly.reduce((a, b) => (b.score > a.score ? b : a), hourly[0]);
  return {
    start: Math.max(0, top.hour - 1),
    end: Math.min(23, top.hour + 1),
    species,
    avgScore: top.score,
    level: top.level,
  };
}

/** Top 2-3 影响因子：对最佳窗口内得分偏离基准(70)贡献最大者 */
function computeTopFactors(hourly, bestWindow, weights, species) {
  if (!bestWindow || !hourly.length) return [];
  const seg = hourly.filter((h) => h.hour >= bestWindow.start && h.hour <= bestWindow.end);
  const impacts = {};
  for (const h of seg) {
    for (const f of h.factors) {
      const w = weights[f.key] ?? 0;
      impacts[f.key] = impacts[f.key] || { key: f.key, label: f.label, impact: 0, score: 0, count: 0 };
      impacts[f.key].impact += Math.abs((f.score - 70) * w);
      impacts[f.key].score += f.score;
      impacts[f.key].count += 1;
    }
  }
  return Object.values(impacts)
    .map((f) => ({ ...f, impact: Math.round(f.impact), score: Math.round(f.score / f.count) }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 3)
    .map((f) => ({
      key: f.key,
      label: f.label,
      score: f.score,
      direction: f.score >= 70 ? 'positive' : 'negative',
      weight: weights[f.key] ?? 0,
    }));
}

module.exports = { computeForecast, computeTopFactors, computeAdvice, computeDailyTrend, nextRainInfo, windowName, levelName };
