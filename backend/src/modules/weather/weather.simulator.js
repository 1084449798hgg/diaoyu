/**
 * 天气数据模拟器
 * - 与和风天气逐小时 API 的输出结构对齐（配置 HEFENG_API_KEY 后无缝切换真实数据源）
 * - 基于 spotId + date 的确定性伪随机：同一钓点同一天多次生成结果一致
 * - 覆盖范围：锚定日期前 24h ~ 后 14 天（共 384 小时），支撑 15 天鱼口趋势（追加需求）
 * - 内置「天气剧情」：当天凌晨气压骤降 6hPa 后趋稳（窗口信号）、早晨微雨、午后阵风
 * - 追加字段：dissolvedOxygen 溶氧(mg/L)、skycon 天气文字（参考竞品逐小时表）
 */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 月相：以 2000-01-06 新月为基准，周期 29.53 天 */
function moonPhase(dateStr) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const days = (Date.UTC(Y, M - 1, D) - Date.UTC(2000, 0, 6)) / 86400000;
  const phase = ((days % 29.53) + 29.53) % 29.53 / 29.53;
  let name;
  if (phase < 0.025 || phase > 0.975) name = '新月';
  else if (phase < 0.225) name = '眉月';
  else if (phase < 0.275) name = '上弦月';
  else if (phase < 0.475) name = '盈凸月';
  else if (phase < 0.525) name = '满月';
  else if (phase < 0.725) name = '亏凸月';
  else if (phase < 0.775) name = '下弦月';
  else name = '残月';
  return { phase: r1(phase * 100) / 100, name };
}

function pad(n) { return String(n).padStart(2, '0'); }
function isoTime(t) {
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:00:00+08:00`;
}

const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 天气文字（参考竞品逐小时表：晴/多云/阴/小雨/中雨/大雨） */
function skyconText(precip, cloud) {
  if (precip >= 10) return '大雨';
  if (precip >= 4) return '中雨';
  if (precip > 0) return '小雨';
  if (cloud >= 85) return '阴';
  if (cloud >= 45) return '多云';
  return '晴';
}

/**
 * 气压剧情（相对锚定日期 00:00 的小时偏移 rel，-24 ~ +359）
 * - 当天：凌晨骤降 6hPa 后趋稳（窗口信号）
 * - 未来 14 天：3.5 天周期缓慢波动，保证逐日分数有区分度
 */
function pressureAt(rel, rand) {
  let p;
  if (rel < 0) p = 1009 + Math.sin((rel + 24) / 6) * 1.5;
  else if (rel < 3) p = 1009 - (rel / 3) * 2;
  else if (rel < 6) p = 1007 - ((rel - 3) / 3) * 6;
  else if (rel < 10) p = 1001 + (rand() - 0.5) * 0.8;
  else if (rel < 24) p = 1001 + (rel - 10) * 0.3;
  else p = 1011.5 + Math.sin(((rel - 24) / 84) * 2 * Math.PI) * 3.2 + Math.sin(rel / 13) * 0.6;
  return r1(p + (rand() - 0.5) * 0.4);
}

/** 溶氧估算：饱和溶氧随水温升高而下降，午后光合作用略高 */
function dissolvedOxygenAt(temp, pressure, hour, rand) {
  const sat = 14.2 - temp * 0.28 + (pressure - 1013) * 0.02;
  const daily = 0.8 * Math.sin(((hour - 15) / 24) * 2 * Math.PI);
  return r1(clamp(sat + daily + (rand() - 0.5) * 0.4, 4.5, 13.5));
}

const HOURS = 24 + 15 * 24; // 过去 24h + 未来 15 天

function generate(spotId, dateStr) {
  const [Y, M, D] = dateStr.split('-').map(Number);
  const rand = mulberry32(hashStr(`qiandao-lake:${spotId}:${dateStr}`));
  const start = Date.UTC(Y, M - 1, D - 1); // 前一天 00:00（覆盖过去 24h）
  const spotPhase = (spotId * 1.7) % (Math.PI * 2);
  const absDay0 = Math.floor((Date.UTC(Y, M - 1, D) - Date.UTC(2026, 0, 1)) / 86400000);

  const hourly = [];
  for (let i = 0; i < HOURS; i++) {
    const t = new Date(start + i * 3600e3);
    const hour = t.getUTCHours();
    const rel = i - 24;              // 锚定当天 00:00 为 0
    const absDay = absDay0 + Math.floor(rel / 24);
    const dayDrift = 2 * Math.sin(absDay * 0.4 + spotPhase); // 多日缓慢升温/降温（±2℃，约 15 天周期）

    const baseTemp = 18.5 + dayDrift;
    const amp = 7 + rand() * 2;
    const temp = r1(baseTemp + amp * Math.cos(((hour - 15) / 24) * 2 * Math.PI) + (rand() - 0.5));
    const pressure = pressureAt(rel, rand);

    // 风力：仅锚定当天保留「午后阵风」剧情；其余天轻风为主
    let wind = 1.8 + rand() * 1.6;
    if (rel >= 0 && rel < 24) {
      if (rel >= 14 && rel < 16) wind = 7.5 + rand() * 2.5; // 午后阵风 7.5-10 m/s（口弱+安全提示）
      if (rel >= 0 && rel < 6) wind = 1.2 + rand() * 0.8;
    }
    wind = r1(wind);

    // 降水：锚定当天 06-10 微雨（刺激鱼口）；前一天 18-20 时与锚定次日 02-05 时暴雨（不利）
    let precip = 0;
    if (rel >= 6 && rel < 10) precip = r1(0.5 + rand() * 2.5);
    else if ((rel >= -6 && rel < -4) || (rel >= 26 && rel < 29)) precip = r1(10 + rand() * 8);
    else if (rel >= 24 && rand() < 0.18) precip = r1(0.3 + rand() * 3);

    const humidity = Math.round(precip > 0 ? 82 + rand() * 15 : 58 + rand() * 28);
    const cloud = Math.round(precip > 0 ? 85 + rand() * 15 : 20 + rand() * 50);
    const dew = r1(temp - (100 - humidity) / 5);
    const dirBase = Math.floor(rand() * 8);

    hourly.push({
      time: isoTime(t),
      hour,
      weekday: WEEKDAYS[t.getUTCDay()],
      temp,
      pressure,
      windSpeed: wind,
      windDir: DIRS[(dirBase + Math.floor(i / 3)) % 8],
      precip,
      humidity,
      cloud,
      dewPoint: dew,
      skycon: skyconText(precip, cloud),
      dissolvedOxygen: dissolvedOxygenAt(temp, pressure, hour, rand),
    });
  }

  const moon = moonPhase(dateStr);
  return {
    spotId,
    date: dateStr,
    hourly,
    sunrise: '06:05',
    sunset: '17:25',
    moonPhase: moon.phase,
    moonPhaseName: moon.name,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generate, moonPhase };
