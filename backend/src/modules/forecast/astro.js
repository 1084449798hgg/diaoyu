/**
 * 天文算法 —— 移植自 mourner/suncalc (BSD-2-Clause) 与 Chris-db/FishCast (MIT)
 * 用于按钓点经纬度本地计算：日出日落、月相、月上/下中天、月出月落，
 * 进而得到 Solunar「大口/小口」窗口（钓鱼黄金时段的经典理论）。
 *
 * 来源：
 *  - https://github.com/mourner/suncalc  (BSD-2-Clause, © Vladimir Agafonkin)
 *  - https://github.com/Chris-db/FishCast (MIT, js/astro.js)
 * 精度为分钟级，足以支撑逐小时鱼情窗口推理；无外部依赖、无需 API Key。
 *
 * 说明：所有入参 date 均为 JS Date（UTC 毫秒），内部按给定 lat/lng 计算本地时刻。
 */
const rad = Math.PI / 180;
const dayMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // 黄赤交角

const toJulian = (ms) => ms / dayMs - 0.5 + J1970;
const fromJulian = (j) => (j + 0.5 - J1970) * dayMs;
const toDays = (ms) => toJulian(ms) - J2000;

const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const altitude = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

/* ---------------- 太阳 ---------------- */
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + Math.PI;
}
function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}
const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, dec) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

/** 日出 / 日落 / 正午（返回 UTC 毫秒；极昼极夜返回 null） */
function sunTimes(ms, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(ms);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const h0 = -0.833 * rad;
  const w = hourAngle(h0, phi, dec);
  if (Number.isNaN(w)) return { sunrise: null, sunset: null, noon: fromJulian(Jnoon) };
  const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset), noon: fromJulian(Jnoon) };
}

/* ---------------- 月亮 ---------------- */
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

/** 月亮高度角（弧度），含天文折射修正 */
function moonAltitude(ms, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(ms);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  const hr = h < 0 ? 0 : h;
  h += 0.0002967 / Math.tan(hr + 0.00312536 / (hr + 0.08901179));
  return h;
}

/** 月相：phase 0=新月 0.25=上弦 0.5=满月 0.75=下弦；fraction=照明比例 */
function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
  );
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
}

function moonPhaseName(phase) {
  if (phase < 0.033 || phase >= 0.967) return '新月';
  if (phase < 0.217) return '娥眉月';
  if (phase < 0.283) return '上弦月';
  if (phase < 0.467) return '盈凸月';
  if (phase < 0.533) return '满月';
  if (phase < 0.717) return '亏凸月';
  if (phase < 0.783) return '下弦月';
  return '残月';
}

/**
 * 月亮事件：上/下中天（月亮高度极值）、月出月落（高度过零点）。
 * 按当地 00:00 起每 10 分钟采样 24h（144 点），取极值/过零。
 * 参考 q3579338/fishing-weather-forecast-china docs/model.md §3.6（MIT）。
 * @returns {{upper:number[], lower:number[], rises:number[], sets:number[]}} UTC 毫秒数组
 */
function moonEvents(localMidnightMs, lat, lng) {
  const STEP = 10 * 60 * 1000;
  const N = 144;
  const alts = [];
  for (let i = 0; i <= N; i++) alts.push(moonAltitude(localMidnightMs + i * STEP, lat, lng));
  const upper = [], lower = [], rises = [], sets = [];
  for (let i = 1; i < N; i++) {
    const a = alts[i - 1], b = alts[i], c = alts[i + 1];
    if (b >= a && b >= c) upper.push(localMidnightMs + i * STEP);   // 上中天 major
    if (b <= a && b <= c) lower.push(localMidnightMs + i * STEP);   // 下中天 major
    if (a < 0 && b >= 0) rises.push(localMidnightMs + i * STEP);     // 月出 minor
    if (a >= 0 && b < 0) sets.push(localMidnightMs + i * STEP);      // 月落 minor
  }
  return { upper, lower, rises, sets };
}

/**
 * 计算某小时 ∈ Solunar 窗口的加分（model.md §3.6 / FishCast solunarScore）
 * 上/下中天 ±1h → major +15；月出/月落 ±30min → minor +8；封顶 100。
 * @param {number} hourMs 该小时整点的 UTC 毫秒
 * @param {object} ev 月事件（可取前一天/当天/后一天三天的合集）
 */
function solunarBonus(hourMs, ev) {
  const HOUR = 3600000;
  const near = (arr, win) => arr.some((t) => Math.abs(t - hourMs) <= win);
  let bonus = 0;
  let tag = '';
  if (near([...ev.upper, ...ev.lower], HOUR)) { bonus = 15; tag = '月中天·大口窗口'; }
  else if (near([...ev.rises, ...ev.sets], HOUR / 2)) { bonus = 8; tag = '月出落·小口窗口'; }
  return { bonus, tag };
}

module.exports = {
  sunTimes, moonIllumination, moonAltitude, moonEvents, solunarBonus, moonPhaseName,
};
