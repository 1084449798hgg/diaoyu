const express = require('express');
const ah = require('../../utils/async-handler');
const { badRequest, notFound } = require('../../middleware/errors');
const { haversine } = require('../../utils/geo');
const pool = require('../../db/pool');

const router = express.Router();

const WATER_TYPES = ['水库', '河流', '黑坑', '湖泊', '近海'];

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
    catchesCount: Number(s.catches_count || 0),
    distance: lng != null && lat != null ? haversine(lng, lat, Number(s.lng), Number(s.lat)) : undefined,
    updatedAt: s.updated_at,
  };
}

/** GET /api/v1/spots?lng=&lat=&radius=&waterType= —— 钓点列表（视口/半径查询） */
router.get('/', ah(async (req, res) => {
  const { lng, lat, radius, waterType } = req.query;
  const conds = [];
  const args = [];
  if (waterType && WATER_TYPES.includes(String(waterType))) {
    conds.push('s.water_type = ?');
    args.push(String(waterType));
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
