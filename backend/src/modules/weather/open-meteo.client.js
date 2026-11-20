/**
 * Open-Meteo 公共天气客户端（免 Key，CC BY 4.0）
 * 按钓点经纬度拉取真实逐小时天气 + 海况，映射为内部统一结构。
 * 失败抛错，由 weather.service 降级到模拟器。
 *
 * 数据来源：
 *  - 天气 https://api.open-meteo.com/v1/forecast （16 天预报 + past_days 历史）
 *  - 海况 https://marine-api.open-meteo.com/v1/marine （仅近海）
 *  - 日出日落/月相由 reasoning.js 的 astro 本地计算，此处不依赖。
 */
const config = require('../../config');

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const TIMEOUT_MS = 4000;

const r1 = (v) => Math.round(v * 10) / 10;
const pad = (n) => String(n).padStart(2, '0');

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await globalThis.fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`open-meteo http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** WMO weather_code → 中文天气（雷暴必须含"雷"字，触发 reasoning 的硬封顶） */
function skyconOf(code) {
  if (code === 0) return '晴';
  if (code === 1 || code === 2) return '多云';
  if (code === 3) return '阴';
  if (code === 45 || code === 48) return '雾';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 65) return code >= 63 ? '中雨' : '小雨';
  if (code >= 66 && code <= 67) return '冻雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 85 && code <= 86) return '阵雪';
  if (code >= 95) return '雷暴'; // 95-99 雷暴（含雷电、冰雹）
  return '多云';
}

/** 风向度数 → 八方位中文（与模拟器 DIRS 对齐） */
function windDirOf(deg) {
  if (deg == null) return '北';
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** 溶氧估算（与 hefeng.client 一致） */
function dissolvedOxygen(temp, pressure) {
  return Math.round((14.2 - temp * 0.28 + (pressure - 1013) * 0.02) * 10) / 10;
}

/**
 * 拉取真实天气并映射为内部 weather 对象
 * @param {object} spot  钓点行（需 lng/lat；water_type 决定是否取海况）
 * @param {string} dateStr 'YYYY-MM-DD'
 */
async function fetch(spot, dateStr) {
  const lng = Number(spot.lng);
  const lat = Number(spot.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('钓点缺少经纬度');

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    timezone: 'auto',
    past_days: '1',
    forecast_days: '16',
    wind_speed_unit: 'ms',
    hourly: [
      'temperature_2m', 'relative_humidity_2m', 'pressure_msl', 'cloud_cover',
      'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    ].join(','),
  });

  const isSea = spot.water_type === '近海' || spot.water_type === 'sea';
  const marineParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    timezone: 'auto',
    forecast_days: '16',
    hourly: 'wave_height,sea_surface_temperature',
  });

  const [wx, marine] = await Promise.all([
    fetchJson(`${WEATHER_URL}?${params}`),
    isSea ? fetchJson(`${MARINE_URL}?${marineParams}`).catch(() => null) : Promise.resolve(null),
  ]);

  const H = wx.hourly;
  if (!H || !Array.isArray(H.time) || H.time.length === 0) throw new Error('open-meteo 无逐小时数据');

  // 海况按 time 索引对齐
  const waveByTime = {};
  if (marine && marine.hourly && Array.isArray(marine.hourly.time)) {
    marine.hourly.time.forEach((t, i) => { waveByTime[t] = marine.hourly.wave_height?.[i] ?? null; });
  }

  const hourly = H.time.map((t, i) => {
    // t 形如 "2026-11-20T05:00"（北京时间墙上时间，无时区后缀）→ 补 +08:00
    const [day, hhmm] = t.split('T');
    const hour = Number(hhmm.slice(0, 2));
    const temp = r1(Number(H.temperature_2m?.[i]) || 0);
    const pressure = r1(Number(H.pressure_msl?.[i]) || 1013);
    const precip = r1(Number(H.precipitation?.[i]) || 0);
    const cloud = Math.round(Number(H.cloud_cover?.[i]) || 0);
    const code = Number(H.weather_code?.[i]);
    return {
      time: `${day}T${hhmm}:00+08:00`,
      hour,
      temp,
      pressure,
      windSpeed: r1(Number(H.wind_speed_10m?.[i]) || 0),
      windDir: windDirOf(Number(H.wind_direction_10m?.[i])),
      precip,
      humidity: Math.round(Number(H.relative_humidity_2m?.[i]) || 0),
      cloud,
      dewPoint: r1(temp - (100 - (Number(H.relative_humidity_2m?.[i]) || 0)) / 5),
      skycon: skyconOf(code),
      dissolvedOxygen: dissolvedOxygen(temp, pressure),
      gust: r1(Number(H.wind_gusts_10m?.[i]) || 0),
      waveHeight: waveByTime[t] != null ? r1(Number(waveByTime[t])) : null,
      weatherCode: code,
    };
  });

  return {
    spotId: spot.id,
    date: dateStr,
    hourly,
    sunrise: null, // 由 astro 本地计算
    sunset: null,
    moonPhase: null, // 由 astro 本地计算
    moonPhaseName: null,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { fetch, skyconOf, windDirOf };
