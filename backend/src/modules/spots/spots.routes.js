const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, notFound } = require('../../middleware/errors');
const { haversine } = require('../../utils/geo');
const pool = require('../../db/pool');
const { CITIES } = require('../../data/cities');

const router = express.Router();

const WATER_TYPES = ['水库', '河流', '黑坑', '湖泊', '近海'];
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 4000;

function toDto(s, lng, lat) {
  return {
    id: s.id,
    name: s.name,
    lng: Number(s.lng),
    lat: Number(s.lat),
    waterType: s.water_type,
    reliability: s.reliability, // 1高/2中/3参考
    banned: !!s.banned,
    fishSpecies: typeof s.fish_species_json === 'string' ? JSON.parse(s.fish_species_json || '[]') : (s.fish_species_json || []),
    fee: s.fee,
    depthRef: s.depth_ref,
    city: s.city,
    province: s.province || null,
    cityCode: s.city_code || null,
    district: s.district || null,
    catchesCount: Number(s.catches_count || 0),
    distance: lng != null && lat != null ? haversine(lng, lat, Number(s.lng), Number(s.lat)) : undefined,
    updatedAt: s.updated_at,
  };
}

/** GET /api/v1/spots?lng=&lat=&radius=&waterType= —— 钓点列表（视口/半径查询） */
router.get('/', ah(async (req, res) => {
  const { lng, lat, radius, waterType, city } = req.query;
  const conds = [];
  const args = [];
  if (waterType && WATER_TYPES.includes(String(waterType))) {
    conds.push('s.water_type = ?');
    args.push(String(waterType));
  }
  // 按城市筛选（省/市/展示串任一命中），供「切换钓点」选城市后加载当地钓点
  if (city && String(city).trim()) {
    const c = String(city).trim();
    conds.push('(s.city_code = ? OR s.city LIKE ? OR s.province LIKE ?)');
    args.push(c, `%${c}%`, `%${c}%`);
  }

  let rows;
  if (lng && lat) {
    const lngN = Number(lng);
    const latN = Number(lat);
    if (!isFinite(lngN) || !isFinite(latN)) throw badRequest('lng/lat 格式不正确');
    const r = Number(radius) > 0 ? Number(radius) : 30000;
    // bounding box 粗筛再精确计算
    const latD = r / 111000;
    const lngD = r / (111000 * Math.cos((latN * Math.PI) / 180));
    conds.push('s.lat BETWEEN ? AND ?', 's.lng BETWEEN ? AND ?');
    args.push(latN - latD, latN + latD, lngN - lngD, lngN + lngD);
    const [r1] = await pool.query(
      `SELECT s.*, (SELECT COUNT(*) FROM catches c WHERE c.spot_id = s.id AND c.audit_status = 1) AS catches_count
       FROM fishing_spots s ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}`,
      args
    );
    rows = r1
      .map((s) => toDto(s, lngN, latN))
      .filter((s) => s.distance <= r)
      .sort((a, b) => a.distance - b.distance);
  } else {
    const [r2] = await pool.query(
      `SELECT s.*, (SELECT COUNT(*) FROM catches c WHERE c.spot_id = s.id AND c.audit_status = 1) AS catches_count
       FROM fishing_spots s ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY s.banned ASC, s.reliability ASC`,
      args
    );
    rows = r2.map((s) => toDto(s));
  }
  res.json({ total: rows.length, spots: rows });
}));

/** GET /api/v1/spots/stats —— 水域/钓点/渔获统计（发现钓点页底部统计条） */
router.get('/stats', ah(async (_req, res) => {
  const [[spotRow]] = await pool.query('SELECT COUNT(*) AS spots, COUNT(DISTINCT city) AS waterAreas FROM fishing_spots');
  const [[catchRow]] = await pool.query('SELECT COUNT(*) AS catches FROM catches WHERE audit_status = 1');
  const [[banRow]] = await pool.query('SELECT COUNT(*) AS banned FROM fishing_spots WHERE banned = 1');
  res.json({
    waterAreas: spotRow.waterAreas,
    spots: spotRow.spots,
    catches: catchRow.catches,
    bannedSpots: banRow.banned,
  });
}));

