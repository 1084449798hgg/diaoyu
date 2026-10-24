/**
 * 和风天气 Web API 客户端
 * 免费额度 50000 次/月，逐小时 1 次/小时更新。
 * 配置 HEFENG_API_KEY 后启用；失败抛错由 weather.service 走降级逻辑。
 */
const config = require('../../config');

const BASE = 'https://devapi.qweather.com/v7';
const TIMEOUT_MS = 3000;

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`hefeng http ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const r1 = (v) => Math.round(v * 10) / 10;
const pad = (n) => String(n).padStart(2, '0');

/** 拉取 72 小时逐小时 + 日出日落月相，映射为内部统一结构 */
async function fetch(spot, dateStr) {
  const location = `${spot.lng},${spot.lat}`;
  const [hourlyJson, astroJson] = await Promise.all([
    fetchWithTimeout(`${BASE}/weather/72h?location=${location}&key=${config.hefengApiKey}`),
    fetchWithTimeout(`${BASE}/astronomy/sunmoon?location=${location}&date=${dateStr}&key=${config.hefengApiKey}`),
  ]);

  if (hourlyJson.code !== '200') throw new Error(`hefeng hourly code ${hourlyJson.code}`);

  const hourly = (hourlyJson.hourly || []).map((h) => {
    const d = new Date(h.fxTime);
    const temp = Number(h.temp);
    const pressure = Number(h.pressure);
    const precip = Number(h.precip || 0);
    const cloud = Number(h.cloud || 0);
    // 与模拟器对齐的追加字段：天气文字 + 溶氧估算（真实源无逐小时溶氧，按水温/气压估算）
    const skyconMap = { '100': '晴', '101': '多云', '102': '多云', '103': '阴', '104': '阴', '150': '晴', '151': '多云', '152': '阴', '300': '小雨', '301': '中雨', '302': '大雨', '303': '大雨', '304': '大雨', '305': '小雨', '306': '中雨', '307': '大雨', '308': '大雨', '309': '小雨', '310': '大雨', '314': '中雨', '315': '大雨', '399': '小雨' };
    return {
      time: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:00:00+08:00`,
      hour: d.getUTCHours(),
      temp,
      pressure,
      windSpeed: Number(h.windSpeed),
      windDir: h.windDir,
      precip,
      humidity: Number(h.humidity),
      cloud,
      dewPoint: Number(h.dew || 0),
      skycon: skyconMap[h.icon] || (precip > 0 ? '小雨' : cloud >= 45 ? '多云' : '晴'),
      dissolvedOxygen: Math.round((14.2 - temp * 0.28 + (pressure - 1013) * 0.02) * 10) / 10,
    };
  });

  const astro = astroJson.code === '200' ? astroJson : {};
  return {
    spotId: spot.id,
    date: dateStr,
    hourly,
    sunrise: astro.sunrise || '06:00',
    sunset: astro.sunset || '18:00',
    moonPhase: astro.moonPhase ? Number(astro.moonPhase) : 0.5,
    moonPhaseName: astro.moonPhaseName || '月相未知',
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { fetch };