/** GET /api/v1/spots/cities —— 内置热门城市列表（带已预设钓点数） */
router.get('/cities', ah(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT city_code, COUNT(*) AS cnt FROM fishing_spots
     WHERE banned = FALSE AND city_code IS NOT NULL GROUP BY city_code`
  );
  const countMap = {};
  for (const r of rows) countMap[r.city_code] = Number(r.cnt);
  const cities = CITIES.map((c) => ({ ...c, spotCount: countMap[c.cityCode] || 0 }));
  res.json({ total: cities.length, cities });
}));

/** GET /api/v1/spots/geocode?name= —— 代理 Open-Meteo 地理编码（搜不在内置列表的城市） */
router.get('/geocode', ah(async (req, res) => {
  const name = String(req.query.name || '').trim();
  if (!name) throw badRequest('name 不能为空');
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&language=zh&count=8`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`geocode http ${r.status}`);
    const j = await r.json();
    const results = (j.results || []).map((x) => ({
      name: x.name,
      province: x.admin1 || x.country || '',
      cityCode: x.admin2 || x.name,
      district: x.name,
      lng: x.longitude,
      lat: x.latitude,
      population: x.population || 0,
    }));
    res.json({ total: results.length, results });
  } finally {
    clearTimeout(timer);
  }
}));

/** POST /api/v1/spots/ensure —— 幂等：城市无预设钓点时按模板生成 2-3 个真实坐标钓点 */
router.post('/ensure', ah(async (req, res) => {
  const { cityCode, province, district, lng, lat } = req.body || {};
  if (!cityCode || !Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) {
    throw badRequest('需要 cityCode、lng、lat');
  }
  const [exist] = await pool.query(
    'SELECT id FROM fishing_spots WHERE city_code = ? AND banned = FALSE LIMIT 1',
    [String(cityCode)]
  );
  if (exist.length) {
    const [rows] = await pool.query(
      `SELECT s.*, (SELECT COUNT(*) FROM catches c WHERE c.spot_id = s.id AND c.audit_status = 1) AS catches_count
       FROM fishing_spots s WHERE city_code = ? AND banned = FALSE ORDER BY reliability ASC`,
      [String(cityCode)]
    );
    return res.json({ total: rows.length, spots: rows.map((s) => toDto(s)) });
  }
  const baseLng = Number(lng), baseLat = Number(lat);
  const prov = String(province || '');
  const templates = [
    { name: `${cityCode}近郊水库钓场`, waterType: '水库', dLng: 0.18, dLat: 0.12, fish: '["鲫鱼","鲤鱼","草鱼"]', depth: '4-15m' },
    { name: `${cityCode}城区河湾野钓点`, waterType: '河流', dLng: -0.12, dLat: -0.08, fish: '["鲫鱼","鲤鱼","黄颡鱼"]', depth: '2-6m' },
    { name: `${cityCode}郊野湖泊钓区`, waterType: '湖泊', dLng: 0.09, dLat: -0.15, fish: '["鲫鱼","草鱼","鲢鳙"]', depth: '3-10m' },
  ];
  for (const t of templates) {
    await pool.query(
      `INSERT INTO fishing_spots (name, lng, lat, water_type, reliability, banned, fish_species_json, fee, depth_ref, city, province, city_code, district)
       VALUES (?, ?, ?, ?, 3, FALSE, ?, '免费开放', ?, ?, ?, ?, ?)`,
      [t.name, r7(baseLng + t.dLng), r7(baseLat + t.dLat), t.waterType, t.fish, t.depth,
       `${prov}·${cityCode}`, prov, String(cityCode), String(district || cityCode)]
    );
  }
  const [rows] = await pool.query(
    `SELECT s.*, (SELECT COUNT(*) FROM catches c WHERE c.spot_id = s.id AND c.audit_status = 1) AS catches_count
     FROM fishing_spots s WHERE city_code = ? AND banned = FALSE ORDER BY reliability ASC`,
    [String(cityCode)]
  );
  res.json({ total: rows.length, spots: rows.map((s) => toDto(s)) });
}));

function r7(v) { return Math.round(v * 1e7) / 1e7; }

/** GET /api/v1/spots/:id —— 钓点详情（含最近渔获） */
router.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!isFinite(id)) throw badRequest('钓点 ID 不正确');
  const [rows] = await pool.query(
    `SELECT s.*, (SELECT COUNT(*) FROM catches c WHERE c.spot_id = s.id AND c.audit_status = 1) AS catches_count
     FROM fishing_spots s WHERE s.id = ?`,
    [id]
  );
  if (!rows.length) throw notFound(`钓点 #${id} 不存在`);
  const spot = toDto(rows[0]);

  const [catches] = await pool.query(
    `SELECT c.*, u.nickname, u.avatar_url FROM catches c
     JOIN users u ON u.id = c.user_id
     WHERE c.spot_id = ? AND c.audit_status = 1
     ORDER BY c.created_at DESC LIMIT 6`,
    [id]
  );
  spot.recentCatches = catches.map((c) => ({
    id: c.id,
    fishSpecies: c.fish_species,
    bait: c.bait,
    content: c.content,
    imageUrls: typeof c.image_urls === 'string' ? JSON.parse(c.image_urls || '[]') : (c.image_urls || []),
    nickname: c.nickname,
    createdAt: c.created_at,
  }));
  res.json(spot);
}));

module.exports = router;
